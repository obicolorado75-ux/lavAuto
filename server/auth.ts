import { randomBytes, scrypt as scryptCallback, timingSafeEqual, createHash } from "node:crypto"
import { promisify } from "node:util"
import type { NextFunction, Request, Response } from "express"
import type pg from "pg"
import { getPool } from "./db.ts"
import type { Permission } from "./permissions.ts"

const scrypt = promisify(scryptCallback) as (password: string, salt: Buffer, keylen: number) => Promise<Buffer>

export class HttpError extends Error {
  status: number
  code: string
  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = "HttpError"
    this.status = status
    this.code = code
  }
}

export interface AuthContext {
  userId: string
  email: string
  sessionId: string
}

// Express request augmentation requires a namespace declaration by design.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthContext
      tenant?: {
        organizationId: string
        userId: string
        role: string
        siteId?: string
        /** Permissions effectives (rôle + exceptions), calculées par requireTenantContext. */
        permissions: Set<Permission>
        /** Raccourci de lecture, équivalent à `permissions.has(p)`. */
        can: (permission: Permission) => boolean
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Password hashing (scrypt, Node built-in — no external dependency)
// ---------------------------------------------------------------------------

const SCRYPT_KEYLEN = 64

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16)
  const derived = await scrypt(password, salt, SCRYPT_KEYLEN)
  return `scrypt:${salt.toString("hex")}:${derived.toString("hex")}`
}

export async function verifyPassword(password: string, stored: string | null | undefined): Promise<boolean> {
  if (!stored) return false
  const [scheme, saltHex, hashHex] = stored.split(":")
  if (scheme !== "scrypt" || !saltHex || !hashHex) return false
  const salt = Buffer.from(saltHex, "hex")
  const expected = Buffer.from(hashHex, "hex")
  const derived = await scrypt(password, salt, expected.length)
  return derived.length === expected.length && timingSafeEqual(derived, expected)
}

// ---------------------------------------------------------------------------
// Sessions (opaque token in an httpOnly cookie; only its SHA-256 is stored)
// ---------------------------------------------------------------------------

export const SESSION_COOKIE = "washpilot_session"
export const SESSION_TTL_DAYS = 30
/**
 * Rotation : un jeton de session est rajeuni au plus une fois par heure.
 * Entre deux fenêtres, l'expiration glissante habituelle s'applique — la
 * rotation ne fait que borner la durée de vie d'un jeton volé, sans casser
 * les onglets ouverts (le nouveau jeton remplace le cookie à la réponse).
 */
export const DEFAULT_SESSION_ROTATION_INTERVAL_MS = 60 * 60 * 1000
// La fenêtre se lit à chaque appel (et non au chargement du module) : les
// tests d'intégration ne peuvent pas faire avancer l'horloge serveur, ils la
// raccourcissent via SESSION_ROTATION_INTERVAL_MS. En production, laisser la
// variable vide → 1 heure.
export function sessionRotationIntervalMs(): number {
  const raw = Number(process.env.SESSION_ROTATION_INTERVAL_MS || "")
  return Number.isFinite(raw) && raw >= 0 ? raw : DEFAULT_SESSION_ROTATION_INTERVAL_MS
}

function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex")
}

