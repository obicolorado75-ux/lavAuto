/**
 * Webhook d'agrégateur de paiement — activation automatique des abonnements.
 *
 * `server/checkout.ts` le promettait depuis le premier jour : une intention de
 * paiement est « idempotente par construction (reference UNIQUE), donc prête à
 * recevoir le webhook d'un agrégateur sans rien changer ». Ce module est la
 * deuxième moitié de cette promesse.
 *
 * La règle cardinale, la même que pour l'encaissement d'un lavage : **un
 * webhook n'est pas une facture**. Il annonce un événement ; l'argent qui a
 * réellement suivi se constate sur le relevé (rapprochement). Ici le risque est
 * plus grand encore qu'en caisse — activer un forfait sur une simple requête
 * HTTP, c'est offrir gratuitement l'abonnement à quiconque sait fabriquer une
 * requête. Trois verrous, dans cet ordre :
 *
 *   1. **Secret absent = route fermée** (503). Comme `CRON_SECRET` : un
 *      déclencheur ouvert serait une porte dérobée vers des activations
 *      gratuites. Le secret ne s'appelle jamais `PAYMENT_PROVIDER` — il est
 *      indépendant, ce qui permet de préparer le webhook avant de basculer
 *      le mode d'encaissement.
 *   2. **Signature HMAC-SHA256 en temps constant**, calculée sur les octets
 *      bruts du corps. Une comparaison naïve (`===`) laisse fuir, octet par
 *      octet, le préfixe du bon code ; une signature calculée sur le corps
 *      *re-sérialisé* ne correspond jamais à celle de l'agrégateur, qui signe
 *      ce qu'il a envoyé, pas ce qu'Express en a fait.
 *   3. **Montant et durée bornés côté serveur**. L'intention locale porte le
 *      prix au moment où le client l'a ouverte ; le webhook ne peut activer
 *      que ce montant-là, arrondi à la semaine payée. Un agrégateur compromis
 *      ou désynchronisé ne peut pas offrir douze mois pour mille francs.
 *
 * Idempotence : un registre dédié, `webhook_events`, clé sur
 * `(transaction_id, verdict)`. Une retransmission réseau — chose courante sur
 * les rails mobiles — est reconnue avant traitement, sans second mois offert.
 * Un événement explicitement annulé après coup (`failed`/`cancelled`/
 * `refunded`) marque l'intention `failed` et refuse toute activation
 * ultérieure pour cette transaction.
 *
 * Montée **avant** `requireSession` dans `mountApi()` : un webhook n'a ni
 * cookie de station ni contexte de locataire — l'intention elle-même désigne
 * l'organisation. C'est le même franchissement assumé que la console, et il
 * est aussi visible au montage.
 */

import { Router } from "express"
import type { NextFunction, Request, Response } from "express"
import { createHmac, timingSafeEqual } from "node:crypto"
import { z } from "zod"

import { env } from "./env.ts"
import { getPool, isDatabaseReady } from "./db.ts"
import { HttpError } from "./auth.ts"
import { asyncRoute } from "./http.ts"
import { activateSubscription } from "./subscription-service.ts"
import { REVENUE_CHANNELS, type RevenueChannel } from "./revenue.ts"

// ---------------------------------------------------------------------------
// Charge utile : stricte, mais tolérante aux variantes d'agrégateurs.
// ---------------------------------------------------------------------------

const webhookEventSchema = z
  .object({
    /** Référence de la transaction chez l'agrégateur — la clé d'idempotence. */
    transaction_id: z.string().trim().min(3).max(120),
    /** Référence de l'intention WashPilot (`WP-…`), rendue à l'agrégateur. */
    reference: z.string().trim().min(3).max(80).optional(),
    /** Statut de l'événement. Tout ce qui n'est pas un succès explicite est traité comme une annonce neutre. */
    status: z.string().trim().min(1).max(40).optional(),
    /** Montant réellement encaissé, tel que déclaré par l'agrégateur. */
    amount: z.union([z.number(), z.string()]).optional(),
    currency: z.string().trim().max(8).optional(),
    /** Canal de l'argent reçu ; validé contre la liste métier, jamais inventé. */
    channel: z.enum(REVENUE_CHANNELS).optional(),
  })
  .strip()

