"use client"

/**
 * L'identité visuelle de la station, vue du navigateur.
 *
 * ## Pourquoi un magasin et non un simple `useApi`
 *
 * Le même logo s'affiche à plusieurs endroits à la fois : la barre latérale
 * (deux variantes, large et repliée), l'écran Paramètres › Identité visuelle.
 * Un `useApi` par composant produirait trois requêtes et trois images
 * binaires en mémoire pour un fichier de 200 Ko. Ici, une seule lecture sert
 * tout le monde, et un téléversement prévient tous les abonnés.
 *
 * ## Pourquoi l'image n'est pas un `<img src="/api/v1/branding/logo">`
 *
 * Le cookie de session suffit dans un onglet ordinaire, pas dans les aperçus
 * intégrés en iframe où les cookies tiers sont bloqués : l'application s'y
 * authentifie alors par en-tête `Authorization`, qu'une balise `<img>` ne
 * sait pas envoyer. On récupère donc les octets par `apiFetch` — qui porte le
 * jeton — et on les expose par une URL d'objet. Le logo s'affiche alors dans
 * les deux contextes, sans exception.
 */

import * as React from "react"

import { apiErrorMessage, apiFetch } from "@/lib/api"

export interface BrandLogoMeta {
  mime_type: string
  byte_size: number
  updated_at: string
  url: string
}

interface BrandingPayload {
  logo: BrandLogoMeta | null
}

export type BrandingStatus = "idle" | "loading" | "ready" | "error"

export interface BrandingState {
  status: BrandingStatus
  logo: BrandLogoMeta | null
  /** URL d'objet du logo téléversé ; `null` = pas de logo personnalisé. */
  image_url: string | null
  error: string | null
}

const EMPTY: BrandingState = { status: "idle", logo: null, image_url: null, error: null }

/** Au-delà, on relit : le logo a pu changer dans un autre onglet. */
const STALE_MS = 60_000

let state: BrandingState = EMPTY
let inflight: Promise<void> | null = null
let lastLoadedAt = 0
let generation = 0
const listeners = new Set<() => void>()

function emit(next: BrandingState) {
  state = next
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function snapshot(): BrandingState {
  return state
}

/** Remplace l'URL d'objet en libérant l'ancienne : sinon, fuite mémoire. */
function swapImageUrl(url: string | null) {
  if (state.image_url && state.image_url !== url) URL.revokeObjectURL(state.image_url)
}

async function readBranding(): Promise<void> {
  const ticket = ++generation
  if (state.status !== "ready") emit({ ...state, status: "loading", error: null })

  try {
    const response = await apiFetch("/api/v1/branding")
    if (!response.ok) throw new Error(await apiErrorMessage(response))
    const payload = (await response.json()) as BrandingPayload
    if (ticket !== generation) return

    if (!payload.logo) {
      swapImageUrl(null)
      lastLoadedAt = Date.now()
      emit({ status: "ready", logo: null, image_url: null, error: null })
      return
    }

    // L'URL du logo est versionnée par `updated_at` côté serveur ; on la
    // demande telle quelle. Un échec ici n'efface pas l'information : on sait
    // qu'un logo existe, on n'a simplement pas pu le charger.
    const imageResponse = await apiFetch(payload.logo.url)
    if (ticket !== generation) return
    if (!imageResponse.ok) {
      throw new Error(
        imageResponse.status === 404
          ? "Le logo enregistré est introuvable. Téléversez-le à nouveau."
          : await apiErrorMessage(imageResponse),
      )
    }
    const blob = await imageResponse.blob()
    if (ticket !== generation) return
    const url = URL.createObjectURL(blob)
    swapImageUrl(url)
    lastLoadedAt = Date.now()
    emit({ status: "ready", logo: payload.logo, image_url: url, error: null })
  } catch (error) {
    if (ticket !== generation) return
    emit({
      status: "error",
      logo: state.logo,
      // On conserve l'image déjà affichée : mieux vaut un logo d'il y a cinq
      // minutes qu'un logo qui disparaît parce que le réseau a hoqueté.
      image_url: state.image_url,
      error: error instanceof Error ? error.message : "Impossible de charger le logo de la station.",
    })
  } finally {
    if (ticket === generation) inflight = null
  }
}

/**
 * (Re)charge l'identité visuelle. Sans `force`, une lecture récente est
 * réutilisée — plusieurs composants peuvent appeler sans se concerter.
 */
export function loadBranding(force = false): Promise<void> {
  if (inflight && !force) return inflight
  if (!force && state.status === "ready" && Date.now() - lastLoadedAt < STALE_MS) {
    return Promise.resolve()
  }
  inflight = readBranding()
  return inflight
}

/** Oublie tout : à appeler à la déconnexion, pour ne pas montrer le logo d'une autre station. */
export function resetBranding() {
  generation += 1
  inflight = null
  lastLoadedAt = 0
  swapImageUrl(null)
  emit(EMPTY)
}

/** Téléverse un logo préparé par `prepareBrandLogo`. Lève une `Error` en français en cas d'échec. */
export async function uploadBrandLogo(draft: {
  mime_type: string
  data_base64: string
}): Promise<void> {
  const response = await apiFetch("/api/v1/branding/logo", {
    method: "PUT",
    body: JSON.stringify({ mime_type: draft.mime_type, data_base64: draft.data_base64 }),
  })
  if (!response.ok) throw new Error(await apiErrorMessage(response))
  await loadBranding(true)
}

/** Retire le logo personnalisé : retour à la marque WashPilot CI. */
export async function removeBrandLogo(): Promise<void> {
  const response = await apiFetch("/api/v1/branding/logo", { method: "DELETE" })
  if (!response.ok) throw new Error(await apiErrorMessage(response))
  await loadBranding(true)
}

/**
 * L'état de l'identité visuelle, partagé par tous les composants.
 *
 * Le premier abonné déclenche la lecture ; les suivants la partagent. Au
 * montage, une lecture plus vieille qu'une minute est rafraîchie.
 */
export function useBranding(): BrandingState & { reload: () => void } {
  const value = React.useSyncExternalStore(subscribe, snapshot, snapshot)

  React.useEffect(() => {
    void loadBranding()
  }, [])

  const reload = React.useCallback(() => {
    void loadBranding(true)
  }, [])

  return { ...value, reload }
}