/** Description lisible d'un appareil, dérivée de l'User-Agent (et du fuseau horaire annoncé). */
export function describeDevice(userAgent?: string | null, timeZone?: string | null): string {
  const ua = (userAgent ?? "").slice(0, 300)
  let family = "Appareil inconnu"
  if (/iPhone/i.test(ua)) family = "iPhone"
  else if (/iPad/i.test(ua)) family = "iPad"
  else if (/Android/i.test(ua)) family = "Android"
  else if (/Windows/i.test(ua)) family = "Windows"
  else if (/Mac OS X|Macintosh/i.test(ua)) family = "macOS"
  else if (/Linux/i.test(ua)) family = "Linux"
  let browser = ""
  if (/Edg\//i.test(ua)) browser = "Edge"
  else if (/OPR\//i.test(ua)) browser = "Opera"
  else if (/Chrome\//i.test(ua)) browser = "Chrome"
  else if (/Firefox\//i.test(ua)) browser = "Firefox"
  else if (/Safari\//i.test(ua)) browser = "Safari"
  const base = browser ? `${browser} · ${family}` : family
  return timeZone ? `${base} (${timeZone})` : base
}

export interface SessionFingerprint {
  ip?: string | null
  userAgent?: string | null
  timeZone?: string | null
}

export async function createSession(
  pool: pg.Pool,
  userId: string,
  fingerprint?: SessionFingerprint,
): Promise<string> {
  const token = randomBytes(32).toString("base64url")
  await pool.query(
    `INSERT INTO auth_sessions (user_id, token_hash, expires_at, created_ip, device_label)
     VALUES ($1, $2, NOW() + make_interval(days => $3), $4, $5)`,
    [
      userId,
      hashSessionToken(token),
      SESSION_TTL_DAYS,
      fingerprint?.ip ?? null,
      describeDevice(fingerprint?.userAgent, fingerprint?.timeZone),
    ],
  )
  return token
}

export async function destroySession(pool: pg.Pool, token: string): Promise<void> {
  await pool.query("DELETE FROM auth_sessions WHERE token_hash = $1", [hashSessionToken(token)])
}

/**
 * Révoque TOUTES les sessions d'un utilisateur (mot de passe changé, compte
 * désactivé, incident de sécurité). La révocation est un DELETE : rien ne
 * survit, aucun jeton ancien ne peut être rejoué.
 */
export async function revokeAllSessionsForUser(pool: pg.Pool, userId: string): Promise<number> {
  const q = await pool.query("DELETE FROM auth_sessions WHERE user_id = $1", [userId])
  return q.rowCount ?? 0
}

/**
 * Révoque une session identifiée par sa clé primaire, MAIS uniquement si elle
 * appartient à `userId` (bouton « fermer cet appareil »). Le filtre côté
 * requête — et pas seulement côté applicatif — garantit qu'un identifiant
 * volé ou deviné appartenant à un autre compte renvoie 0 ligne : l'appelant
 * répond 404 et l'attaquant n'apprend rien.
 */
export async function revokeSessionByIdScoped(
  pool: pg.Pool,
  sessionId: string,
  userId: string,
): Promise<boolean> {
  const q = await pool.query(
    "DELETE FROM auth_sessions WHERE id = $1::uuid AND user_id = $2::uuid",
    [sessionId, userId],
  )
  return Boolean(q.rowCount)
}

/**
 * Trace une révocation de session dans `audit_logs`. La route appelante a
 * déjà vérifié la session ; on relit l'organisation du compte pour que
 * l'événement apparaisse dans le journal visible par le gérant. L'écriture
 * est best effort : un échec d'audit ne doit jamais empêcher une révocation.
 */
export async function auditSessionEvent(
  pool: pg.Pool,
  session: SessionUser,
  action: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  try {
    const orgQ = await pool.query<{ organization_id: string | null }>(
      "SELECT organization_id FROM users WHERE id = $1::uuid",
      [session.userId],
    )
    const organizationId = orgQ.rows[0]?.organization_id ?? null
    if (!organizationId) return
    await pool.query(
      `INSERT INTO audit_logs (organization_id, actor_user_id, action, entity_type, entity_id, metadata)
       VALUES ($1::uuid, $2::uuid, $3, 'auth_session', $4, $5::jsonb)`,
      [
        organizationId,
        session.userId,
        action,
        session.sessionId,
        JSON.stringify({ ...metadata, actor_email: session.email }),
      ],
    )
  } catch {
    // Best effort : la révocation prime sur sa trace.
  }
}

export interface ActiveSessionRow {
  id: string
  current: boolean
  createdAt: string
  lastUsedAt: string | null
  expiresAt: string
  deviceLabel: string | null
  createdIp: string | null
}

/** Liste les sessions actives d'un utilisateur ; la session appelante est marquée `current`. */
export async function listActiveSessions(
  pool: pg.Pool,
  userId: string,
  currentSessionId: string,
): Promise<ActiveSessionRow[]> {
  const q = await pool.query(
    `SELECT s.id,
            (s.id::text = $2) AS current,
            s.created_at, s.last_used_at, s.expires_at, s.device_label, s.created_ip
       FROM auth_sessions s
      WHERE s.user_id = $1::uuid AND s.expires_at > NOW()
      ORDER BY s.last_used_at DESC NULLS LAST, s.created_at DESC`,
    [userId, currentSessionId],
  )
  return (q.rows as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id),
    current: Boolean(row.current),
    createdAt: new Date(row.created_at as string).toISOString(),
    lastUsedAt: row.last_used_at ? new Date(row.last_used_at as string).toISOString() : null,
    expiresAt: new Date(row.expires_at as string).toISOString(),
    deviceLabel: (row.device_label as string | null) ?? null,
    createdIp: (row.created_ip as string | null) ?? null,
  }))
}

// ---------------------------------------------------------------------------
// Password reset tokens (single-use, short-lived; only the SHA-256 is stored)
// ---------------------------------------------------------------------------

function hashResetToken(token: string): string {
  return createHash("sha256").update(token).digest("hex")
}

/**
 * Crée un jeton de réinitialisation à usage unique et invalide les jetons
 * encore actifs de l'utilisateur (un seul lien valide à la fois).
 */
export async function createPasswordResetToken(
  pool: pg.Pool,
  userId: string,
  ttlMinutes: number,
  requestedIp?: string | null,
): Promise<string> {
  const token = randomBytes(32).toString("base64url")
  await pool.query(
    "UPDATE password_reset_tokens SET used_at = NOW() WHERE user_id = $1 AND used_at IS NULL",
    [userId],
  )
  await pool.query(
    `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at, requested_ip)
     VALUES ($1, $2, NOW() + make_interval(mins => $3), $4)`,
    [userId, hashResetToken(token), ttlMinutes, requestedIp ?? null],
  )
  return token
}

/**
 * Consomme un jeton de réinitialisation : l'opération est atomique, un jeton
 * expiré ou déjà utilisé renvoie null (aucun indice sur la cause).
 */
export async function consumePasswordResetToken(
  pool: pg.Pool,
  token: string,
): Promise<string | null> {
  if (!token) return null
  const q = await pool.query(
    `UPDATE password_reset_tokens
     SET used_at = NOW()
     WHERE token_hash = $1 AND used_at IS NULL AND expires_at > NOW()
     RETURNING user_id`,
    [hashResetToken(token)],
  )
  const row = q.rows[0] as { user_id: string } | undefined
  return row?.user_id ?? null
}

/** Vérifie qu'un jeton est encore exploitable sans le consommer (pré-affichage du formulaire). */
export async function isPasswordResetTokenValid(pool: pg.Pool, token: string): Promise<boolean> {
  if (!token) return false
  const q = await pool.query(
    `SELECT 1 FROM password_reset_tokens
     WHERE token_hash = $1 AND used_at IS NULL AND expires_at > NOW()
     LIMIT 1`,
    [hashResetToken(token)],
  )
  return Boolean(q.rowCount)
}

/** The preview/production proxy serves HTTPS: cross-site iframes then require SameSite=None; Secure. */
function cookieSecurity(req: Request): { secure: boolean; sameSite: "none" | "lax" } {
  const secure = req.secure || req.get("x-forwarded-proto") === "https"
  return { secure, sameSite: secure ? "none" : "lax" }
}

export function setSessionCookie(req: Request, res: Response, token: string): void {
  const { secure, sameSite } = cookieSecurity(req)
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite,
    secure,
    maxAge: SESSION_TTL_DAYS * 24 * 60 * 60 * 1000,
    path: "/",
  })
}

