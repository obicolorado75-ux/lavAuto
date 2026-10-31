import test, { after, before } from "node:test"
import assert from "node:assert/strict"
import type { Server } from "node:http"
import type { Pool } from "pg"

import { closeDatabase, getPool, initDatabaseSchema } from "../server/db.ts"
import { createApiApp } from "../server/app.ts"
import {
  BRAND_LOGO_MAX_BYTES,
  BRAND_LOGO_MIME_TYPES,
  decodeBrandLogo,
  logoUrl,
  toImageBuffer,
  type BrandLogoMimeType,
} from "../server/branding.ts"
import {
  BRAND_LOGO_MAX_EDGE,
  formatBytes,
  planLogoAttempts,
  sniffImageMime,
  MAX_BRAND_LOGO_BYTES as CLIENT_MAX_BRAND_LOGO_BYTES,
} from "../src/lib/brand-logo.ts"

// ---------------------------------------------------------------------------
// Logo de la station
//
// Trois promesses :
//   • ce qui entre dans la base est bien une image PNG, JPEG ou WebP — pas un
//     fichier qui se prétend tel ;
//   • tout membre voit le logo de sa station, mais seul le propriétaire le
//     change ;
//   • une fois retiré, le logo ne laisse ni octet ni ligne derrière lui.
// ---------------------------------------------------------------------------

const PASSWORD = "WashPilot2026!"
const sessions = new Map<string, string>()
let server: Server
let baseUrl: string
let pool: Pool
let orgId: string
let otherOrgId: string

/** Un PNG minimal : l'en-tête suffit à la détection, c'est elle qu'on teste. */
function pngBytes(extra = 32): Buffer {
  const header = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  return Buffer.concat([header, Buffer.alloc(extra, 0x7f)])
}

function jpegBytes(extra = 32): Buffer {
  return Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(extra, 0x22)])
}

function webpBytes(extra = 32): Buffer {
  const riff = Buffer.from("RIFF", "ascii")
  const size = Buffer.alloc(4)
  size.writeUInt32LE(extra + 4)
  const webp = Buffer.from("WEBP", "ascii")
  return Buffer.concat([riff, size, webp, Buffer.alloc(extra, 0x33)])
}

function base64(bytes: Buffer): string {
  return bytes.toString("base64")
}

function api(path: string, options: { as?: string; method?: string; body?: unknown } = {}) {
  const headers: Record<string, string> = { "Content-Type": "application/json" }
  if (options.as) headers.Cookie = sessions.get(options.as) ?? ""
  return fetch(`${baseUrl}${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  })
}

async function login(email: string) {
  const response = await fetch(`${baseUrl}/api/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD }),
  })
  assert.equal(response.status, 200, `connexion ${email}`)
  const cookie = response.headers.getSetCookie?.().join("; ") ?? response.headers.get("set-cookie") ?? ""
  sessions.set(email, cookie)
}

interface LogoSummary {
  mime_type: string
  byte_size: number
  updated_at: string
  url: string
}

before(async () => {
  assert.ok(await initDatabaseSchema(), "base de test initialisée")
  pool = getPool() as Pool

  const app = createApiApp()
  await new Promise<void>((resolve) => {
    server = app.listen(0, "127.0.0.1", resolve)
  })
  const address = server.address()
  const port = typeof address === "object" && address ? address.port : 0
  baseUrl = `http://127.0.0.1:${port}`

  for (const email of ["demo@washpilot.ci", "gerant@washpilot.ci", "laveur@washpilot.ci"]) {
    await login(email)
  }

  const org = await pool.query(
    "SELECT m.organization_id FROM organization_members m JOIN users u ON u.id = m.user_id WHERE u.email='demo@washpilot.ci'",
  )
  orgId = org.rows[0].organization_id
  // Deuxième organisation : son logo ne doit jamais apparaître ici.
  const other = await pool.query("SELECT id FROM organizations WHERE id <> $1::uuid LIMIT 1", [orgId])
  otherOrgId = other.rows[0]?.id ?? ""
})

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()))
  await closeDatabase()
})

// ---------------------------------------------------------------------------
// Lecture du fichier reçu — sans base ni HTTP
// ---------------------------------------------------------------------------

test("une image est acceptée quand son contenu correspond au type annoncé", () => {
  assert.equal(decodeBrandLogo({ mime_type: "image/png", data_base64: base64(pngBytes()) }).length, 40)
  assert.equal(decodeBrandLogo({ mime_type: "image/jpeg", data_base64: base64(jpegBytes()) }).length, 36)
  assert.equal(decodeBrandLogo({ mime_type: "image/webp", data_base64: base64(webpBytes()) }).length, 44)
})

