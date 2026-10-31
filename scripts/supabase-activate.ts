/**
 * Active un projet Supabase : applique les migrations et vérifie que la base
 * est prête à recevoir l'application.
 *
 * Pourquoi une commande dédiée plutôt que `supabase db push` ? Parce que le
 * serveur de la station n'a besoin que de `pg` : la CLI Supabase exige un
 * jeton personnel, un `supabase link` et une session interactive. Ici, une
 * seule variable suffit — celle que l'application utilisera de toute façon —
 * et l'on peut donc vérifier la base **avec la même identité qu'elle**.
 *
 * Ce que la commande fait, dans cet ordre :
 *   1. valide l'URL (refuse un gabarit `<MOT_DE_PASSE>` non rempli) ;
 *   2. se connecte et affiche qui l'on est, sur quelle base, avec TLS ou non ;
 *   3. applique les migrations de `supabase/migrations/`, dans l'ordre, et les
 *      inscrit dans `supabase_migrations.schema_migrations` — la table que lit
 *      la CLI Supabase, pour que `supabase db push` ne les rejoue pas ;
 *   4. vérifie ce dont l'application a besoin au démarrage : les tables
 *      essentielles, le rôle `washpilot_app` et l'appartenance du compte.
 *
 * Les migrations livrées sont idempotentes (`IF NOT EXISTS`, `DROP POLICY IF
 * EXISTS`), donc les rejouer ne casse rien. C'est volontaire : une base où
 * quelqu'un a collé le SQL à la main dans l'éditeur Supabase reste activable
 * par cette commande.
 *
 * Usage :
 *   npm run db:activate -- --check                     # diagnostic, n'écrit rien
 *   npm run db:activate                                # lit DATABASE_URL (.env compris)
 *   npm run db:activate -- "postgresql://…"            # URL passée en argument
 *   npm run db:activate -- --url "postgresql://…" --ca ./prod-ca-2021.crt
 *
 * Variables :
 *   DATABASE_URL      connexion PostgreSQL (pooler en mode session : port 5432)
 *   DATABASE_SSL_CA   AC privée au format PEM, ou chemin d'un fichier .crt
 */
import "dotenv/config"

import { readFileSync, readdirSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import pg from "pg"

import { buildSslConfig, describeConnection, isUnfilledRemoteDatabaseUrl } from "../server/database-target.ts"

const { Client } = pg

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const migrationsDir = path.join(root, "supabase", "migrations")

/** Schéma lu par la CLI Supabase : y inscrire une migration l'empêche d'être rejouée. */
const MIGRATIONS_SCHEMA = "supabase_migrations"
const MIGRATIONS_TABLE = "schema_migrations"

interface Options {
  url: string
  ca: string
  checkOnly: boolean
  dryRun: boolean
  help: boolean
}

function parseArgs(argv: string[]): Options {
  const options: Options = { url: "", ca: "", checkOnly: false, dryRun: false, help: false }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === "--check") options.checkOnly = true
    else if (arg === "--dry-run") options.dryRun = true
    else if (arg === "--help" || arg === "-h") options.help = true
    else if (arg === "--url") options.url = argv[(i += 1)] ?? ""
    else if (arg.startsWith("--url=")) options.url = arg.slice("--url=".length)
    else if (arg === "--ca") options.ca = argv[(i += 1)] ?? ""
    else if (arg.startsWith("--ca=")) options.ca = arg.slice("--ca=".length)
    else if (!arg.startsWith("-") && !options.url) options.url = arg
    else {
      console.error(`Argument inconnu : ${arg}`)
      process.exit(2)
    }
  }
  return options
}

function usage(): void {
  console.log(
    [
      "Active le schéma d'un projet Supabase pour WashPilot CI.",
      "",
      "Usage :",
      "  npm run db:activate -- --check              diagnostic (aucune écriture)",
      "  npm run db:activate                         applique les migrations manquantes",
      "  npm run db:activate -- \"postgresql://…\"     connexion passée en argument",
      "",
      "Options :",
      "  --url <url>   connexion PostgreSQL (sinon DATABASE_URL)",
      "  --ca <pem>    AC privée : contenu PEM ou chemin d'un .crt",
      "  --check       se contente de vérifier, n'écrit rien",
      "  --dry-run     liste les migrations à appliquer sans les exécuter",
      "  --help        affiche ce message",
      "",
      "L'URL d'administration se trouve dans Supabase : Project Settings → Database.",
      "Prenez le pooler en mode SESSION (port 5432), jamais le mode transaction (6543).",
    ].join("\n"),
  )
}

/** Masque le mot de passe avant tout affichage ou journal. */
function maskUrl(url: string): string {
  try {
    const parsed = new URL(url)
    if (parsed.password) parsed.password = "•••"
    return parsed.toString()
  } catch {
    return "(URL illisible)"
  }
}

