import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  COLOR_THEMES,
  COLOR_VARS,
  DEFAULT_COLOR_THEME,
  STATION_COLOR_THEME_STORAGE_KEY,
  getColorTheme,
  isColorTheme,
  readStoredColorThemeOrNull,
  resolveColorTheme,
} from "../src/lib/palette.ts";

/**
 * Le thème couleur est appliqué à deux endroits : le script inline de
 * `index.html` (avant le premier rendu, pour éviter un flash de la couleur par
 * défaut) et `ColorThemeProvider`. Le script ne peut rien importer, donc la
 * palette y est **dupliquée**.
 *
 * Ces tests sont le garde-fou : si une teinte change d'un seul côté, la suite
 * échoue au lieu de laisser un aperçu faux — puis un vrai écart de couleur au
 * premier rendu — passer en production.
 */

const root = join(import.meta.dirname, "..");
const indexHtml = readFileSync(join(root, "index.html"), "utf8");
const appCss = readFileSync(join(root, "src/index.css"), "utf8");

describe("thème couleur — palette", () => {
  it("expose au moins six choix, tous identifiés de façon unique", () => {
    assert.ok(COLOR_THEMES.length >= 6);
    const ids = COLOR_THEMES.map((theme) => theme.value);
    assert.equal(new Set(ids).size, ids.length, "identifiants dupliqués");
  });

  it("couvre les deux modes pour chaque thème, avec les quatre variables", () => {
    for (const theme of COLOR_THEMES) {
      for (const mode of ["light", "dark"] as const) {
        const vars = theme[mode];
        assert.equal(Object.keys(vars).length, 4, `${theme.value}/${mode}`);
        for (const name of ["primary", "accent", "success", "info"] as const) {
          assert.match(
            vars[name],
            /^oklch\(/,
            `${theme.value}/${mode}/${name} doit être une couleur oklch()`,
          );
        }
      }
    }
  });

  it("éclaircit les teintes en mode sombre, jamais l'inverse", () => {
    /** Luminosité oklch (première valeur décimale). */
    const lightness = (value: string) =>
      Number(/oklch\(([\d.]+)/.exec(value)![1]);
    for (const theme of COLOR_THEMES) {
      assert.ok(
        lightness(theme.dark.primary) > lightness(theme.light.primary),
        `${theme.value} : la couleur d'action sombre doit être plus claire`,
      );
    }
  });

  it("reconnaît un thème valide et ignore une valeur corrompue", () => {
    assert.equal(isColorTheme("ambre"), true);
    assert.equal(isColorTheme("fuchsia"), false);
    assert.equal(getColorTheme("fuchsia").value, DEFAULT_COLOR_THEME);
  });
});

describe("thème couleur — cohérence avec le script inline", () => {
  it("déclare la palette complète dans index.html, valeur pour valeur", () => {
    for (const theme of COLOR_THEMES) {
      assert.ok(
        indexHtml.includes(`${theme.value}: {`),
        `thème « ${theme.value} » absent de index.html`,
      );
      for (const mode of ["light", "dark"] as const) {
        for (const name of ["primary", "accent", "success", "info"] as const) {
          assert.ok(
            indexHtml.includes(theme[mode][name]),
            `index.html ne contient pas ${theme.value}/${mode}/${name} = ${theme[mode][name]}`,
          );
        }
      }
    }
  });

  it("utilise la même clé de stockage des deux côtés", () => {
    assert.match(indexHtml, /getItem\("washpilot-color-theme"\)/);
  });

  it("pose le thème couleur avant de charger l'application", () => {
    const script = indexHtml.indexOf("washpilot-color-theme");
    const bundle = indexHtml.indexOf("/src/main.tsx");
    assert.ok(script > -1 && bundle > -1 && script < bundle);
  });
});

describe("thème couleur — feuille de style", () => {
  it("déduit les couleurs de police de la palette au lieu de les figer", () => {
    for (const [name] of COLOR_VARS) {
      const variable = String(name);
      assert.match(
        appCss,
        new RegExp(
          `${variable}-foreground: color-mix\\(in oklch, var\\(${variable}\\)`,
        ),
        `${name}-foreground doit être calculé depuis ${name}`,
      );
    }
  });

  it("garde la vitrine lisible en mode sombre", () => {
    // La classe verrouille les surfaces ET les textes posés sur la palette,
    // sans quoi une carte blanche hériterait du texte clair du mode sombre.
    const blocks = [...appCss.matchAll(/\.light-surface \{([\s\S]*?)\}/g)];
    assert.ok(blocks.length > 0, "classe .light-surface absente");
    const block = blocks
      .map((match) => match[1])
      .find((css) => css.includes("--background:"));
    assert.ok(block, "aucun bloc .light-surface ne verrouille les surfaces");
    assert.match(String(block), /--background:\s*oklch\(1 0 0\)/);
    assert.match(String(block), /--foreground:\s*oklch\(0\.145 0 0\)/);
    assert.ok(
      /--primary-foreground: color-mix\(in oklch/.test(String(block)),
      "la vitrine doit recalculer --primary-foreground pour le mode clair",
    );
  });
});

describe("thème couleur — priorité entre la personne et la station", () => {
  it("le choix personnel l'emporte sur celui de la station", () => {
    assert.deepEqual(resolveColorTheme("rose", "emeraude"), { theme: "rose", source: "user" });
  });

  it("sans choix personnel, la station décide", () => {
    assert.deepEqual(resolveColorTheme(null, "emeraude"), { theme: "emeraude", source: "station" });
  });

  it("sans choix ni station, le bleu WashPilot reste la référence", () => {
    assert.deepEqual(resolveColorTheme(null, null), {
      theme: DEFAULT_COLOR_THEME,
      source: "default",
    });
  });

  it("sans stockage accessible, aucun choix personnel n'est inventé", () => {
    // En dehors du navigateur, `localStorage` n'existe pas : la fonction doit
    // rendre `null` (donc « suivre la station ») et non un thème par défaut,
    // qui écraserait la couleur choisie par la station.
    assert.equal(readStoredColorThemeOrNull(), null);
  });

  it("index.html lit le cache du thème de la station avant le bundle", () => {
    assert.equal(STATION_COLOR_THEME_STORAGE_KEY, "washpilot-station-color-theme");
    const script = indexHtml.indexOf(`getItem("${STATION_COLOR_THEME_STORAGE_KEY}")`);
    const bundle = indexHtml.indexOf("/src/main.tsx");
    assert.ok(script > -1, "le script inline doit lire le cache du thème de la station");
    assert.ok(script < bundle, "sinon la couleur de la station arrive après la première peinture");
    // Le choix personnel doit être consulté AVANT la station : l'ordre des
    // deux `getItem` décide de la priorité à l'écran.
    assert.ok(
      indexHtml.indexOf('getItem("washpilot-color-theme")') <
        indexHtml.indexOf(`getItem("${STATION_COLOR_THEME_STORAGE_KEY}")`),
    );
  });

  it("la couleur de la station vient du serveur, pas d'un réglage local", () => {
    const api = readFileSync(join(root, "src/lib/branding-api.ts"), "utf8");
    assert.match(api, /setStationColorTheme\(payload\.color_theme/);
    assert.match(api, /setStationColorTheme\(null\)/, "la déconnexion doit oublier la couleur");
  });
});
