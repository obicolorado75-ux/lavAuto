"use client"

import * as React from "react"
import {
  CTable,
  CTableBody,
  CTableCaption,
  CTableDataCell,
  CTableFoot,
  CTableHead,
  CTableHeaderCell,
  CTableRow,
} from "@coreui/react"
import { cn } from "cn"

/**
 * Tableau de l'application.
 *
 * `elevated` pose la surface 3D (`.table-3d`) : bord, ombre portée, en-tête
 * légèrement en relief. Les lignes se décollent de 1 px au survol, se teintent
 * et reçoivent un liseré d'accent sur leur première cellule.
 *
 * `animateRows` (actif par défaut) fait apparaître les lignes en cascade —
 * 16 ms d'écart, plafonné aux douze premières. C'est du CSS pur : cent lignes
 * animées par framer-motion coûteraient plus cher en rendu que le gain perçu,
 * et une caisse doit rester fluide sur un téléphone d'entrée de gamme.
 */

function Table({
  className,
  elevated = false,
  animateRows = true,
  ...props
}: React.ComponentProps<typeof CTable> & {
  /** Surface en relief : à réserver au tableau qui EST la carte de l'écran. */
  elevated?: boolean
  /** Cascade d'apparition des lignes. Désactiver sur un tableau très dense. */
  animateRows?: boolean
}) {
  return (
    <div
      data-slot="table-container"
      data-elevated={elevated || undefined}
      className={cn(
        "relative w-full overflow-x-auto",
        elevated && "table-3d",
        animateRows && "table-anim",
      )}
    >
      <CTable
        hover
        data-slot="table"
        className={cn("mb-0 w-full caption-bottom text-sm", className)}
        {...props}
      />
    </div>
  )
}

function TableHeader({ className, ...props }: React.ComponentProps<typeof CTableHead>) {
  return <CTableHead data-slot="table-header" className={cn("[&_tr]:border-b", className)} {...props} />
}

function TableBody({ className, ...props }: React.ComponentProps<typeof CTableBody>) {
  return <CTableBody data-slot="table-body" className={cn("[&_tr:last-child]:border-0", className)} {...props} />
}

function TableFooter({ className, ...props }: React.ComponentProps<typeof CTableFoot>) {
  return (
    <CTableFoot
      data-slot="table-footer"
      className={cn("border-t font-medium [&>tr]:last:border-b-0", className)}
      {...props}
    />
  )
}

function TableRow({
  className,
  index,
  style,
  ...props
}: React.ComponentProps<typeof CTableRow> & {
  /**
   * Rang de la ligne dans la page. Sert de décalage à `.row-in` quand un écran
   * anime ses lignes lui-même ; sinon la cascade vient de `.table-anim`.
   */
  index?: number
}) {
  return (
    <CTableRow
      data-slot="table-row"
      data-lift=""
      className={cn("has-aria-expanded:bg-muted/50 data-[state=selected]:bg-muted", className)}
      style={
        index === undefined
          ? style
          : ({ ...style, "--row": Math.min(index, 10) } as React.CSSProperties)
      }
      {...props}
    />
  )
}

function TableHead({ className, ...props }: React.ComponentProps<typeof CTableHeaderCell>) {
  return (
    <CTableHeaderCell
      data-slot="table-head"
      scope="col"
      className={cn("h-10 text-left align-middle whitespace-nowrap [&:has([role=checkbox])]:pr-0", className)}
      {...props}
    />
  )
}

function TableCell({ className, ...props }: React.ComponentProps<typeof CTableDataCell>) {
  return (
    <CTableDataCell
      data-slot="table-cell"
      className={cn("align-middle whitespace-nowrap [&:has([role=checkbox])]:pr-0", className)}
      {...props}
    />
  )
}

function TableCaption({ className, ...props }: React.ComponentProps<typeof CTableCaption>) {
  return (
    <CTableCaption data-slot="table-caption" className={cn("mt-4 text-sm text-body-secondary", className)} {...props} />
  )
}

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
}