test("un fichier qui ment sur son type est refusé", () => {
  // Le cas réel : un JPEG renommé « logo.png ». Le navigateur annonce
  // image/png, le contenu commence par FF D8 FF.
  assert.throws(
    () => decodeBrandLogo({ mime_type: "image/png", data_base64: base64(jpegBytes()) }),
    /ne correspond pas au format annoncé/,
  )
  assert.throws(
    () => decodeBrandLogo({ mime_type: "image/webp", data_base64: base64(pngBytes()) }),
    /ne correspond pas au format annoncé/,
  )
  // Un fichier texte n'est jamais une image, quel que soit le type annoncé.
  for (const mime of BRAND_LOGO_MIME_TYPES) {
    assert.throws(
      () => decodeBrandLogo({ mime_type: mime, data_base64: base64(Buffer.from("<html>bonjour</html>")) }),
      /ne correspond pas au format annoncé/,
    )
  }
})

test("un logo trop lourd est refusé avant d'atteindre la base", () => {
  const tooBig = pngBytes(BRAND_LOGO_MAX_BYTES)
  assert.ok(tooBig.length > BRAND_LOGO_MAX_BYTES)
  assert.throws(
    () => decodeBrandLogo({ mime_type: "image/png", data_base64: base64(tooBig) }),
    /300 Ko/,
  )
})

test("un corps vide ou mal encodé est refusé", () => {
  assert.throws(() => decodeBrandLogo({ mime_type: "image/png", data_base64: "" }), /illisible|vide/)
  assert.throws(() => decodeBrandLogo({ mime_type: "image/png", data_base64: "pas du base64 !" }), /illisible/)
  // Longueur non multiple de 4 : base64 tronqué.
  const truncated = base64(pngBytes()).slice(0, 21)
  assert.throws(() => decodeBrandLogo({ mime_type: "image/png", data_base64: truncated }), /illisible/)
})

test("les octets rendus par le pilote sont toujours une image", () => {
  const bytes = pngBytes()
  assert.deepEqual(toImageBuffer(bytes), bytes)
  assert.deepEqual(toImageBuffer(new Uint8Array(bytes)), bytes)
  // Certains pilotes rendent un `bytea` sous forme hexadécimale préfixée.
  assert.deepEqual(toImageBuffer(`\\x${bytes.toString("hex")}`), bytes)
})

test("l'URL du logo change à chaque téléversement", () => {
  const first = logoUrl("2026-10-31T10:00:00.000Z")
  const second = logoUrl("2026-10-31T10:00:01.000Z")
  assert.match(first, /^\/api\/v1\/branding\/logo\?v=\d+$/)
  assert.notEqual(first, second, "deux téléversements ne doivent pas partager la même URL")
  assert.equal(logoUrl(new Date("2026-10-31T10:00:00.000Z")), first)
})

// ---------------------------------------------------------------------------
// préparation côté navigateur — les parties pures
// ---------------------------------------------------------------------------

test("la signature binaire fixe le format, pas l'extension du fichier", () => {
  assert.equal(sniffImageMime(pngBytes()), "image/png")
  assert.equal(sniffImageMime(jpegBytes()), "image/jpeg")
  assert.equal(sniffImageMime(webpBytes()), "image/webp")
  // GIF, BMP, SVG : hors du périmètre.
  assert.equal(sniffImageMime(Buffer.from("GIF89a")), null)
  assert.equal(sniffImageMime(Buffer.from("BM")), null)
  assert.equal(sniffImageMime(Buffer.from("<svg xmlns=")), null)
  assert.equal(sniffImageMime(new Uint8Array()), null)
})

test("aucune image transparente n'est convertie en JPEG", () => {
  const attempts = planLogoAttempts(true)
  assert.ok(attempts.length > 1)
  assert.equal(attempts.filter((a) => a.mime_type === "image/jpeg").length, 0)
  assert.equal(attempts[0].mime_type, "image/png", "le PNG transparent est essayé en premier")
})

