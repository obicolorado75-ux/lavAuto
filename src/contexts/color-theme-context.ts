import * as React from "react"
import { DEFAULT_COLOR_THEME, type ColorTheme } from "@/lib/palette"

export type ColorThemeProviderState = {
  /** Thème couleur appliqué au document. */
  colorTheme: ColorTheme
  setColorTheme: (theme: ColorTheme) => void
}

const initialState: ColorThemeProviderState = {
  colorTheme: DEFAULT_COLOR_THEME,
  setColorTheme: () => null,
}

export const ColorThemeProviderContext =
  React.createContext<ColorThemeProviderState>(initialState)
