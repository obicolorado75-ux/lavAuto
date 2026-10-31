"use client"

import { ArrowRight, ShieldCheck, TimerReset } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useSubscription } from "@/lib/subscription"

/**
 * Impayé sur un forfait payant.
 *
 * Un abonnement `active` dont l'échéance est dépassée n'est pas un essai. Le
 * dire clairement — et dire **quand** la coupure tombe — vaut mieux qu'un
 * bandeau générique : c'est la seule fenêtre où le client peut encore payer
 * sans perdre l'usage de sa station.
 *
 * Aucun montant n'est affiché ici : le prix vit dans la demande de paiement,
 * où il est figé à la commande. Une carte qui afficherait le prix courant
 * pourrait contredire la référence déjà émise.
 */
export function ArrearsCard() {
  const { state } = useSubscription()
  if (!state?.past_due) return null

  const lapsed = state.read_only
  const remaining = state.payment_grace_days_remaining

  return (
    <Card className={lapsed ? "border-destructive/40" : "border-amber-500/50"}>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2">
              <TimerReset
                className={lapsed ? "size-5 text-destructive" : "size-5 text-amber-600 dark:text-amber-400"}
                aria-hidden="true"
              />
              {lapsed ? "Paiement en retard — espace en lecture seule" : "Paiement en retard"}
            </CardTitle>
            <CardDescription>
              Forfait {state.plan_name ?? "payant"} échu depuis {state.days_past_due} jour(s).
            </CardDescription>
          </div>
          <Badge variant={lapsed ? "destructive" : "outline"}>
            {lapsed ? "Lecture seule" : remaining <= 2 ? "Dernier délai" : "Tolérance en cours"}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-4 text-sm">
        <dl className="grid gap-3 rounded-lg border bg-muted/40 p-3 sm:grid-cols-3">
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">Échéance dépassée depuis</dt>
            <dd className="font-medium tabular-nums">{state.days_past_due} jour(s)</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">
              {lapsed ? "Tolérance de paiement" : "Tolérance jusqu’au"}
            </dt>
            <dd className="font-medium">
              {lapsed ? `${state.payment_grace_days} jours, écoulés` : formatDate(state.payment_grace_ends_at)}
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-muted-foreground">
              {lapsed ? "Lecture seule depuis" : "Jours avant la coupure"}
            </dt>
            <dd className="font-medium tabular-nums">
              {lapsed
                ? `${Math.max(0, state.days_past_due - state.payment_grace_days)} jour(s)`
                : `${remaining} jour(s)`}
            </dd>
          </div>
        </dl>

        <p className="text-muted-foreground">
          {lapsed ? (
            <>
              Les enregistrements sont désactivés — mais <strong>rien n’est perdu</strong> :
              vos lavages, paiements et dépenses restent consultables et exportables. Le
              retour à la normale est immédiat dès la validation du paiement.
            </>
          ) : (
            <>
              Aucun prélèvement n’a lieu automatiquement : le règlement se fait par mobile
              money, avec la référence de votre demande. Passé la tolérance, l’espace passe
              en lecture seule — vos données restent consultables.
            </>
          )}
        </p>

        <div className="flex flex-wrap items-center gap-3">
          <a
            href="#payer"
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground transition-transform duration-150 hover:scale-[1.02] active:scale-[0.98]"
          >
            {lapsed ? "Régler pour réactiver" : "Régler maintenant"}
            <ArrowRight className="size-4" aria-hidden="true" />
          </a>
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <ShieldCheck className="size-3.5" aria-hidden="true" />
            Vos données ne sont jamais supprimées pour un impayé.
          </span>
        </div>
      </CardContent>
    </Card>
  )
}

function formatDate(iso: string | null): string {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  })
}
