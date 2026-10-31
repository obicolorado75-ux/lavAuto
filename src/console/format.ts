/**
 * Formatage des durées et des taux pour les écrans de la console.
 *
 * Ces helpers vivaient dans `monitoring.tsx` et `support.tsx`, mais d'autres
 * pages les importent (`monitoring-error.tsx`, `support-detail.tsx`). Un
 * fichier dédié évite le couplage page→page et garde la règle « un fichier de
 * page n'exporte que des composants » (fast refresh).
 */

/** Durée dite en français : 1 240 ms se lit mieux en « 1,2 s ». */
export function durationLabel(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} ms`
  return `${(ms / 1000).toFixed(1).replace(".", ",")} s`
}

/** Le ton d'un taux d'erreur. Les seuils sont des choix, pas des lois. */
export function rateTone(rate: number): "success" | "warning" | "danger" {
  if (rate >= 1) return "danger"
  if (rate >= 0.1) return "warning"
  return "success"
}
