import test from "node:test"
import assert from "node:assert/strict"
import express from "express"
import type { Server } from "node:http"
import { securityHeaders, buildContentSecurityPolicy } from "../server/security-headers.ts"

// ---------------------------------------------------------------------------
// En-têtes de sécurité HTTP — factorisation server.ts / vercel-app.ts
//
// Les deux entrées serveur montent LE MÊME middleware (security-headers.ts).
// Ce fichier vérifie le contrat du middleware lui-même ; la preuve que les
// deux apps l'utilisent est structurelle (un seul import partagé, grepé dans
// le test de déploiement Vercel). Points clés :
//   • CSP appliquée en production, report-only ailleurs (pas d'interface
//     cassée silencieusement pendant la période de calibration) ;
//   • HSTS émis UNIQUEMENT derrière HTTPS (req.secure, via X-Forwarded-Proto
//     puisque trust proxy est posé sur les deux apps) ;
//   • liste blanche CSP construite depuis les sources réellement utilisées.
// ---------------------------------------------------------------------------

function withApp(run: (baseUrl: string) => Promise<void>): Promise<void> {
  const app = express()
  app.set("trust proxy", 1)
  app.use(securityHeaders)
  app.get("/probe", (_req, res) => res.json({ ok: true }))
  return new Promise((resolve, reject) => {
    const server: Server = app.listen(0, async () => {
      const address = server.address()
      if (typeof address === "object" && address) {
        try {
          await run(`http://127.0.0.1:${address.port}`)
          resolve()
        } catch (error) {
          reject(error)
        } finally {
          server.close()
        }
      } else {
        server.close(() => reject(new Error("adresse de test indisponible")))
      }
    })
  })
}

test("CSP appliquée en production, report-only hors production", async () => {
  const originalEnv = process.env.NODE_ENV
  try {
    process.env.NODE_ENV = "production"
    await withApp(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/probe`)
      const csp = response.headers.get("content-security-policy")
      assert.ok(csp, "Content-Security-Policy présent en production")
      assert.match(csp!, /default-src 'self'/)
      assert.match(csp!, /frame-ancestors 'none'/)
      assert.match(csp!, /upgrade-insecure-requests/)
      assert.equal(response.headers.get("content-security-policy-report-only"), null)
    })

    process.env.NODE_ENV = "development"
    await withApp(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/probe`)
      assert.equal(response.headers.get("content-security-policy"), null)
      assert.ok(
        response.headers.get("content-security-policy-report-only"),
        "report-only hors production : on calibre avant d'appliquer",
      )
    })
  } finally {
    process.env.NODE_ENV = originalEnv
  }
})

test("HSTS uniquement derrière HTTPS", async () => {
  await withApp(async (baseUrl) => {
    // Connexion HTTP simple : pas de HSTS (il serait ignoré, voire nocif).
    const plain = await fetch(`${baseUrl}/probe`)
    assert.equal(plain.headers.get("strict-transport-security"), null)

    // Proxy annonçant HTTPS (trust proxy est posé sur l'app de test comme sur
    // les deux vraies entrées) : HSTS émis, max-age ≈ 1 an, sans preload ni
    // includeSubDomains (choix documentés, non négociables à la légère).
    const secure = await fetch(`${baseUrl}/probe`, {
      headers: { "X-Forwarded-Proto": "https" },
    })
    const hsts = secure.headers.get("strict-transport-security")
    assert.equal(hsts, "max-age=31536000")
    assert.doesNotMatch(hsts!, /preload/i)
    assert.doesNotMatch(hsts!, /includeSubDomains/i)
  })
})

test("en-têtes de base présents sur toutes les réponses", async () => {
  await withApp(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/probe`)
    assert.equal(response.headers.get("x-content-type-options"), "nosniff")
    assert.equal(response.headers.get("referrer-policy"), "strict-origin-when-cross-origin")
    assert.equal(
      response.headers.get("permissions-policy"),
      "camera=(), microphone=(), geolocation=()",
    )
    assert.equal(response.headers.get("x-frame-options"), "DENY")
  })
})

test("liste blanche CSP : les sources déclarées sont celles réellement utilisées", () => {
  const csp = buildContentSecurityPolicy()
  // API et scripts : mêmes origines que la page (proxy Vite / rewrite Vercel).
  assert.match(csp, /script-src 'self' https:\/\/www\.googletagmanager\.com/)
  // Google Fonts (index.html) + styles inline React (style={{…}}).
  assert.match(csp, /style-src 'self' 'unsafe-inline' https:\/\/fonts\.googleapis\.com/)
  assert.match(csp, /font-src 'self' data: https:\/\/fonts\.gstatic\.com/)
  // Aperçus photo (data:) et exports CSV (blob:) générés côté client.
  assert.match(csp, /img-src 'self' data: blob:/)
  // Pas de wildcard nulle part : toute ouverture doit être un choix explicite.
  assert.doesNotMatch(csp, /\*/u)
})

test("connect-src suit l'origine publique déclarée (APP_URL)", () => {
  const originalAppUrl = process.env.APP_URL
  try {
    delete process.env.APP_URL
    assert.match(buildContentSecurityPolicy(), /connect-src 'self'/)

    process.env.APP_URL = "https://washpilot-ci.vercel.app/console"
    assert.match(buildContentSecurityPolicy(), /connect-src 'self' https:\/\/washpilot-ci\.vercel\.app/)

    // APP_URL mal formé : on retombe sur 'self', jamais une politique cassée.
    process.env.APP_URL = "pas-une-url"
    assert.match(buildContentSecurityPolicy(), /connect-src 'self'/)
  } finally {
    if (originalAppUrl === undefined) delete process.env.APP_URL
    else process.env.APP_URL = originalAppUrl
  }
})
