/**
 * Identité visuelle de la station — le logo téléversé depuis Paramètres.
 *
 * ## Pourquoi le logo vit dans la base
 *
 * L'application n'a jamais eu de disque ni de compartiment objet : tout vit
 * dans PostgreSQL (voir SUPABASE.md). Un logo rangé ailleurs imposerait un
 * second fournisseur, un second jeu de secrets et une restauration séparée —
 * pour une image de 200 Ko. Il est donc stocké en `bytea`, borné par un CHECK
 * dans le schéma, et servi par une route qui le relit.
 *
 * ## Ce qui est vérifié, et pourquoi
 *
 * Un type MIME déclaré par le navigateur ne prouve rien : il vient du client.
 * On regarde donc les **premiers octets** du fichier (signature PNG, JPEG ou
 * WebP) et on refuse tout ce qui ne correspond pas au type annoncé. Sans ce
 * contrôle, un fichier HTML nommé « logo.png » serait servi plus tard avec
 * `Content-Type: image/png` — inoffensif grâce à `nosniff`, mais la base
 * contiendrait autre chose qu'un logo, et la sauvegarde avec.
 *
 * La limite de 300 Ko est assumée : un logo d'application s'affiche à 30 px de
 * haut dans la barre latérale et sur 40 mm de papier. Au-delà, ce n'est plus un
 * logo, c'est une photo qu'on n'a pas redimensionnée — le navigateur le fait
 * avant l'envoi (voir `src/lib/brand-logo.ts`), et le serveur le vérifie.
 *
 * ## Qui peut faire quoi
 *
 * Lire le logo : tout membre connecté — c'est ce qui s'affiche dans sa barre
 * latérale. Le changer : `settings:manage`, réservée au propriétaire, comme
 * tout ce qui touche à l'identité de la station.
 */

import { Router } from "express"
import { z } from "zod"
import type { Pool } from "pg"
import { getPool } from "./db.ts"
import { HttpError } from "./auth.ts"
import { asyncRoute, body, requirePermission, tenant } from "./http.ts"

/** Formats acceptés. PNG d'abord : c'est le seul qui porte la transparence. */
export const BRAND_LOGO_MIME_TYPES = ["image/png", "image/jpeg", "image/webp"] as const
export type BrandLogoMimeType = (typeof BRAND_LOGO_MIME_TYPES)[number]

/** Plafond en octets, identique au CHECK de `organization_branding`. */
export const BRAND_LOGO_MAX_BYTES = 300_000

export interface BrandLogoInput {
  mime_type: BrandLogoMimeType
  data_base64: string
}

/** Signature binaire de chaque format accepté. */
function looksLike(mime: BrandLogoMimeType, data: Buffer): boolean {
  if (mime === "image/png") {
    // 89 50 4E 47 0D 0A 1A 0A
    return data.length >= 8 && data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  }
  if (mime === "image/jpeg") {
    // FF D8 FF — SOI + premier marqueur.
    return data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff
  }
  // WebP : RIFF….WEBP
  return (
    data.length >= 12 &&
    data.subarray(0, 4).toString("ascii") === "RIFF" &&
    data.subarray(8, 12).toString("ascii") === "WEBP"
  )
}

/**
 * Décode et vérifie un logo reçu. Fonction pure : testable sans base, sans
 * réseau, sans navigateur — c'est la partie qui décide de ce qui entre dans la
 * table.
 */
