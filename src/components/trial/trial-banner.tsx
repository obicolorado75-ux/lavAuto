"use client"

import * as React from "react"
import { Link } from "react-router"
import { AlertTriangle, ArrowRight, Clock, Lock, X } from "lucide-react"
import { cn } from "cn"
import { formatRemaining, useSubscription } from "@/lib/subscription"

// Masquage conservé le temps de la session de navigation (remis à zéro au
// rechargement de la page), partagé entre les montages du bandeau.
let dismissedForSession = false

/** Date lisible sans dépendre de la locale du poste. */
function formatDate(iso: string | null): string {
  if (!iso) return "—"
  const date = new Date(iso)
  return date.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })
}

/**
 * Bandeau affiché en haut des écrans de l'application.
 *
 * - Essai terminé : message permanent (non masquable) rappelant la lecture seule.
 * - Échéance dans 3 jours ou moins : rappel masquable pour la session en cours.
 */
export function TrialBanner({ className }: { className?: string }) {
  const { state, isExpired, isEndingSoon, msRemaining } = useSubscription()
  // Dernier jour de tolérance : le ton change, on ne noie plus le message.
  const isGraceEndingSoon = (state?.payment_grace_days_remaining ?? 99) <= 2
  const [dismissed, setDismissed] = React.useState(dismissedForSession)

  const dismiss = React.useCallback(() => {
    dismissedForSession = true
    setDismissed(true)
  }, [])

  if (!state) return null

  // Impayé encore dans la tolérance : l'accès marche, mais la coupure approche.
  // C'est le seul moment où un rappel peut encore éviter la lecture seule.
  if (state.past_due && !isExpired) {
    return (
      <div
        className={cn(
          "row-in glow-danger glow-static flex flex-col gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between",
          className,
        )}
        role="status"
      >
        <div className="flex items-start gap-2.5">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden="true" />
          <div>
            <p className="font-medium text-destructive">
              Forfait {state.plan_name ?? ""} impayé depuis {state.days_past_due} jour(s).
            </p>
            <p className="text-muted-foreground">
              {isGraceEndingSoon ? (
                <>
                  Il reste <strong>{state.payment_grace_days_remaining} jour(s)</strong> avant la
                  lecture seule. Vos données resteront consultables et exportables.
                </>
              ) : (
                <>
                  La tolérance court jusqu’au{" "}
                  <strong>{formatDate(state.payment_grace_ends_at)}</strong>. Passé ce délai, l’espace
                  passera en lecture seule — vos données restent consultables.
                </>
              )}
            </p>
          </div>
        </div>
        <Link
          to="/settings/billing"
          viewTransition
          className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-md bg-destructive px-3 text-sm font-medium text-white transition-transform duration-150 hover:scale-[1.02] active:scale-[0.98]"
        >
          Payer maintenant
          <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      </div>
    )
  }

  if (isExpired) {
    return (
      <div
        className={cn(
          "row-in glow-danger glow-static flex flex-col gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between",
          className,
        )}
        role="status"
      >
        <div className="flex items-start gap-2.5">
          <Lock className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden="true" />
          <div>
            <p className="font-medium text-destructive">
              {state.expired_reason === "payment"
                ? `Forfait ${state.plan_name ?? ""} échu depuis ${state.days_past_due} jour(s).`
                : state.expired_reason === "cancelled"
                  ? "Votre abonnement est résilié."
                  : `Votre essai gratuit de ${state.trial_days} jours est terminé.`}
            </p>
            <p className="text-muted-foreground">
              L’espace est passé en <strong>lecture seule</strong> : consultation libre, mais
              plus de nouveaux lavages, dépenses ou opérations de caisse, et un historique
              limité aux {state.report_window_days ?? 7} derniers jours. Vos données restent
              exportables — nous ne les prenons jamais en otage.
            </p>
          </div>
        </div>
        <Link
          to="/settings/billing"
          viewTransition
          className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-md bg-destructive px-3 text-sm font-medium text-white transition-transform duration-150 hover:scale-[1.02] active:scale-[0.98]"
        >
          Choisir un forfait
          <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      </div>
    )
  }

  if (!isEndingSoon || dismissed) return null

  return (
    <div
      className={cn(
        "row-in glow-warning glow-static flex flex-col gap-2 rounded-lg border border-amber-500/50 bg-amber-500/10 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between",
        className,
      )}
      role="status"
    >
      <div className="flex items-start gap-2.5">
        <Clock className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
        <p>
          <span className="font-medium">
            Il reste {formatRemaining(msRemaining)} d’essai gratuit.
          </span>{" "}
          <span className="text-muted-foreground">
            Passé ce délai, votre station restera consultable mais les enregistrements
            seront désactivés.
          </span>
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Link
          to="/settings/billing"
          viewTransition
          className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md bg-amber-500 px-3 text-sm font-medium text-white transition-transform duration-150 hover:scale-[1.02] active:scale-[0.98]"
        >
          Activer un forfait
        </Link>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Masquer ce rappel"
          className="inline-flex size-9 items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}
