import test from "node:test"
import assert from "node:assert/strict"
import { createHmac } from "node:crypto"

import { createPaymentsWebhookRouter } from "../server/payments-webhook.ts"
import { env } from "../server/env.ts"

// ---------------------------------------------------------------------------
// Webhook d'activation des abonnements — la partie purement vérifiable sans
// base de données : les trois verrous qui précèdent toute écriture.
//
//   1. secret absent → 503, la surface n'existe pas ;
//   2. signature HMAC sur les OCTETS BRUTS du corps, comparée en temps
//      constant — un corps re-sérialisé (clés réordonnées, espaces retirés)
//      doit être refusé, sinon la promesse « signé sur ce qui a été envoyé »
//      ne vaut rien ;
//   3. charge utile stricte : transaction_id obligatoire, inconnu toléré.
//
// Les scénarios avec intention réelle (activation, idempotence, montant
// partiel, course webhook/validation humaine) vivent dans checkout.test.ts,
// où le parcours complet est déjà monté. Ce fichier protège la DOGME : si
// l'un de ces trois refus cesse de répondre, un abonnement gratuit est à
// portée d'une requête HTTP fabriquée.
// ---------------------------------------------------------------------------

const SECRET = "wh_test_secret_2026"

function sign(body: string): string {
  return createHmac("sha256", SECRET).update(Buffer.from(body, "utf8")).digest("hex")
}

/** Serveur éphémère portant le routeur webhook seul, comme au montage réel. */
async function start(): Promise<string> {
  const { default: express } = await import("express")
  const { apiErrorHandler } = await import("../server/app.ts")
  const app = express()
  app.use(express.json({ limit: "1mb" }))
  app.use("/api/v1", createPaymentsWebhookRouter())
  app.use(apiErrorHandler)
  const server = app.listen(0, "127.0.0.1")
  await new Promise<void>((resolve) => server.once("listening", resolve))
  const address = server.address()
  const port = typeof address === "object" && address ? address.port : 0
  // fermetures propres : le process de test reste léger
  test.after?.(() => server.close())
  return `http://127.0.0.1:${port}/api/v1/payments/webhook`
}

async function post(url: string, body: string, headers: Record<string, string> = {}) {
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body,
  })
}

test("secret absent : la route répond 503 et n'examine même pas la signature", async () => {
  const previous = env.PAYMENT_WEBHOOK_SECRET
  env.PAYMENT_WEBHOOK_SECRET = ""
  try {
    const url = await start()
    const response = await post(url, JSON.stringify({ transaction_id: "TX-1", status: "success" }), {
      "X-Signature": sign(JSON.stringify({ transaction_id: "TX-1", status: "success" })),
    })
    assert.equal(response.status, 503)
    const payload = await response.json()
    assert.equal(payload.error.code, "webhook_not_configured")
  } finally {
    env.PAYMENT_WEBHOOK_SECRET = previous
  }
})

test("signature valide + transaction inconnue : 200 ignoré, aucune écriture d'activation", async () => {
  const previous = env.PAYMENT_WEBHOOK_SECRET
  env.PAYMENT_WEBHOOK_SECRET = SECRET
  try {
    const url = await start()
    const body = JSON.stringify({ transaction_id: "TX-INCONNUE", status: "success", amount: 20000 })
    const response = await post(url, body, { "X-Signature": sign(body) })
    // Soit 200 {action:"ignored"} si la base de test tourne, soit 503 si elle
    // est indisponible — dans les deux cas JAMAIS une activation ni un 500.
    assert.ok(response.status === 200 || response.status === 503, `statut ${response.status}`)
    if (response.status === 200) {
      const payload = await response.json()
      assert.equal(payload.received, true)
      assert.ok(["ignored", "activated"].includes(payload.action))
      // Sans intention correspondante dans cette base fraiche, impossible
      // d'avoir activé quoi que ce soit.
      assert.equal(payload.action, "ignored")
    }
  } finally {
    env.PAYMENT_WEBHOOK_SECRET = previous
  }
})

test("signature absente ou fausse : 401, muet sur la raison precise", async () => {
  const previous = env.PAYMENT_WEBHOOK_SECRET
  env.PAYMENT_WEBHOOK_SECRET = SECRET
  try {
    const url = await start()
    const body = JSON.stringify({ transaction_id: "TX-2", status: "success" })

    const noSig = await post(url, body)
    assert.equal(noSig.status, 401)
    assert.equal((await noSig.json()).error.code, "invalid_signature")

    const badSig = await post(url, body, { "X-Signature": "deadbeef".repeat(8) })
    assert.equal(badSig.status, 401)

    // Signee pour un autre corps : la signature porte sur CE corps-ci, pas
    // sur une version remaniée intermediaire.
    const swapped = await post(url, body.replace("TX-2", "TX-3"), { "X-Signature": sign(body) })
    assert.equal(swapped.status, 401)
  } finally {
    env.PAYMENT_WEBHOOK_SECRET = previous
  }
})

test("corps altere apres signature (re-serialisation) : refuse", async () => {
  const previous = env.PAYMENT_WEBHOOK_SECRET
  env.PAYMENT_WEBHOOK_SECRET = SECRET
  try {
    const url = await start()
    const body = '{"transaction_id":"TX-4","status":"success","amount":20000}'
    const altered = '{"status":"success","transaction_id":"TX-4","amount":20000}'
    assert.notEqual(body, altered, "les octets doivent differer (ordre des cles)")
    const response = await post(url, altered, { "X-Signature": sign(body) })
    assert.equal(response.status, 401)
  } finally {
    env.PAYMENT_WEBHOOK_SECRET = previous
  }
})

test("charge utile invalide sous signature correcte : 400", async () => {
  const previous = env.PAYMENT_WEBHOOK_SECRET
  env.PAYMENT_WEBHOOK_SECRET = SECRET
  try {
    const url = await start()
    // transaction_id manque : schema strict, meme authentifie.
    const body = JSON.stringify({ status: "success" })
    const response = await post(url, body, { "X-Signature": sign(body) })
    assert.equal(response.status, 400)
    assert.equal((await response.json()).error.code, "invalid_payload")
  } finally {
    env.PAYMENT_WEBHOOK_SECRET = previous
  }
})

test("prefixe sha256= accepte, entetes alternatifs acceptes", async () => {
  const previous = env.PAYMENT_WEBHOOK_SECRET
  env.PAYMENT_WEBHOOK_SECRET = SECRET
  try {
    const url = await start()
    const body = JSON.stringify({ transaction_id: "TX-5", status: "pending" })
    const signature = sign(body)

    const prefixed = await post(url, body, { "X-Signature": `sha256=${signature}` })
    // Neutre : enregistre l'attente. 200 (base prete) ou 503 (base fermee).
    assert.ok(prefixed.status === 200 || prefixed.status === 503, `statut ${prefixed.status}`)

    const altHeader = await post(url, body, { "X-Webhook-Signature": signature })
    assert.ok(altHeader.status === 200 || altHeader.status === 503, `statut ${altHeader.status}`)
  } finally {
    env.PAYMENT_WEBHOOK_SECRET = previous
  }
})