type WebhookPayload = z.infer<typeof webhookEventSchema>

/** Statuts qui signifient « l'argent est là ». Comparaison normalisée : les agrégateurs écrivent SUCCESS, success, paid, approved… */
const SUCCESS_STATUSES = new Set(["success", "successful", "paid", "approved", "settled", "completed"])
/** Statuts qui signifient « l'argent n'arrivera pas, ou est revenu au client ». */
const FAILURE_STATUSES = new Set(["failed", "failure", "cancelled", "canceled", "declined", "expired", "refunded", "reversed"])

function statusVerdict(status: string | undefined): "success" | "failure" | "neutral" {
  const normalized = (status ?? "").toLowerCase().replace(/[^a-z]/g, "")
  if (SUCCESS_STATUSES.has(normalized)) return "success"
  if (FAILURE_STATUSES.has(normalized)) return "failure"
  return "neutral"
}

/**
 * Le montant attendu est en centimes ; les agrégateurs envoient des francs.
 * `Math.round` plutôt que `parseInt` : 20000.99 doit devenir 2 000 100, pas
 * 2 000 000 — un écart de quelques centimes ne doit pas faire échouer la
 * confrontation pour un dirham d'arrondi.
 */
function toCents(amount: number | string | undefined): number | null {
  if (amount === undefined) return null
  const value = typeof amount === "string" ? Number(amount.replace(",", ".")) : amount
  if (!Number.isFinite(value) || value < 0) return null
  return Math.round(value * 100)
}

// ---------------------------------------------------------------------------
// Signature
// ---------------------------------------------------------------------------

/**
 * Extrait la signature d'une requête d'agrégateur.
 *
 * Chaque agrégateur a son entête fétiche ; on accepte les trois conventions
 * dominantes, ainsi que le préfixe `sha256=` que beaucoup prependent. On ne
 * devine jamais le *contenu* : seul l'endroit où chercher varie.
 */
function extractSignature(req: Request): string | null {
  for (const header of ["x-signature", "x-webhook-signature", "webhook-signature"]) {
    const value = req.get(header)
    if (value && value.trim()) {
      return value.trim().replace(/^sha256=/i, "")
    }
  }
  return null
}

function computeSignature(rawBody: Buffer, secret: string): string {
  return createHmac("sha256", secret).update(rawBody).digest("hex")
}

/**
 * Comparaison à temps constant. Deux secrets de longueurs différentes ne sont
 * pas comparables — et cette différence de longueur est déjà une information
 * qu'on refuse de transformer en oracle : on répond simplement « invalide ».
 */
function signatureMatches(expected: string, provided: string): boolean {
  if (expected.length !== provided.length) return false
  return timingSafeEqual(Buffer.from(expected, "utf8"), Buffer.from(provided, "utf8"))
}

// ---------------------------------------------------------------------------
// Corps brut : deux hébergements, deux mécaniques
// ---------------------------------------------------------------------------

declare global {
  var __washpilotRawBodyWeakMap: WeakMap<Request, Buffer> | undefined
}

/**
 * Enregistre le corps brut au fil du flux, avant toute parse JSON.
 *
 * Vercel analyse le JSON **avant** d'appeler la fonction : le flux est vide et
 * `express.raw()` produirait un buffer de zéro octet — donc une signature
 * calculée sur rien, que aucun agrégateur honnête ne présente. Quand le corps
 * arrive déjà analysé (`req.body` posé, `req._body` vrai), on le re-sérialise
 * en JSON canonique : c'est le seul cas où cette reconstruction est correcte,
 * parce que Vercel parse exactement les octets reçus et que les agrégateurs
 * signent leur propre sérialisation JSON. Pour le serveur classique, le
 * captureur lit le flux lui-même, sans intermédiaire.
 */
