/**
 * Grammaire de mouvement des surfaces — cartes, tableaux, graphiques.
 *
 * Trois couches doivent rester d'accord, et aucune ne peut importer les autres :
 *
 *   · les jetons JS (`src/lib/motion.ts`) — ce que framer-motion anime ;
 *   · les classes CSS (`src/index.css`) — ce que le navigateur anime seul ;
 *   · les composants (`ui/card.tsx`, `ui/table.tsx`, `ui/chart.tsx`) — ce qui
 *     décide quand l'une ou l'autre s'applique.
 *
 * Une retouche d'un seul côté ne se voit pas à la compilation : une carte qui
 * ne décolle plus, un tableau dont les lignes clignotent. Ces tests sont le
 * garde-fou de cette duplication — même logique que `theme.test.ts`.
 */
import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"

import { DURATION, HOVER_CARD, HOVER_CHART, HOVER_MS, HOVER_LIFT } from "../src/lib/motion.ts"

const root = join(import.meta.dirname, "..")
const read = (path: string) => readFileSync(join(root, path), "utf8")

const appCss = read("src/index.css")
const coreuiCss = read("src/coreui.css")
const cardTsx = read("src/components/ui/card.tsx")
const tableTsx = read("src/components/ui/table.tsx")
const chartTsx = read("src/components/ui/chart.tsx")

test("les amplitudes de survol restent sobres et hiérarchisées", () => {
  // Une carte qui grossit de plus de 2 % chevauche ses voisines et fait
  // « trembler » la grille ; au-delà de 6 px de décollement, l'ombre se
  // détache du sol et l'objet paraît flotter.
  assert.ok(HOVER_CARD.scale > 1 && HOVER_CARD.scale <= 1.02, `échelle carte: ${HOVER_CARD.scale}`)
  assert.ok(HOVER_CARD.y < 0 && HOVER_CARD.y >= -6, `décollement carte: ${HOVER_CARD.y}`)

  // Le graphique bouge moins que la carte : c'est une donnée qu'on lit.
  assert.ok(Math.abs(HOVER_CHART.y) < Math.abs(HOVER_CARD.y))
  assert.ok(HOVER_CHART.scale < HOVER_CARD.scale)

  // La carte « 3D » décolle plus que le survol simple : sinon les deux gestes
  // sont indiscernables et l'élévation ne signifie plus rien.
  assert.ok(HOVER_CARD.y < HOVER_LIFT.y)
})

test("la durée de survol est la même en JS et en CSS", () => {
  assert.equal(HOVER_MS, DURATION.hoverShadow * 1000)
  assert.equal(HOVER_MS, 160)
  assert.match(appCss, /--motion-hover:\s*160ms;/)
  assert.match(appCss, /--motion-enter:\s*240ms;/)
})

test("les trois surfaces ont leur classe d'élévation 3D", () => {
  for (const selector of [".card-3d", ".table-3d", ".chart-3d", ".table-anim", ".chart-reveal"]) {
    assert.ok(appCss.includes(selector), `classe manquante dans index.css : ${selector}`)
  }
})

test("le relief passe par transform et opacity, jamais par box-shadow animé", () => {
  const cardBlock = appCss.slice(appCss.indexOf(".card-3d {"), appCss.indexOf(".card-3d > *"))
  // Une transition sur box-shadow forcerait un recalcul du flou à chaque
  // image ; l'ombre haute doit rester portée par un pseudo-élément d'opacité.
  assert.doesNotMatch(cardBlock, /transition:[^;]*box-shadow/)
  assert.match(cardBlock, /transform:/)
  assert.match(appCss, /\.card-3d::after\s*\{[^}]*opacity:\s*0;/s)
})

test("le template CoreUI n'aplatit plus les élévations", () => {
  // L'ancienne règle neutralisait `.elev-*` et `.surface-3d` en `!important`,
  // ce qui rendait toute la nouvelle grammaire inopérante dans l'application.
  assert.doesNotMatch(coreuiCss, /\.coreui-app :is\(\.elev-1/)
  assert.match(coreuiCss, /\.coreui-app \.card-3d:hover/)
})

test("les composants branchent bien les classes", () => {
  assert.match(cardTsx, /interactive\s*\?\s*cn\("card-3d"/)
  assert.match(cardTsx, /card-3d-tight/)
  assert.match(tableTsx, /elevated && "table-3d"/)
  assert.match(tableTsx, /animateRows && "table-anim"/)
  assert.match(chartTsx, /elevated && "chart-3d"/)
  assert.match(chartTsx, /reveal && "chart-reveal"/)
})

test("le mouvement réduit neutralise les nouveaux gestes", () => {
  const reduced = appCss.slice(appCss.lastIndexOf("@media (prefers-reduced-motion: reduce)"))
  assert.match(reduced, /\.card-3d,/)
  assert.match(reduced, /\.table-3d tbody tr:hover \{ transform: none; \}/)
  assert.match(reduced, /\.chart-3d:hover \.recharts-surface \{ filter: none; \}/)
})

test("les animations d'apparition rendent la main au survol", () => {
  // Piège classique : `animation-fill-mode: both` conserve `transform: none`
  // après la cascade, et le `translate3d(0, -1px, 0)` du survol ne s'applique
  // jamais. Toutes les animations d'apparition de lignes doivent donc finir en
  // `backwards`.
  for (const selector of [".row-in {", ".table-anim tbody tr {", ".chart-reveal {"]) {
    const start = appCss.indexOf(selector)
    assert.notEqual(start, -1, `sélecteur introuvable : ${selector}`)
    const block = appCss.slice(start, appCss.indexOf("}", start))
    assert.match(block, /backwards/, `${selector} doit utiliser animation-fill-mode: backwards`)
    assert.doesNotMatch(block, /\bboth\b/, `${selector} ne doit pas remplir l'animation (both)`)
  }
})
