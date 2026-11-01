import * as React from "react"

/**
 * Contexte d'ouverture de la recherche globale (⌘K).
 *
 * Séparé de `command-search.tsx` pour respecter `react-refresh/only-export-components` :
 * un fichier = un composant exporté, les hooks partageés vivent à côté.
 * C'est le couple idiomatique <Provider> + useXxx() des autres contextes
 * d'application (auth, permissions, notifications…).
 */

interface SearchContextValue {
  open: boolean
  setOpen: (open: boolean) => void
  openSearch: () => void
}

const SearchContext = React.createContext<SearchContextValue | null>(null)

export function useSearch(): SearchContextValue {
  const context = React.useContext(SearchContext)
  return (
    context ?? {
      open: false,
      setOpen: () => {},
      openSearch: () => {},
    }
  )
}

/**
 * Fournit l'état de la recherche ET monte la palette elle-même.
 * La palette est chargée en paresse : les écrans qui n'utilisent jamais ⌘K
 * ne paient pas son poids dans leur chunk initial.
 */
const CommandSearchLazy = React.lazy(() =>
  import("@/components/command-search").then((m) => ({ default: m.CommandSearch })),
)

export function SearchProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false)

  const value = React.useMemo<SearchContextValue>(
    () => ({ open, setOpen, openSearch: () => setOpen(true) }),
    [open],
  )

  return (
    <SearchContext.Provider value={value}>
      {children}
      {open ? (
        <React.Suspense fallback={null}>
          <CommandSearchLazy open={open} onOpenChange={setOpen} />
        </React.Suspense>
      ) : null}
    </SearchContext.Provider>
  )
}

export { SearchContext }
export type { SearchContextValue }
