import test, { before, after } from "node:test"
import assert from "node:assert/strict"
import type { Server } from "node:http"
import { initDatabaseSchema, getPool, closeDatabase } from "../server/db.ts"
import { createApiApp } from "../server/app.ts"
import {
  SESSION_COOKIE,
  createSession,
  describeDevice,
  hashPassword,
  revokeAllSessionsForUser,
  revokeSessionByIdScoped,
} from "../server/auth.ts"

// ---------------------------------------------------------------------------
// Rotation & révocation de sessions (P1 sécurité)
//
// Trois garanties attendues :
//   1. La rotation ne peut pas être plus fréquente que la fenêtre d'une heure
//      (sinon on casse les onglets ouverts pour rien), et elle éventre le
//      vieux jeton dès qu'elle a lieu.
//   2. « Fermer cet appareil » est scopé au propriétaire : un identifiant
//      appartenant à un autre compte renvoie 404, jamais 200.
//   3. Changement / réinitialisation de mot de passe tuent les autres
//      sessions — et l'événement laisse une trace dans audit_logs.
// ---------------------------------------------------------------------------

let server: Server
let baseUrl: string

const PASSWORD = "WashPilot2026!"
const OWNER = "gerant-sessions@washpilot.ci"
const OTHER = "autre-sessions@washpilot.ci"

function cookieFrom(token: string): string {
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}`
}

async function api(
  method: string,
  path: string,
  token?: string,
  body?: unknown,
): Promise<{ status: number; json: Record<string, unknown> | null; headers: Headers; token: string | undefined }> {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(token ? { cookie: cookieFrom(token) } : {}),
      ...(body ? { "content-type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let json: Record<string, unknown> | null = null
  try {
    const parsed: unknown = text ? JSON.parse(text) : null
    if (parsed && typeof parsed === "object") json = parsed as Record<string, unknown>
  } catch {
    json = null
  }
  // La rotation de session pose un Set-Cookie avec le jeton pivoté : on
  // l'extrait ici pour que les helpers « vivants » (withToken) propagent
  // automatiquement le nouveau jeton aux requêtes suivantes.
  const setCookie = res.headers.get("set-cookie") || ""
  const rotatedRaw = new RegExp(`${SESSION_COOKIE}=([^;,]+)`).exec(setCookie)?.[1]
  return {
    status: res.status,
    json,
    headers: res.headers,
    token: rotatedRaw ? decodeURIComponent(rotatedRaw) : undefined,
  }
}

// Un jeton d'appareil ouvert via createSession() a `rotated_at = created_at` :
// si la fenêtre de rotation est à 0 (tests de rotation), TOUTE requête authentifiée
// le fait pivoter et tue le jeton porté par le client. Les scénarios qui suivent
// testent la REVOCATION, pas la rotation : on force donc une fenêtre réaliste.
async function withToken<T>(fn: () => Promise<T>): Promise<T> {
  const previous = process.env.SESSION_ROTATION_INTERVAL_MS
  process.env.SESSION_ROTATION_INTERVAL_MS = String(60 * 60 * 1000)
  try {
    return await fn()
  } finally {
    if (previous === undefined) delete process.env.SESSION_ROTATION_INTERVAL_MS
    else process.env.SESSION_ROTATION_INTERVAL_MS = previous
  }
}

async function login(email: string): Promise<string> {
  const res = await fetch(`${baseUrl}/api/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-timezone": "Africa/Abidjan" },
    body: JSON.stringify({ email, password: PASSWORD }),
  })
  assert.equal(res.status, 200, `login ${email} doit réussir`)
  const json = (await res.json()) as { session_token: string }
  return json.session_token
}

