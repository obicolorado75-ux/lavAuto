/**
 * Thème **couleur** — source unique de la palette métier.
 *
 * Deux notions distinctes, à ne pas confondre :
 *   • le **mode** (clair / sombre), géré par `src/lib/theme.ts` ;
 *   • le **thème couleur** (l'identité de la marque), géré ici.
 *
 * Un thème couleur redéfinit quatre teintes : la couleur d'action, la teinte
 * d'accent des surfaces, la couleur d'état positive et la couleur
 * d'information. **Tout le reste en découle** dans `src/index.css` : les
 * textes posés sur ces fonds (`*-foreground`), les fonds discrets des badges
 * et de la barre latérale sont calculés par `color-mix()`. C'est ce qui garantit
 * que la couleur de police reste lisible, quelle que soit la teinte choisie et
 * quel que soit le mode — un `#fff` posé à la main sur un jaune deviendrait
 * illisible dès qu'on change de thème.
 *
 * Ce module ne dépend d'aucun DOM : il est importable depuis les tests et
 * depuis le script inline de `index.html` est le seul à dupliquer le défaut
 * (comme pour la clé de thème, voir `tests/theme.test.ts`).
 */

/** Identifiant d'un thème couleur. */
export type ColorTheme =
  | "bleu"
  | "indigo"
  | "violet"
  | "teal"
  | "emeraude"
  | "ambre"
  | "rose"
  | "ardoise";

/** Teintes qu'un thème couleur pilote, associées à leur variable CSS. */
export const COLOR_VARS = [
  ["--primary", "primary"],
  ["--accent", "accent"],
  ["--success", "success"],
  ["--info", "info"],
] as const satisfies ReadonlyArray<readonly [string, keyof ColorPaletteVars]>;

/** Les quatre teintes qu'un thème couleur injecte dans le document. */
export interface ColorPaletteVars {
  /** Couleur d'action : boutons pleins, liens, anneau de focus, éléments actifs. */
  primary: string;
  /** Teinte d'accent : survols, sélections, puces (doit rester discrète). */
  accent: string;
  /** État positif : lavage terminé, caisse équilibrée, badge « à jour ». */
  success: string;
  /** Information : lavage en cours, statut neutre mis en avant. */
  info: string;
}

export interface ColorThemeOption {
  value: ColorTheme;
  label: string;
  description: string;
  /** Les deux modes. Le mode sombre n'est pas le mode clair assombri : ses
   *  teintes sont plus claires et moins saturées, pour rester lisibles sur un
   *  fond presque noir sans vibrer. */
  light: ColorPaletteVars;
  dark: ColorPaletteVars;
}

/**
 * Les huit thèmes proposés.
 *
 * `primary` sert de texte sur `--primary` **et** de fond pour du texte blanc :
 * les valeurs claires restent sous une luminosité oklch de 0,62 pour que le
 * contraste avec du blanc dépasse 4,5:1. Les valeurs sombres remontent, car le
 * texte posé dessus y est foncé (`--primary-foreground`).
 */
