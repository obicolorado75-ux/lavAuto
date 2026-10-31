import test from "node:test"
import assert from "node:assert/strict"
import {
  TRIAL_DAYS,
  EXPIRED_REPORT_WINDOW_DAYS,
  PAYMENT_GRACE_DAYS,
  computeSubscriptionState,
  clampReportRange,
  readOnlyMessage,
} from "../server/entitlements.ts"

const DAY = 86_400_000
const NOW = new Date("2026-10-20T12:00:00.000Z")

/** Abonnement d'essai sur le forfait d'entrée, échéance dans `days` jours. */
function trialEndingIn(days: number) {
  return {
    status: "trialing",
    current_period_end: new Date(NOW.getTime() + days * DAY),
    plan_code: "starter",
    plan_price_cents: 1_000_000,
    plan_features: {
      "reports.advanced": false,
      "reports.export": false,
      "reports.consolidated": false,
      "audit.read": false,
      "sites.multiple": false,
    },
    now: NOW,
  }
}

test("l'essai gratuit dure 14 jours", () => {
  assert.equal(TRIAL_DAYS, 14)
})

test("un essai qui vient de démarrer laisse 14 jours et tout est autorisé", () => {
  const state = computeSubscriptionState(trialEndingIn(TRIAL_DAYS))

  assert.equal(state.status, "trialing")
  assert.equal(state.is_trial, true)
  assert.equal(state.is_expired, false)
  assert.equal(state.read_only, false)
  assert.equal(state.days_remaining, 14)
  assert.equal(state.ms_remaining, TRIAL_DAYS * DAY)
  assert.equal(state.progress, 0)
  assert.equal(state.capabilities["washes.create"], true)
  assert.equal(state.capabilities["cash.manage"], true)
  // Les écritures sont ouvertes ; les fonctions des forfaits supérieurs, non.
  assert.deepEqual(state.restricted, [
    "reports.export",
    "reports.advanced",
    "reports.consolidated",
    "audit.read",
    "sites.multiple",
    "stock.manage",
    "team.tracking",
  ])
})

test("l'essai ne débloque rien au-delà du forfait choisi", () => {
  // Décision produit : on essaie exactement ce que l'on achète. Débloquer les
  // options supérieures pendant l'essai rendrait les trois forfaits
  // indiscernables au moment du choix, et ferait du quinzième jour une perte
  // de fonctionnalités — le meilleur moyen de faire fuir un client qui venait
  // de s'habituer.
  const starter = computeSubscriptionState(trialEndingIn(5))
  assert.equal(starter.capabilities["reports.advanced"], false)
  assert.equal(starter.capabilities["reports.export"], false)
  assert.equal(starter.capabilities["audit.read"], false)
  assert.equal(starter.capabilities["sites.multiple"], false)

  // Le même essai sur un forfait supérieur donne bien ses options.
  const business = computeSubscriptionState({
    ...trialEndingIn(5),
    plan_code: "business",
    plan_features: {
      "reports.advanced": true,
      "reports.export": true,
      "reports.consolidated": true,
      "audit.read": true,
      "sites.multiple": true,
    },
  })
  assert.equal(business.capabilities["reports.consolidated"], true)
  assert.equal(business.capabilities["sites.multiple"], true)
})

test("à mi-parcours la progression vaut la moitié", () => {
  const state = computeSubscriptionState(trialEndingIn(7))

  assert.equal(state.days_remaining, 7)
  assert.ok(Math.abs(state.progress - 0.5) < 0.001)
  assert.equal(state.trial_started_at, new Date(NOW.getTime() - 7 * DAY).toISOString())
})

test("passé le délai, l'espace bascule en lecture seule", () => {
  const state = computeSubscriptionState(trialEndingIn(-0.5))

  assert.equal(state.status, "expired")
  assert.equal(state.is_expired, true)
  assert.equal(state.read_only, true)
  assert.equal(state.ms_remaining, 0)
  assert.equal(state.days_remaining, 0)
  assert.equal(state.progress, 1)
  assert.equal(state.report_window_days, EXPIRED_REPORT_WINDOW_DAYS)
})

test("en lecture seule, les écritures et les options payantes sont coupées", () => {
  const state = computeSubscriptionState(trialEndingIn(-1))

  for (const capability of [
    "washes.create",
    "washes.cancel",
    "expenses.manage",
    "cash.manage",
    "catalog.manage",
    "team.manage",
    "reports.export",
    "reports.advanced",
    "stock.manage",
  ] as const) {
    assert.equal(state.capabilities[capability], false, `${capability} devrait être bloquée`)
  }
  // Les 7 capacités d'écriture plus les 7 options de forfait.
  assert.equal(state.restricted.length, 14)
})

test("l'échéance exacte compte comme expirée", () => {
  const state = computeSubscriptionState(trialEndingIn(0))
  assert.equal(state.status, "expired")
  assert.equal(state.read_only, true)
})

