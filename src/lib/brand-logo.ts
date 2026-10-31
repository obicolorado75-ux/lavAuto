/**
 * Préparation du logo de la station côté navigateur.
 *
 * Le logo est stocké dans PostgreSQL (table `organization_branding`, colonne
 * `bytea`) : l'application n'a ni disque ni compartiment objet. Deux
 * conséquences pour ce fichier :
 *
 * 1. **Il faut borner.** Un appareil photo de téléphone produit des images de
 *    4 à 12 Mo ; la base refuserait tout ce qui dépasse 300 Ko. On redimensionne
 *    donc avant l'envoi, pour que le refus soit l'exception et non la règle.
 * 2. **Il ne faut pas abîmer.** Un logo s'affiche à 30 px de haut à côté du nom
 *    de la station. Écraser un PNG transparent en JPEG y collerait un rectangle
 *    blanc sur le fond bleu de la barre latérale. On conserve donc la
 *    transparence tant qu'un format qui la porte reste assez léger (PNG, puis
 *    WebP) et le JPEG n'est utilisé que pour une image entièrement opaque.
 *
 * Les parties pures — lecture de la signature binaire, plan de compression —
 * sont séparées du dessin sur canevas : elles se vérifient sans navigateur.
 */

/** Plafond en octets, identique au CHECK de `organization_branding`. */
export const MAX_BRAND_LOGO_BYTES = 300_000

/**
 * Cible interne, plus basse que le plafond.
 *
 * Le corps JSON porte le base64 (≈ 4/3 des octets réels) : viser pile 300 Ko
 * laisserait 100 Ko de marge pour les autres champs, et surtout un fichier
 * arrivé à 299 Ko passerait pour un exploit. 240 Ko laissent respirer les deux
 * extrêmes sans qu'on voie la différence à l'écran.
 */
export const TARGET_BRAND_LOGO_BYTES = 240_000

/** Taille maximale du fichier d'origine accepté en entrée. */
export const MAX_BRAND_LOGO_SOURCE_BYTES = 12_000_000

/** Plus grand côté après compression. Au-delà, c'est du gaspillage. */
export const BRAND_LOGO_MAX_EDGE = 512

export const BRAND_LOGO_MIME_TYPES = ["image/png", "image/jpeg", "image/webp"] as const
export type BrandLogoMimeType = (typeof BRAND_LOGO_MIME_TYPES)[number]

export interface BrandLogoDraft {
  mime_type: BrandLogoMimeType
  data_base64: string
  byte_size: number
  width: number
  height: number
  /** Aperçu immédiat, sans aller-retour serveur. */
  preview_url: string
}

/**
 * Format réel d'une image, d'après ses premiers octets.
 *
 * `File.type` vient du nom de fichier (parfois du système) et n'engage à rien :
 * un `logo.png` renommé depuis un JPEG annonce `image/png`. Le serveur, lui,
 * vérifie la signature et refuserait l'envoi avec un message obscur. On lit
 * donc la même signature ici, et c'est **elle** qui fixe le type transmis.
 */