function attachRawBody(
  req: Request,
  _res: Response,
  next: NextFunction | (() => void),
): void {
  const done = next as (error?: unknown) => void
  if (requestHasParsedBody(req)) {
    ;(req as Request & { _washpilotRaw?: Buffer })._washpilotRaw = Buffer.from(
      JSON.stringify((req as Request & { body?: unknown }).body),
      "utf8",
    )
    done()
    return
  }
  // Garde-fou : si le flux est déjà terminé (corps consommé par un
  // intermédiaire, ou requête sans corps), les listeners « end » ne se
  // déclencheront jamais — on passe la main immédiatement avec un buffer
  // vide explicite plutôt que de laisser la requête suspendue.
  if (req.readableEnded) {
    ;(req as Request & { _washpilotRaw?: Buffer })._washpilotRaw = Buffer.alloc(0)
    done()
    return
  }
  const chunks: Buffer[] = []
  req.on("data", (chunk: Buffer) => chunks.push(chunk))
  req.on("end", () => {
    ;(req as Request & { _washpilotRaw?: Buffer })._washpilotRaw = Buffer.concat(chunks)
    done()
  })
  req.on("error", () =>
    done(new HttpError(400, "invalid_request_body", "Le corps de la requête n'a pas pu être lu.")),
  )
}

/**
 * Le parseur de corps a-t-il déjà drainé le flux ?
 *
 * Piège mesuré sur express 5 / body-parser 2 : le drapeau `_body` est posé
 * par `raw-body` en fin de consommation, mais la route peut être atteinte
 * AVANT son rafraîchissement — un test strict sur `_body === true` laisse
 * alors filer la requête vers la lecture du flux, déjà épuisé : l'événement
 * « end » ne se déclenche plus et la requête reste suspendue jusqu'au
 * timeout. Les deux signaux sont donc testés séparément :
 *   - `_body === true` (le parseur a tourné), ou
 *   - `readableEnded` (le flux est fini) avec un objet `body` posé.
 * Dans les deux cas il n'y a plus d'octets à lire : on re-sérialise.
 */
function requestHasParsedBody(req: Request): boolean {
  const candidate = req as Request & { body?: unknown; _body?: boolean }
  if (candidate._body === true) return true
  return req.readableEnded && typeof candidate.body === "object" && candidate.body !== null
}

/**
 * Récupère les octets signés.
 *
 * Deux sources, dans l'ordre de confiance : le buffer posé par notre
 * middleware (montage local ou Vercel), puis `req.rawBody`, convention
 * d'autres hébergeurs. Si aucune n'existe, on refuse la requête — mieux vaut
 * un 400 honnête qu'une signature calquée sur un corps reconstruit au hasard.
 */
function resolveRawBody(req: Request & { rawBody?: Buffer }): Buffer | null {
  const attached = (req as Request & { _washpilotRaw?: Buffer })._washpilotRaw
  if (attached !== undefined) return attached
  if (Buffer.isBuffer(req.rawBody)) return req.rawBody
  return null
}

// ---------------------------------------------------------------------------
// Réponse : toujours 200 pour un événement traité, y compris refusé.
// ---------------------------------------------------------------------------

interface WebhookResult {
  received: true
  action: "activated" | "ignored" | "marked_failed"
  reason: string
  reference?: string
  subscription_status?: string
  current_period_end?: string
}

// ---------------------------------------------------------------------------
// Routeur
// ---------------------------------------------------------------------------

