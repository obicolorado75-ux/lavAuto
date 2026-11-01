import type { Request, Response } from "express"

/**
 * Lecture des variables d'environnement AU MOMENT DE L'APPEL, jamais au
 * chargement du module.
 *
 * Piège classique : importer l'objet `env` validé (figé à l'import) rend ce
 * middleware incalibrable en test — un fichier qui pose `NODE_ENV` ou
 * `APP_URL` après l'avoir importé ne change rien, et les tests « échouent
 * vert ». Ici le middleware doit refléter l'environnement réel du process au
 * moment où chaque requête est traitée, comme en production derrière Vercel.
 */
function currentEnv(name: "NODE_ENV" | "APP_URL"): string {
  return (process.env[name] ?? "").trim()
}

/**
 * En-têtes de sécurité HTTP — source unique.
 *
 * Les deux entrées serveur (`server.ts` pour l'hébergement classique/Docker,
 * `server/vercel-app.ts` pour le déploiement serverless) montent la même pile
 * applicative mais construisent chacune leur instance Express. Sans ce module,
 * les en-têtes devraient être dupliqués à l'identique aux deux endroits — et
 * une duplication non vérifiée finit toujours par diverger : le durcissement
 * fait sur l'un n'est jamais reporté sur l'autre, et la faille revient par le
 * second déploiement.
 */

/**
 * Politique de sécurité du contenu (CSP).
 *
 * Construite à partir d'une liste blanche de sources réellement utilisées par
 * l'application (vérifiée dans `src/`, pas devinée) :
 *
 *   • `self`               : scripts, styles et API sont servis par le même
 *                            domaine (build Vite + réécriture `vercel.json`).
 *   • fonts.googleapis.com / fonts.gstatic.com : feuille de style Inter,
 *                            déclarée dans `index.html`.
 *   • www.googletagmanager.com : GTM, chargé dynamiquement par
 *                            `src/utils/analytics.ts` si `VITE_GTM_ID` est posé.
 *   • wa.me                  : liens d'assistance WhatsApp.
 *   • data:/blob:            : images d'aperçu et exports CSV générés côté
 *                            client (`URL.createObjectURL`).
 *
 * Deux concessions assumées, à réviser si elles causent un incident :
 *   • `style-src 'unsafe-inline'` : 32 composants React posent des styles
 *     en ligne (`style={{…}}`) — sans cette autorisation, la mise en page
 *     entière se dégrade silencieusement. Un non-CEX exige une refonte
 *     (CSS-in-JS avec nonce ou classes statiques), pas un simple réglage.
 *   • PAS de `require-trusted-types-for` : l'injection GTM écrit du code JS
 *     dans `script.innerHTML` (analytics.ts), que Trusted Types bloquerait
 *     net. Sans `unsafe-eval` ni `unsafe-inline` côté script, l'exposition
 *     XSS résiduelle reste faible ; on durcira ici quand GTM sera retiré ou
 *     chargé par un gestionnaire conforme.
 *
 * `frame-ancestors 'none'` remplace X-Frame-Options (plus précis, supporté par
 * tous les navigateurs modernes) ; `upgrade-insecure-requests` force HTTPS dès
 * qu'un appelant contourne le redirected-to-HTTPS du proxy.
 *
 * Le mode strict est **report-only** hors production : un CSP mal calibré casse
 * l'interface en silence (scripts bloqués, erreurs muettes). On laisse donc le
 * navigateur journaliser les violations en développement/staging avant
 * d'appliquer réellement la politique en production. Pour valider en amont :
 * déployer avec NODE_ENV=staging, parcourir l'application, chercher « violation
 * CSP » dans la console — s'il n'y en a aucune, on passe en production.
 */
const CSP_SOURCES = {
  scriptSrc: "'self' https://www.googletagmanager.com",
  styleSrc: "'self' 'unsafe-inline' https://fonts.googleapis.com",
  fontSrc: "'self' data: https://fonts.gstatic.com",
  imgSrc: "'self' data: blob:",
  get connectSrc() {
    return buildConnectSources()
  },
  frameSrc: "'self' https://www.googletagmanager.com",
}