test("le plan de compression reste sous le plafond et tient dans le corps JSON", () => {
  for (const transparent of [true, false]) {
    const attempts = planLogoAttempts(transparent)
    for (const attempt of attempts) {
      assert.ok(BRAND_LOGO_MIME_TYPES.includes(attempt.mime_type as BrandLogoMimeType))
      assert.ok(attempt.edge > 0 && attempt.edge <= BRAND_LOGO_MAX_EDGE, `bord hors limites : ${attempt.edge}`)
    }
    // Les dernières tentatives sont plus légères que les premières : sans
    // cela, un échec de taille en fin de liste serait définitif.
    const last = attempts[attempts.length - 1]
    assert.ok(last.edge <= attempts[0].edge)
  }
  assert.ok(planLogoAttempts(false).some((a) => a.mime_type === "image/jpeg"))
})

test("les deux plafonds et la contrainte SQL disent la même chose", async () => {
  const { schemaSql } = await import("../server/db.ts")
  const check = /logo_byte_size BETWEEN 1 AND (\d+)/.exec(schemaSql)
  assert.ok(check, "contrainte de taille introuvable dans le schéma")
  assert.equal(Number(check[1]), BRAND_LOGO_MAX_BYTES)
  assert.equal(CLIENT_MAX_BRAND_LOGO_BYTES, BRAND_LOGO_MAX_BYTES)
})

test("les tailles s'affichent en français", () => {
  assert.equal(formatBytes(0), "0 Ko")
  assert.equal(formatBytes(512), "512 o")
  assert.equal(formatBytes(2048), "2 Ko")
  assert.equal(formatBytes(1_468_006), "1,4 Mo")
})

// ---------------------------------------------------------------------------
// L'API, de bout en bout
// ---------------------------------------------------------------------------

test("une station sans logo personnalisé répond null, pas une erreur", async () => {
  const response = await api("/api/v1/branding", { as: "laveur@washpilot.ci" })
  assert.equal(response.status, 200)
  const payload = (await response.json()) as { logo: LogoSummary | null }
  assert.equal(payload.logo, null)

  const image = await api("/api/v1/branding/logo", { as: "laveur@washpilot.ci" })
  assert.equal(image.status, 404)
  const body = (await image.json()) as { error?: { code?: string } }
  assert.equal(body.error?.code, "brand_logo_not_found")
})

test("le propriétaire téléverse un logo, tout le monde le voit", async () => {
  const bytes = pngBytes(120)
  const response = await api("/api/v1/branding/logo", {
    as: "demo@washpilot.ci",
    method: "PUT",
    body: { mime_type: "image/png", data_base64: base64(bytes) },
  })
  assert.equal(response.status, 200)
  const payload = (await response.json()) as { logo: LogoSummary }
  assert.equal(payload.logo.mime_type, "image/png")
  assert.equal(payload.logo.byte_size, bytes.length)
  assert.match(payload.logo.url, /^\/api\/v1\/branding\/logo\?v=\d+$/)

  // L'image revient intacte, avec les en-têtes qui la rendent inoffensive.
  const image = await api(payload.logo.url, { as: "laveur@washpilot.ci" })
  assert.equal(image.status, 200)
  assert.equal(image.headers.get("content-type"), "image/png")
  assert.equal(image.headers.get("x-content-type-options"), "nosniff")
  assert.match(image.headers.get("cache-control") ?? "", /private/)
  assert.deepEqual(Buffer.from(await image.arrayBuffer()), bytes)

  // Un agent de lavage lit l'identité de sa station : c'est sa barre latérale.
  const meta = await api("/api/v1/branding", { as: "laveur@washpilot.ci" })
  assert.equal(meta.status, 200)
  assert.equal(((await meta.json()) as { logo: LogoSummary }).logo.byte_size, bytes.length)
})

test("un second téléversement remplace le premier, sans laisser d'orphelin", async () => {
  const jpeg = jpegBytes(64)
  const response = await api("/api/v1/branding/logo", {
    as: "demo@washpilot.ci",
    method: "PUT",
    body: { mime_type: "image/jpeg", data_base64: base64(jpeg) },
  })
  assert.equal(response.status, 200)
  const payload = (await response.json()) as { logo: LogoSummary }
  assert.equal(payload.logo.mime_type, "image/jpeg")

  const rows = await pool.query("SELECT count(*)::int AS total FROM organization_branding WHERE organization_id=$1::uuid", [orgId])
  assert.equal(rows.rows[0].total, 1, "une seule ligne par organisation")
})