export function clearSessionCookie(req: Request, res: Response): void {
  const { secure, sameSite } = cookieSecurity(req)
  res.clearCookie(SESSION_COOKIE, { httpOnly: true, sameSite, secure, path: "/" })
}

/**
 * Read the session token from the cookie, or from the Authorization header
 * (fallback for embedded previews where third-party cookies are blocked).
 */
export function readSessionToken(req: Request): string | null {
  const header = req.get("cookie")
  if (header) {
    for (const part of header.split(";")) {
      const separator = part.indexOf("=")
      if (separator === -1) continue
      const name = part.slice(0, separator).trim()
      if (name !== SESSION_COOKIE) continue
      const value = part.slice(separator + 1).trim()
      if (value) return decodeURIComponent(value)
    }
  }
  const authorization = req.get("authorization") || ""
  const match = /^Bearer\s+(.+)$/i.exec(authorization)
  if (match) return match[1].trim()
  // Dernier recours : certains proxys consomment l'en-tête Authorization.
  const custom = req.get("x-session-token")
  return custom ? custom.trim() : null
}

export interface SessionUser {
  sessionId: string
  userId: string
  email: string
  firstName: string | null
  lastName: string | null
  phone: string | null
  avatarUrl: string | null
  status: string
  /**
   * Nouveau jeton émis par la rotation de session (au plus une fois par
   * fenêtre d'heure). Le gestionnaire qui résout la session DOIT poser le
   * nouveau cookie via `setSessionCookie` si ce champ est présent — sinon
   * l'ancien jeton reste valable jusqu'à son expiration glissante.
   */
  rotatedToken?: string
}

