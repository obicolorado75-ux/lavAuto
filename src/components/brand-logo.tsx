"use client"

import * as React from "react"

import { BrandBadge, BrandMark } from "@/components/brand"
import { useBranding } from "@/lib/branding-api"
import { cn } from "@/lib/utils"

/**
 * Le logo de la station, ou celui de WashPilot CI à défaut.
 *
 * L'application n'a qu'un seul endroit qui décide quelle marque s'affiche :
 * ce composant. Partout où la marque apparaissait en dur (`BrandMark`,
 * `BrandBadge`), on passe par lui — un logo téléversé qui n'apparaîtrait que
 * sur l'écran de réglages serait un réglage qui ne règle rien.
 *
 * Pendant le chargement, c'est la marque par défaut qui s'affiche : elle est
 * déjà dans le cache du navigateur, elle ne clignote pas, et une station sans
 * logo ne voit aucune différence. Une fois les octets arrivés, l'image prend
 * sa place sans déplacer le texte voisin (la hauteur est fixée par la prop).
 *
 * `variant` reprend la règle de `brand.tsx` : un emplacement horizontal reçoit
 * l'emblème (`mark`), un emplacement carré et étroit reçoit le médaillon
 * (`badge`). Un logo téléversé, lui, est le même dans les deux : c'est celui
 * de la station, pas une variante de la marque.
 */
export function BrandLogo({
  height = 30,
  tone = "dark",
  variant = "mark",
  className,
}: {
  height?: number
  tone?: "auto" | "light" | "dark"
  variant?: "mark" | "badge"
  className?: string
}) {
  const { image_url } = useBranding()
  // On retient l'URL qui a échoué, et non un simple booléen : une nouvelle
  // image est donc automatiquement une nouvelle chance, sans effet de bord.
  // Sans cela, un premier échec condamnait l'emplacement jusqu'au
  // rechargement de la page, même après un téléversement réussi.
  const [brokenUrl, setBrokenUrl] = React.useState<string | null>(null)
  const broken = brokenUrl !== null && brokenUrl === image_url

  const Fallback = variant === "badge" ? BrandBadge : BrandMark
  if (!image_url || broken) return <Fallback height={height} tone={tone} className={className} />

  return (
    <span className={cn("inline-flex shrink-0 items-center", className)}>
      {/* `alt=""` : le lien ou le titre voisin porte déjà le nom de la
          station ; annoncer « Logo » en plus ferait du bruit. */}
      <img
        src={image_url}
        alt=""
        aria-hidden
        draggable={false}
        decoding="async"
        onError={() => setBrokenUrl(image_url)}
        className="block object-contain"
        style={{ height, width: "auto", maxWidth: height * 4 }}
      />
    </span>
  )
}

export default BrandLogo