export const COLOR_THEMES: ReadonlyArray<ColorThemeOption> = [
  {
    value: "bleu",
    label: "Bleu WashPilot",
    description: "La teinte de la maison : eau, confiance, lisibilité maximum.",
    light: {
      primary: "oklch(0.505 0.17 262)",
      accent: "oklch(0.955 0.02 262)",
      success: "oklch(0.56 0.15 152)",
      info: "oklch(0.56 0.12 240)",
    },
    dark: {
      primary: "oklch(0.72 0.14 262)",
      accent: "oklch(0.3 0.05 262)",
      success: "oklch(0.75 0.16 152)",
      info: "oklch(0.75 0.1 240)",
    },
  },
  {
    value: "indigo",
    label: "Indigo",
    description: "Plus profond, plus calme : idéal pour une caisse le soir.",
    light: {
      primary: "oklch(0.5 0.19 272)",
      accent: "oklch(0.955 0.02 272)",
      success: "oklch(0.56 0.15 152)",
      info: "oklch(0.56 0.17 258)",
    },
    dark: {
      primary: "oklch(0.7 0.16 272)",
      accent: "oklch(0.3 0.06 272)",
      success: "oklch(0.75 0.16 152)",
      info: "oklch(0.76 0.14 258)",
    },
  },
  {
    value: "violet",
    label: "Violet",
    description: "Distinctif, un peu plus chaleureux que le bleu.",
    light: {
      primary: "oklch(0.5 0.19 302)",
      accent: "oklch(0.955 0.02 302)",
      success: "oklch(0.56 0.15 152)",
      info: "oklch(0.56 0.16 285)",
    },
    dark: {
      primary: "oklch(0.72 0.16 302)",
      accent: "oklch(0.3 0.06 302)",
      success: "oklch(0.75 0.16 152)",
      info: "oklch(0.76 0.13 285)",
    },
  },
  {
    value: "teal",
    label: "Turquoise",
    description: "L’eau au premier plan : sobre, féminin, lumineux.",
    light: {
      primary: "oklch(0.52 0.1 195)",
      accent: "oklch(0.955 0.02 195)",
      success: "oklch(0.56 0.15 152)",
      info: "oklch(0.56 0.11 220)",
    },
    dark: {
      primary: "oklch(0.75 0.1 195)",
      accent: "oklch(0.3 0.04 195)",
      success: "oklch(0.78 0.15 152)",
      info: "oklch(0.76 0.1 220)",
    },
  },
  {
    value: "emeraude",
    label: "Émeraude",
    description: "Vert d’eau : met naturellement les états positifs en avant.",
    light: {
      primary: "oklch(0.52 0.13 162)",
      accent: "oklch(0.955 0.02 162)",
      success: "oklch(0.55 0.15 152)",
      info: "oklch(0.55 0.11 215)",
    },
    dark: {
      primary: "oklch(0.75 0.13 162)",
      accent: "oklch(0.3 0.04 162)",
      success: "oklch(0.8 0.15 152)",
      info: "oklch(0.75 0.1 215)",
    },
  },
  {
    value: "ambre",
    label: "Ambre",
    description:
      "Chaud et énergique. La teinte la plus sombre, pour le contraste.",
    light: {
      primary: "oklch(0.55 0.12 70)",
      accent: "oklch(0.955 0.02 70)",
      success: "oklch(0.54 0.14 150)",
      info: "oklch(0.54 0.11 240)",
    },
    dark: {
      primary: "oklch(0.78 0.12 70)",
      accent: "oklch(0.3 0.05 70)",
      success: "oklch(0.78 0.15 150)",
      info: "oklch(0.75 0.1 240)",
    },
  },
  {
    value: "rose",
    label: "Rose",
    description:
      "Identité plus commerciale ; les alertes rouges restent distinctes.",
    light: {
      primary: "oklch(0.52 0.16 5)",
      accent: "oklch(0.955 0.025 5)",
      success: "oklch(0.56 0.15 152)",
      info: "oklch(0.56 0.12 240)",
    },
    dark: {
      primary: "oklch(0.75 0.14 5)",
      accent: "oklch(0.3 0.06 5)",
      success: "oklch(0.78 0.15 152)",
      info: "oklch(0.76 0.1 240)",
    },
  },
  {
    value: "ardoise",
    label: "Ardoise",
    description:
      "Neutre, sans couleur d’action : pour un rendu très professionnel.",
    light: {
      primary: "oklch(0.38 0.02 250)",
      accent: "oklch(0.955 0.005 250)",
      success: "oklch(0.56 0.13 152)",
      info: "oklch(0.55 0.06 250)",
    },
    dark: {
      primary: "oklch(0.85 0.02 250)",
      accent: "oklch(0.3 0.01 250)",
      success: "oklch(0.78 0.14 152)",
      info: "oklch(0.75 0.05 250)",
    },
  },
];

/** Thème appliqué tant qu'aucun choix n'a été enregistré. */
export const DEFAULT_COLOR_THEME: ColorTheme = "bleu";

/** Clé `localStorage`. ⚠️ Dupliquée dans le script inline de `index.html`. */
export const COLOR_THEME_STORAGE_KEY = "washpilot-color-theme"

