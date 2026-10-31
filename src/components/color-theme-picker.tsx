"use client"

import { Check } from "lucide-react"

import { useColorTheme } from "@/hooks/use-color-theme"
import { useTheme } from "@/hooks/use-theme"
import { COLOR_THEMES } from "@/lib/palette"
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
 */
export function ColorThemePicker({ className }: { className?: string }) {
  const { colorTheme, setColorTheme } = useColorTheme()
  const { resolvedTheme } = useTheme()

  return (
    <div className={cn("grid grid-cols-2 gap-2 sm:grid-cols-4", className)}>
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
  )
}
