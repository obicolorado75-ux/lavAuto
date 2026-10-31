"use client"

import { Check, RotateCcw } from "lucide-react"

import { useColorTheme } from "@/hooks/use-color-theme"
import { useTheme } from "@/hooks/use-theme"
import { COLOR_THEMES, getColorTheme } from "@/lib/palette"
import { cn } from "@/lib/utils"

/**
 * Choix du thème couleur.
 *
 * Chaque pastille affiche la teinte **du mode en cours** : en sombre, la
 * version claire d'une couleur vibrerait sur le fond noir, et l'aperçu ne
 * montrerait pas ce que l'utilisateur verra réellement.
 *
 * Le texte de la pastille sélectionnée est calculé en `color-mix()` à partir
 * de la couleur d'action, comme partout ailleurs : aucune couleur de police
 * n'est figée ici, donc aucune ne devient illisible si la palette change.
 *
 * Depuis que la station peut imposer sa couleur, une pastille peut être
 * sélectionnée **sans** avoir été cliquée sur cet appareil. Le bandeau du
 * dessus le dit, et propose de revenir à l'identité de la station : sans lui,
 * l'utilisateur verrait une couleur choisie pour lui sans comprendre d'où
 * elle vient.
 */
export function ColorThemePicker({ className }: { className?: string }) {
  const { colorTheme, setColorTheme, stationColorTheme, custom, resetColorTheme } = useColorTheme()
  const { resolvedTheme } = useTheme()
  const stationLabel = stationColorTheme ? getColorTheme(stationColorTheme).label : null

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {stationLabel && (
        <div
          role="status"
          className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border bg-muted/40 px-3 py-2 text-xs"
        >
          <span className="text-muted-foreground">
            {custom
              ? `Votre station utilise « ${stationLabel} » par défaut. Votre choix l’emporte sur cet appareil.`
              : `Couleur définie par votre station : « ${stationLabel} ».`}
          </span>
          {custom && (
            <button
              type="button"
              onClick={resetColorTheme}
              className="inline-flex items-center gap-1 font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <RotateCcw className="size-3" aria-hidden="true" />
              Revenir à l’identité de la station
            </button>
          )}
        </div>
      )}

      <div role="radiogroup" aria-label="Couleur de l’interface" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {COLOR_THEMES.map((theme) => {
          const selected = colorTheme === theme.value
          const swatch = theme[resolvedTheme]
          return (
            <button
              key={theme.value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => setColorTheme(theme.value)}
              title={theme.description}
              className={cn(
                "flex items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-sm transition-colors duration-150",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                // Fond teinté posé en style inline : `.coreui-app` redéfinit
                // `--accent` avec son propre `--cui-primary-bg-subtle` (violet),
                // et la pastille sélectionnée gardait une teinte étrangère au
                // thème choisi. La teinte de la palette est la seule qui compte.
                selected
                  ? "border-primary/60 text-accent-foreground"
                  : "border-border bg-background text-foreground hover:bg-muted"
              )}
              style={selected ? { backgroundColor: theme[resolvedTheme].accent } : undefined}
            >
              <span
                aria-hidden="true"
                className="grid size-6 shrink-0 place-items-center rounded-full ring-1 ring-black/10 dark:ring-white/15"
                style={{ backgroundColor: swatch.primary }}
              >
                {selected && (
                  <Check className="size-3.5" style={{ color: theme[resolvedTheme].accent }} />
                )}
              </span>
              <span className="min-w-0 truncate">{theme.label}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
