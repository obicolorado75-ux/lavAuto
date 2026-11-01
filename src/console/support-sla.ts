/**
 * Le délai restant avant l'engagement SLA, dit en français plutôt qu'en
 * nombre flottant. Déplacé depuis `support.tsx` (règle fast refresh : une
 * page de route n'exporte que des composants).
 */
import type { SupportRequest } from "./types"

export function remainingLabel(request: SupportRequest): string {
  if (request.sla.responded) return "répondu"
  const hours = request.sla.hours_remaining
  if (hours < 0) {
    const late = Math.abs(hours)
    return late >= 10 ? `${Math.round(late / 10)} j de retard` : `${late.toFixed(1)} h de retard`
  }
  if (hours < 1) return `${Math.round(hours * 60)} min`
  return hours >= 10 ? `${Math.round(hours / 10)} j` : `${hours.toFixed(1)} h`
}