export function decodeBrandLogo(input: BrandLogoInput): Buffer {
  // Une chaîne base64 de N octets pèse 4N/3 : borner la chaîne avant de
  // décoder évite de construire 200 Mo de mémoire pour un envoi malveillant.
  if (input.data_base64.length > (BRAND_LOGO_MAX_BYTES * 4) / 3 + 4) {
    throw new HttpError(400, "brand_logo_too_large", "Le logo ne doit pas dépasser 300 Ko.")
  }
  if (input.data_base64.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(input.data_base64)) {
    throw new HttpError(400, "invalid_brand_logo", "Le fichier du logo est illisible.")
  }
  const data = Buffer.from(input.data_base64, "base64")
  if (!data.length) {
    throw new HttpError(400, "invalid_brand_logo", "Le fichier du logo est vide.")
  }
  if (data.length > BRAND_LOGO_MAX_BYTES) {
    throw new HttpError(400, "brand_logo_too_large", "Le logo ne doit pas dépasser 300 Ko.")
  }
  // Aller-retour : garantit qu'aucun caractère n'a été ignoré au décodage.
  if (data.toString("base64") !== input.data_base64) {
    throw new HttpError(400, "invalid_brand_logo", "Le fichier du logo est illisible.")
  }
  if (!looksLike(input.mime_type, data)) {
    throw new HttpError(
      400,
      "invalid_brand_logo",
      "Le contenu du fichier ne correspond pas au format annoncé. Utilisez une image PNG, JPEG ou WebP.",
    )
  }
  return data
}

/** Enveloppe hexadécimale rendue par certains pilotes pour un `bytea`. */
export function toImageBuffer(raw: unknown): Buffer {
  if (Buffer.isBuffer(raw)) return raw
  if (raw instanceof Uint8Array) return Buffer.from(raw)
  return Buffer.from(String(raw ?? "").replace(/^\\x/, ""), "hex")
}

const logoValidator = z
  .object({
    mime_type: z.enum(BRAND_LOGO_MIME_TYPES),
    data_base64: z.string().min(1, "Le fichier du logo est vide."),
  })
  .strip()

interface BrandingRow {
  logo_mime_type: string | null
  logo_byte_size: number | null
  logo_updated_at: Date | null
}

export interface BrandLogoSummary {
  mime_type: string
  byte_size: number
  /** Date ISO du dernier téléversement : sert de version pour le cache. */
  updated_at: string
  /** Adresse à mettre dans `src` — versionnée, donc jamais périmée. */
  url: string
}

function summarise(row: BrandingRow | undefined): BrandLogoSummary | null {
  if (!row?.logo_mime_type || !row.logo_updated_at) return null
  const updatedAt = new Date(row.logo_updated_at)
  return {
    mime_type: row.logo_mime_type,
    byte_size: Number(row.logo_byte_size ?? 0),
    updated_at: updatedAt.toISOString(),
    url: logoUrl(updatedAt),
  }
}

/** URL versionnée du logo : le cache du navigateur se périme tout seul. */
export function logoUrl(updatedAt: Date | string): string {
  const stamp = new Date(updatedAt).getTime()
  return `/api/v1/branding/logo?v=${Number.isFinite(stamp) ? stamp : 0}`
}

function db(): Pool {
  const pool = getPool()
  if (!pool) throw new HttpError(503, "database_not_configured", "Base de données indisponible.")
  return pool
}