/**
 * Clé du **thème de la station** mis en cache.
 *
 * Il vient du serveur, donc après le premier rendu. Le cacher permet au script
 * inline de `index.html` de l'appliquer avant la peinture, comme le choix
 * personnel : sans cela, chaque ouverture de l'application afficherait une
 * fraction de seconde de bleu WashPilot avant de basculer sur la couleur de la
 * station. Le cache n'est qu'un raccourci d'affichage — la valeur de référence
 * reste celle de la base, relue à chaque démarrage.
 */
export const STATION_COLOR_THEME_STORAGE_KEY = "washpilot-station-color-theme";

export function isColorTheme(value: unknown): value is ColorTheme {
  return COLOR_THEMES.some((theme) => theme.value === value);
}

export function getColorTheme(value: unknown): ColorThemeOption {
  return (
    COLOR_THEMES.find((theme) => theme.value === value) ??
    COLOR_THEMES.find((theme) => theme.value === DEFAULT_COLOR_THEME)!
  );
}

/**
 * Lit la préférence enregistrée.
 *
 * Comme pour le mode, `localStorage` lève en navigation privée sur certains
 * navigateurs : une couleur ne justifie pas de faire planter l'application.
 */
export function readStoredColorTheme(
  fallback: ColorTheme = DEFAULT_COLOR_THEME,
): ColorTheme {
  return readStoredColorThemeOrNull() ?? fallback;
}

/**
 * Le choix **personnel**, ou `null` si l'utilisateur n'en a pas exprimé.
 *
 * La distinction compte depuis que la station a son propre thème : « aucun
 * choix » ne veut plus dire « bleu », mais « suivre la station ».
 */
export function readStoredColorThemeOrNull(): ColorTheme | null {
  try {
    const stored = window.localStorage.getItem(COLOR_THEME_STORAGE_KEY);
    return isColorTheme(stored) ? stored : null;
  } catch {
    return null;
  }
}

export function storeColorTheme(theme: ColorTheme): void {
  try {
    window.localStorage.setItem(COLOR_THEME_STORAGE_KEY, theme);
  } catch {
    // Préférence non persistée : le défaut revient au prochain chargement.
  }
}

/** Efface le choix personnel : l'application reprend le thème de la station. */
export function clearStoredColorTheme(): void {
  try {
    window.localStorage.removeItem(COLOR_THEME_STORAGE_KEY);
  } catch {
    // Rien à effacer si le stockage est inaccessible.
  }
}

export interface ResolvedColorTheme {
  theme: ColorTheme
  /** D'où vient la couleur : choix personnel, station, ou valeur par défaut. */
  source: "user" | "station" | "default"
}

/**
 * Quelle couleur appliquer, et pourquoi.
 *
 * Trois niveaux, du plus précis au plus général : le choix de la personne
 * (elle a cliqué, on le respecte), celui de sa station (l'identité de la
 * maison), puis le bleu WashPilot. Une station qui impose sa couleur à tout le
 * monde retirerait un réglage existant ; l'inverse — ignorer le choix
 * personnel — reviendrait à ne pas enregistrer ce que l'utilisateur vient de
 * cliquer.
 *
 * Fonction pure : testable sans DOM.
 */
export function resolveColorTheme(
  userChoice: ColorTheme | null,
  stationTheme: ColorTheme | null,
): ResolvedColorTheme {
  if (userChoice) return { theme: userChoice, source: "user" }
  if (stationTheme) return { theme: stationTheme, source: "station" }
  return { theme: DEFAULT_COLOR_THEME, source: "default" }
}

/**
 * Applique le thème couleur au document.
 *
 * Écrit quatre variables inline sur `<html>` : elles l'emportent sur `:root`
 * et `.dark` de `src/index.css`, dans les deux modes. Retirer le thème
 * (`null`) efface ces variables et rend la main à la feuille de style.
 */
export function applyColorTheme(
  theme: ColorTheme | null,
  mode: "light" | "dark",
): void {
  const root = document.documentElement;
  const vars = theme ? getColorTheme(theme)[mode] : null;

  if (vars) {
    root.dataset.colorTheme = theme!;
    for (const [name, key] of COLOR_VARS) {
      root.style.setProperty(name, vars[key]);
    }
  } else {
    delete root.dataset.colorTheme;
    for (const [name] of COLOR_VARS) root.style.removeProperty(name);
  }
}