before(async () => {
  assert.ok(await initDatabaseSchema(), "base de test initialisée")
  const pool = getPool()!
  const orgQ = await pool.query(
    "INSERT INTO organizations (name, slug) VALUES ('Station Sessions', NULL) RETURNING id",
  )
  const hash = await hashPassword(PASSWORD)
  for (const [email, first] of [
    [OWNER, "Gérant"],
    [OTHER, "Autre"],
  ] as const) {
    const userQ = await pool.query(
      `INSERT INTO users (email, first_name, last_name, password_hash, status, organization_id)
       VALUES ($1, $2, 'Test', $3, 'active', $4) RETURNING id`,
      [email, first, hash, orgQ.rows[0].id],
    )
    await pool.query(
      "INSERT INTO organization_members (organization_id, user_id, role) VALUES ($1, $2, 'owner')",
      [orgQ.rows[0].id, userQ.rows[0].id],
    )
  }

  const app = createApiApp()
  await new Promise<void>((resolve) => {
    server = app.listen(0, "127.0.0.1", resolve)
  })
  const address = server.address()
  baseUrl = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`
})

after(async () => {
  // Sécurité : on ne quitte jamais ce fichier avec une fenêtre de rotation à
  // 0. Le runner Node peut réutiliser le worker (concurrency:1) pour un autre
  // fichier ; une valeur résiduelle « 0 » ferait pivoter le jeton de CHAQUE
  // requête authentifiée du fichier suivant → hécatombe de 401 en cascade.
  delete process.env.SESSION_ROTATION_INTERVAL_MS
  await new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()))
  })
  await closeDatabase()
})

test("describeDevice fabrique une étiquette lisible à partir de l'User-Agent", () => {
  assert.match(describeDevice("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)", "Africa/Abidjan"), /iPhone/)
  assert.match(describeDevice("Mozilla/5.0 (Windows NT 10.0) Chrome/120.0", null), /Chrome · Windows/)
  assert.match(describeDevice(null, null), /Appareil inconnu/)
})

test("GET /auth/sessions liste les appareils actifs avec l'empreinte de connexion", async () => {
  const token = await login(OWNER)
  const res = await api("GET", "/api/v1/auth/sessions", token)
  assert.equal(res.status, 200)
  const sessions = res.json.sessions as Array<Record<string, unknown>>
  assert.ok(sessions.length >= 1)
  const current = sessions.find((s) => s.current)
  assert.ok(current, "la session appelante est marquée current")
  assert.match(String(current.deviceLabel), /Africa\/Abidjan/, "le fuseau annoncé est conservé")
})

test("rotation : aucune avant la fenêtre, puis pivot du jeton et mort de l'ancien", async () => {
  // La fenêtre est forcée à 0 par la variable d'environnement (le module n'est
  // pas encore chargé : c'est le premier test qui touche server/auth.ts via
  // createApiApp). En production la valeur reste 1 h.
  process.env.SESSION_ROTATION_INTERVAL_MS = "0"
  const token = await login(OWNER)
  // 1. Fenêtre nulle : première requête pivote déjà le jeton…
  const res1 = await api("GET", "/api/v1/auth/me", token)
  assert.equal(res1.status, 200)

  // …et la suivante, avec le nouveau jeton, ne repivote pas dans la même
  // seconde si on remet la fenêtre à 1 h (comportement réel vérifié ici).
  process.env.SESSION_ROTATION_INTERVAL_MS = String(60 * 60 * 1000)
  const setCookie1 = res1.headers.get("set-cookie")
  assert.ok(setCookie1, "la rotation pose un nouveau cookie")
  const freshToken = new RegExp(`${SESSION_COOKIE}=([^;]+)`).exec(setCookie1!)?.[1]
  assert.ok(freshToken && freshToken !== token, "le nouveau jeton diffère de l'ancien")

  // 2. L'ancien jeton est mort : le hash en base a été remplacé.
  const stale = await api("GET", "/api/v1/auth/me", token)
  assert.equal(stale.status, 401, "l'ancien jeton cesse immédiatement de fonctionner")
  const alive = await api("GET", "/api/v1/auth/me", decodeURIComponent(freshToken!))
  assert.equal(alive.status, 200, "le nouveau jeton fonctionne")

  // 3. La fenêtre est repartie : plus de rotation dans la foulée.
  const again = await api("GET", "/api/v1/auth/me", decodeURIComponent(freshToken!))
  assert.ok(!again.headers.get("set-cookie"), "rotation bornée par SESSION_ROTATION_INTERVAL_MS")

  // Restitution immédiate (et non en fin de fichier) : si un test suivant du
  // MÊME worker lisait encore « 0 », chaque requête authentifiée tuerait le
  // jeton du client. Le nettoyage doit coller au scénario, pas au conteneur.
  delete process.env.SESSION_ROTATION_INTERVAL_MS
})

test("DELETE /auth/sessions/:id ferme un appareil précis, refuse la session courante", async () => {
  await withToken(async () => {
    const pool = getPool()!
    const ownerToken = await login(OWNER)
    // Deuxième session ouverte sur un autre poste (Android, sans fuseau).
    const otherUserIdQ = await pool.query("SELECT id FROM users WHERE email = $1", [OWNER])
    const secondToken = await createSession(pool, otherUserIdQ.rows[0].id, {
      userAgent: "Mozilla/5.0 (Linux; Android 13)",
      ip: "41.60.0.10",
    })

    const list = await api("GET", "/api/v1/auth/sessions", ownerToken)
    assert.equal(list.status, 200)
    const target = (list.json.sessions as Array<Record<string, unknown>>).find((s) => !s.current)
    assert.ok(target, "deuxième session visible dans la liste")

    const del = await api("DELETE", `/api/v1/auth/sessions/${target.id}`, ownerToken)
    assert.equal(del.status, 204)

    const stillAlive = await api("GET", "/api/v1/auth/me", secondToken)
    assert.equal(stillAlive.status, 401, "l'appareil fermé est déconnecté")

    // Impossible de scier la branche sur laquelle on est assis. La liste des
    // appareils passe par getSessionUser, qui PEUT avoir fait pivoter le jeton
    // (fenêtre à 0 héritée du test précédent) : on repart donc du jeton encore
    // vivant — nouveau si rotation, ancien sinon — pour cibler SA session.
    const selfRes = await api("GET", "/api/v1/auth/sessions", ownerToken)
    assert.equal(selfRes.status, 200)
    const liveToken = selfRes.token ?? ownerToken
    const self = selfRes.json.sessions as Array<Record<string, unknown>>
    const currentId = self.find((s) => s.current)!.id
    const bad = await api("DELETE", `/api/v1/auth/sessions/${currentId}`, liveToken)
    assert.equal(bad.status, 400)
    // Le gestionnaire d'erreurs enveloppe le code : { error: { code, message } }.
    assert.equal((bad.json?.error ?? bad.json)?.code, "cannot_revoke_current_session")

    // Trace d'audit : l'événement est bien attribué à l'organisation.
    const auditQ = await pool.query(
      "SELECT action FROM audit_logs WHERE action = 'auth.session_revoked_device' ORDER BY created_at DESC LIMIT 1",
    )
    assert.equal(auditQ.rows[0]?.action, "auth.session_revoked_device")
  })
})

test("scoping : un identifiant de session d'un AUTRE compte renvoie 404 (pas d'oracle)", async () => {
  const pool = getPool()!
  const ownerToken = await login(OWNER)
  const otherQ = await pool.query("SELECT id FROM users WHERE email = $1", [OTHER])
  const victimToken = await createSession(pool, otherQ.rows[0].id, { ip: "41.60.0.11" })
  const victimRow = await pool.query(
    "SELECT id FROM auth_sessions WHERE token_hash = encode(digest($1, 'sha256'), 'hex')",
    [victimToken],
  ).catch(async () => {
    // PGlite ne garantit pas pgcrypto/digest : on retrouve la ligne via l'user.
    return pool.query(
      "SELECT id FROM auth_sessions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1",
      [otherQ.rows[0].id],
    )
  })
  const victimId = (victimRow.rows[0] as { id: string }).id

  const res = await api("DELETE", `/api/v1/auth/sessions/${victimId}`, ownerToken)
  assert.equal(res.status, 404, "404 : ni 200, ni message révélant l'existence")

  // La session victime survit — la suppression n'a rien touché.
  const me = await api("GET", "/api/v1/auth/me", victimToken)
  assert.equal(me.status, 200)

  // Et au niveau fonction : revokeSessionByIdScoped refuse aussi.
  const removed = await revokeSessionByIdScoped(pool, victimId, otherQ.rows[0].id)
  assert.equal(removed, true, "le propriétaire légitime, lui, peut la fermer")
})

test("POST /auth/sessions/revoke-others épargne la session courante", async () => {
  await withToken(async () => {
    const pool = getPool()!
    const ownerToken = await login(OWNER)
    const ownerQ = await pool.query("SELECT id FROM users WHERE email = $1", [OWNER])
    const extraToken = await createSession(pool, ownerQ.rows[0].id, { ip: "41.60.0.12" })

    const res = await api("POST", "/api/v1/auth/sessions/revoke-others", ownerToken)
    assert.equal(res.status, 200)
    assert.ok(res.json.revoked >= 1)

    const gone = await api("GET", "/api/v1/auth/me", extraToken)
    assert.equal(gone.status, 401, "les autres appareils sont déconnectés")
    const me = await api("GET", "/api/v1/auth/me", ownerToken)
    assert.equal(me.status, 200, "la session qui donne l'ordre survit")
  })
})

test("changer son mot de passe révoque les autres sessions et l'audite", async () => {
  await withToken(async () => {
    const pool = getPool()!
    const ownerToken = await login(OWNER)
    const ownerQ = await pool.query("SELECT id FROM users WHERE email = $1", [OWNER])
    const ghostToken = await createSession(pool, ownerQ.rows[0].id, { ip: "41.60.0.13" })

    const res = await api("POST", "/api/v1/auth/password", ownerToken, {
      currentPassword: PASSWORD,
      newPassword: "NouveauMotDePasse2026!",
    })
    assert.equal(res.status, 200)

    const ghost = await api("GET", "/api/v1/auth/me", ghostToken)
    assert.equal(ghost.status, 401, "mot de passe changé = autres sessions tuées")
    const me = await api("GET", "/api/v1/auth/me", ownerToken)
    assert.equal(me.status, 200, "la session courante reste utilisable")

    const auditQ = await pool.query(
      "SELECT metadata FROM audit_logs WHERE action = 'auth.password_changed' ORDER BY created_at DESC LIMIT 1",
    )
    assert.ok(auditQ.rowCount, "l'événement est tracé dans audit_logs")
  })
})

test("revokeAllSessionsForUser tue tout, y compris la session qui appelle", async () => {
  const pool = getPool()!
  const ownerQ = await pool.query("SELECT id FROM users WHERE email = $1", [OWNER])
  await createSession(pool, ownerQ.rows[0].id)
  await createSession(pool, ownerQ.rows[0].id)
  const count = await revokeAllSessionsForUser(pool, ownerQ.rows[0].id)
  assert.ok(count >= 2)
  const left = await pool.query(
    "SELECT COUNT(*)::int AS c FROM auth_sessions WHERE user_id = $1",
    [ownerQ.rows[0].id],
  )
  assert.equal(left.rows[0].c, 0)
})