/**
 * Résout l'utilisateur actif pour le jeton de la requête, ou null.
 *
 * Rotation périodique : au-delà de `SESSION_ROTATION_INTERVAL_MS` depuis la
 * création de la ligne de session, un nouveau jeton est inséré atomiquement
 * (UPDATE du hash) et l'ancien cesse immédiatement de fonctionner. La fenêtre
 * d'expiration glissante repart en même temps (`rotated_at = created_at` est
 * posé à chaque rotation, y compris sur les lignes héritées où la colonne
 * arrive vide via ALTER TABLE).
 */
export async function getSessionUser(req: Request): Promise<SessionUser | null> {
  const token = readSessionToken(req)
  if (!token) return null
  const pool = getPool()
  if (!pool) return null

  const q = await pool.query(
    `SELECT s.id AS session_id, u.id AS user_id, u.email, u.first_name, u.last_name, u.phone, u.avatar_url, u.status,
            COALESCE(s.rotated_at, s.created_at) AS last_rotated_at
     FROM auth_sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = $1 AND s.expires_at > NOW()
     LIMIT 1`,
    [hashSessionToken(token)],
  )
  const row = q.rows[0] as {
    session_id: string; user_id: string; email: string; first_name: string | null
    last_name: string | null; phone: string | null; avatar_url: string | null; status: string
    last_rotated_at: Date | string
  } | undefined
  if (!row || row.status !== "active") return null

  let rotatedToken: string | undefined
  const lastRotatedMs = new Date(row.last_rotated_at).getTime()
  if (Date.now() - lastRotatedMs >= sessionRotationIntervalMs()) {
    const freshToken = randomBytes(32).toString("base64url")
    const rotateQ = await pool.query(
      `UPDATE auth_sessions
          SET token_hash = $2,
              rotated_at = NOW(),
              last_used_at = NOW(),
              expires_at = NOW() + make_interval(days => $3)
        WHERE id = $1 AND token_hash = $4`,
      [row.session_id, hashSessionToken(freshToken), SESSION_TTL_DAYS, hashSessionToken(token)],
    )
    // rowCount === 0 : un requête concurrente a déjà pivoté le jeton ; la
    // présente requête continue avec l'ancien (valable jusqu'à sa propre
    // résolution suivante). Jamais d'interruption de session pour l'utilisateur.
    if (rotateQ.rowCount) rotatedToken = freshToken
  }

  if (!rotatedToken) {
    // Sliding expiration: refresh the window on activity (best effort).
    void pool.query(
      `UPDATE auth_sessions SET last_used_at = NOW(), expires_at = NOW() + make_interval(days => $2) WHERE id = $1`,
      [row.session_id, SESSION_TTL_DAYS],
    ).catch(() => {})
  }
  return {
    sessionId: row.session_id,
    userId: row.user_id,
    email: row.email,
    firstName: row.first_name,
    lastName: row.last_name,
    phone: row.phone,
    avatarUrl: row.avatar_url,
    status: row.status,
    rotatedToken,
  }
}

/** Require a valid session cookie; attach the authenticated user to the request. */
export async function requireSession(req: Request, res: Response, next: NextFunction) {
  try {
    const pool = getPool()
    if (!pool) throw new HttpError(503, "database_not_configured", "La base de données n'est pas configurée.")
    const user = await getSessionUser(req)
    if (!user) throw new HttpError(401, "authentication_required", "Connectez-vous pour continuer.")
    req.auth = { userId: user.userId, email: user.email, sessionId: user.sessionId }
    // Rotation : le nouveau jeton remplace le cookie avant la réponse ; si une
    // route réécrit le cookie derrière nous (login), sa valeur gagne.
    if (user.rotatedToken) setSessionCookie(req, res, user.rotatedToken)
    next()
  } catch (error) {
    if (error instanceof HttpError) return next(error)
    next(new HttpError(401, "invalid_session", "Votre session a expiré ou n'est pas valide. Reconnectez-vous."))
  }
}
