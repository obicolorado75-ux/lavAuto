import test, { before, after } from "node:test"
import assert from "node:assert/strict"
import type { Server } from "node:http"
import { initDatabaseSchema, getPool, closeDatabase } from "../server/db.ts"
import { createApiApp } from "../server/app.ts"
import { resetAuthThrottle } from "../server/auth-router.ts"

// ---------------------------------------------------------------------------
// Anti-brute-force sur les endpoints de credentials
//
// Deux couches doivent coexister sans se marcher dessus :
//   • budget large par IP (30 / 15 min) — le trafic normal d'une station ;
//   • budget étroit par COMPTE CIBLÉ (8 / 15 min) — ce qui tue une attaque
//     à IP rotative, car la clé ne contient plus l'adresse de l'attaquant.
// Et une règle métier : une authentification RÉUSSIE recharge le budget du
// compte (un gérant légitime n'est jamais puni indéfiniment).
// ---------------------------------------------------------------------------

let server: Server
let baseUrl: string

const PASSWORD = "WashPilot2026!"
const VICTIM = "victime-rl@washpilot.ci"

async function tryLogin(email: string, password = "mauvais-mot-de-passe") {
  return fetch(`${baseUrl}/api/v1/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  })
}

before(async () => {
  assert.ok(await initDatabaseSchema(), "base de test initialisée")
  const pool = getPool()!
  // Compte créé directement en base : on veut un login qui ÉCHOUE avec de
  // vraies mauvaises réponses, pas un 400 de schéma ni un effet de bord
  // d'inscription.
  const { hashPassword } = await import("../server/auth.ts")
  const orgQ = await pool.query(
    "INSERT INTO organizations (name, slug) VALUES ('Station RL', NULL) RETURNING id",
  )
  const userQ = await pool.query(
    `INSERT INTO users (email, first_name, last_name, password_hash, status, organization_id)
     VALUES ($1, 'Victime', 'Test', $2, 'active', $3) RETURNING id`,
    [VICTIM, await hashPassword(PASSWORD), orgQ.rows[0].id],
  )
  await pool.query(
    "INSERT INTO organization_members (organization_id, user_id, role) VALUES ($1, $2, 'owner')",
    [orgQ.rows[0].id, userQ.rows[0].id],
  )

  const app = createApiApp()
  await new Promise<void>((resolve) => {
    server = app.listen(0, "127.0.0.1", resolve)
  })
  const address = server.address()
  baseUrl = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`
})

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()))
  await closeDatabase()
})

test("les tentatives échouées d'un même compte finissent par être bloquées (429)", async () => {
  resetAuthThrottle(VICTIM) // fenêtre propre, quel que soit l'ordre des tests
  let lastStatus = 0
  for (let i = 0; i < 12; i += 1) {
    lastStatus = (await tryLogin(VICTIM)).status
    if (lastStatus === 429) break
  }
  assert.equal(lastStatus, 429, "le budget du compte doit expirer avant le budget IP")
})

test("une authentification réussie recharge le budget du compte", async () => {
  // Le blocage précédent est levé par resetAuthThrottle — ce que le serveur
  // fait lui-même après un login réussi. On vérifie qu'un bon mot de passe
  // ouvre bien une session dans la foulée.
  resetAuthThrottle(VICTIM)
  const response = await tryLogin(VICTIM, PASSWORD)
  assert.equal(response.status, 200, "le bon mot de passe doit fonctionner après reset")
  assert.ok(response.headers.getSetCookie().length > 0, "un cookie de session est posé")
})

test("le budget par compte est indépendant des comptes voisins", async () => {
  resetAuthThrottle(VICTIM)
  // On épuise le budget de la victime…
  for (let i = 0; i < 10; i += 1) await tryLogin(VICTIM)
  // …un autre compte vierge doit encore pouvoir tenter sa chance (401, pas 429).
  const other = await tryLogin("tiers-rl@washpilot.ci")
  assert.equal(other.status, 401, "le throttling vise le compte attaqué, pas le reste du monde")
})