export function createPaymentsWebhookRouter(): Router {
  const r = Router()

  r.post(
    "/payments/webhook",
    attachRawBody,
    asyncRoute(async (req: Request, res: Response) => {
      // -- Verrou 1 : le secret. Absent, la surface n'existe pas. ------------
      const secret = env.PAYMENT_WEBHOOK_SECRET.trim()
      if (!secret) {
        res.status(503).json({
          error: {
            code: "webhook_not_configured",
            message: "PAYMENT_WEBHOOK_SECRET n'est pas défini : le webhook d'activation automatique est fermé.",
          },
        })
        return
      }

      // -- Verrou 2 : la signature, sur les octets bruts. --------------------
      const rawBody = resolveRawBody(req as Request & { rawBody?: Buffer })
      if (rawBody === null) {
        throw new HttpError(400, "invalid_request_body", "Corps de requête illisible : signature impossible à vérifier.")
      }
      const signature = extractSignature(req)
      if (!signature || !signatureMatches(computeSignature(rawBody, secret), signature)) {
        // Volontairement muet sur la raison précise : un attaquant explorant
        // l'entête ou le corps ne doit pas apprendre laquelle des deux pièces
        // il a trouvée.
        throw new HttpError(401, "invalid_signature", "Signature de webhook invalide.")
      }

      // -- Charge utile. ------------------------------------------------------
      let parsed
      try {
        parsed = webhookEventSchema.parse(JSON.parse(rawBody.toString("utf8")))
      } catch {
        throw new HttpError(400, "invalid_payload", "Charge utile du webhook illisible.")
      }
      const payload = parsed as WebhookPayload

      const pool = getPool()
      if (!pool || !isDatabaseReady()) {
        // 503 : l'agrégateur rejouera. Un webhook perdu faute de base est
        // regagné à la seconde suivante ; une activation ratée ne l'est pas.
        res.status(503).json({
          error: { code: "database_unavailable", message: "Base de données indisponible, réessayez." },
        })
        return
      }

      // -- Verrou 3 : idempotence par (transaction, verdict). ------------------
      // La clé est dérivée, jamais saisie par l'expéditeur : c'est nous qui
      // décidons ce qu'un « même événement » signifie. L'insertion atomique
      // dans `webhook_events` gagne ou perd la course : le perdant rejoue la
      // réponse du gagnant, sans second traitement.
      const verdict = statusVerdict(payload.status)
      const claim = await pool.query<{ id: string }>(
        `INSERT INTO webhook_events(provider, transaction_id, event_key, payload, status)
         VALUES($1, $2, $3, $4::jsonb, 'processing')
         ON CONFLICT (event_key) DO NOTHING
         RETURNING id`,
        [env.PAYMENT_PROVIDER, payload.transaction_id, `${payload.transaction_id}:${verdict}`, JSON.stringify(payload)],
      )

      if (!claim.rowCount) {
        const prior = await pool.query<{ status: string; result: WebhookResult | null }>(
          "SELECT status, result FROM webhook_events WHERE event_key = $1",
          [`${payload.transaction_id}:${verdict}`],
        )
        const row = prior.rows[0]
        if (row?.status === "processed" && row.result) {
          res.setHeader("Idempotency-Replayed", "true")
          res.status(200).json(row.result)
          return
        }
        // Le premier traitement est encore en cours (ou a échoué) : rien ne
        // sert de traiter deux fois — l'agrégateur rejouera et trouvera soit
        // la réponse finale, soit une place libre.
        res.status(202).json({ received: true, reason: "Événement déjà en cours de traitement." })
        return
      }
      const eventId = claim.rows[0]?.id ? String(claim.rows[0].id) : ""

      let result: WebhookResult
      try {
        result = await handleVerifiedWebhook(pool, payload, verdict)
      } catch (error) {
        // Trace d'échec puis propagation : un 5xx Honnête pousse l'agrégateur
        // à rejouer, alors qu'un 200 sur une exception enterrerait un paiement
        // réel. La ligne `failed` libère la clé pour le rejeu.
        await pool
          .query("UPDATE webhook_events SET status = 'failed', error = $2 WHERE event_key = $1", [
            `${payload.transaction_id}:${verdict}`,
            error instanceof Error ? error.message.slice(0, 500) : "erreur inconnue",
          ])
          .catch(() => {})
        throw error
      }
      await pool.query(
        `UPDATE webhook_events
            SET status = 'processed', result = $2::jsonb, processed_at = now()
          WHERE event_key = $1`,
        [`${payload.transaction_id}:${verdict}`, JSON.stringify(result)],
      )
      void eventId
      res.status(200).json(result)
    }),
  )

  return r
}

