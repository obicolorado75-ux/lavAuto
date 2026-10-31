import * as React from "react"
import { DEFAULT_COLOR_THEME, type ColorTheme } from "@/lib/palette"

export type ColorThemeProviderState = {
  /** Thème couleur appliqué au document. */
  colorTheme: ColorTheme
  setColorTheme: (theme: ColorTheme) => void
  /**
   * Thème choisi par la station, s'il y en a un.
   *
   * `null` : la station n'a rien choisi, l'application garde sa palette.
   */
  stationColorTheme: ColorTheme | null
  /** L'utilisateur a-t-il forcé sa propre couleur sur cet appareil ? */
  custom: boolean
  /** Efface le choix personnel : retour au thème de la station. */
  resetColorTheme: () => void
}

const initialState: ColorThemeProviderState = {
  colorTheme: DEFAULT_COLOR_THEME,
  setColorTheme: () => null,
  stationColorTheme: null,
  custom: false,
  resetColorTheme: () => null,
}

export const ColorThemeProviderContext =
  React.createContext<ColorThemeProviderState>(initialState)