test("seul le propriétaire peut changer le logo", async () => {
  const body = { mime_type: "image/png", data_base64: base64(pngBytes()) }
  for (const email of ["gerant@washpilot.ci", "laveur@washpilot.ci"]) {
    const put = await api("/api/v1/branding/logo", { as: email, method: "PUT", body })
    assert.equal(put.status, 403, `${email} ne doit pas téléverser de logo`)
    const del = await api("/api/v1/branding/logo", { as: email, method: "DELETE" })
    assert.equal(del.status, 403, `${email} ne doit pas retirer de logo`)
  }
})

test("le serveur refuse ce que le navigateur aurait dû refuser", async () => {
  const mismatch = await api("/api/v1/branding/logo", {
    as: "demo@washpilot.ci",
    method: "PUT",
    body: { mime_type: "image/png", data_base64: base64(jpegBytes()) },
  })
  assert.equal(mismatch.status, 400)
  assert.equal(((await mismatch.json()) as { error: { code: string } }).error.code, "invalid_brand_logo")

  const tooBig = await api("/api/v1/branding/logo", {
    as: "demo@washpilot.ci",
    method: "PUT",
    body: { mime_type: "image/png", data_base64: base64(pngBytes(BRAND_LOGO_MAX_BYTES)) },
  })
  assert.equal(tooBig.status, 400)

  const wrongType = await api("/api/v1/branding/logo", {
    as: "demo@washpilot.ci",
    method: "PUT",
    body: { mime_type: "image/gif", data_base64: base64(pngBytes()) },
  })
  assert.equal(wrongType.status, 400)

  // Rien de tout cela n'a touché le logo en place.
  const meta = await api("/api/v1/branding", { as: "demo@washpilot.ci" })
  assert.equal(((await meta.json()) as { logo: LogoSummary }).logo.mime_type, "image/jpeg")
})

test("le logo d'une autre organisation reste invisible", async () => {
  if (!otherOrgId) return
  await pool.query("DELETE FROM organization_branding WHERE organization_id=$1::uuid", [otherOrgId])
  const bytes = webpBytes(48)
  await pool.query(
    `INSERT INTO organization_branding(organization_id, logo_mime_type, logo_byte_size, logo_data, logo_updated_at, updated_at)
     VALUES($1::uuid,'image/webp',$2,$3,now(),now())`,
    [otherOrgId, bytes.length, bytes],
  )
  const image = await api("/api/v1/branding/logo", { as: "demo@washpilot.ci" })
  assert.equal(image.status, 200)
  const served = Buffer.from(await image.arrayBuffer())
  assert.notDeepEqual(served, bytes, "le logo d'une autre station ne doit jamais être servi")
  const meta = await api("/api/v1/branding", { as: "demo@washpilot.ci" })
  assert.notEqual(((await meta.json()) as { logo: LogoSummary }).logo.mime_type, "image/webp")
  await pool.query("DELETE FROM organization_branding WHERE organization_id=$1::uuid", [otherOrgId])
})

test("retirer le logo ramène à la marque par défaut", async () => {
  const removal = await api("/api/v1/branding/logo", { as: "demo@washpilot.ci", method: "DELETE" })
  assert.equal(removal.status, 200)
  assert.deepEqual(await removal.json(), { logo: null })

  const meta = await api("/api/v1/branding", { as: "demo@washpilot.ci" })
  assert.equal(((await meta.json()) as { logo: LogoSummary | null }).logo, null)
  const image = await api("/api/v1/branding/logo", { as: "demo@washpilot.ci" })
  assert.equal(image.status, 404)

  // La ligne a disparu : pas de logo fantôme dans la base ni dans la sauvegarde.
  const rows = await pool.query("SELECT count(*)::int AS total FROM organization_branding WHERE organization_id=$1::uuid", [orgId])
  assert.equal(rows.rows[0].total, 0)

  // Retirer un logo déjà absent ne casse rien.
  const again = await api("/api/v1/branding/logo", { as: "demo@washpilot.ci", method: "DELETE" })
  assert.equal(again.status, 200)
})

test("chaque changement de logo laisse une trace lisible", async () => {
  const rows = await pool.query<{ action: string }>(
    `SELECT action FROM audit_logs
      WHERE organization_id=$1::uuid AND action LIKE 'branding.%'
      ORDER BY created_at`,
    [orgId],
  )
  const actions = rows.rows.map((row) => row.action)
  assert.ok(actions.includes("branding.logo_updated"), "le téléversement doit être tracé")
  assert.ok(actions.includes("branding.logo_removed"), "le retrait doit être tracé")
})
