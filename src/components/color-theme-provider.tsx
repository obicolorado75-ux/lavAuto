"use client"

import * as React from "react"
import { ColorThemeProviderContext } from "@/contexts/color-theme-context"
import { useTheme } from "@/hooks/use-theme"
import {
  applyColorTheme,
  clearStoredColorTheme,
  readStoredColorThemeOrNull,
  resolveColorTheme,
  storeColorTheme,
  type ColorTheme,
} from "@/lib/palette"
import { useStationColorTheme } from "@/lib/station-theme"

type ColorThemeProviderProps = {
  children: React.ReactNode
}

/**
 * Applique le **thème couleur** (identité de marque), indépendamment du mode
 * clair / sombre.
 *
 * Trois niveaux décident de la couleur, dans cet ordre : le choix personnel de
 * l'utilisateur (`localStorage`), celui de la station (lu sur le serveur par
 * `branding-api`), puis le bleu WashPilot. Voir `resolveColorTheme`.
 *
 * Il lit `resolvedTheme` pour réécrire les quatre variables à chaque bascule :
 * une même teinte a une version claire (fond) et une version sombre (texte et
 * accents) — c'est ce qui garde la police lisible dans les deux modes.
 *
 * ⚠️ Doit être monté **sous** `ThemeProvider`, dont il consomme le contexte.
 */
export function ColorThemeProvider({ children }: ColorThemeProviderProps) {
  const { resolvedTheme } = useTheme()
  const stationColorTheme = useStationColorTheme()
  const [userChoice, setUserChoiceState] = React.useState<ColorTheme | null>(() => {
    // Le script inline de `index.html` a déjà posé les variables avant le
    // premier rendu : on relit la même source pour éviter un clignotement.
    return readStoredColorThemeOrNull()
  })

  const { theme: colorTheme } = resolveColorTheme(userChoice, stationColorTheme)

  React.useEffect(() => {
    applyColorTheme(colorTheme, resolvedTheme)
  }, [colorTheme, resolvedTheme])

  // Deux onglets ouverts sur le même compte doivent rester de la même couleur.
  // `storage` n'est émis que vers les autres onglets : pas de boucle.
  React.useEffect(() => {
    const onStorage = () => setUserChoiceState(readStoredColorThemeOrNull())
    window.addEventListener("storage", onStorage)
    return () => window.removeEventListener("storage", onStorage)
  }, [])

  const setColorTheme = React.useCallback((next: ColorTheme) => {
    storeColorTheme(next)
    setUserChoiceState(next)
  }, [])

  const resetColorTheme = React.useCallback(() => {
    clearStoredColorTheme()
    setUserChoiceState(null)
  }, [])

  const value = React.useMemo(
    () => ({
      colorTheme,
      setColorTheme,
      stationColorTheme,
      custom: userChoice !== null,
      resetColorTheme,
    }),
    [colorTheme, setColorTheme, stationColorTheme, userChoice, resetColorTheme],
  )

  return (
    <ColorThemeProviderContext.Provider value={value}>
      {children}
    </ColorThemeProviderContext.Provider>
  )
}
