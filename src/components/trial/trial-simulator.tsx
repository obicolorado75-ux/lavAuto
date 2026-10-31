"use client"

import * as React from "react"
import { FlaskConical } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { apiErrorMessage, apiFetch } from "@/lib/api"
import { useSubscription } from "@/lib/subscription"

const PRESETS: { label: string; days: number; paid?: boolean }[] = [
  { label: "11 jours restants", days: 11 },
  { label: "3 jours restants", days: 3 },
  { label: "1 jour restant", days: 1 },
  { label: "Essai terminé", days: 0 },
]

// Impayé sur un forfait payant : le cas qu'on ne pouvait pas voir à l'écran
// sans attendre l'échéance d'un vrai abonnement.
const PAID_PRESETS: { label: string; days: number; paid?: boolean }[] = [
  { label: "Payant : échu de 2 j", days: -2, paid: true },
  { label: "Payant : échu de 5 j", days: -5, paid: true },
  { label: "Payant : tolérance écoulée", days: -9, paid: true },
]

/**
 * Outil de démonstration (développement uniquement) : repositionne l'échéance
 * de l'essai pour visualiser chaque état sans attendre 14 jours.
 * La route serveur associée n'est pas montée en production.
 */
export function TrialSimulator() {
  const { refresh } = useSubscription()
  const [busy, setBusy] = React.useState<number | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  if (!import.meta.env.DEV) return null

  async function simulate(days: number, paid = false) {
    setBusy(days)
    setError(null)
    try {
      const response = await apiFetch("/api/v1/subscription/simulate", {
        method: "POST",
        body: JSON.stringify({ days_left: days, plan_code: paid ? "pro" : "starter", paid }),
      })
      if (!response.ok) {
        setError(await apiErrorMessage(response))
        return
      }
      await refresh()
    } catch {
      setError("Simulation impossible : serveur injoignable.")
    } finally {
      setBusy(null)
    }
  }

  return (
    <Card className="border-dashed">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <FlaskConical className="size-4" aria-hidden="true" /> Démonstration de l’essai
        </CardTitle>
        <CardDescription>
          Visible uniquement en développement : déplace l’échéance de l’essai pour tester le
          compte à rebours et le mode lecture seule.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          {[...PRESETS, ...PAID_PRESETS].map((preset) => (
            <Button
              key={`${preset.label}`}
              type="button"
              size="sm"
              variant={preset.paid ? "secondary" : "outline"}
              disabled={busy !== null}
              onClick={() => void simulate(preset.days, preset.paid)}
            >
              {busy === preset.days ? "…" : preset.label}
            </Button>
          ))}
        </div>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </CardContent>
    </Card>
  )
}