export function createBrandingRouter() {
  const r = Router()

  // GET /api/v1/branding — l'identité de la station, sans les octets.
  //
  // Lisible par tout membre : c'est ce qui décore sa barre latérale et son
  // reçu. Aucune donnée personnelle, aucun réglage sensible.
  r.get(
    "/branding",
    asyncRoute(async (req, res) => {
      const t = tenant(req)
      const q = await db().query<BrandingRow>(
        `SELECT logo_mime_type, logo_byte_size, logo_updated_at
           FROM organization_branding WHERE organization_id = $1::uuid`,
        [t.organizationId],
      )
      res.json({ logo: summarise(q.rows[0]) })
    }),
  )

  // GET /api/v1/branding/logo — les octets, servis en image.
  //
  // Pas de `requirePermission` : tout membre doit voir le logo de sa station.
  // Le `Cache-Control` de la pile `/api/v1` est `private, no-store` ; on le
  // remplace ici par un cache court et **versionné par l'URL** (`?v=`), pour
  // que le changement de logo se voie immédiatement sans marteler la base.
  r.get(
    "/branding/logo",
    asyncRoute(async (req, res) => {
      const t = tenant(req)
      const q = await db().query<BrandingRow & { logo_data: unknown }>(
        `SELECT logo_mime_type, logo_byte_size, logo_updated_at, logo_data
           FROM organization_branding WHERE organization_id = $1::uuid`,
        [t.organizationId],
      )
      const row = q.rows[0] as (BrandingRow & { logo_data: unknown }) | undefined
      if (!row?.logo_mime_type || !row.logo_data) {
        throw new HttpError(404, "brand_logo_not_found", "Cette station n'a pas de logo personnalisé.")
      }
      const data = toImageBuffer(row.logo_data)
      const etag = `W/"${new Date(row.logo_updated_at ?? Date.now()).getTime()}-${data.length}"`
      if (req.headers["if-none-match"] === etag) {
        res.status(304).end()
        return
      }
      const extension = row.logo_mime_type === "image/webp" ? "webp" : row.logo_mime_type === "image/jpeg" ? "jpg" : "png"
      res.setHeader("Content-Type", row.logo_mime_type)
      res.setHeader("Content-Length", String(data.length))
      res.setHeader("Content-Disposition", `inline; filename="logo.${extension}"`)
      res.setHeader("Cache-Control", "private, max-age=86400")
      res.setHeader("ETag", etag)
      res.setHeader("X-Content-Type-Options", "nosniff")
      res.send(data)
    }),
  )

  // PUT /api/v1/branding/logo — téléverse (ou remplace) le logo.
  r.put(
    "/branding/logo",
    requirePermission("settings:manage"),
    asyncRoute(async (req, res) => {
      const t = tenant(req)
      const input = body(logoValidator, req.body)
      const data = decodeBrandLogo(input)
      const pool = db()
      const q = await pool.query<BrandingRow>(
        `INSERT INTO organization_branding(organization_id, logo_mime_type, logo_byte_size, logo_data, logo_updated_at, updated_by, updated_at)
         VALUES($1::uuid, $2, $3, $4, now(), $5::uuid, now())
         ON CONFLICT (organization_id) DO UPDATE SET
           logo_mime_type = EXCLUDED.logo_mime_type,
           logo_byte_size = EXCLUDED.logo_byte_size,
           logo_data = EXCLUDED.logo_data,
           logo_updated_at = now(),
           updated_by = EXCLUDED.updated_by,
           updated_at = now()
         RETURNING logo_mime_type, logo_byte_size, logo_updated_at`,
        [t.organizationId, input.mime_type, data.length, data, t.userId],
      )
      await pool.query(
        `INSERT INTO audit_logs(organization_id, actor_user_id, action, entity_type, entity_id, metadata)
         VALUES($1::uuid, $2::uuid, 'branding.logo_updated', 'organization', $1::text, $3::jsonb)`,
        [t.organizationId, t.userId, JSON.stringify({ mime_type: input.mime_type, byte_size: data.length })],
      )
      res.status(200).json({ logo: summarise(q.rows[0]) })
    }),
  )

  // DELETE /api/v1/branding/logo — revient à l'identité par défaut.
  r.delete(
    "/branding/logo",
    requirePermission("settings:manage"),
    asyncRoute(async (req, res) => {
      const t = tenant(req)
      const pool = db()
      const q = await pool.query(
        "DELETE FROM organization_branding WHERE organization_id = $1::uuid",
        [t.organizationId],
      )
      if (q.rowCount) {
        await pool.query(
          `INSERT INTO audit_logs(organization_id, actor_user_id, action, entity_type, entity_id)
           VALUES($1::uuid, $2::uuid, 'branding.logo_removed', 'organization', $1::text)`,
          [t.organizationId, t.userId],
        )
      }
      res.status(200).json({ logo: null })
    }),
  )

  return r
}