/** `DATABASE_SSL_CA` accepte un chemin de fichier ou le PEM lui-même. */
function readCa(value: string): string {
  const raw = (value ?? "").trim()
  if (!raw) return ""
  if (raw.includes("BEGIN CERTIFICATE")) return raw.replaceAll("\\n", "\n")
  try {
    return readFileSync(path.resolve(root, raw), "utf8")
  } catch (error) {
    console.error(
      `[ca] Impossible de lire le certificat « ${raw} » : ${error instanceof Error ? error.message : "inconnu"}`,
    )
    process.exit(2)
  }
}

interface Migration {
  version: string
  name: string
  file: string
  sql: string
}

function loadMigrations(): Migration[] {
  return readdirSync(migrationsDir)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => {
      const file = path.join(migrationsDir, name)
      const version = name.slice(0, name.indexOf("_")) || name.replace(/\.sql$/, "")
      return {
        version,
        name: name.replace(/\.sql$/, "").slice(version.length + 1),
        file,
        sql: readFileSync(file, "utf8"),
      }
    })
}

interface Row {
  [key: string]: unknown
}

function text(value: unknown): string {
  return typeof value === "string" ? value : value === null || value === undefined ? "—" : String(value)
}

async function main(): Promise<number> {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) {
    usage()
    return 0
  }

  const url = (options.url || process.env.DATABASE_URL || "").trim()
  if (!url) {
    console.error("Aucune connexion fournie : renseignez DATABASE_URL (fichier .env) ou passez --url.\n")
    usage()
    return 2
  }
  // Le gabarit se reconnaît à son mot de passe. Une base locale en `trust`
  // n'en a pas : le contrôle ne vaut que pour une connexion distante, sinon
  // tout PostgreSQL de développement serait refusé.
  if (isUnfilledRemoteDatabaseUrl(url)) {
    console.error(
      "Refus : l'URL contient encore le gabarit de mot de passe (<MOT_DE_PASSE> / [YOUR-PASSWORD]).\n" +
        "Récupérez le mot de passe dans Supabase → Project Settings → Database → Reset database password.",
    )
    return 2
  }

  const profile = describeConnection(url)
  const migrations = loadMigrations()
  const ca = readCa(options.ca || process.env.DATABASE_SSL_CA || "")

  console.log(`[cible] ${maskUrl(url)}`)
  console.log(`[mode]  ${profile.mode}${profile.sessionStateSurvives ? "" : " (état de session non conservé !)"}`)
  if (profile.warning) console.warn(`[attention] ${profile.warning}`)

  const client = new Client({
    connectionString: url,
    ssl: buildSslConfig(url, ca),
    connectionTimeoutMillis: 15_000,
    application_name: "washpilot-supabase-activate",
  })

  try {
    await client.connect()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`\n[échec] Connexion impossible : ${message}`)
    if (/certificate|self[- ]signed/i.test(message)) {
      console.error(
        "Le certificat du serveur n'est pas reconnu. Téléchargez l'AC du projet\n" +
          "(Supabase → Settings → Database → SSL Configuration) puis relancez avec --ca <fichier.crt>.",
      )
    } else if (/ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ETIMEDOUT/i.test(message)) {
      console.error(
        "Le réseau n'atteint pas ce serveur. Vérifiez l'hôte, le port (5432 pour le pooler en mode session)\n" +
          "et, si vous êtes dans un environnement filtré, exécutez la commande depuis un poste ou une CI qui a accès à Internet.",
      )
    } else if (/password|authentification|authentication/i.test(message)) {
      console.error("Le mot de passe est refusé. Réinitialisez-le dans Supabase puis mettez l'URL à jour.")
    }
    return 1
  }

  try {
    const who = await client.query<Row>(
      `SELECT current_user AS utilisateur,
              current_database() AS base,
              inet_server_addr()::text AS adresse,
              current_setting('server_version') AS version`,
    )
    const info = who.rows[0] ?? {}
    console.log(
      `[base]  ${text(info.base)} sur ${text(info.adresse)} — PostgreSQL ${text(info.version)}, ` +
        `connecté en « ${text(info.utilisateur)} »`,
    )

    const existing = await client.query<Row>(
      `SELECT to_regclass($1)::text AS table_migrations,
              to_regclass('public.organizations')::text AS organizations,
              to_regclass('public.auth_sessions')::text AS auth_sessions`,
      [`${MIGRATIONS_SCHEMA}.${MIGRATIONS_TABLE}`],
    )
    const state = existing.rows[0] ?? {}
    const alreadyApplied = new Set<string>()
    if (state.table_migrations) {
      const applied = await client.query<Row>(`SELECT version FROM ${MIGRATIONS_SCHEMA}.${MIGRATIONS_TABLE}`)
      for (const row of applied.rows) alreadyApplied.add(text(row.version))
    }

    const pending = migrations.filter((migration) => !alreadyApplied.has(migration.version))
    console.log(
      `[schéma] ${alreadyApplied.size} migration(s) déjà inscrite(s), ${pending.length} à appliquer, ` +
        `${migrations.length} livrée(s) dans le dépôt`,
    )
    if (state.organizations) console.log("[schéma] des tables d'application existent déjà (organizations trouvée)")

    if (options.checkOnly) {
      for (const migration of pending) console.log(`  · manquante : ${migration.name} (${migration.version})`)
      return await report(client, pending.length === 0)
    }

    if (pending.length === 0) {
      console.log("[migrations] rien à appliquer : la base est à jour.")
      return await report(client, true)
    }

    if (options.dryRun) {
      for (const migration of pending) console.log(`  · à appliquer : ${migration.name} (${migration.version})`)
      console.log("[migrations] --dry-run : aucune écriture effectuée.")
      return await report(client, false)
    }

    // La table d'historique est créée avant les migrations : la CLI Supabase la
    // reconnaît, donc un `supabase db push` ultérieur ne rejouera pas ce qui a
    // déjà été appliqué ici.
    await client.query(`CREATE SCHEMA IF NOT EXISTS ${MIGRATIONS_SCHEMA}`)
    await client.query(
      `CREATE TABLE IF NOT EXISTS ${MIGRATIONS_SCHEMA}.${MIGRATIONS_TABLE} (
         version text PRIMARY KEY,
         name text,
         statements text[],
         created_by text,
         applied_at timestamptz NOT NULL DEFAULT now()
       )`,
    )

    for (const migration of pending) {
      console.log(`[migrations] application de ${migration.name} (${migration.version})…`)
      try {
        await client.query("BEGIN")
        await client.query(migration.sql)
        await client.query(
          `INSERT INTO ${MIGRATIONS_SCHEMA}.${MIGRATIONS_TABLE}(version, name, created_by)
           VALUES ($1, $2, $3)
           ON CONFLICT (version) DO NOTHING`,
          [migration.version, migration.name, "scripts/supabase-activate.ts"],
        )
        await client.query("COMMIT")
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined)
        console.error(
          `\n[échec] ${migration.name} : ${error instanceof Error ? error.message : String(error)}\n` +
            "La migration a été annulée (transaction). La base reste dans son état précédent.",
        )
        return 1
      }
    }

    return await report(client, true)
  } finally {
    await client.end().catch(() => undefined)
  }
}