test("un forfait payant actif n'est jamais restreint par l'essai", () => {
  const state = computeSubscriptionState({
    status: "active",
    current_period_end: null,
    plan_code: "pro",
    plan_price_cents: 1000000,
    plan_features: { "reports.advanced": true, "reports.export": true, "sites.multiple": false },
    now: NOW,
  })

  assert.equal(state.status, "active")
  assert.equal(state.is_trial, false)
  assert.equal(state.read_only, false)
  assert.equal(state.trial_ends_at, null)
  assert.equal(state.capabilities["washes.create"], true)
  assert.equal(state.capabilities["reports.export"], true)
  assert.equal(state.capabilities["sites.multiple"], false)
})

test("un forfait payant en attente de validation reste utilisable", () => {
  const state = computeSubscriptionState({
    status: "pending",
    current_period_end: null,
    plan_code: "pro",
    plan_price_cents: 1000000,
    plan_features: { "reports.advanced": true },
    now: NOW,
  })

  assert.equal(state.status, "pending")
  assert.equal(state.read_only, false)
  assert.equal(state.capabilities["washes.create"], true)
})

test("un abonnement résilié passe aussi en lecture seule", () => {
  const state = computeSubscriptionState({
    status: "cancelled",
    current_period_end: null,
    plan_code: "pro",
    plan_price_cents: 1000000,
    plan_features: {},
    now: NOW,
  })

  assert.equal(state.status, "cancelled")
  assert.equal(state.read_only, true)
  assert.equal(state.capabilities["expenses.manage"], false)
})

test("une organisation sans abonnement n'est pas bloquée (onboarding en cours)", () => {
  const state = computeSubscriptionState({ status: null, current_period_end: null, now: NOW })

  assert.equal(state.status, "none")
  assert.equal(state.read_only, false)
  assert.equal(state.capabilities["washes.create"], true)
})

test("un statut stocké « expired » reste expiré sans date d'échéance", () => {
  const state = computeSubscriptionState({
    status: "expired",
    current_period_end: null,
    plan_code: "starter",
    plan_price_cents: 0,
    now: NOW,
  })

  assert.equal(state.read_only, true)
  assert.equal(state.progress, 1)
})

test("la période de rapport est tronquée à la fenêtre autorisée", () => {
  const today = new Date("2026-10-20T00:00:00.000Z")
  const result = clampReportRange(
    { from: "2026-09-01", to: "2026-10-20" },
    EXPIRED_REPORT_WINDOW_DAYS,
    today,
  )

  assert.equal(result.clamped, true)
  assert.equal(result.from, "2026-10-14") // 7 jours, aujourd'hui inclus
  assert.equal(result.to, "2026-10-20")
})

test("une période déjà courte n'est pas modifiée", () => {
  const today = new Date("2026-10-20T00:00:00.000Z")
  const result = clampReportRange({ from: "2026-10-18", to: "2026-10-20" }, EXPIRED_REPORT_WINDOW_DAYS, today)

  assert.equal(result.clamped, false)
  assert.equal(result.from, "2026-10-18")
})

test("sans restriction, la période demandée est conservée", () => {
  const result = clampReportRange({ from: "2026-01-01", to: "2026-10-20" }, null)

  assert.equal(result.clamped, false)
  assert.equal(result.from, "2026-01-01")
})

// --- Impayé sur un forfait payant -------------------------------------------
// Avant cette série, un abonnement `active` restait actif indéfiniment, même
// des mois après son échéance : seul l'œil d'un opérateur dans la console
// empêchait la fuite. La tolérance ci-dessous est le délai réel du rail de
// paiement mobile money, pas un cadeau.

/** Forfait payant dont l'échéance est dépassée de `days` jours. */
function paidLapsedBy(days: number) {
  return {
    status: "active",
    current_period_end: new Date(NOW.getTime() - days * DAY),
    plan_code: "pro",
    plan_price_cents: 2_000_000,
    plan_features: { "reports.advanced": true, "reports.export": true },
    now: NOW,
  }
}

test("un impayé dans la tolérance reste utilisable et annonce sa date de coupure", () => {
  const state = computeSubscriptionState(paidLapsedBy(2))

  assert.equal(state.past_due, true)
  assert.equal(state.status, "active")
  assert.equal(state.read_only, false)
  assert.equal(state.expired_reason, null)
  assert.equal(state.days_past_due, 2)
  assert.equal(state.payment_grace_days, PAYMENT_GRACE_DAYS)
  assert.equal(state.payment_grace_days_remaining, PAYMENT_GRACE_DAYS - 2)
  assert.ok(state.payment_grace_ends_at)
  assert.equal(state.capabilities["washes.create"], true)
})