export function sniffImageMime(bytes: Uint8Array): BrandLogoMimeType | null {
  const startsWith = (signature: number[]) =>
    bytes.length >= signature.length && signature.every((byte, index) => bytes[index] === byte)

  if (startsWith([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png"
  if (startsWith([0xff, 0xd8, 0xff])) return "image/jpeg"
  // WebP : « RIFF » + taille sur 4 octets + « WEBP ».
  if (bytes.length >= 12) {
    const ascii = (from: number, to: number) =>
      String.fromCharCode(...bytes.subarray(from, to))
    if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp"
  }
  return null
}

export interface LogoAttempt {
  mime_type: BrandLogoMimeType
  /** Plus grand côté, en pixels. */
  edge: number
  /** Qualité de compression pour les formats avec perte (ignorée en PNG). */
  quality?: number
}

/**
 * Plan de compression, du plus fidèle au plus léger.
 *
 * Une image transparente ne passe jamais par le JPEG ; une image opaque essaie
 * quand même le PNG d'abord, parce qu'un logo de traits sur fond uni y reste
 * souvent plus petit qu'en WebP et garde des bords nets.
 */
export function planLogoAttempts(transparent: boolean): LogoAttempt[] {
  const png: LogoAttempt = { mime_type: "image/png", edge: BRAND_LOGO_MAX_EDGE }
  if (transparent) {
    return [
      png,
      { mime_type: "image/webp", edge: BRAND_LOGO_MAX_EDGE, quality: 0.92 },
      { mime_type: "image/webp", edge: BRAND_LOGO_MAX_EDGE, quality: 0.85 },
      { mime_type: "image/webp", edge: 384, quality: 0.8 },
      { mime_type: "image/webp", edge: 320, quality: 0.7 },
      { mime_type: "image/webp", edge: 256, quality: 0.62 },
    ]
  }
  return [
    png,
    { mime_type: "image/webp", edge: BRAND_LOGO_MAX_EDGE, quality: 0.9 },
    { mime_type: "image/jpeg", edge: BRAND_LOGO_MAX_EDGE, quality: 0.86 },
    { mime_type: "image/jpeg", edge: BRAND_LOGO_MAX_EDGE, quality: 0.78 },
    { mime_type: "image/jpeg", edge: 384, quality: 0.72 },
    { mime_type: "image/jpeg", edge: 320, quality: 0.64 },
  ]
}

// ---------------------------------------------------------------------------
// Dessin — uniquement dans le navigateur
// ---------------------------------------------------------------------------

interface LoadedImage {
  source: CanvasImageSource
  width: number
  height: number
  close: () => void
}

async function loadImage(file: File): Promise<LoadedImage> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file)
      return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() }
    } catch {
      // Certains formats passent par <img> et non par createImageBitmap selon
      // le navigateur ; le repli ci-dessous est la voie universelle.
    }
  }
  const url = URL.createObjectURL(file)
  try {
    const image = new Image()
    image.src = url
    await image.decode()
    return { source: image, width: image.naturalWidth, height: image.naturalHeight, close: () => URL.revokeObjectURL(url) }
  } catch (error) {
    URL.revokeObjectURL(url)
    throw error
  }
}

function canvasBlob(canvas: HTMLCanvasElement, mime: string, quality?: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    try {
      canvas.toBlob((blob) => resolve(blob), mime, quality)
    } catch {
      resolve(null)
    }
  })
}

function blobBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = String(reader.result ?? "")
      resolve(result.slice(result.indexOf(",") + 1))
    }
    reader.onerror = () => reject(new Error("Impossible de lire le logo compressé."))
    reader.readAsDataURL(blob)
  })
}

function fileHead(file: File, length = 16): Promise<Uint8Array> {
  return file.slice(0, length).arrayBuffer().then((buffer) => new Uint8Array(buffer))
}

/**
 * Une image a-t-elle des pixels transparents ?
 *
 * On échantillonne à 64 px : un logo dont la transparence ne concerne que
 * quelques pixels isolés n'a pas d'intérêt à la préserver, et un parcours
 * complet des pixels d'une image 4000 × 4000 coûterait une seconde de gel sur
 * un téléphone d'entrée de gamme.
 */
function hasTransparency(image: LoadedImage): boolean {
  const canvas = document.createElement("canvas")
  const scale = Math.min(1, 64 / Math.max(image.width, image.height))
  canvas.width = Math.max(1, Math.round(image.width * scale))
  canvas.height = Math.max(1, Math.round(image.height * scale))
  const context = canvas.getContext("2d", { willReadFrequently: true })
  if (!context) return false
  context.clearRect(0, 0, canvas.width, canvas.height)
  context.drawImage(image.source, 0, 0, canvas.width, canvas.height)
  try {
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height)
    for (let index = 3; index < data.length; index += 4) {
      if (data[index] < 250) return true
    }
  } catch {
    // Canevas « pollué » (image d'une autre origine) : impossible ici, le
    // fichier vient d'un champ de saisie. Prudence : on suppose opaque.
    return false
  }
  return false
}