// ---------------------------------------------------------------------------
// Traitement d'un événement authentifié
// ---------------------------------------------------------------------------

async function handleVerifiedWebhook(
  pool: NonNullable<ReturnType<typeof getPool>>,
  payload: WebhookPayload,
  verdict: "success" | "failure" | "neutral",
): Promise<WebhookResult> {
  // L'intention est le point de rendez-vous des trois acteurs (client,
  // agrégateur, éditeur) : c'est elle qui désigne l'organisation, le forfait,
  // la durée et le prix. Sans correspondance exacte, rien ne bouge — une
  // transaction inconnue relève du rapprochement, pas du webhook.
  const intentQ = await pool.query<{
    id: string
    organization_id: string
    plan_code: string
    months: number
    amount_cents: number
    reference: string
    status: string
    declared_reference: string | null
  }>(
    `SELECT id, organization_id, plan_code, months, amount_cents, reference, status, declared_reference
       FROM payment_intents
      WHERE reference = $1 OR provider_transaction_id = $2
      ORDER BY created_at DESC
      LIMIT 1`,
    [payload.reference ?? "", payload.transaction_id],
  )

  if (!intentQ.rowCount) {
    return {
      received: true,
      action: "ignored",
      reason: "Aucune intention ne correspond à cette référence ni à cette transaction.",
    }
  }
  const intent = intentQ.rows[0]

  // -- Événement d'annulation : on ferme l'intention, on n'active rien. ------
  if (verdict === "failure") {
    if (intent.status === "pending") {
      await pool.query(
        `UPDATE payment_intents
            SET status = 'failed', metadata = metadata || $2::jsonb
          WHERE id = $1::uuid AND status = 'pending'`,
        [intent.id, JSON.stringify({ webhook_status: payload.status ?? null, webhook_transaction_id: payload.transaction_id })],
      )
      await auditIntentEvent(pool, intent.organization_id, "subscription.payment_webhook_failed", intent.reference, payload)
    }
    return {
      received: true,
      action: "marked_failed",
      reason: intent.status === "pending" ? "Intention marquée en échec." : `Intention déjà ${intent.status}.`,
      reference: intent.reference,
    }
  }

  // -- Annonce neutre (initiation, attente…) : on mémorise, on attend. --------
  if (verdict === "neutral") {
    await pool.query(
      `UPDATE payment_intents
          SET provider_transaction_id = COALESCE(provider_transaction_id, $2),
              metadata = metadata || $3::jsonb
        WHERE id = $1::uuid AND status = 'pending'`,
      [intent.id, payload.transaction_id, JSON.stringify({ webhook_status: payload.status ?? null })],
    )
    return {
      received: true,
      action: "ignored",
      reason: "Événement enregistré ; le paiement reste en attente de confirmation.",
      reference: intent.reference,
    }
  }

  // -- Succès. Déjà réglée ? (validation manuelle entre-temps, ou doublon
  //    sous une autre transaction.) Rien à faire, et surtout rien à revendre.
  if (intent.status !== "pending") {
    return {
      received: true,
      action: "ignored",
      reason: `Intention déjà ${intent.status} : rien à activer.`,
      reference: intent.reference,
    }
  }

  // Confrontation du montant. Tolérance d'un centime : les frais agrégateur
  // parfois inclus, parfois non, ne doivent pas bloquer l'activation d'un
  // client qui a payé. Mais un écart significatif est une anomalie, pas une
  // omissions : elle sort de la file du webhook et rejoint celle de l'humain.
  const declared = toCents(payload.amount)
  if (declared !== null && Math.abs(declared - intent.amount_cents) > 1) {
    await auditIntentEvent(pool, intent.organization_id, "subscription.payment_webhook_mismatch", intent.reference, {
      ...payload,
      expected_amount_cents: intent.amount_cents,
      declared_amount_cents: declared,
    })
    return {
      received: true,
      action: "ignored",
      reason: "Montant déclaré par l'agrégateur différent du montant attendu : transmission à la file de validation humaine.",
      reference: intent.reference,
    }
  }

  // Acquisition de l'intention : deux webhooks simultanés (ou un webhook
  // pendant qu'un opérateur clique « valider ») ne doivent produire qu'une
  // activation. Le passage pending → paid est conditionnel dans le SQL même,
  // exactement comme la route de confirmation humaine.
  const claimed = await pool.query(
    `UPDATE payment_intents
        SET status = 'paid',
            settled_at = now(),
            provider_transaction_id = $2,
            provider = $3,
            metadata = metadata || $4::jsonb
      WHERE id = $1::uuid AND status = 'pending'
      RETURNING id`,
    [
      intent.id,
      payload.transaction_id,
      env.PAYMENT_PROVIDER,
      JSON.stringify({ settled_by: "payment_webhook", webhook_status: payload.status ?? "success" }),
    ],
  )
  if (!claimed.rowCount) {
    return {
      received: true,
      action: "ignored",
      reason: "Intention déjà réglée entre-temps.",
      reference: intent.reference,
    }
  }

  // -- Activation. Point de passage unique de tout l'argent d'abonnement :
  //    registre comptable, historique client, grâce, plafonds — inchangés.
  //
  //    La durée activée naît de l'**argent reçu**, pas de l'intention : si
  //    l'agrégateur confirme un montant inférieur (paiement partiel, erreur
  //    de saisie côté client), on active ce que l'argent couvre, en semaines
  //    entières, et on le dit. Douze mois pour le prix d'un ne s'offrira
  //    jamais par ici.
  const confirmedCents = declared ?? intent.amount_cents
  const fullMonths = confirmedCents >= intent.amount_cents ? intent.months : 0
  const activatedMonths =
    fullMonths > 0
      ? fullMonths
      : Math.max(1, Math.floor((confirmedCents / intent.amount_cents) * intent.months * 4.345))

  const result = await activateSubscription(pool, {
    organizationId: intent.organization_id,
    planCode: intent.plan_code,
    months: activatedMonths,
    source: "payment_webhook",
    paymentReference: payload.transaction_id,
    actorUserId: null,
    note:
      activatedMonths < intent.months
        ? `Paiement partiel confirmé par webhook : ${activatedMonths} mois activés sur ${intent.months} attendus.`
        : null,
    channel: (payload.channel ?? "other") as RevenueChannel,
    operatorEmail: null,
    amountCents: confirmedCents,
    extra: {
      webhook_transaction_id: payload.transaction_id,
      intent_reference: intent.reference,
      expected_months: intent.months,
      activated_months: activatedMonths,
    },
  })

  await auditIntentEvent(pool, intent.organization_id, "subscription.payment_webhook_confirmed", intent.reference, {
    ...payload,
    activated_months: activatedMonths,
  })

  return {
    received: true,
    action: "activated",
    reason:
      activatedMonths < intent.months
        ? `Forfait activé pour ${activatedMonths} mois (paiement partiel).`
        : "Forfait activé.",
    reference: intent.reference,
    subscription_status: "active",
    current_period_end: result.periodEnd,
  }
}

/**
 * Trace côté client, comme toute intervention sur son abonnement. Le webhook
 * n'a pas d'acteur humain : `actor_user_id` reste NULL et le pourquoi vit dans
 * les métadonnées.
 */
async function auditIntentEvent(
  pool: NonNullable<ReturnType<typeof getPool>>,
  organizationId: string,
  action: string,
  reference: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  await pool.query(
    `INSERT INTO audit_logs(organization_id, actor_user_id, action, entity_type, entity_id, metadata)
     VALUES($1::uuid, NULL, $2, 'subscription', $3::text, $4::jsonb)`,
    [organizationId, action, reference, JSON.stringify(metadata)],
  )
}
