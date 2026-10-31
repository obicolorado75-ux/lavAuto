"use client"

/**
 * Le thème couleur de la station, tel que le serveur l'a rendu.
 *
 * ## Pourquoi un magasin séparé de `branding-api`
 *
 * `ColorThemeProvider` est monté au-dessus du routeur, donc avant l'écran de
 * connexion. S'il lisait directement `useBranding()`, chaque visiteur non
 * connecté déclencherait un appel à `/api/v1/branding` pour récolter un 401 —
 * du bruit dans les journaux et une requête inutile sur chaque page publique.
 *
 * Ici, personne ne va chercher le thème : il **arrive** quand un écran
 * authentifié charge l'identité de la station (`branding-api`), et le
 * fournisseur de couleurs réagit. Aucun réseau, donc, et un seul point
 * d'écriture.
 *
 * Le cache `localStorage` sert au script inline de `index.html` : il applique
 * la couleur avant la première peinture, ce qui évite le bref passage en bleu
 * WashPilot sur une station qui a choisi, par exemple, le vert.
 */

import * as React from "react"

import {
  STATION_COLOR_THEME_STORAGE_KEY,
  isColorTheme,
  type ColorTheme,
} from "@/lib/palette"

function readCache(): ColorTheme | null {
  try {
    const stored = window.localStorage.getItem(STATION_COLOR_THEME_STORAGE_KEY)
    return isColorTheme(stored) ? stored : null
  } catch {
    return null
  }
}

let current: ColorTheme | null = typeof window === "undefined" ? null : readCache()
const listeners = new Set<() => void>()

function emit() {
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function snapshot(): ColorTheme | null {
  return current
}

/** Enregistre le thème de la station (`null` : aucune couleur choisie). */
export function setStationColorTheme(theme: ColorTheme | null) {
  const next = theme && isColorTheme(theme) ? theme : null
  try {
    if (next) window.localStorage.setItem(STATION_COLOR_THEME_STORAGE_KEY, next)
    else window.localStorage.removeItem(STATION_COLOR_THEME_STORAGE_KEY)
  } catch {
    // Cache indisponible : la couleur sera simplement appliquée un peu plus tard.
  }
  if (next === current) return
  current = next
  emit()
}

/** Le thème de la station, réactif. `null` tant qu'il n'a pas été chargé. */
export function useStationColorTheme(): ColorTheme | null {
  return React.useSyncExternalStore(subscribe, snapshot, snapshot)
}

/** Lecture hors React — utile dans les tests et pour les composants non hooks. */
export function getStationColorTheme(): ColorTheme | null {
  return current
}
