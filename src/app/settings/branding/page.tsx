"use client"

import * as React from "react"
import { ImagePlus, Loader2, Lock, Palette, Paintbrush, RotateCcw, Trash2, Upload } from "lucide-react"

import { BaseLayout } from "@/components/layouts/base-layout"
import { BrandMark } from "@/components/brand"
import { StationColorPicker } from "@/components/branding/station-color-picker"
import { BlockedReason } from "@/components/access/blocked-reason"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useBranding, loadBranding } from "@/lib/branding-api"
import {
  MAX_BRAND_LOGO_BYTES,
  formatBytes,
  prepareBrandLogo,
  type BrandLogoDraft,
} from "@/lib/brand-logo"
import { getColorTheme, type ColorTheme } from "@/lib/palette"
import { useMutation } from "@/lib/use-mutation"
import { usePermission } from "@/lib/permissions"

/** Couleur de la barre latérale (CoreUI, thème sombre) — l'aperçu doit être honnête. */
const SIDEBAR_BG = "#3c4b64"

function FrenchDate({ value }: { value: string | null | undefined }) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return (
    <time dateTime={date.toISOString()}>
      {date.toLocaleString("fr-CI", { dateStyle: "long", timeStyle: "short" })}
    </time>
  )
}

export default function BrandingSettingsPage() {
  const manage = usePermission("settings:manage")
  const { logo, image_url, color_theme, status, error: loadError } = useBranding()
  const save = useMutation()

  const inputRef = React.useRef<HTMLInputElement>(null)
  const [draft, setDraft] = React.useState<BrandLogoDraft | null>(null)
  const [preparing, setPreparing] = React.useState(false)
  const [localError, setLocalError] = React.useState<string | null>(null)
  const [dragging, setDragging] = React.useState(false)
  // Pastille en cours d'enregistrement : `null` quand rien n'est en vol, la
  // valeur choisie sinon (« reset » pour le retour au bleu).
  const [pendingTheme, setPendingTheme] = React.useState<ColorTheme | null | "reset">(null)

  const busy = save.pending || preparing
  const locked = !manage.loading && !manage.allowed
  const message = localError ?? save.error ?? null
  const themeLabel = color_theme ? getColorTheme(color_theme).label : null

  // L'aperçu suit la sélection en cours, sinon le logo enregistré, sinon la
  // marque par défaut : on ne montre jamais un cadre vide.
  const previewUrl = draft?.preview_url ?? image_url

  async function pick(file: File | undefined) {
    if (!file) return
    setPreparing(true)
    setLocalError(null)
    save.reset()
    setDraft(null)
    try {
      setDraft(await prepareBrandLogo(file))
    } catch (pickError) {
      setLocalError(pickError instanceof Error ? pickError.message : "Cette image ne peut pas être lue.")
    } finally {
      setPreparing(false)
      // Remet le champ à zéro : choisir deux fois le même fichier doit
      // fonctionner (correction après un échec, par exemple).
      if (inputRef.current) inputRef.current.value = ""
    }
  }

  async function upload() {
    if (!draft) return
    const outcome = await save.run({
      url: "/api/v1/branding/logo",
      method: "PUT",
      body: { mime_type: draft.mime_type, data_base64: draft.data_base64 },
      success: "Logo enregistré : il remplace la marque WashPilot dans toute l'application.",
      failure: "Le logo n'a pas pu être enregistré.",
    })
    if (outcome.ok) {
      setDraft(null)
      await loadBranding(true)
    }
  }

  async function remove() {
    const outcome = await save.run({
      url: "/api/v1/branding/logo",
      method: "DELETE",
      confirm: "Retirer le logo de la station ? La marque WashPilot CI réapparaîtra partout.",
      success: "Logo retiré. La marque WashPilot CI est de nouveau affichée.",
      failure: "Le logo n'a pas pu être retiré.",
    })
    if (outcome.ok) {
      setDraft(null)
      await loadBranding(true)
    }
  }

  async function chooseTheme(theme: ColorTheme | null) {
    setPendingTheme(theme ?? "reset")
    const outcome = await save.run({
      url: "/api/v1/branding/theme",
      method: "PUT",
      body: { color_theme: theme },
      success: theme
        ? `Couleur enregistrée : l'application adopte « ${getColorTheme(theme).label} ».`
        : "Retour au bleu WashPilot : la couleur de la station est effacée.",
      failure: "La couleur n'a pas pu être enregistrée.",
    })
    setPendingTheme(null)
    if (outcome.ok) await loadBranding(true)
  }

  return (
    <BaseLayout
      title="Identité visuelle"
      description="Logo et couleur de votre station : ils remplacent la marque WashPilot CI dans la barre latérale, l’en-tête et les couleurs de l’application."
    >
      <div className="flex flex-col gap-6 px-4 lg:px-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Palette className="size-5" aria-hidden="true" /> Logo de la station
              {logo
                ? <Badge variant="success-light">Personnalisé</Badge>
                : <Badge variant="secondary">Marque par défaut</Badge>}
            </CardTitle>
            <CardDescription>
              Une seule image suffit : elle devient l’identité de votre station partout où la
              marque apparaissait jusqu’ici, jusqu’en tête du reçu imprimé.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            <div className="grid gap-5 md:grid-cols-[minmax(0,260px)_minmax(0,1fr)]">
              {/* Aperçu sur fond sombre : c'est ainsi que le logo apparaît
                  réellement dans la barre latérale. Le montrer sur du blanc
                  laisserait passer un logo invisible une fois en place. */}
              <div
                className="flex min-h-32 flex-col items-center justify-center gap-3 rounded-xl border border-dashed p-4"
                style={{ backgroundColor: SIDEBAR_BG }}
              >
                {previewUrl
                  ? (
                    <img
                      src={previewUrl}
                      alt="Aperçu du logo de la station"
                      className="max-h-24 w-auto max-w-full object-contain"
                    />
                  )
                  : <BrandMark height={44} tone="dark" />}
                <span className="text-xs text-white/70">Aperçu dans la barre latérale</span>
              </div>

              <div className="flex flex-col gap-4">
                <div>
                  <h3 className="text-sm font-medium">Téléverser une image</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    PNG, JPEG ou WebP · {formatBytes(MAX_BRAND_LOGO_BYTES)} maximum. Le fond
                    transparent (PNG) est conseillé. Le logo s’affiche sur fond bleu nuit (barre
                    latérale) et sur papier blanc (reçu) : des traits de couleur moyenne, ni tout
                    blancs ni tout noirs, restent lisibles sur les deux. Les grandes images sont
                    réduites automatiquement avant l’envoi.
                  </p>
                </div>

                <label
                  htmlFor="brand-logo-file"
                  onDragOver={(event) => {
                    if (locked) return
                    event.preventDefault()
                    setDragging(true)
                  }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={(event) => {
                    event.preventDefault()
                    setDragging(false)
                    if (locked) return
                    void pick(event.dataTransfer.files?.[0])
                  }}
                  className={[
                    "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-6 text-center transition-colors",
                    dragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/60 hover:bg-muted/40",
                    locked ? "cursor-not-allowed opacity-60" : "",
                  ].join(" ")}
                >
                  {preparing
                    ? <Loader2 className="size-6 animate-spin text-muted-foreground" aria-hidden="true" />
                    : <ImagePlus className="size-6 text-muted-foreground" aria-hidden="true" />}
                  <span className="text-sm font-medium">
                    {preparing ? "Préparation de l’image…" : "Choisir un fichier ou déposer l’image ici"}
                  </span>
                  <span className="text-xs text-muted-foreground">Le fichier n’est envoyé qu’après validation.</span>
                  <input
                    ref={inputRef}
                    id="brand-logo-file"
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    disabled={locked || busy}
                    className="sr-only"
                    onChange={(event) => void pick(event.target.files?.[0])}
                  />
                </label>

                {draft && (
                  <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/30 px-3 py-2 text-sm">
                    <span className="font-medium">Nouveau logo prêt</span>
                    <span className="text-muted-foreground">
                      {draft.mime_type.replace("image/", "").toUpperCase()} · {draft.width} × {draft.height} px ·{" "}
                      {formatBytes(draft.byte_size)}
                    </span>
                  </div>
                )}

                <div className="flex flex-wrap gap-2">
                  <Button onClick={() => void upload()} disabled={!draft || busy || locked}>
                    {save.pending
                      ? <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                      : <Upload className="size-4" aria-hidden="true" />}
                    Enregistrer le logo
                  </Button>
                  {draft && (
                    <Button variant="outline" onClick={() => setDraft(null)} disabled={busy}>
                      <RotateCcw className="size-4" aria-hidden="true" /> Annuler
                    </Button>
                  )}
                  {logo && !draft && (
                    <Button variant="outline" onClick={() => void remove()} disabled={busy || locked}>
                      <Trash2 className="size-4" aria-hidden="true" /> Retirer le logo
                    </Button>
                  )}
                </div>

                <BlockedReason
                  reason={
                    locked
                      ? manage.reason ?? "Seul le propriétaire de la station peut modifier le logo."
                      : null
                  }
                />

                {message && (
                  <p role="alert" className="text-sm text-destructive">{message}</p>
                )}
                {!message && loadError && (
                  <p role="status" className="text-sm text-muted-foreground">{loadError}</p>
                )}

                {logo && !draft && (
                  <p className="text-xs text-muted-foreground">
                    Logo actuel : {logo.mime_type.replace("image/", "").toUpperCase()} ·{" "}
                    {formatBytes(logo.byte_size)} · modifié le <FrenchDate value={logo.updated_at} />
                  </p>
                )}
                {status === "loading" && !logo && !draft && (
                  <p className="text-xs text-muted-foreground">Chargement de l’identité de la station…</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Paintbrush className="size-5" aria-hidden="true" /> Couleur de la station
              {themeLabel
                ? <Badge variant="success-light">{themeLabel}</Badge>
                : <Badge variant="secondary">Bleu WashPilot</Badge>}
            </CardTitle>
            <CardDescription>
              La couleur des boutons, des liens, des accents et des états de l’application.
              Huit palettes vérifiées pour rester lisibles en mode clair comme en mode sombre.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <StationColorPicker
              value={color_theme}
              onChange={(theme) => void chooseTheme(theme)}
              disabled={locked || busy}
              pending={pendingTheme}
            />
            <p className="text-sm text-muted-foreground">
              La couleur s’applique à tous les membres de la station. Celui qui a choisi sa propre
              couleur dans <strong>Paramètres › Compte › Apparence</strong> garde la sienne — c’est un
              choix personnel, sur son appareil — mais peut revenir à celle de la station en un clic.
            </p>
            <BlockedReason
              reason={locked ? manage.reason ?? "Seul le propriétaire peut changer la couleur de la station." : null}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lock className="size-5" aria-hidden="true" /> Où l’identité apparaît
            </CardTitle>
            <CardDescription>
              L’identité est propre à votre organisation : toutes vos stations et tous vos membres
              la voient.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm text-muted-foreground">
              <li>La barre latérale, à côté du nom de la station (et en version réduite quand elle est repliée).</li>
              <li>L’en-tête sur téléphone, où la barre latérale est fermée.</li>
              <li>La tête du <strong>reçu de lavage</strong> imprimé, au-dessus du nom de la station.</li>
              <li>Les couleurs des boutons, liens, badges et graphiques, pour qui n’a pas choisi les siennes.</li>
            </ul>
            <p className="mt-4 text-sm text-muted-foreground">
              Tant qu’aucun logo n’est téléversé, la marque <strong>WashPilot CI</strong> reste affichée.
              Retirer le logo ramène à cette marque, sans rien perdre d’autre — ni la couleur.
            </p>
          </CardContent>
        </Card>
      </div>
    </BaseLayout>
  )
}