/**
 * Vérifie ce que le serveur exigera au démarrage, puis résume la situation.
 *
 * Un écart ici n'est pas cosmétique : sans `organizations` et `auth_sessions`
 * l'API refuse de démarrer ; sans appartenance au rôle `washpilot_app`, chaque
 * requête d'une station échoue en « permission denied to set role ».
 */
async function report(client: pg.Client, migrationsSettled: boolean): Promise<number> {
  const q = await client.query<Row>(
    `SELECT
       (SELECT count(*)::int FROM pg_tables WHERE schemaname = 'public') AS tables,
       (SELECT count(*)::int FROM pg_policies WHERE schemaname = 'public') AS policies,
       (SELECT to_regclass('public.organizations')::text) AS organizations,
       (SELECT to_regclass('public.auth_sessions')::text) AS auth_sessions,
       (SELECT rolname FROM pg_roles WHERE rolname = 'washpilot_app') AS rls_role,
       COALESCE(
         (SELECT pg_has_role(current_user, 'washpilot_app', 'MEMBER')
            FROM pg_roles WHERE rolname = 'washpilot_app'),
         false
       ) AS rls_member,
       current_user AS utilisateur`,
  )
  const row = q.rows[0] ?? {}
  const hasTables = Boolean(row.organizations) && Boolean(row.auth_sessions)
  const hasRole = Boolean(row.rls_role)
  const isMember = Boolean(row.rls_member)
  const ready = migrationsSettled && hasTables && hasRole && isMember

  console.log("")
  console.log(`  tables publiques ......... ${text(row.tables)}`)
  console.log(`  politiques RLS ........... ${text(row.policies)}`)
  console.log(`  organizations ............ ${hasTables ? "oui" : "NON"}`)
  console.log(`  auth_sessions ............ ${Boolean(row.auth_sessions) ? "oui" : "NON"}`)
  console.log(`  rôle washpilot_app ....... ${hasRole ? "oui" : "NON"}`)
  console.log(`  appartenance du compte ... ${isMember ? "oui" : "NON"}`)
  console.log("")

  if (!hasRole) {
    console.error(
      "Le rôle washpilot_app est absent : les politiques RLS existent mais le propriétaire des tables\n" +
        "y échappe, et l'isolation multi-station n'est pas assurée. Créez-le (CREATE ROLE washpilot_app NOLOGIN;)\n" +
        "ou appliquez la migration initiale.",
    )
  } else if (!isMember) {
    console.error(
      `Le compte « ${text(row.utilisateur)} » n'est pas membre du rôle washpilot_app :\n` +
        `  GRANT washpilot_app TO ${text(row.utilisateur)};\n` +
        "Sans cette appartenance, le démarrage signalera une isolation dégradée.",
    )
  }

  if (ready) {
    console.log("[prêt] La base est activée : démarrez l'API avec cette même DATABASE_URL.")
    console.log("       Sur une base réelle, pensez à SEED_DEMO_DATA=false et à APP_URL / CORS_ORIGINS.")
    return 0
  }
  console.log("[incomplet] La base n'est pas encore prête pour l'application.")
  return 1
}

main()
  .then((code) => {
    process.exitCode = code
  })
  .catch((error) => {
    console.error("[échec]", error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
