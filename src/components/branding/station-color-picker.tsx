"use client"

import * as React from "react"
import { Check, Loader2 } from "lucide-react"

import { useTheme } from "@/hooks/use-theme"
import { COLOR_THEMES, type ColorTheme } from "@/lib/palette"
import { cn } from "@/lib/utils"

/**
 * Le choix de la couleur de la station.
 *
 * On ne propose que les huit palettes de `src/lib/palette.ts`, jamais un
 * sélecteur libre. Ces palettes portent une garantie : le texte posé sur la
 * couleur d'action est recalculé par `color-mix()` pour rester lisible dans
 * les deux modes. Un `#ffcc00` choisi à la main donnerait des boutons jaunes
 * au texte blanc — illisible, et personne ne s'en apercevrait avant la
 * première caisse.
 *
 * L'aperçu utilise les variables du thème **en ligne**, sur un bloc isolé : la
 * page garde ses propres couleurs, et l'on voit exactement ce que boutons,
 * badges et liens deviendront.
 */
export function StationColorPicker({
  value,
  onChange,
  disabled,
  pending,
}: {
  value: ColorTheme | null
  onChange: (theme: ColorTheme | null) => void
  disabled?: boolean
  /** Palette en cours d'enregistrement, pour n'occuper que sa pastille. */
  pending: ColorTheme | null | "reset"
}) {
  const { resolvedTheme } = useTheme()
  const mode = resolvedTheme

  // L'aperçu montre la couleur choisie ; sans choix, celle que l'application
  // applique réellement (le bleu WashPilot).
  const preview = COLOR_THEMES.find((theme) => theme.value === (value ?? "bleu")) ?? COLOR_THEMES[0]
  const vars = preview[mode]
  const onPrimary = `color-mix(in oklch, ${vars.primary}, ${mode === "dark" ? "black 82%" : "white 92%"})`
  const onAccent = `color-mix(in oklch, ${vars.accent}, ${mode === "dark" ? "white 88%" : "black 72%"})`
  const previewStyle = {
    backgroundColor: "var(--muted)",
    "--primary": vars.primary,
    "--accent": vars.accent,
    "--success": vars.success,
    "--info": vars.info,
    "--primary-foreground": onPrimary,
    "--accent-foreground": onAccent,
  } as React.CSSProperties

  return (
    <div className="flex flex-col gap-4">
      <div role="radiogroup" aria-label="Couleur de la station" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {COLOR_THEMES.map((theme) => {
          const selected = value === theme.value
          const swatch = theme[mode]
          const busy = pending === theme.value
          return (
            <button
              key={theme.value}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={disabled || pending !== null}
              onClick={() => onChange(theme.value)}
              title={theme.description}
              className={cn(
                "flex items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-sm transition-colors duration-150",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                "disabled:cursor-not-allowed disabled:opacity-60",
                selected
                  ? "border-primary/60 text-accent-foreground"
                  : "border-border bg-background text-foreground hover:bg-muted",
              )}
              style={selected ? { backgroundColor: swatch.accent } : undefined}
            >
              <span
                aria-hidden="true"
                className="grid size-6 shrink-0 place-items-center rounded-full ring-1 ring-black/10 dark:ring-white/15"
                style={{ backgroundColor: swatch.primary }}
              >
                {busy
                  ? <Loader2 className="size-3.5 animate-spin" style={{ color: swatch.accent }} />
                  : selected && <Check className="size-3.5" style={{ color: swatch.accent }} />}
              </span>
              <span className="min-w-0 truncate">{theme.label}</span>
            </button>
          )
        })}
      </div>

      {/* Aperçu : les trois surfaces que la couleur pilote réellement. */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border p-3" style={previewStyle}>
        <span
          className="rounded-md px-3 py-1.5 text-xs font-medium"
          style={{ backgroundColor: vars.primary, color: onPrimary }}
        >
          Encaisser
        </span>
        <span
          className="rounded-full px-2.5 py-1 text-xs font-medium"
          style={{ backgroundColor: `color-mix(in oklch, ${vars.success}, transparent 82%)`, color: vars.success }}
        >
          Lavage terminé
        </span>
        <span
          className="rounded-full px-2.5 py-1 text-xs font-medium"
          style={{ backgroundColor: `color-mix(in oklch, ${vars.info}, transparent 82%)`, color: vars.info }}
        >
          En cours
        </span>
        <span className="ml-auto text-xs text-muted-foreground">Aperçu</span>
      </div>

      {value && (
        <div>
          <button
            type="button"
            onClick={() => onChange(null)}
            disabled={disabled || pending !== null}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending === "reset" && <Loader2 className="size-3 animate-spin" aria-hidden="true" />}
            Revenir au bleu WashPilot
          </button>
        </div>
      )}
    </div>
  )
}

export default StationColorPicker