test("la tolérance est un délai, pas un sursis : au-delà, lecture seule", () => {
  const state = computeSubscriptionState(paidLapsedBy(PAYMENT_GRACE_DAYS + 1))

  assert.equal(state.past_due, true)
  assert.equal(state.status, "expired")
  assert.equal(state.is_expired, true)
  assert.equal(state.read_only, true)
  assert.equal(state.expired_reason, "payment")
  assert.equal(state.payment_grace_days_remaining, 0)
  assert.equal(state.capabilities["washes.create"], false)
  // Le rapport reste borné, comme après un essai : on ne prend pas les
  // données en otage, on ferme seulement l'écriture.
  assert.equal(state.report_window_days, EXPIRED_REPORT_WINDOW_DAYS)
})

test("la tolérance ferme à l'instant exact de son terme", () => {
  // Une demi-journée avant la fin : encore ouvert.
  const justInside = computeSubscriptionState(paidLapsedBy(PAYMENT_GRACE_DAYS - 0.5))
  assert.equal(justInside.read_only, false)
  assert.equal(justInside.status, "active")
  assert.equal(justInside.payment_grace_days_remaining, 1)

  // À l'instant pile : fermé. Même règle que l'échéance d'essai — une date
  // qui « compte encore » est une date qu'on ne tient jamais.
  const exact = computeSubscriptionState(paidLapsedBy(PAYMENT_GRACE_DAYS))
  assert.equal(exact.read_only, true)
  assert.equal(exact.expired_reason, "payment")
})

test("un forfait actif sans échéance n'est pas un impayé", () => {
  // On ne ferme jamais un espace sur une donnée absente : une activation
  // manuelle sans date doit rester utilisable.
  const state = computeSubscriptionState({
    status: "active",
    current_period_end: null,
    plan_code: "pro",
    plan_price_cents: 2_000_000,
    plan_features: {},
    now: NOW,
  })

  assert.equal(state.past_due, false)
  assert.equal(state.read_only, false)
  assert.equal(state.payment_grace_ends_at, null)
  assert.equal(state.payment_grace_days_remaining, 0)
})

test("un forfait payant à échéance future n'est pas en retard", () => {
  const state = computeSubscriptionState({
    status: "active",
    current_period_end: new Date(NOW.getTime() + 10 * DAY),
    plan_code: "pro",
    plan_price_cents: 2_000_000,
    plan_features: {},
    now: NOW,
  })

  assert.equal(state.past_due, false)
  assert.equal(state.status, "active")
  assert.equal(state.days_past_due, 0)
})

test("un essai échu se distingue d'un impayé dans les dates affichées", () => {
  const state = computeSubscriptionState(trialEndingIn(-1))

  assert.equal(state.expired_reason, "trial")
  assert.equal(state.past_due, false)
  assert.ok(state.trial_ends_at, "un essai échu garde sa date d'échéance")
  assert.equal(state.payment_grace_ends_at, null)
})

test("un impayé n'affiche pas de dates d'essai", () => {
  const state = computeSubscriptionState(paidLapsedBy(PAYMENT_GRACE_DAYS + 3))
  assert.equal(state.trial_ends_at, null)
  assert.equal(state.trial_started_at, null)
})

test("le message de refus nomme la vraie cause", () => {
  const lapsed = computeSubscriptionState(paidLapsedBy(PAYMENT_GRACE_DAYS + 3))
  const message = readOnlyMessage(lapsed)
  assert.match(message, /échéance de votre forfait/i)
  assert.doesNotMatch(message, /essai gratuit/i)

  const trial = computeSubscriptionState(trialEndingIn(-1))
  assert.match(readOnlyMessage(trial), /essai gratuit/i)

  const cancelled = computeSubscriptionState({
    status: "cancelled",
    current_period_end: null,
    plan_code: "pro",
    plan_price_cents: 2_000_000,
    plan_features: {},
    now: NOW,
  })
  assert.match(readOnlyMessage(cancelled), /résilié/i)
})

test("un forfait payant expose les jours qui lui restent, même négatifs", () => {
  // La console trie « à renouveler sous 7 jours » sur ce champ. Avant, il
  // valait 0 pour tout forfait payant : la liste affichait donc toutes les
  // stations actives, et n'alertait sur rien.
  const soon = computeSubscriptionState({
    status: "active",
    current_period_end: new Date(NOW.getTime() + 3 * DAY),
    plan_code: "pro",
    plan_price_cents: 2_000_000,
    plan_features: {},
    now: NOW,
  })
  assert.equal(soon.days_remaining, 3)

  const late = computeSubscriptionState(paidLapsedBy(9))
  assert.equal(late.days_remaining, -9, "un retard se lit en négatif, pas en zéro")

  const undated = computeSubscriptionState({
    status: "active",
    current_period_end: null,
    plan_code: "pro",
    plan_price_cents: 2_000_000,
    plan_features: {},
    now: NOW,
  })
  assert.equal(undated.days_remaining, 0)
})