export function buildContentSecurityPolicy(): string {
  return [
    `default-src 'self'`,
    `script-src ${CSP_SOURCES.scriptSrc}`,
    `style-src ${CSP_SOURCES.styleSrc}`,
    `font-src ${CSP_SOURCES.fontSrc}`,
    `img-src ${CSP_SOURCES.imgSrc}`,
    `connect-src ${CSP_SOURCES.connectSrc}`,
    // Le seul iframe que l'application crée est le pixel sanscript de GTM.
    `frame-src ${CSP_SOURCES.frameSrc}`,
    // Aucune ressource embarquée (objets Flash/PDF) : l'app n'en affiche pas.
    `object-src 'none'`,
    // Formulaires : uniquement vers nous-mêmes ou wa.me (assistance).
    `form-action 'self' https://wa.me`,
    `base-uri 'self'`,
    `frame-ancestors 'none'`,
    // Les navigateurs peuvent différer l'application d'une politique ; on la
    // veut immédiate (le mode report-only hors production joue déjà le rôle
    // de période de calibration).
    `enforce`,
    `upgrade-insecure-requests`,
  ].join("; ")
}

/**
 * Origine publique de l'API, si elle est hébergée sur un sous-domaine distinct.
 *
 * Par défaut l'API est servie par la même origine que la page (`/api/v1` via
 * le proxy Vite en dev, la réécriture `vercel.json` ou le serveur Express en
 * prod) — `connect-src 'self'` suffit alors. Mais quand l'éditeur déploie une
 * station dont le front appelle `https://api.washpilot.ci` (variable
 * `VITE_API_BASE_URL`), une CSP trop stricte bloquerait **tous** les appels :
 * panne totale, silencieuse, et invisible côté serveur. On autorise donc
 * l'origine déclarée dans `APP_URL` (l'URL publique connue du déploiement).
 * Les autres origines doivent rester un choix explicite fait ici, pas un
 * wildcard ajouté sous la pression d'un incident.
 */
export function buildConnectSources(): string {
  const appUrl = currentEnv("APP_URL")
  let origin = ""
  try {
    if (appUrl) origin = new URL(appUrl).origin
  } catch {
    // APP_URL mal formé : on s'en tient à 'self' plutôt que d'empoisonner la
    // politique entière. La validation d'APP_URL appartient au démarrage.
  }
  return origin ? `'self' ${origin}` : "'self'"
}

/**
 * HSTS n'a de sens que derrière HTTPS : envoyé sur une connexion HTTP, il est
 * ignoré par le navigateur (et peut verrouiller un accès futur en clair sur le
 * même sous-domaine). On ne l'émet donc que quand la requête est réellement
 * sécurisée — `trust proxy` étant déjà posé sur les deux apps, `req.secure`
 * reflète l'en-tête `X-Forwarded-Proto` du proxy/Vercel.
 *
 * max-age ≈ 1 an, sans `includeSubDomains` : l'éditeur pourrait un jour servir
 * autre chose sur un sous-domaine en HTTP interne (staging, back-office) et se
 * retrouver enfermé. `preload` est volontairement absent — le listing
 * hstspreload.org est irréversible en pratique et suppose que *tous* les
 * sous-domaines sont déjà en HTTPS à demeure.
 */
export function buildStrictTransportSecurity(): string {
  return "max-age=31536000"
}

/** Middleware commun aux deux entrées serveur. */
export function securityHeaders(req: Request, res: Response, next: () => void) {
  res.setHeader("X-Content-Type-Options", "nosniff")
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin")
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
  // Double protection anti-clic-jacking pour les vieux clients qui ignorent
  // `frame-ancestors` ; les navigateurs modernes lisent les deux sans conflit.
  res.setHeader("X-Frame-Options", "DENY")

  const csp = buildContentSecurityPolicy()
  if (currentEnv("NODE_ENV") === "production") {
    res.setHeader("Content-Security-Policy", csp)
  } else {
    res.setHeader("Content-Security-Policy-Report-Only", csp)
  }

  if (req.secure) {
    res.setHeader("Strict-Transport-Security", buildStrictTransportSecurity())
  }

  next()
}