/**
 * Prépare un fichier choisi par l'utilisateur : type réel, gabarit, compression.
 *
 * Lève une `Error` porteuse d'un message français, directement affichable.
 */
export async function prepareBrandLogo(file: File): Promise<BrandLogoDraft> {
  if (!file.size) throw new Error("Ce fichier est vide.")
  if (file.size > MAX_BRAND_LOGO_SOURCE_BYTES) {
    throw new Error("L'image d'origine est trop lourde (12 Mo maximum).")
  }

  const mimeType = sniffImageMime(await fileHead(file))
  if (!mimeType) {
    throw new Error("Ce fichier n'est pas une image PNG, JPEG ou WebP.")
  }

  let image: LoadedImage
  try {
    image = await loadImage(file)
  } catch {
    throw new Error("Cette image ne peut pas être ouverte. Essayez un autre fichier.")
  }

  if (!image.width || !image.height) {
    image.close()
    throw new Error("Cette image ne peut pas être ouverte. Essayez un autre fichier.")
  }

  try {
    // Déjà légère et de taille raisonnable : on l'envoie telle quelle. La
    // recompresser abîmerait un logo déjà optimisé (bords nets, transparence).
    if (file.size <= TARGET_BRAND_LOGO_BYTES && Math.max(image.width, image.height) <= BRAND_LOGO_MAX_EDGE * 2) {
      const dataBase64 = await blobBase64(file)
      return {
        mime_type: mimeType,
        data_base64: dataBase64,
        byte_size: file.size,
        width: image.width,
        height: image.height,
        preview_url: `data:${mimeType};base64,${dataBase64}`,
      }
    }

    const transparent = mimeType !== "image/jpeg" && hasTransparency(image)
    const canvas = document.createElement("canvas")
    const context = canvas.getContext("2d")
    if (!context) throw new Error("Votre navigateur ne permet pas de préparer cette image.")

    let best: { blob: Blob; mime: BrandLogoMimeType; width: number; height: number } | null = null

    for (const attempt of planLogoAttempts(transparent)) {
      const scale = Math.min(1, attempt.edge / Math.max(image.width, image.height))
      canvas.width = Math.max(1, Math.round(image.width * scale))
      canvas.height = Math.max(1, Math.round(image.height * scale))
      context.clearRect(0, 0, canvas.width, canvas.height)
      if (attempt.mime_type === "image/jpeg") {
        // Pas d'alpha en JPEG : sans fond, les zones transparentes virent au noir.
        context.fillStyle = "#ffffff"
        context.fillRect(0, 0, canvas.width, canvas.height)
      }
      context.drawImage(image.source, 0, 0, canvas.width, canvas.height)

      const blob = await canvasBlob(canvas, attempt.mime_type, attempt.quality)
      // Le navigateur peut ignorer le format demandé (WebP sur un vieux
      // Safari) et rendre un PNG : on garde le type réellement produit.
      if (!blob) continue
      const produced = blob.type as BrandLogoMimeType
      if (!BRAND_LOGO_MIME_TYPES.includes(produced)) continue
      if (!best || blob.size < best.blob.size) {
        best = { blob, mime: produced, width: canvas.width, height: canvas.height }
      }
      if (blob.size <= TARGET_BRAND_LOGO_BYTES) break
    }

    if (!best) throw new Error("Votre navigateur ne permet pas de préparer cette image.")
    if (best.blob.size > MAX_BRAND_LOGO_BYTES) {
      throw new Error("Le logo reste trop lourd après compression. Essayez une image plus simple ou moins large.")
    }

    const dataBase64 = await blobBase64(best.blob)
    return {
      mime_type: best.mime,
      data_base64: dataBase64,
      byte_size: best.blob.size,
      width: best.width,
      height: best.height,
      preview_url: `data:${best.mime};base64,${dataBase64}`,
    }
  } finally {
    image.close()
  }
}

/** Taille lisible pour l'interface : « 128 Ko », « 1,4 Mo ». */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 Ko"
  if (bytes < 1024) return `${bytes} o`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} Mo`
}
