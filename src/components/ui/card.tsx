import * as React from "react"
import {
  CCard,
  CCardBody,
  CCardFooter,
  CCardHeader,
  CCardText,
  CCardTitle,
} from "@coreui/react"
import { cn } from "cn"

/**
 * Carte de l'application.
 *
 * Trois niveaux de présence, du plus discret au plus engageant :
 *
 *   · par défaut — une surface posée, avec son liseré (`elev-1`) ;
 *   · `elevation={2|3}` — une surface qui pèse davantage dans la hiérarchie
 *     (panneau de synthèse, encart à décision) ;
 *   · `interactive` — une carte qui **décolle au survol** : 4 px de translation,
 *     1,2 % d'échelle, ombre portée révélée par `.card-3d` et liseré lumineux
 *     sur le bord supérieur. À réserver aux cartes sur lesquelles on clique,
 *     sinon le relief ne veut plus rien dire.
 *
 * L'animation vit dans `src/index.css` (`.card-3d`) et non ici : elle ne dépend
 * d'aucun état React, et une carte qui apparaît dans une liste n'a pas à
 * monter un composant de mouvement par élément.
 */
function Card({
  className,
  size = "default",
  interactive = false,
  elevation,
  hoverScale,
  ...props
}: React.ComponentProps<"div"> & {
  size?: "default" | "sm"
  /** Décollement au survol : ombre + échelle + perspective (`.card-3d`). */
  interactive?: boolean
  /**
   * Hauteur statique de la carte, sans interaction. Utiliser `interactive`
   * plutôt que `elevation={3}` quand la carte est cliquable : le relief doit
   * alors répondre au curseur.
   */
  elevation?: 1 | 2 | 3
  /**
   * Amplitude du survol. `tight` pour les grilles denses (indicateurs,
   * répartitions) où 4 px suffiraient à faire chevaucher les voisines.
   */
  hoverScale?: "default" | "tight"
}) {
  return (
    <CCard
      data-slot="card"
      data-size={size}
      data-interactive={interactive || undefined}
      className={cn(
        "group/card text-sm",
        interactive
          ? cn("card-3d", hoverScale === "tight" && "card-3d-tight")
          : elevation && `elev-${elevation}`,
        className
      )}
      {...props}
    />
  )
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <CCardHeader
      data-slot="card-header"
      className={cn(
        "group/card-header @container/card-header grid auto-rows-min items-start gap-1 has-data-[slot=card-action]:grid-cols-[1fr_auto] has-data-[slot=card-description]:grid-rows-[auto_auto]",
        className
      )}
      {...props}
    />
  )
}

function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <CCardTitle
      data-slot="card-title"
      className={cn("mb-0 text-base leading-snug font-medium group-data-[size=sm]/card:text-sm", className)}
      {...props}
    />
  )
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <CCardText
      data-slot="card-description"
      className={cn("mb-0 text-sm text-body-secondary", className)}
      {...props}
    />
  )
}

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn("col-start-2 row-span-2 row-start-1 self-start justify-self-end", className)}
      {...props}
    />
  )
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return <CCardBody data-slot="card-content" className={className} {...props} />
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <CCardFooter
      data-slot="card-footer"
      className={cn("flex items-center", className)}
      {...props}
    />
  )
}

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
}
