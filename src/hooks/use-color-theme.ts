import * as React from "react"
import { ColorThemeProviderContext } from "@/contexts/color-theme-context"

export const useColorTheme = () => {
  const context = React.useContext(ColorThemeProviderContext)
  if (context === undefined)
    throw new Error("useColorTheme must be used within a ColorThemeProvider")
  return context
}
