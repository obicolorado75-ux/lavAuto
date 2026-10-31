"use client"

import * as React from "react"
import { ColorThemeProviderContext } from "@/contexts/color-theme-context"
import { useTheme } from "@/hooks/use-theme"
import {
  DEFAULT_COLOR_THEME,
  applyColorTheme,
  readStoredColorTheme,
  storeColorTheme,
  type ColorTheme,
} from "@/lib/palette"

type ColorThemeProviderProps = {
  children: React.ReactNode
  defaultColorTheme?: ColorTheme
}

/**
 * Applique le **thème couleur** (identité de marque), indépendamment du mode
 * clair / sombre.
 *
 * Il lit `resolvedTheme` pour réécrire les quatre variables à chaque bascule :
 * une même teinte a une version claire (fond) et une version sombre (texte et
 * accents) — c'est ce qui garde la police lisible dans les deux modes.
 *
 * ⚠️ Doit être monté **sous** `ThemeProvider`, dont il consomme le contexte.
 */
export function ColorThemeProvider({
  children,
  defaultColorTheme = DEFAULT_COLOR_THEME,
}: ColorThemeProviderProps) {
  const { resolvedTheme } = useTheme()
  const [colorTheme, setColorThemeState] = React.useState<ColorTheme>(() => {
    // Le script inline de `index.html` a déjà posé les variables avant le
    // premier rendu : on relit la même source pour éviter un clignotement.
    const stored = readStoredColorTheme(defaultColorTheme)
    applyColorTheme(stored, resolvedTheme)
    return stored
  })

  React.useEffect(() => {
    applyColorTheme(colorTheme, resolvedTheme)
  }, [colorTheme, resolvedTheme])

  // Deux onglets ouverts sur le même compte doivent rester de la même couleur.
  // `storage` n'est émis que vers les autres onglets : pas de boucle.
  React.useEffect(() => {
    const onStorage = () => setColorThemeState(readStoredColorTheme(defaultColorTheme))
    window.addEventListener("storage", onStorage)
    return () => window.removeEventListener("storage", onStorage)
  }, [defaultColorTheme])

  const setColorTheme = React.useCallback((next: ColorTheme) => {
    storeColorTheme(next)
    setColorThemeState(next)
  }, [])

  const value = React.useMemo(
    () => ({ colorTheme, setColorTheme }),
    [colorTheme, setColorTheme],
  )

  return (
    <ColorThemeProviderContext.Provider value={value}>
      {children}
    </ColorThemeProviderContext.Provider>
  )
}
