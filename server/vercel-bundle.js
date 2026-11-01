var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res, err) => function __init() {
  if (err) throw err[0];
  try {
    return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
  } catch (e) {
    throw err = [e], e;
  }
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// server/pglite-location.ts
function resolvePgliteLocation(input) {
  const requested = (input.dataDir ?? "").trim();
  if (input.nodeEnv === "test") {
    return {
      mode: "memory",
      dataDir: null,
      ephemeral: true,
      reason: "Mode test : base en m\xE9moire pour isoler les fichiers de tests les uns des autres."
    };
  }
  if (requested === MEMORY_SENTINEL) {
    return {
      mode: "memory",
      dataDir: null,
      ephemeral: true,
      reason: `Base en m\xE9moire demand\xE9e explicitement (PGLITE_DATA_DIR=${MEMORY_SENTINEL}). Les donn\xE9es seront perdues \xE0 l'arr\xEAt.`
    };
  }
  const dataDir = requested === "" ? DEFAULT_DATA_DIR : requested;
  return {
    mode: "disk",
    dataDir,
    ephemeral: false,
    reason: `Base persist\xE9e dans \xAB ${dataDir} \xBB. Les donn\xE9es survivent au red\xE9marrage.`
  };
}
function describePgliteLocation(location, nodeEnv) {
  if (location.mode === "disk") return `[db] ${location.reason}`;
  if (nodeEnv === "test") return `[db] ${location.reason}`;
  return `[db] ATTENTION \u2014 ${location.reason}`;
}
var MEMORY_SENTINEL, DEFAULT_DATA_DIR;
var init_pglite_location = __esm({
  "server/pglite-location.ts"() {
    MEMORY_SENTINEL = ":memory:";
    DEFAULT_DATA_DIR = ".data/pglite";
  }
});

// server/database-target.ts
function chooseDatabaseTarget(input) {
  const url = (input.databaseUrl ?? "").trim();
  if (input.nodeEnv === "test") {
    return { target: "embedded", ignoredDatabaseUrl: url !== "" };
  }
  return { target: url === "" ? "embedded" : "external", ignoredDatabaseUrl: false };
}
function hasUnfilledDatabaseUrl(databaseUrl) {
  const url = (databaseUrl ?? "").trim();
  if (url === "") return false;
  const password = /:\/\/[^/@]*:([^@]*)@/.exec(url)?.[1] ?? "";
  if (password === "") return true;
  let decoded = password;
  try {
    decoded = decodeURIComponent(password);
  } catch {
  }
  return /^[<[({]*\s*(mot[\s_-]?de[\s_-]?passe|your[\s_-]?password|password|changeme)\s*[>\])}]*$/i.test(
    decoded
  );
}
function isUnfilledRemoteDatabaseUrl(databaseUrl) {
  const url = (databaseUrl ?? "").trim();
  if (url === "") return false;
  if (describeConnection(url).mode === "local") return false;
  return hasUnfilledDatabaseUrl(url);
}
function parseHostPort(databaseUrl) {
  try {
    const parsed2 = new URL(databaseUrl);
    const port = parsed2.port ? Number(parsed2.port) : null;
    return { host: parsed2.hostname.toLowerCase(), port: Number.isFinite(port) ? port : null };
  } catch {
    return { host: "", port: null };
  }
}
function describeConnection(databaseUrl) {
  const { host, port } = parseHostPort(databaseUrl);
  if (!host || host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]") {
    return { mode: "local", sessionStateSurvives: true, warning: null };
  }
  const isSupabasePooler = host === "pooler.supabase.com" || host.endsWith(".pooler.supabase.com");
  if (isSupabasePooler) {
    if (port === 6543) {
      return {
        mode: "transaction-pooler",
        sessionStateSurvives: false,
        warning: "DATABASE_URL vise le pooler Supabase en mode TRANSACTION (port 6543). L'\xE9tat de session (SET ROLE, app.current_org) n'y survit pas : l'isolation multi-station devient al\xE9atoire. Utilisez le pooler en mode session (port 5432) ou la connexion directe."
      };
    }
    return { mode: "session-pooler", sessionStateSurvives: true, warning: null };
  }
  if (port === 6543) {
    return {
      mode: "transaction-pooler",
      sessionStateSurvives: false,
      warning: "DATABASE_URL utilise le port 6543, convention des poolers en mode transaction. L'\xE9tat de session (SET ROLE, app.current_org) n'y survit pas."
    };
  }
  return { mode: "direct", sessionStateSurvives: true, warning: null };
}
function buildSslConfig(databaseUrl, caCertificate) {
  const { host } = parseHostPort(databaseUrl);
  if (!host || host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]") {
    return false;
  }
  const ca = (caCertificate ?? "").trim();
  return ca ? { rejectUnauthorized: true, ca } : { rejectUnauthorized: true };
}
var init_database_target = __esm({
  "server/database-target.ts"() {
  }
});

// server/tenant-context.ts
import { AsyncLocalStorage } from "node:async_hooks";
function runWithTenant(scope, fn) {
  return storage.run(scope, fn);
}
function runWithoutTenant(fn) {
  return storage.exit(fn);
}
function currentTenantScope() {
  return storage.getStore() ?? null;
}
var storage;
var init_tenant_context = __esm({
  "server/tenant-context.ts"() {
    storage = new AsyncLocalStorage();
  }
});

// server/db-rls.ts
function setRlsRoleAvailable(available) {
  roleAvailable = available;
}
function isRlsRoleAvailable() {
  return roleAvailable;
}
async function probeRlsRole(queryable) {
  try {
    const q = await queryable.query(
      `SELECT
         (SELECT rolname FROM pg_roles WHERE rolname = '${RLS_ROLE}') IS NOT NULL AS role_exists,
         COALESCE(
           (SELECT pg_has_role(current_user, '${RLS_ROLE}', 'MEMBER')
              FROM pg_roles WHERE rolname = '${RLS_ROLE}'),
           false
         ) AS is_member,
         current_user AS app_user`
    );
    const row = q.rows[0] ?? {};
    const roleExists = Boolean(row.role_exists);
    const isMember = Boolean(row.is_member);
    const appUser = typeof row.app_user === "string" ? row.app_user : "l'utilisateur de l'application";
    setRlsRoleAvailable(roleExists && isMember);
    if (roleExists && isMember) {
      console.info("[rls] Isolation multi-station active (r\xF4le washpilot_app, politiques org_isolation).");
    } else if (roleExists) {
      console.warn(
        `[rls] Le r\xF4le washpilot_app existe mais le compte \xAB ${appUser} \xBB n'en est pas membre : SET ROLE serait refus\xE9.
[rls] Ex\xE9cutez \xAB GRANT washpilot_app TO ${appUser}; \xBB puis red\xE9marrez. Jusque-l\xE0, l'application tourne sans le r\xF4le applicatif : les politiques prot\xE8gent les comptes non propri\xE9taires, mais pas le propri\xE9taire des tables.`
      );
    } else {
      console.warn(
        "[rls] R\xF4le washpilot_app indisponible : les politiques existent mais le propri\xE9taire des tables y \xE9chappe. Connectez l'application avec un compte autoris\xE9 \xE0 cr\xE9er des r\xF4les, ou cr\xE9ez washpilot_app \xE0 la main."
      );
    }
  } catch (error) {
    setRlsRoleAvailable(false);
    console.warn(
      "[rls] V\xE9rification du r\xF4le applicatif impossible:",
      error instanceof Error ? error.message : error
    );
  }
}
function tenantSetupStatements(organizationId) {
  const statements = [];
  if (roleAvailable) statements.push({ text: `SET ROLE ${RLS_ROLE}` });
  statements.push({
    text: `SELECT set_config('${ORG_SETTING}', $1, false)`,
    values: [organizationId]
  });
  return statements;
}
function tenantTeardownStatements() {
  const statements = [{ text: `RESET ${ORG_SETTING}` }];
  if (roleAvailable) statements.push({ text: "RESET ROLE" });
  return statements;
}
function bindRlsGuard(raw) {
  async function setup(client, organizationId) {
    for (const statement of tenantSetupStatements(organizationId)) {
      await client.query(statement.text, statement.values);
    }
  }
  async function teardown(client) {
    for (const statement of tenantTeardownStatements()) {
      await client.query(statement.text);
    }
  }
  function isRoleSetupError(error) {
    const message = error instanceof Error ? error.message : String(error);
    return /permission denied to set role|must be member|must be superuser|role .* does not exist|not a member/i.test(message);
  }
  function disableRoleWithWarning(error) {
    setRlsRoleAvailable(false);
    if (!fallbackWarned) {
      fallbackWarned = true;
      console.error(
        "[rls] SET ROLE washpilot_app refus\xE9 \xE0 l'ex\xE9cution : repli sans le r\xF4le applicatif (isolation limit\xE9e aux comptes non propri\xE9taires). V\xE9rifiez \xAB GRANT washpilot_app TO <compte>; \xBB :",
        error instanceof Error ? error.message : error
      );
    }
  }
  async function applySetup(client, organizationId) {
    try {
      await setup(client, organizationId);
    } catch (error) {
      if (!isRoleSetupError(error)) throw error;
      try {
        await teardown(client);
      } catch {
      }
      disableRoleWithWarning(error);
    }
  }
  return {
    async query(sqlOrConfig, params) {
      const scope = currentTenantScope();
      if (!scope) return raw.query(sqlOrConfig, params);
      const client = await raw.connect();
      try {
        await applySetup(client, scope.organizationId);
        return await client.query(sqlOrConfig, params);
      } finally {
        try {
          await teardown(client);
        } finally {
          client.release();
        }
      }
    },
    async connect() {
      const scope = currentTenantScope();
      const client = await raw.connect();
      if (!scope) return client;
      try {
        await applySetup(client, scope.organizationId);
      } catch (error) {
        client.release();
        throw error;
      }
      let released = false;
      const guarded = {
        query: (sqlOrConfig, params) => client.query(sqlOrConfig, params),
        release() {
          if (released) return;
          released = true;
          void (async () => {
            try {
              await teardown(client);
            } catch (error) {
              console.warn(
                "[rls] Nettoyage de connexion \xE9chou\xE9:",
                error instanceof Error ? error.message : error
              );
            } finally {
              client.release();
            }
          })();
        }
      };
      return guarded;
    },
    async end() {
      await raw.end();
    }
  };
}
var RLS_ROLE, ORG_SETTING, roleAvailable, fallbackWarned;
var init_db_rls = __esm({
  "server/db-rls.ts"() {
    init_tenant_context();
    RLS_ROLE = "washpilot_app";
    ORG_SETTING = "app.current_org";
    roleAvailable = false;
    fallbackWarned = false;
  }
});

// server/env.ts
var env_exports = {};
__export(env_exports, {
  env: () => env
});
import { z } from "zod";
var schema, parsed, env;
var init_env = __esm({
  "server/env.ts"() {
    schema = z.object({
      NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
      PORT: z.coerce.number().int().min(1).max(65535).default(3e3),
      DATABASE_URL: z.string().trim().optional().default(""),
      /**
       * Autorité de certification à faire confiance pour la connexion externe.
       * Chemin d'un fichier (`.crt`) ou contenu PEM, `\n` littéraux acceptés.
       *
       * Nécessaire quand l'hébergeur signe ses connexions avec sa propre AC —
       * Supabase, par exemple, avec `prod-ca-2021.crt`. Sans elle, `pg` refuse le
       * certificat (« self-signed certificate in certificate chain ») et le
       * serveur bascule sur la base embarquée. Vide : seules les autorités
       * publiques sont acceptées (Supabase et autres services PostgreSQL managés).
       */
      DATABASE_SSL_CA: z.string().trim().optional().default(""),
      PG_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
      /**
       * Dossier de la base PostgreSQL embarquée (PGlite), utilisée quand
       * `DATABASE_URL` est vide ou injoignable.
       *
       * Vide (défaut) : les données sont écrites dans `.data/pglite` et
       * survivent au redémarrage. La valeur `:memory:` demande explicitement une
       * base volatile, par exemple pour une démonstration jetable. En
       * `NODE_ENV=test`, la base est toujours en mémoire quelle que soit cette
       * variable, pour que deux fichiers de tests ne se contaminent pas.
       */
      PGLITE_DATA_DIR: z.string().trim().optional().default(""),
      CORS_ORIGINS: z.string().optional().default("http://localhost:5173"),
      /** URL publique de l'application, utilisée pour construire les liens e-mail. */
      APP_URL: z.string().trim().optional().default(""),
      /** Durée de validité d'un lien de réinitialisation de mot de passe. */
      PASSWORD_RESET_TTL_MINUTES: z.coerce.number().int().min(5).max(1440).default(60),
      /**
       * Durée de l'essai gratuit offert à l'inscription, en jours.
       *
       * 14 par défaut. Le plancher à 1 interdit l'essai de zéro jour, qui
       * afficherait « essayez gratuitement » à un visiteur déjà expiré. Le
       * plafond à 90 interdit l'essai perpétuel : un produit qu'on n'achète
       * jamais n'est pas un produit. La vitrine annonce cette même valeur,
       * qu'elle lit sur l'API — elle n'est donc jamais démentie par la réalité.
       */
      TRIAL_DAYS: z.coerce.number().int().min(1).max(90).default(14),
      /**
       * Jours de tolérance après l'échéance d'un forfait **payant** avant de passer
       * l'espace en lecture seule.
       *
       * Le rail mobile money ne prélève pas tout seul : entre la relance J-7 et
       * l'arrivée effective de l'argent, il faut une marge. Zéro n'est pas
       * autorisé — couper un client le jour même de son échéance, sans préavis,
       * est le meilleur moyen de le perdre ; 30 est le plafond, au-delà la
       * tolérance devient un forfait gratuit de fait.
       */
      PLAN_GRACE_DAYS: z.coerce.number().int().min(1).max(30).default(7),
      /** Transport e-mail (Resend). Sans clé, les liens sont journalisés côté serveur. */
      RESEND_API_KEY: z.string().trim().optional().default(""),
      MAIL_FROM: z.string().trim().optional().default("WashPilot CI <onboarding@resend.dev>"),
      /** Numéro WhatsApp de l'assistance, au format international (ex. +2250700000000). */
      // --- Encaissement des abonnements ---------------------------------------
      // `manual` : aucun contrat marchand, l'editeur valide depuis le back-office.
      // Un code d'agregateur (ex. `cinetpay`) bascule l'activation en automatique.
      PAYMENT_PROVIDER: z.string().trim().toLowerCase().default("manual"),
      // Numero marchand mobile money affiche au client en mode manuel.
      PAYMENT_MERCHANT_NUMBER: z.string().trim().optional().default(""),
      PAYMENT_MERCHANT_NAME: z.string().trim().optional().default(""),
      SUPPORT_WHATSAPP: z.string().trim().optional().default(""),
      /** Adresse e-mail de l'assistance, affichée en second recours. */
      SUPPORT_EMAIL: z.string().trim().optional().default("support@washpilot.ci"),
      /** Relances automatiques d'échéance d'abonnement (désactivables en test). */
      REMINDERS_ENABLED: z.enum(["true", "false"]).optional().default("true").transform((value) => value === "true"),
      /** Intervalle entre deux passages du planificateur de relances, en minutes. */
      REMINDERS_INTERVAL_MINUTES: z.coerce.number().int().min(5).max(1440).default(60),
      /** Fréquence d'évaluation des alertes de supervision (seuils réglés en Console). */
      MONITORING_ALERT_INTERVAL_MINUTES: z.coerce.number().int().min(1).max(60).default(5),
      /** WhatsApp Cloud API : les alertes proactives exigent un modèle approuvé. */
      WHATSAPP_ACCESS_TOKEN: z.string().trim().optional().default(""),
      WHATSAPP_PHONE_NUMBER_ID: z.string().trim().optional().default(""),
      WHATSAPP_API_VERSION: z.string().trim().regex(/^v\d+\.\d+$/).default("v22.0"),
      WHATSAPP_ALERT_TEMPLATE: z.string().trim().optional().default(""),
      WHATSAPP_ALERT_TEMPLATE_LANGUAGE: z.string().trim().optional().default("fr"),
      /** Relevé d'agrégateur lu périodiquement, sans activer les paiements en ligne. */
      RECONCILIATION_ENABLED: z.enum(["true", "false"]).optional().default("false").transform((value) => value === "true"),
      RECONCILIATION_PROVIDER: z.string().trim().toLowerCase().optional().default(""),
      RECONCILIATION_STATEMENT_URL: z.string().trim().optional().default(""),
      RECONCILIATION_STATEMENT_TOKEN: z.string().trim().optional().default(""),
      RECONCILIATION_LOOKBACK_HOURS: z.coerce.number().int().min(1).max(24 * 31).default(24),
      /**
       * Adresses d'amorçage des administrateurs de plateforme, séparées par des
       * virgules. Elles créent/réactivent les comptes `bootstrap` au démarrage.
       * Les comptes gérés depuis la Console (`managed_by = 'console'`) sont
       * volontairement ignorés : leur cycle de vie ne dépend plus de cette liste.
       * Aucun compte de station ne peut obtenir ce droit par ses propres routes.
       */
      PLATFORM_ADMIN_EMAILS: z.string().trim().optional().default(""),
      /**
       * Mot de passe initial des comptes de la console.
       *
       * N'est lu qu'à la création d'un opérateur : changer cette variable ne
       * réécrit jamais un mot de passe existant. Si elle est vide, un secret
       * aléatoire est tiré et affiché une seule fois dans les journaux de
       * démarrage.
       */
      PLATFORM_ADMIN_PASSWORD: z.string().optional().default(""),
      /**
       * Jeu de démonstration (station « Cocody Riviera », comptes @washpilot.ci).
       *
       * Actif par défaut en développement et en test, où il donne des données
       * lisibles immédiatement. Jamais en production. `false` sur une base réelle :
       * sans cela, effacer les comptes serait inutile — le démarrage suivant les
       * recréerait, avec leur mot de passe public.
       */
      SEED_DEMO_DATA: z.string().trim().optional().default(""),
      /**
       * Secret du déclencheur de relances (`POST /api/v1/cron/reminders`).
       *
       * Sur un hébergement serverless, aucun processus ne vit assez longtemps pour
       * porter une horloge : les relances d'échéance sont déclenchées par le cron
       * de la plateforme. Sans ce secret, la route n'existe pas — un déclencheur
       * ouvert permettrait d'envoyer des e-mails aux clients à volonté.
       */
      CRON_SECRET: z.string().trim().optional().default("")
    });
    parsed = schema.safeParse(process.env);
    if (!parsed.success) {
      throw new Error("Invalid environment configuration: " + parsed.error.issues.map((i) => i.path.join(".")).join(", "));
    }
    env = {
      ...parsed.data,
      CORS_ORIGINS: parsed.data.CORS_ORIGINS.split(",").map((v) => v.trim()).filter(Boolean),
      PLATFORM_ADMIN_EMAILS: parsed.data.PLATFORM_ADMIN_EMAILS.split(",").map((v) => v.trim().toLowerCase()).filter(Boolean)
    };
  }
});

// server/permissions.ts
function isRole(value) {
  return typeof value === "string" && ROLES.includes(value);
}
function isPermission(value) {
  return typeof value === "string" && PERMISSIONS.includes(value);
}
function rolePermissions(role) {
  return isRole(role) ? ROLE_PERMISSIONS[role] : [];
}
function effectivePermissions(role, overrides = []) {
  const effective = new Set(rolePermissions(role));
  if (role === "owner") return effective;
  for (const override of overrides) {
    if (!isPermission(override.permission)) continue;
    if (override.granted) {
      if (OWNER_ONLY_PERMISSIONS.includes(override.permission)) continue;
      effective.add(override.permission);
    } else {
      effective.delete(override.permission);
    }
  }
  return effective;
}
function deniedMessage(permission) {
  const label = PERMISSION_LABELS[permission] ?? permission;
  return `Action non autoris\xE9e pour votre r\xF4le : ${label.toLowerCase()}. Demandez l\u2019acc\xE8s au propri\xE9taire de la station.`;
}
var PERMISSIONS, ROLES, ROLE_LABELS, ROLE_DESCRIPTIONS, ROLE_PERMISSIONS, OWNER_ONLY_PERMISSIONS, GRANTABLE_PERMISSIONS, PERMISSION_LABELS;
var init_permissions = __esm({
  "server/permissions.ts"() {
    PERMISSIONS = [
      // Consultation générale
      "dashboard:read",
      // Lavages
      "wash:create",
      "wash:read",
      "wash:update",
      "wash:status",
      "wash:cancel",
      // Encaissements
      "payment:create",
      "payment:read",
      "payment:verify",
      "payment:cancel",
      // Caisse
      "cash_session:read",
      "cash_session:manage",
      // Catalogue (prestations, catégories, tarifs)
      "service:read",
      "service:manage",
      // Laveurs
      "worker:read",
      "worker:create",
      "worker:update",
      "worker:delete",
      // Dépenses
      "expense:read",
      "expense:create",
      "expense:manage",
      // Stock (produits, mouvements)
      "stock:read",
      "stock:manage",
      "stock:move",
      // Fournisseurs et achats
      "supplier:manage",
      "purchase:manage",
      // Présences et rendement des laveurs
      "attendance:read",
      "attendance:manage",
      "attendance:correct",
      // Rapports
      "report:operational",
      "report:financial",
      "report:export",
      // Traçabilité
      "audit:read",
      // Administration
      "user:manage",
      "settings:manage",
      "subscription:manage",
      "data:export"
    ];
    ROLES = ["owner", "manager", "cashier", "washer"];
    ROLE_LABELS = {
      owner: "Propri\xE9taire",
      manager: "G\xE9rant",
      cashier: "Caissier",
      washer: "Agent de lavage"
    };
    ROLE_DESCRIPTIONS = {
      owner: "Acc\xE8s complet : param\xE8tres, tarifs, finances, utilisateurs et abonnement.",
      manager: "Gestion op\xE9rationnelle : lavages, encaissements, caisse, laveurs, d\xE9penses et marges. Ne modifie ni les tarifs, ni les d\xE9penses enregistr\xE9es, ni les utilisateurs.",
      cashier: "Tenue de la caisse : lavages, encaissements et d\xE9penses courantes.",
      washer: "Acc\xE8s limit\xE9 : consultation des lavages et des prestations."
    };
    ROLE_PERMISSIONS = {
      // Le propriétaire détient toutes les permissions, par définition.
      owner: PERMISSIONS,
      manager: [
        "dashboard:read",
        "wash:create",
        "wash:read",
        "wash:update",
        // Avancement operationnel : le lavage passe de « en attente » a « en
        // cours », puis a « termine ». C'est la personne qui tient le poste qui
        // fait avancer la voiture, pas le gerant qui repond des comptes.
        "wash:status",
        "payment:create",
        "payment:read",
        "payment:verify",
        "cash_session:read",
        "cash_session:manage",
        "service:read",
        "worker:read",
        "worker:create",
        "worker:update",
        "report:operational",
        "audit:read",
        // Dépenses : voir et enregistrer, jamais corriger.
        //
        // Une dépense en espèces insère un mouvement de sortie dans la session de
        // caisse ouverte. Comme le caissier ouvre et clôture lui-même cette
        // session, il était jusqu'ici seul à justifier un tiroir dans lequel il
        // puisait : la sortie se déduisait du montant attendu, l'écart à la
        // clôture restait nul, et aucun échelon intermédiaire ne la voyait.
        //
        // `expense:create` est accordé pour une raison moins évidente que
        // `expense:read` : sans elle, un gérant qui achète des consommables fait
        // enregistrer la dépense par son caissier, qui en devient l'auteur
        // apparent. Refuser la permission fabriquait un journal d'audit faux.
        //
        // `expense:manage` (modifier, supprimer) reste au propriétaire : on
        // délègue l'enregistrement, jamais la réécriture.
        "expense:read",
        "expense:create",
        // Stock : voir, gérer et mouvementer.
        //
        // Même raisonnement que pour les dépenses. En station, c'est le gérant qui
        // réceptionne les bidons et qui compte les étagères. Sans `stock:move` il
        // ferait saisir le mouvement par son caissier, qui en deviendrait l'auteur
        // apparent dans `audit_logs` : refuser la permission fabriquerait un
        // journal faux.
        //
        // La frontière « on délègue l'enregistrement, jamais la réécriture » n'est
        // pas portée ici par une permission mais par le modèle : un mouvement ne
        // se modifie ni ne se supprime, il se contrepasse.
        "stock:read",
        "stock:manage",
        "stock:move",
        // Fournisseurs et achats.
        //
        // C'est le gérant qui va au marché et qui revient avec les sachets. Lui
        // refuser l'achat obligerait le propriétaire à ressaisir après coup ce
        // qu'il n'a pas vu arriver, ou le gérant à emprunter le compte d'un
        // autre : les deux fabriquent un journal faux.
        "supplier:manage",
        "purchase:manage",
        // Présences.
        //
        // Le gérant pointe et déclare les absences : il est sur place, c'est lui
        // qui voit qui arrive. La **correction** d'un pointage déjà saisi reste
        // au propriétaire : réécrire une heure d'arrivée après coup touche à ce
        // qui servira peut-être à juger quelqu'un. Elle reste délégable au cas
        // par cas, comme l'annulation d'un lavage.
        "attendance:read",
        "attendance:manage",
        // Le détail des dépenses sans leur total rendrait l'écran de rapports
        // incohérent — retenir l'agrégat quand on donne la ligne ne protège rien.
        "report:financial"
      ],
      cashier: [
        "dashboard:read",
        "wash:create",
        "wash:read",
        // Le caissier enregistre le lavage et suit la voiture : c'est lui qui
        // fait passer l'operation de « en attente » a « en cours », puis a
        // « terminate ». Lui refuser ce geste obligerait le gerant a quitter le
        // comptoir pour une operation de terrain.
        "wash:status",
        "payment:create",
        "payment:read",
        "cash_session:read",
        "cash_session:manage",
        "service:read",
        "worker:read",
        "expense:read",
        "expense:create",
        "report:operational"
      ],
      washer: ["wash:read", "service:read"]
    };
    OWNER_ONLY_PERMISSIONS = [
      "user:manage",
      "settings:manage",
      "subscription:manage",
      "payment:cancel"
    ];
    GRANTABLE_PERMISSIONS = PERMISSIONS.filter(
      (permission) => !OWNER_ONLY_PERMISSIONS.includes(permission)
    );
    PERMISSION_LABELS = {
      "dashboard:read": "Consulter le tableau de bord",
      "wash:create": "Enregistrer un lavage",
      "wash:read": "Consulter les lavages",
      "wash:update": "Modifier un lavage",
      "wash:status": "Faire avancer l'avancement d'un lavage",
      "wash:cancel": "Annuler un lavage",
      "payment:create": "Enregistrer un encaissement",
      "payment:read": "Consulter les encaissements",
      "payment:verify": "Confirmer un encaissement mobile money",
      "payment:cancel": "Rembourser un encaissement",
      "cash_session:read": "Consulter la caisse",
      "cash_session:manage": "Ouvrir et cl\xF4turer la caisse",
      "service:read": "Consulter les prestations et les tarifs",
      "service:manage": "Modifier les prestations et les tarifs",
      "worker:read": "Consulter les laveurs",
      "worker:create": "Ajouter un laveur",
      "worker:update": "Modifier un laveur",
      "worker:delete": "Supprimer un laveur",
      "expense:read": "Consulter les d\xE9penses",
      "expense:create": "Enregistrer une d\xE9pense",
      "expense:manage": "Modifier ou supprimer une d\xE9pense",
      "stock:read": "Consulter le stock et les mouvements",
      "stock:manage": "Cr\xE9er et modifier les produits du stock",
      "stock:move": "Enregistrer un mouvement de stock",
      "supplier:manage": "G\xE9rer les fournisseurs",
      "purchase:manage": "Enregistrer un achat",
      "attendance:read": "Consulter les pr\xE9sences et le rendement",
      "attendance:manage": "Pointer et d\xE9clarer une absence",
      "attendance:correct": "Corriger un pointage, valider une absence",
      "report:operational": "Consulter les rapports d\u2019activit\xE9",
      "report:financial": "Consulter les rapports financiers (marges, d\xE9penses)",
      "report:export": "Exporter les rapports",
      "audit:read": "Consulter l\u2019historique des op\xE9rations",
      "user:manage": "G\xE9rer les utilisateurs et leurs droits",
      "settings:manage": "Modifier les param\xE8tres de la station",
      "subscription:manage": "G\xE9rer l\u2019abonnement",
      "data:export": "Exporter les donn\xE9es de la station"
    };
  }
});

// server/validation-messages.ts
import { z as z2 } from "zod";
function configureFrenchValidation() {
  z2.config(localeFr);
}
function lastKey(path) {
  for (let i = path.length - 1; i >= 0; i -= 1) {
    const segment = path[i];
    if (typeof segment === "string") return segment;
  }
  return null;
}
function lineNumber(path) {
  for (let i = path.length - 1; i >= 0; i -= 1) {
    const segment = path[i];
    if (typeof segment === "number") return segment + 1;
  }
  return null;
}
function humanise(key) {
  const nettoye = key.replace(/_(id|cents|milli|minutes|at|url)$/u, "").replace(/_/gu, " ").trim();
  if (!nettoye) return "ce champ";
  return `\xAB ${nettoye} \xBB`;
}
function fieldLabel(path) {
  const key = lastKey(path);
  if (!key) return null;
  return FIELD_LABELS[key] ?? humanise(key);
}
function valueAtPath(input, path) {
  let courant = input;
  for (const segment of path) {
    if (courant === null || courant === void 0) return void 0;
    if (typeof courant !== "object") return void 0;
    courant = courant[segment];
  }
  return courant;
}
function isMissing(input, path) {
  return valueAtPath(input, path) === void 0;
}
function capitalise(phrase) {
  if (!phrase) return phrase;
  return phrase.charAt(0).toUpperCase() + phrase.slice(1);
}
function decapitalise(phrase) {
  if (!phrase) return phrase;
  if (phrase.length > 1 && phrase[1] === phrase[1].toUpperCase() && new RegExp("\\p{L}", "u").test(phrase[1])) return phrase;
  return phrase.charAt(0).toLowerCase() + phrase.slice(1);
}
function groupDigits(valeur) {
  return new Intl.NumberFormat("fr-FR").format(valeur).replace(/\u202f|\u00a0/gu, " ");
}
function readableBound(key, valeur) {
  if (key && key.endsWith("_cents")) return `${groupDigits(Math.round(valeur / 100))} F`;
  if (key && key.endsWith("_milli")) return groupDigits(valeur / 1e3);
  if (key === "start_minute" || key === "end_minute") {
    if (Number.isInteger(valeur) && valeur >= 0 && valeur <= 1439) {
      return `${String(Math.floor(valeur / 60)).padStart(2, "0")}:${String(valeur % 60).padStart(2, "0")}`;
    }
  }
  return groupDigits(valeur);
}
function phraseFor(issue, input) {
  const key = lastKey(issue.path);
  const label = fieldLabel(issue.path);
  if (!label) return null;
  const sujet = capitalise(label);
  switch (issue.code) {
    case "invalid_type": {
      const manquant = isMissing(input, issue.path ?? []);
      if (manquant) return `${sujet} est obligatoire.`;
      if (issue.expected === "int") return `${sujet} doit \xEAtre un nombre entier.`;
      if (issue.expected === "number") return `${sujet} doit \xEAtre un nombre.`;
      if (issue.expected === "boolean") return `${sujet} ne peut valoir que oui ou non.`;
      if (issue.expected === "array") return `${sujet} doit former une liste.`;
      return `${sujet} n'a pas le bon format.`;
    }
    case "invalid_value":
      if (isMissing(input, issue.path ?? [])) return `${sujet} est obligatoire.`;
      return `${sujet} ne fait pas partie des choix possibles.`;
    case "invalid_format": {
      const format = issue.format;
      if (format === "uuid") return `${sujet} n'est pas valide. Reprenez la s\xE9lection dans la liste.`;
      if (format === "email") return `${sujet} n'est pas valide.`;
      if (format === "date") return `${sujet} doit respecter le format AAAA-MM-JJ.`;
      if (format === "datetime") return `${sujet} doit comporter une date et une heure.`;
      if (format === "url") return `${sujet} doit \xEAtre une adresse internet valide.`;
      return `${sujet} n'a pas le bon format.`;
    }
    case "too_small": {
      const minimum = Number(issue.minimum ?? 0);
      const origin = issue.origin;
      if (origin === "string") {
        if (minimum <= 1) return `${sujet} est obligatoire.`;
        return `${sujet} doit contenir au moins ${minimum} caract\xE8res.`;
      }
      if (origin === "array") {
        return `${sujet} : il faut en indiquer au moins ${minimum}.`;
      }
      const inclusive = issue.inclusive !== false;
      if (!inclusive) return `${sujet} doit d\xE9passer ${readableBound(key, minimum)}.`;
      return `${sujet} doit \xEAtre au moins ${readableBound(key, minimum)}.`;
    }
    case "too_big": {
      const maximum = Number(issue.maximum ?? 0);
      const origin = issue.origin;
      if (origin === "string") return `${sujet} ne doit pas d\xE9passer ${maximum} caract\xE8res.`;
      if (origin === "array") return `${sujet} : ${maximum} au maximum.`;
      const inclusive = issue.inclusive !== false;
      if (!inclusive) return `${sujet} doit rester en dessous de ${readableBound(key, maximum)}.`;
      return `${sujet} ne peut pas d\xE9passer ${readableBound(key, maximum)}.`;
    }
    case "not_multiple_of":
      return `${sujet} doit \xEAtre un multiple de ${issue.divisor ?? ""}.`.replace(" .", ".");
    default:
      return null;
  }
}
function describeIssue(issue, input) {
  const path = issue.path ?? [];
  const brut = { ...issue, input: valueAtPath(input, path) };
  const parDefaut = localeFr.localeError?.(brut);
  const estPersonnalise = typeof parDefaut === "string" && issue.message !== parDefaut;
  const ligne = lineNumber(path);
  const prefixe = ligne === null ? "" : `Ligne ${ligne} : `;
  const ajuste = (phrase2) => `${prefixe}${ligne === null ? phrase2 : decapitalise(phrase2)}`;
  if (estPersonnalise) return ajuste(issue.message);
  const phrase = phraseFor(issue, input);
  if (phrase) return ajuste(phrase);
  return ajuste(issue.message);
}
function describeIssues(issues, input) {
  const phrases = [];
  for (const issue of issues) {
    const phrase = describeIssue(issue, input);
    if (!phrases.includes(phrase)) phrases.push(phrase);
  }
  return phrases.join(" ");
}
var localeFr, FIELD_LABELS;
var init_validation_messages = __esm({
  "server/validation-messages.ts"() {
    localeFr = z2.locales.fr();
    configureFrenchValidation();
    FIELD_LABELS = {
      // Identité et comptes
      email: "l'adresse e-mail",
      password: "le mot de passe",
      first_name: "le pr\xE9nom",
      last_name: "le nom",
      phone: "le num\xE9ro de t\xE9l\xE9phone",
      role: "le r\xF4le",
      custom_role: "l'intitul\xE9 du poste",
      status: "le statut",
      is_active: "l'\xE9tat actif",
      // Organisation et stations
      name: "le nom",
      description: "la description",
      city: "la ville",
      district: "la commune",
      address: "l'adresse",
      site_id: "la station",
      logo_url: "le logo",
      contact_name: "le nom du contact",
      // Lavages
      vehicle_category_id: "la cat\xE9gorie de v\xE9hicule",
      service_id: "la prestation",
      items: "les prestations",
      quantity: "la quantit\xE9",
      worker_id: "le laveur",
      worker_ids: "les laveurs",
      principal_worker_id: "le responsable du lavage",
      plate: "la plaque",
      reference: "la r\xE9f\xE9rence",
      reason: "le motif",
      comment: "le commentaire",
      note: "la note",
      notes: "les notes",
      // Argent
      payment_method: "le mode de paiement",
      method: "le mode de paiement",
      paid_with: "le mode de paiement",
      channel: "le moyen d'encaissement",
      amount_cents: "le montant",
      amount: "le montant",
      amount_received_cents: "le montant re\xE7u",
      price_cents: "le prix",
      price_xof: "le prix",
      price_by_vehicle_type: "les prix par cat\xE9gorie de v\xE9hicule",
      unit_price_cents: "le prix unitaire",
      total_cents: "le total",
      opening_amount_cents: "le fond de caisse",
      counted_amount_cents: "le montant compt\xE9",
      discrepancy_reason: "le motif de l'\xE9cart",
      cash_session_id: "la session de caisse",
      transaction_reference: "la r\xE9f\xE9rence de la transaction",
      payment_reference: "la r\xE9f\xE9rence du paiement",
      invoice_reference: "la r\xE9f\xE9rence de la facture",
      beneficiary: "le b\xE9n\xE9ficiaire",
      category: "la cat\xE9gorie",
      // Stock et achats
      product_id: "le produit",
      category_id: "la cat\xE9gorie",
      unit: "l'unit\xE9 de mesure",
      unit_cost_cents: "le co\xFBt unitaire",
      quantity_milli: "la quantit\xE9",
      received_milli: "la quantit\xE9 re\xE7ue",
      counted_milli: "la quantit\xE9 compt\xE9e",
      initial_quantity_milli: "la quantit\xE9 initiale",
      low_stock_threshold_milli: "le seuil d'alerte",
      supplier_id: "le fournisseur",
      purchase_date: "la date de l'achat",
      kind: "le type de mouvement",
      // Présences et horaires
      work_date: "la date",
      check_in_at: "l'heure d'arriv\xE9e",
      check_out_at: "l'heure de d\xE9part",
      break_minutes: "la pause",
      break_duration_minutes: "la pause",
      absence_reason: "le motif de l'absence",
      day_of_week: "le jour de la semaine",
      specific_date: "la date",
      start_minute: "l'heure de d\xE9but",
      end_minute: "l'heure de fin",
      late_tolerance_minutes: "la tol\xE9rance de retard",
      valid_from: "la date de d\xE9but de validit\xE9",
      valid_to: "la date de fin de validit\xE9",
      duration_minutes: "la dur\xE9e",
      joined_at: "la date d'arriv\xE9e",
      at: "l'heure",
      // Abonnement et assistance
      plan_code: "le forfait",
      months: "le nombre de mois",
      days: "le nombre de jours",
      grace_days: "le d\xE9lai de gr\xE2ce",
      trial_days: "la dur\xE9e de l'essai",
      subject: "l'objet",
      body: "le message",
      message: "le message",
      text: "le message",
      template_id: "le mod\xE8le",
      internal: "la visibilit\xE9 interne",
      stage: "l'\xE9tape",
      type: "le type",
      code: "le code",
      // Filtres et pagination
      from: "la date de d\xE9but",
      to: "la date de fin",
      limit: "le nombre de r\xE9sultats",
      offset: "la position de d\xE9part"
    };
  }
});

// server/http.ts
import { z as z3 } from "zod";
function asyncRoute(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}
function body(schema2, value) {
  const result = schema2.safeParse(value);
  if (!result.success) {
    throw new HttpError(400, "invalid_data", describeIssues(result.error.issues, value));
  }
  return result.data;
}
function tenant(req) {
  if (!req.tenant) throw new HttpError(401, "tenant_required", "Organisation active requise.");
  return req.tenant;
}
function requirePermission(...permissions) {
  return (req, _res, next) => {
    if (!req.tenant) {
      return next(new HttpError(401, "authentication_required", "Connectez-vous pour continuer."));
    }
    const missing = permissions.find((permission) => !req.tenant.can(permission));
    if (missing) {
      return next(new HttpError(403, "forbidden", deniedMessage(missing)));
    }
    next();
  };
}
function assertPermission(req, permission) {
  if (!req.tenant) throw new HttpError(401, "authentication_required", "Connectez-vous pour continuer.");
  if (!req.tenant.can(permission)) throw new HttpError(403, "forbidden", deniedMessage(permission));
}
function parseId(value) {
  if (typeof value !== "string") throw new HttpError(400, "invalid_id", "Identifiant invalide.");
  const result = z3.string().uuid().safeParse(value);
  if (!result.success) throw new HttpError(400, "invalid_id", "Identifiant invalide.");
  return result.data;
}
var init_http = __esm({
  "server/http.ts"() {
    init_auth();
    init_permissions();
    init_validation_messages();
    init_auth();
  }
});

// server/console-auth.ts
import { randomBytes, createHash } from "node:crypto";
import { Router } from "express";
import { z as z4 } from "zod";
function hashToken(token) {
  return createHash("sha256").update(token).digest("hex");
}
function consoleDb() {
  const pool2 = getPool();
  if (!pool2) throw new HttpError(503, "database_not_configured", "Base de donn\xE9es indisponible.");
  return pool2;
}
function cookieSecurity(req) {
  const secure = req.secure || req.get("x-forwarded-proto") === "https";
  return { secure, sameSite: secure ? "none" : "lax" };
}
function setConsoleCookie(req, res, token) {
  const { secure, sameSite } = cookieSecurity(req);
  res.cookie(CONSOLE_COOKIE, token, {
    httpOnly: true,
    sameSite,
    secure,
    maxAge: CONSOLE_SESSION_TTL_DAYS * 24 * 60 * 60 * 1e3,
    path: "/"
  });
}
function clearConsoleCookie(req, res) {
  const { secure, sameSite } = cookieSecurity(req);
  res.clearCookie(CONSOLE_COOKIE, { httpOnly: true, sameSite, secure, path: "/" });
}
function readConsoleToken(req) {
  const header = req.get("cookie");
  if (header) {
    for (const part of header.split(";")) {
      const separator = part.indexOf("=");
      if (separator === -1) continue;
      if (part.slice(0, separator).trim() !== CONSOLE_COOKIE) continue;
      const value = part.slice(separator + 1).trim();
      if (value) return decodeURIComponent(value);
    }
  }
  const authorization = req.get("authorization") || "";
  const match = /^Console\s+(.+)$/i.exec(authorization);
  return match ? match[1].trim() : null;
}
async function createOperatorSession(pool2, operatorId) {
  const token = randomBytes(32).toString("base64url");
  await pool2.query(
    `INSERT INTO platform_operator_sessions (operator_id, token_hash, expires_at)
     VALUES ($1::uuid, $2, NOW() + make_interval(days => $3))`,
    [operatorId, hashToken(token), CONSOLE_SESSION_TTL_DAYS]
  );
  return token;
}
async function destroyOperatorSession(pool2, token) {
  await pool2.query("DELETE FROM platform_operator_sessions WHERE token_hash = $1", [hashToken(token)]);
}
async function resolveOperator(req) {
  const token = readConsoleToken(req);
  if (!token) return null;
  const pool2 = getPool();
  if (!pool2) return null;
  const q = await pool2.query(
    `SELECT s.id AS session_id, o.id, o.email, o.full_name, o.status, o.role
     FROM platform_operator_sessions s
     JOIN platform_operators o ON o.id = s.operator_id
     WHERE s.token_hash = $1 AND s.expires_at > NOW()
     LIMIT 1`,
    [hashToken(token)]
  );
  const row = q.rows[0];
  if (!row || row.status !== "active") return null;
  void pool2.query("UPDATE platform_operator_sessions SET last_used_at = NOW() WHERE id = $1::uuid", [row.session_id]).catch(() => {
  });
  return {
    operatorId: row.id,
    email: row.email,
    fullName: row.full_name,
    role: row.role,
    sessionId: row.session_id
  };
}
async function requireOperator(req, _res, next) {
  try {
    const operator = await resolveOperator(req);
    if (!operator) {
      throw new HttpError(404, "not_found", "Cette route API n'existe pas.");
    }
    req.operator = operator;
    next();
  } catch (error) {
    next(error);
  }
}
function requireConsoleAdmin(req, _res, next) {
  if (req.operator?.role !== "admin") {
    next(new HttpError(403, "console_admin_required", "Cette action est r\xE9serv\xE9e \xE0 un administrateur de la Console."));
    return;
  }
  next();
}
function requireConsoleWrite(req, _res, next) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method) || req.operator?.role !== "support") {
    next();
    return;
  }
  next(new HttpError(403, "console_read_only", "Le profil support est limit\xE9 \xE0 la consultation."));
}
async function logConsoleAction(pool2, operator, action, organizationId, organizationName, metadata = {}) {
  await pool2.query(
    `INSERT INTO platform_audit_logs(operator_id, operator_email, action, organization_id, organization_name, metadata)
     VALUES($1::uuid,$2,$3,$4::uuid,$5,$6::jsonb)`,
    [operator.operatorId, operator.email, action, organizationId, organizationName, JSON.stringify(metadata)]
  );
}
async function syncPlatformOperators(query) {
  const emails = env.PLATFORM_ADMIN_EMAILS;
  if (emails.length === 0) {
    const existing = await query("SELECT count(*)::int AS n FROM platform_operators WHERE status = 'active'");
    if ((existing.rows[0]?.n ?? 0) === 0) {
      console.warn(
        "[console] PLATFORM_ADMIN_EMAILS n'est pas defini et aucun operateur actif n'existe : la console sera inaccessible."
      );
    }
    return;
  }
  for (const email of emails) {
    const found = await query("SELECT id, status, managed_by FROM platform_operators WHERE email = $1", [email]);
    const row = found.rows[0];
    if (!row) {
      const generated = !env.PLATFORM_ADMIN_PASSWORD;
      const password = env.PLATFORM_ADMIN_PASSWORD || randomBytes(12).toString("base64url");
      await query(
        `INSERT INTO platform_operators(email, password_hash, full_name, status, role, managed_by)
         VALUES($1, $2, $3, 'active', 'admin', 'bootstrap')`,
        [email, await hashPassword(password), email.split("@")[0]]
      );
      if (generated) {
        console.warn(
          `[console] Operateur cree : ${email} \u2014 mot de passe provisoire : ${password}
[console] Notez-le maintenant, il ne sera plus affiche. Definissez PLATFORM_ADMIN_PASSWORD pour en choisir un.`
        );
      } else {
        console.info(`[console] Operateur cree : ${email}`);
      }
      continue;
    }
    if (row.managed_by === "console") continue;
    if (row.status !== "active") {
      await query("UPDATE platform_operators SET status = 'active', updated_at = now() WHERE id = $1::uuid", [row.id]);
      console.info(`[console] Operateur reactive : ${email}`);
    }
  }
  const disabled = await query(
    `UPDATE platform_operators SET status = 'disabled', updated_at = now()
     WHERE status = 'active' AND managed_by = 'bootstrap' AND email <> ALL($1::text[]) RETURNING email`,
    [emails]
  );
  if (disabled.rowCount) {
    await query(
      `DELETE FROM platform_operator_sessions
       WHERE operator_id IN (SELECT id FROM platform_operators WHERE status = 'disabled' AND managed_by = 'bootstrap')`
    );
    console.info(`[console] Operateurs desactives : ${disabled.rowCount}`);
  }
}
async function migrateLegacyPlatformAdmins(query) {
  const legacy = await query(
    `SELECT lower(email) AS email, coalesce(nullif(trim(concat_ws(' ', first_name, last_name)), ''), email) AS name
     FROM users WHERE platform_admin`
  );
  const rows = legacy.rows;
  if (rows.length === 0) return;
  for (const row of rows) {
    await query(
      `INSERT INTO platform_operators(email, full_name, status)
       VALUES($1, $2, 'active') ON CONFLICT (email) DO NOTHING`,
      [row.email, row.name]
    );
  }
  await query("UPDATE users SET platform_admin = false WHERE platform_admin");
  console.info(
    `[console] ${rows.length} ancien(s) administrateur(s) repris comme operateur(s) : ${rows.map((r) => r.email).join(", ")}`
  );
}
function createConsoleAuthRouter() {
  const r = Router();
  r.post(
    "/login",
    asyncRoute(async (req, res) => {
      const input = body(
        z4.object({
          email: z4.string().trim().toLowerCase().email(),
          password: z4.string().min(1).max(200)
        }).strip(),
        req.body
      );
      const pool2 = consoleDb();
      const q = await pool2.query(
        "SELECT id, email, full_name, password_hash, status, role FROM platform_operators WHERE email = $1",
        [input.email]
      );
      const row = q.rows[0];
      const refuse = () => {
        throw new HttpError(401, "invalid_credentials", "Identifiants invalides.");
      };
      if (!row || row.status !== "active") {
        await verifyPassword(input.password, null);
        refuse();
        return;
      }
      if (!await verifyPassword(input.password, row.password_hash)) {
        refuse();
        return;
      }
      const token = await createOperatorSession(pool2, row.id);
      await pool2.query("UPDATE platform_operators SET last_login_at = now() WHERE id = $1::uuid", [row.id]);
      setConsoleCookie(req, res, token);
      res.json({
        token,
        operator: { id: row.id, email: row.email, full_name: row.full_name, role: row.role }
      });
    })
  );
  r.post(
    "/logout",
    asyncRoute(async (req, res) => {
      const token = readConsoleToken(req);
      if (token) await destroyOperatorSession(consoleDb(), token);
      clearConsoleCookie(req, res);
      res.json({ ok: true });
    })
  );
  r.get(
    "/me",
    asyncRoute(async (req, res) => {
      const operator = await resolveOperator(req);
      if (!operator) {
        res.status(401).json({ error: { code: "authentication_required", message: "Session de console requise." } });
        return;
      }
      res.json({
        operator: { id: operator.operatorId, email: operator.email, full_name: operator.fullName, role: operator.role }
      });
    })
  );
  return r;
}
var CONSOLE_COOKIE, CONSOLE_SESSION_TTL_DAYS, CONSOLE_OPERATOR_ROLES;
var init_console_auth = __esm({
  "server/console-auth.ts"() {
    init_db();
    init_auth();
    init_http();
    init_env();
    CONSOLE_COOKIE = "washpilot_console";
    CONSOLE_SESSION_TTL_DAYS = 2;
    CONSOLE_OPERATOR_ROLES = ["admin", "supervisor", "support"];
  }
});

// src/config/vehicle-taxonomy.ts
function isVehicleFamily(code) {
  return Boolean(code && FAMILY_BY_CODE.has(code));
}
function vehicleType(codeOrName) {
  if (!codeOrName) return null;
  const direct = TYPE_BY_CODE.get(codeOrName);
  if (direct) return direct;
  const lower = codeOrName.trim().toLowerCase();
  return VEHICLE_TYPES.find((type) => type.name.toLowerCase() === lower) ?? null;
}
function familyOrder(code) {
  if (!code) return VEHICLE_FAMILIES.length;
  const index = VEHICLE_FAMILIES.findIndex((family) => family.code === code);
  return index < 0 ? VEHICLE_FAMILIES.length : index;
}
function sortVehicleCategories(rows) {
  return [...rows].sort((a, b) => {
    const familyDiff = familyOrder(a.family) - familyOrder(b.family);
    if (familyDiff !== 0) return familyDiff;
    const orderDiff = (a.sort_order ?? 0) - (b.sort_order ?? 0);
    if (orderDiff !== 0) return orderDiff;
    return a.name.localeCompare(b.name, "fr-CI");
  });
}
var VEHICLE_FAMILIES, VEHICLE_FAMILY_CODES, FAMILY_BY_CODE, VEHICLE_TYPES, TYPE_BY_CODE, VEHICLE_TYPE_COUNT;
var init_vehicle_taxonomy = __esm({
  "src/config/vehicle-taxonomy.ts"() {
    VEHICLE_FAMILIES = [
      {
        code: "deux_roues",
        label: "Motos et deux-roues",
        description: "Le gros du passage dans beaucoup de stations de quartier.",
        types: [
          { code: "moto", name: "Moto" },
          { code: "scooter", name: "Scooter" },
          { code: "cyclomoteur", name: "Cyclomoteur" },
          { code: "moto_taxi", name: "Moto-taxi" },
          { code: "tricycle_motorise", name: "Tricycle motoris\xE9" },
          { code: "quad", name: "Quad" }
        ]
      },
      {
        code: "petites_voitures",
        label: "Petites voitures",
        description: "Citadines et compactes : lavage rapide, tarif d'entr\xE9e.",
        types: [
          { code: "citadine", name: "Citadine" },
          { code: "mini_citadine", name: "Mini-citadine" },
          { code: "petite_berline", name: "Petite berline" },
          { code: "compacte", name: "Compacte" },
          { code: "coupe", name: "Coup\xE9" },
          { code: "cabriolet", name: "Cabriolet" }
        ]
      },
      {
        code: "berlines",
        label: "Berlines et voitures familiales",
        description: "Le c\u0153ur du parc : berlines, breaks et monospaces.",
        types: [
          { code: "berline_compacte", name: "Berline compacte" },
          { code: "berline_moyenne", name: "Berline moyenne" },
          { code: "berline_grande_taille", name: "Berline grande taille" },
          { code: "break", name: "Break" },
          { code: "monospace_compact", name: "Monospace compact" },
          { code: "monospace_familial", name: "Monospace familial" }
        ]
      },
      {
        code: "suv",
        label: "SUV et v\xE9hicules tout-terrain",
        description: "Gabarit haut et surfaces plus grandes : plus de temps, plus de produit.",
        types: [
          { code: "crossover", name: "Crossover" },
          { code: "suv_compact", name: "SUV compact" },
          { code: "suv_familial", name: "SUV familial" },
          { code: "grand_suv", name: "Grand SUV" },
          { code: "quatre_quatre", name: "4x4" },
          { code: "pick_up_double_cabine", name: "Pick-up double cabine" },
          { code: "tout_terrain", name: "V\xE9hicule tout-terrain" }
        ]
      },
      {
        code: "utilitaires",
        label: "Utilitaires l\xE9gers",
        description: "Fourgons et pick-up de travail, souvent tr\xE8s sales.",
        types: [
          { code: "fourgonnette", name: "Fourgonnette" },
          { code: "fourgon", name: "Fourgon" },
          { code: "petit_utilitaire", name: "Petit utilitaire" },
          { code: "grand_utilitaire", name: "Grand utilitaire" },
          { code: "pick_up_simple_cabine", name: "Pick-up simple cabine" },
          { code: "pick_up_cabine_approfondie", name: "Pick-up cabine approfondie" }
        ]
      },
      {
        code: "transport_personnes",
        label: "Transport de personnes",
        description: "Taxis, minibus et bus : contrats r\xE9guliers possibles.",
        types: [
          { code: "taxi", name: "Taxi" },
          { code: "vtc", name: "VTC" },
          { code: "taxi_collectif", name: "Taxi collectif" },
          { code: "minibus", name: "Minibus" },
          { code: "car", name: "Car" },
          { code: "autocar", name: "Autocar" },
          { code: "bus_urbain", name: "Bus urbain" },
          { code: "bus_articule", name: "Bus articul\xE9" }
        ]
      },
      {
        code: "poids_lourds",
        label: "Poids lourds et camions",
        description: "Interventions longues, souvent hors forfait habituel.",
        types: [
          { code: "camion_leger", name: "Camion l\xE9ger" },
          { code: "camion_porteur", name: "Camion porteur" },
          { code: "camion_benne", name: "Camion-benne" },
          { code: "camion_citerne", name: "Camion-citerne" },
          { code: "camion_frigorifique", name: "Camion frigorifique" },
          { code: "tracteur_routier", name: "Tracteur routier" },
          { code: "semi_remorque", name: "Semi-remorque" },
          { code: "remorque", name: "Remorque" }
        ]
      },
      {
        code: "speciaux",
        label: "V\xE9hicules professionnels et sp\xE9ciaux",
        description: "Engins de chantier, agricoles et v\xE9hicules d'intervention.",
        types: [
          { code: "tracteur_agricole", name: "Tracteur agricole" },
          { code: "engin_chantier", name: "Engin de chantier" },
          { code: "pelle_mecanique", name: "Pelle m\xE9canique" },
          { code: "chargeuse", name: "Chargeuse" },
          { code: "chariot_elevateur", name: "Chariot \xE9l\xE9vateur" },
          { code: "ambulance", name: "Ambulance" },
          { code: "vehicule_secours", name: "V\xE9hicule de secours" },
          { code: "vehicule_blinde", name: "V\xE9hicule blind\xE9" }
        ]
      },
      {
        code: "electriques",
        label: "V\xE9hicules \xE9lectriques et hybrides",
        description: "Pr\xE9cautions propres : pas de jet haute pression sur la batterie.",
        types: [
          { code: "voiture_electrique", name: "Voiture \xE9lectrique" },
          { code: "suv_electrique", name: "SUV \xE9lectrique" },
          { code: "berline_hybride", name: "Berline hybride" },
          { code: "utilitaire_electrique", name: "Utilitaire \xE9lectrique" },
          { code: "moto_electrique", name: "Moto \xE9lectrique" },
          { code: "scooter_electrique", name: "Scooter \xE9lectrique" }
        ]
      }
    ];
    VEHICLE_FAMILY_CODES = VEHICLE_FAMILIES.map((f) => f.code);
    FAMILY_BY_CODE = new Map(VEHICLE_FAMILIES.map((family) => [family.code, family]));
    VEHICLE_TYPES = VEHICLE_FAMILIES.flatMap(
      (family) => family.types.map((type, index) => ({
        ...type,
        family: family.code,
        family_label: family.label,
        sort_order: index
      }))
    );
    TYPE_BY_CODE = new Map(VEHICLE_TYPES.map((type) => [type.code, type]));
    VEHICLE_TYPE_COUNT = VEHICLE_TYPES.length;
  }
});

// src/config/service-categories.ts
function serviceCategoryName(templateCategory) {
  if (!templateCategory) return FALLBACK_SERVICE_CATEGORY;
  return SERVICE_CATALOG_CATEGORY_LABELS[templateCategory] ?? FALLBACK_SERVICE_CATEGORY;
}
var DEFAULT_SERVICE_CATEGORY_NAMES, FALLBACK_SERVICE_CATEGORY, SERVICE_CATALOG_CATEGORY_LABELS;
var init_service_categories = __esm({
  "src/config/service-categories.ts"() {
    DEFAULT_SERVICE_CATEGORY_NAMES = [
      "Lavage ext\xE9rieur",
      "Lavage int\xE9rieur",
      "Lavage complet",
      "Detailing & soins",
      "Autres prestations"
    ];
    FALLBACK_SERVICE_CATEGORY = "Autres prestations";
    SERVICE_CATALOG_CATEGORY_LABELS = {
      exterior_wash: "Lavage ext\xE9rieur",
      interior_cleaning: "Lavage int\xE9rieur",
      complete_wash: "Lavage complet",
      detailing: "Detailing & soins",
      autre: FALLBACK_SERVICE_CATEGORY
    };
  }
});

// server/default-catalog.ts
function toDefault(type) {
  if (!type) throw new Error("type de v\xE9hicule par d\xE9faut inconnu");
  return { name: type.name, family: type.family, sort_order: type.sort_order };
}
function needsDefaultVehicleCategories(existingCount) {
  return existingCount <= 0;
}
var DEFAULT_VEHICLE_CATEGORY_CODES, DEFAULT_VEHICLE_CATEGORIES, DEFAULT_VEHICLE_CATEGORY_NAMES, SERVICE_CATALOG_TEMPLATES, SERVICE_CATALOG_NAMES;
var init_default_catalog = __esm({
  "server/default-catalog.ts"() {
    init_vehicle_taxonomy();
    init_service_categories();
    DEFAULT_VEHICLE_CATEGORY_CODES = [
      "moto",
      "citadine",
      "berline_moyenne",
      "suv_familial",
      "fourgonnette",
      "minibus",
      "camion_porteur",
      "engin_chantier",
      "voiture_electrique"
    ];
    DEFAULT_VEHICLE_CATEGORIES = DEFAULT_VEHICLE_CATEGORY_CODES.map((code) => toDefault(vehicleType(code)));
    DEFAULT_VEHICLE_CATEGORY_NAMES = DEFAULT_VEHICLE_CATEGORIES.map((category) => category.name);
    SERVICE_CATALOG_TEMPLATES = [
      {
        name: "Lavage ext\xE9rieur",
        category: "exterior_wash",
        price_cents: 2e5,
        duration_minutes: 20,
        description: "Carrosserie, vitres et s\xE9chage \xE0 la microfibre."
      },
      {
        name: "Lavage int\xE9rieur simple",
        category: "interior_cleaning",
        price_cents: 15e4,
        duration_minutes: 20,
        description: "Aspiration, tableau de bord et plastiques."
      },
      {
        name: "Lavage complet (int\xE9rieur + ext\xE9rieur)",
        category: "complete_wash",
        price_cents: 35e4,
        duration_minutes: 45,
        description: "Int\xE9rieur et ext\xE9rieur, finition \xE0 la main."
      },
      {
        name: "Lavage express",
        category: "exterior_wash",
        price_cents: 15e4,
        duration_minutes: 15,
        description: "Lavage ext\xE9rieur rapide, sans attente."
      },
      {
        name: "Nettoyage des tapis et si\xE8ges uniquement",
        category: "interior_cleaning",
        price_cents: 25e4,
        duration_minutes: 30,
        description: "Shampoing des si\xE8ges et des tapis du v\xE9hicule."
      },
      {
        name: "Lavage des moquettes (maison)",
        category: "autre",
        price_cents: 3e5,
        duration_minutes: 45,
        description: "Moquettes et tapis de maison d\xE9pos\xE9s \xE0 la station."
      },
      {
        name: "Nettoyage des jantes et pneus",
        category: "exterior_wash",
        price_cents: 1e5,
        duration_minutes: 15,
        description: "D\xE9graissage des jantes et brillance des pneus."
      },
      {
        name: "Lavage du bas de caisse",
        category: "exterior_wash",
        price_cents: 15e4,
        duration_minutes: 20,
        description: "Berceaux et passages de roues, haute pression."
      },
      {
        name: "Lavage moteur complet",
        category: "exterior_wash",
        price_cents: 3e5,
        duration_minutes: 45,
        description: "D\xE9graissage du compartiment moteur, rin\xE7age ma\xEEtris\xE9."
      },
      {
        name: "Lustrage de la carrosserie",
        category: "detailing",
        price_cents: 5e5,
        duration_minutes: 60,
        description: "Polish puis cire, brillance durable."
      },
      {
        name: "Lavage de motos",
        category: "exterior_wash",
        price_cents: 1e5,
        duration_minutes: 15,
        description: "Moto ou scooter, jantes et cha\xEEne d\xE9graiss\xE9es."
      }
    ];
    SERVICE_CATALOG_NAMES = SERVICE_CATALOG_TEMPLATES.map(
      (template) => template.name
    );
  }
});

// server/db.ts
import pg from "pg";
import { mkdir } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
function getPool() {
  return pool;
}
function isDatabaseReady() {
  return ready && pool !== null;
}
async function seedServiceCatalog(query) {
  const kept = [];
  for (const [index, template] of SERVICE_CATALOG_TEMPLATES.entries()) {
    kept.push(`${template.category}|${template.name}`);
    await query(
      `INSERT INTO service_catalog(category, name, price_cents, duration_minutes, description, sort_order, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, true)
       ON CONFLICT (category, name) DO UPDATE
         SET price_cents = EXCLUDED.price_cents,
             duration_minutes = EXCLUDED.duration_minutes,
             description = EXCLUDED.description,
             sort_order = EXCLUDED.sort_order,
             is_active = true`,
      [
        template.category,
        template.name,
        template.price_cents,
        template.duration_minutes,
        template.description,
        index + 1
      ]
    );
  }
  await query(
    `UPDATE service_catalog SET is_active = false
      WHERE is_active AND NOT ((category || '|' || name) = ANY($1::text[]))`,
    [kept]
  );
}
function rlsPolicy(tableName, predicate) {
  return [
    `ALTER TABLE ${tableName} ENABLE ROW LEVEL SECURITY;`,
    `DROP POLICY IF EXISTS org_isolation ON ${tableName};`,
    `CREATE POLICY org_isolation ON ${tableName}`,
    `  USING (${predicate})`,
    `  WITH CHECK (${predicate});`
  ].join("\n");
}
function rlsSchemaSql() {
  const blocks = [
    `-- R\xF4le applicatif : droits DML uniquement, ni superutilisateur ni
-- BYPASSRLS. Les politiques s'appliquent \xE0 lui, contrairement au
-- propri\xE9taire des tables que Postgres en dispense par principe. Cr\xE9\xE9 de
-- fa\xE7on idempotente ; sans droits suffisants (base h\xE9berg\xE9e verrouill\xE9e),
-- les politiques restent pos\xE9es et prot\xE8gent les connexions non
-- propri\xE9taires, et le d\xE9marrage continue.
DO $rls$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'washpilot_app') THEN
    CREATE ROLE washpilot_app NOLOGIN;
  END IF;
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE '[rls] r\xF4le washpilot_app non cr\xE9able (droits insuffisants).';
END $rls$;

DO $rls$
BEGIN
  EXECUTE 'GRANT USAGE ON SCHEMA public TO washpilot_app';
  EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO washpilot_app';
  EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO washpilot_app';
EXCEPTION WHEN undefined_object OR insufficient_privilege THEN
  RAISE NOTICE '[rls] droits du r\xF4le washpilot_app non accord\xE9s.';
END $rls$;

-- Appartenance du compte de l'application au r\xF4le : sans elle, SET ROLE est
-- refus\xE9 (\xAB permission denied to set role \xBB) et chaque requ\xEAte \xE9chouerait.
-- Idempotent ; sur une base h\xE9berg\xE9e qui refuse l'ajout d'appartenance, la
-- sonde au d\xE9marrage indique le GRANT \xE0 ex\xE9cuter \xE0 la main.
DO $rls$
BEGIN
  EXECUTE format('GRANT washpilot_app TO %I', current_user);
EXCEPTION WHEN undefined_object OR insufficient_privilege THEN
  RAISE NOTICE '[rls] appartenance de % au r\xF4le washpilot_app non accord\xE9e (\xE0 faire \xE0 la main : GRANT washpilot_app TO %;).', current_user, current_user;
END $rls$;`
  ];
  blocks.push(rlsPolicy("organizations", `id = ${RLS_CURRENT_ORG}`));
  for (const table of RLS_DIRECT_TABLES) {
    blocks.push(rlsPolicy(table, `organization_id = ${RLS_CURRENT_ORG}`));
  }
  for (const { table, parent, foreignKey } of RLS_PARENT_TABLES) {
    blocks.push(
      rlsPolicy(
        table,
        `EXISTS (SELECT 1 FROM ${parent} p WHERE p.id = ${table}.${foreignKey} AND p.organization_id = ${RLS_CURRENT_ORG})`
      )
    );
  }
  for (const table of RLS_NULLABLE_ORG_TABLES) {
    blocks.push(rlsPolicy(table, `(organization_id IS NULL OR organization_id = ${RLS_CURRENT_ORG})`));
  }
  return blocks.join("\n\n");
}
async function seedDemoData(queryFn) {
  if (env.NODE_ENV === "production") return;
  if (env.NODE_ENV !== "test" && env.SEED_DEMO_DATA.trim().toLowerCase() === "false") return;
  const existingUser = await queryFn("SELECT id FROM users WHERE lower(email) = $1", ["demo@washpilot.ci"]);
  if (existingUser.rows && existingUser.rows.length > 0) return;
  const demoPasswordHash = await hashPassword("WashPilot2026!");
  const orgRes = await queryFn(
    `INSERT INTO organizations (name, slug, onboarding_completed)
     VALUES ('Station Cocody Riviera', 'station-cocody-riviera', true)
     RETURNING id`
  );
  const orgId = orgRes.rows[0].id;
  const userRes = await queryFn(
    `INSERT INTO users (email, first_name, last_name, phone, password_hash, status, organization_id)
     VALUES ('demo@washpilot.ci', 'Awa', 'Kouassi', '+225 07 01 02 03 04', $1, 'active', $2)
     RETURNING id`,
    [demoPasswordHash, orgId]
  );
  const userId = userRes.rows[0].id;
  await queryFn(
    `INSERT INTO organization_members (organization_id, user_id, role)
     VALUES ($1, $2, 'owner')`,
    [orgId, userId]
  );
  const demoTeam = [
    { email: "gerant@washpilot.ci", first: "Serge", last: "N'Guessan", phone: "+225 07 11 22 33 44", role: "manager" },
    { email: "caisse@washpilot.ci", first: "Fatou", last: "Diarra", phone: "+225 07 55 66 77 88", role: "cashier" },
    { email: "laveur@washpilot.ci", first: "Koffi", last: "Yao", phone: "+225 07 99 00 11 22", role: "washer" }
  ];
  for (const member of demoTeam) {
    const memberRes = await queryFn(
      `INSERT INTO users (email, first_name, last_name, phone, password_hash, status, organization_id)
       VALUES ($1, $2, $3, $4, $5, 'active', $6) RETURNING id`,
      [member.email, member.first, member.last, member.phone, demoPasswordHash, orgId]
    );
    await queryFn(
      `INSERT INTO organization_members (organization_id, user_id, role) VALUES ($1, $2, $3)`,
      [orgId, memberRes.rows[0].id, member.role]
    );
  }
  const freePlanRes = await queryFn("SELECT id FROM plans WHERE code = 'starter'");
  if (freePlanRes.rows.length > 0) {
    await queryFn(
      `INSERT INTO subscriptions (organization_id, plan_id, status, current_period_end)
       VALUES ($1, $2, 'trialing', NOW() + interval '11 days')`,
      [orgId, freePlanRes.rows[0].id]
    );
  }
  const siteRes = await queryFn(
    `INSERT INTO sites (organization_id, name, city, address, phone, is_active)
     VALUES ($1, 'Station Cocody Riviera', 'Abidjan', 'Boulevard de France, Cocody', '+225 27 22 44 55 66', true)
     RETURNING id`,
    [orgId]
  );
  const siteId = siteRes.rows[0].id;
  let berlineId = "";
  let suvId = "";
  for (const category of DEFAULT_VEHICLE_CATEGORIES) {
    const inserted = await queryFn(
      `INSERT INTO vehicle_categories (organization_id, name, family, sort_order, is_active)
       VALUES ($1, $2, $3, $4, true) RETURNING id`,
      [orgId, category.name, category.family, category.sort_order]
    );
    if (category.family === "berlines") berlineId = String(inserted.rows[0].id);
    if (category.family === "suv") suvId = String(inserted.rows[0].id);
  }
  const serviceCategoryIds = /* @__PURE__ */ new Map();
  for (const name of DEFAULT_SERVICE_CATEGORY_NAMES) {
    const inserted = await queryFn(
      `INSERT INTO service_categories (organization_id, name, is_active)
       VALUES ($1, $2, true) RETURNING id`,
      [orgId, name]
    );
    serviceCategoryIds.set(name.toLowerCase(), String(inserted.rows[0].id));
  }
  const serviceIds = /* @__PURE__ */ new Map();
  for (const template of SERVICE_CATALOG_TEMPLATES) {
    const categoryName = serviceCategoryName(template.category);
    const inserted = await queryFn(
      `INSERT INTO services (organization_id, category_id, name, description, price_cents, duration_minutes, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, true) RETURNING id`,
      [
        orgId,
        serviceCategoryIds.get(categoryName.toLowerCase()) ?? null,
        template.name,
        template.description,
        template.price_cents,
        template.duration_minutes
      ]
    );
    serviceIds.set(template.name, String(inserted.rows[0].id));
  }
  const completeWash = SERVICE_CATALOG_TEMPLATES.find(
    (template) => template.name === "Lavage complet (int\xE9rieur + ext\xE9rieur)"
  );
  const lustrage = SERVICE_CATALOG_TEMPLATES.find(
    (template) => template.name === "Lustrage de la carrosserie"
  );
  if (!completeWash || !lustrage) throw new Error("catalogue de prestations incomplet");
  const w1 = await queryFn(
    `INSERT INTO workers (organization_id, site_id, first_name, last_name, phone, role, status, district)
     VALUES ($1, $2, 'Jean-Marc', 'Koffi', '+225 07 10 20 30 40', 'car_washer', 'active', 'Cocody')
     RETURNING id`,
    [orgId, siteId]
  );
  const w2 = await queryFn(
    `INSERT INTO workers (organization_id, site_id, first_name, last_name, phone, role, status, district)
     VALUES ($1, $2, 'Ibrahim', 'Tour\xE9', '+225 05 20 30 40 50', 'versatile_washer', 'active', 'Plateau Dokui')
     RETURNING id`,
    [orgId, siteId]
  );
  await queryFn(
    `INSERT INTO workers (organization_id, site_id, first_name, last_name, phone, role, status, district)
     VALUES ($1, $2, 'Fatou', 'Ciss\xE9', '+225 01 30 40 50 60', 'team_lead', 'active', 'Riviera Palmeraie')
     RETURNING id`,
    [orgId, siteId]
  );
  const cashSessionRes = await queryFn(
    `INSERT INTO cash_sessions (organization_id, site_id, opened_by, opening_amount_cents, status)
     VALUES ($1, $2, $3, 2500000, 'open')
     RETURNING id`,
    [orgId, siteId, userId]
  );
  const cashSessionId = cashSessionRes.rows[0].id;
  const wash1 = await queryFn(
    `INSERT INTO washes (organization_id, site_id, vehicle_category_id, reference, status, total_cents, payment_status, payment_method, created_by)
     VALUES ($1, $2, $3, 'LAV-2026-0001', 'completed', $4, 'paid', 'cash', $5)
     RETURNING id`,
    [orgId, siteId, berlineId, completeWash.price_cents, userId]
  );
  await queryFn(
    `INSERT INTO wash_items (wash_id, service_id, service_name, quantity, unit_price_cents, line_total_cents)
     VALUES ($1, $2, $3, 1, $4, $4)`,
    [
      wash1.rows[0].id,
      serviceIds.get(completeWash.name),
      completeWash.name,
      completeWash.price_cents
    ]
  );
  await queryFn(
    `INSERT INTO wash_assignments (wash_id, worker_id) VALUES ($1, $2)`,
    [wash1.rows[0].id, w1.rows[0].id]
  );
  await queryFn(
    `INSERT INTO payments (organization_id, wash_id, method, amount_cents, status)
     VALUES ($1, $2, 'cash', $3, 'verified')`,
    [orgId, wash1.rows[0].id, completeWash.price_cents]
  );
  await queryFn(
    `INSERT INTO cash_movements (organization_id, cash_session_id, type, amount_cents, source, description, wash_id, created_by)
     VALUES ($1, $2, 'entry', $3, 'wash_payment', 'Encaissement lavage LAV-2026-0001', $4, $5)`,
    [orgId, cashSessionId, completeWash.price_cents, wash1.rows[0].id, userId]
  );
  const wash2 = await queryFn(
    `INSERT INTO washes (organization_id, site_id, vehicle_category_id, reference, status, total_cents, payment_status, payment_method, created_by)
     VALUES ($1, $2, $3, 'LAV-2026-0002', 'completed', $4, 'paid', 'wave', $5)
     RETURNING id`,
    [orgId, siteId, suvId, lustrage.price_cents, userId]
  );
  await queryFn(
    `INSERT INTO wash_items (wash_id, service_id, service_name, quantity, unit_price_cents, line_total_cents)
     VALUES ($1, $2, $3, 1, $4, $4)`,
    [wash2.rows[0].id, serviceIds.get(lustrage.name), lustrage.name, lustrage.price_cents]
  );
  await queryFn(
    `INSERT INTO wash_assignments (wash_id, worker_id) VALUES ($1, $2), ($1, $3)`,
    [wash2.rows[0].id, w1.rows[0].id, w2.rows[0].id]
  );
  await queryFn(
    `INSERT INTO payments (organization_id, wash_id, method, amount_cents, status)
     VALUES ($1, $2, 'wave', $3, 'verified')`,
    [orgId, wash2.rows[0].id, lustrage.price_cents]
  );
  await queryFn(
    `INSERT INTO onboarding_progress (organization_id, current_stage, completed_at, plan_code)
     VALUES ($1, 'completed', NOW(), 'starter')
     ON CONFLICT (organization_id) DO UPDATE SET current_stage = 'completed', completed_at = NOW()`,
    [orgId]
  );
}
function createPglitePool(pglite) {
  let transactionLock = Promise.resolve();
  const runQuery = async (sqlOrConfig, params) => {
    let sql;
    let values = params;
    if (typeof sqlOrConfig === "string") {
      sql = sqlOrConfig;
    } else if (sqlOrConfig && typeof sqlOrConfig === "object") {
      sql = sqlOrConfig.text || sqlOrConfig.sql || "";
      values = sqlOrConfig.values || params;
    } else {
      sql = String(sqlOrConfig);
    }
    if (!values || values.length === 0) {
      const trimmed = sql.trim();
      const statements = trimmed.split(";").map((s) => s.trim()).filter(Boolean);
      if (statements.length > 1) {
        await pglite.exec(sql);
        return { rows: [], rowCount: 0, fields: [], command: "EXEC" };
      }
    }
    const res = await pglite.query(sql, values);
    return {
      rows: res.rows || [],
      rowCount: res.rowCount ?? (res.rows ? res.rows.length : 0),
      fields: res.fields || [],
      command: res.command || "SELECT",
      affectedRows: res.affectedRows
    };
  };
  return {
    async query(sqlOrConfig, params) {
      return runQuery(sqlOrConfig, params);
    },
    async connect() {
      let releaseLock = () => {
      };
      const prevLock = transactionLock;
      transactionLock = new Promise((resolve) => {
        releaseLock = resolve;
      });
      await prevLock;
      let released = false;
      const client = {
        async query(sqlOrConfig, params) {
          return runQuery(sqlOrConfig, params);
        },
        release() {
          if (!released) {
            released = true;
            releaseLock();
          }
        }
      };
      return client;
    },
    async end() {
      await pglite.close();
    }
  };
}
async function backfillRevenueLedger(query) {
  const inserted = await query(
    `INSERT INTO subscription_payments(
       organization_id, organization_name, plan_code, plan_name, amount_cents, months,
       period_start, period_end, channel, payment_reference, source, note, occurred_at)
     SELECT a.organization_id,
            COALESCE(o.name, 'Station supprimee'),
            COALESCE(a.metadata->>'plan_code', 'inconnu'),
            COALESCE(a.metadata->>'plan_name', 'Forfait'),
            COALESCE((a.metadata->>'price_cents')::bigint, 0)
              * COALESCE((a.metadata->>'months')::int, 1),
            COALESCE((a.metadata->>'months')::int, 1),
            COALESCE((a.metadata->>'period_end')::timestamptz, a.created_at)
              - (COALESCE((a.metadata->>'months')::int, 1) || ' months')::interval,
            COALESCE((a.metadata->>'period_end')::timestamptz, a.created_at),
            'other',
            a.metadata->>'payment_reference',
            'backfill',
            'Reprise automatique depuis le journal d audit',
            a.created_at
       FROM audit_logs a
       LEFT JOIN organizations o ON o.id = a.organization_id
      WHERE a.action = 'subscription.activated'
        AND a.organization_id IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM subscription_payments sp
           WHERE sp.organization_id = a.organization_id
             AND sp.occurred_at = a.created_at)
     RETURNING id`
  );
  const n = inserted.rowCount ?? 0;
  if (n) console.log(`[revenu] ${n} encaissement(s) repris depuis le journal d'audit.`);
}
function embeddedFallbackAllowed(nodeEnv) {
  return nodeEnv !== "production";
}
function readCaCertificate(raw) {
  const value = (raw ?? "").trim();
  if (!value) return null;
  const looksLikePem = value.includes("-----BEGIN CERTIFICATE-----");
  const unescaped = value.replace(/\\n/g, "\n");
  if (looksLikePem) return unescaped;
  try {
    return readFileSync(value, "utf8");
  } catch {
    console.warn(
      `[db] DATABASE_SSL_CA ne ressemble ni \xE0 un certificat PEM ni \xE0 un fichier lisible (${value}). La connexion se fera avec les autorit\xE9s publiques uniquement.`
    );
    return null;
  }
}
async function initDatabaseSchema() {
  if (process.env.NODE_TEST_CONTEXT && env.NODE_ENV !== "test") {
    throw new Error(
      "Les tests tournent sous `node --test` sans NODE_ENV=test : ils ouvriraient la base de d\xE9veloppement sur disque et la modifieraient. Lancez `npm test` (ou `npm test -- tests/fichier.test.ts`)."
    );
  }
  const decision = chooseDatabaseTarget({
    nodeEnv: env.NODE_ENV,
    databaseUrl: env.DATABASE_URL
  });
  if (!embeddedFallbackAllowed(env.NODE_ENV) && decision.target === "embedded") {
    throw new Error(
      "DATABASE_URL est obligatoire en production. Sans elle, l'application d\xE9marrerait sur la base embarqu\xE9e, \xE0 l'int\xE9rieur du serveur : les donn\xE9es seraient perdues au premier red\xE9ploiement."
    );
  }
  if (decision.ignoredDatabaseUrl) {
    console.warn(
      "[db] Mode test : DATABASE_URL est ignor\xE9e, la suite utilise une base embarqu\xE9e en m\xE9moire. Aucune donn\xE9e r\xE9elle n'est lue ni \xE9crite."
    );
  }
  if (decision.target === "external") {
    const connectionProfile = describeConnection(env.DATABASE_URL);
    if (isUnfilledRemoteDatabaseUrl(env.DATABASE_URL)) {
      throw new Error(
        "DATABASE_URL contient encore un gabarit de mot de passe (<MOT_DE_PASSE> / [YOUR-PASSWORD]). Renseignez le mot de passe du pooler Supabase (Settings \u2192 Database \u2192 Reset database password) avant de d\xE9marrer : sans lui, l'application \xE9crirait dans une base locale vide."
      );
    }
    try {
      if (connectionProfile.warning) console.warn(`[db] ${connectionProfile.warning}`);
      const externalPool = new Pool({
        connectionString: env.DATABASE_URL,
        max: env.PG_POOL_MAX,
        ssl: buildSslConfig(env.DATABASE_URL, readCaCertificate(env.DATABASE_SSL_CA)),
        connectionTimeoutMillis: 8e3,
        idleTimeoutMillis: 3e4
      });
      await externalPool.query("SELECT 1");
      const requiredTables = await externalPool.query(
        `SELECT to_regclass('public.organizations')::text AS organizations,
                to_regclass('public.auth_sessions')::text AS auth_sessions`
      );
      if (!requiredTables.rows[0]?.organizations || !requiredTables.rows[0]?.auth_sessions) {
        throw new Error(
          "Sch\xE9ma Supabase incomplet : appliquez les migrations avec `supabase db push` avant de d\xE9marrer l'API."
        );
      }
      await probeRlsRole(externalPool);
      if (!isRlsRoleAvailable() && env.NODE_ENV === "production") {
        throw new Error(
          "Le r\xF4le RLS washpilot_app n'est pas disponible sur Supabase ; d\xE9marrage refus\xE9 pour prot\xE9ger l'isolation des organisations."
        );
      }
      await seedServiceCatalog(externalPool.query.bind(externalPool));
      await externalPool.query(SERVICE_ELIGIBILITY_TRANSCRIPTION_SQL);
      await migrateLegacyPlatformAdmins(externalPool.query.bind(externalPool));
      await syncPlatformOperators(externalPool.query.bind(externalPool));
      await backfillRevenueLedger(externalPool.query.bind(externalPool));
      pool = bindRlsGuard(externalPool);
      ready = true;
      console.info("[db] Connect\xE9 \xE0 PostgreSQL via DATABASE_URL");
      return true;
    } catch (error) {
      const detail = error instanceof Error ? error.message : "unknown";
      if (!embeddedFallbackAllowed(env.NODE_ENV)) {
        throw new Error(
          `Connexion \xE0 DATABASE_URL impossible (${detail}). L'application refuse de d\xE9marrer sur la base embarqu\xE9e : elle repartirait d'une base vide, caisse comprise.`,
          // L'erreur d'origine reste attachée : sans elle, l'exploitant lirait
          // « connexion impossible » sans savoir si c'est le mot de passe, le
          // réseau ou le certificat.
          { cause: error }
        );
      }
      console.warn("[db] Connexion DATABASE_URL \xE9chou\xE9e, basculement sur PostgreSQL embarqu\xE9 (PGlite):", detail);
    }
  }
  try {
    const location = resolvePgliteLocation({
      nodeEnv: env.NODE_ENV,
      dataDir: env.PGLITE_DATA_DIR
    });
    if (location.dataDir) {
      await mkdir(location.dataDir, { recursive: true });
    }
    pgliteInstance = location.dataDir ? new PGlite(location.dataDir) : new PGlite();
    const rawPool = createPglitePool(pgliteInstance);
    await rawPool.query(schemaSql);
    await probeRlsRole(rawPool);
    pool = bindRlsGuard(rawPool);
    await seedServiceCatalog(pool.query.bind(pool));
    await seedDemoData(pool.query.bind(pool));
    await pool.query(SERVICE_ELIGIBILITY_TRANSCRIPTION_SQL);
    await migrateLegacyPlatformAdmins(pool.query.bind(pool));
    await syncPlatformOperators(pool.query.bind(pool));
    await backfillRevenueLedger(pool.query.bind(pool));
    ready = true;
    console.info(describePgliteLocation(location, env.NODE_ENV));
    return true;
  } catch (error) {
    ready = false;
    console.error(
      "[db] Initialisation de la base de donn\xE9es \xE9chou\xE9e:",
      error instanceof Error ? error.message : "unknown"
    );
    if (env.NODE_ENV === "production" && env.DATABASE_URL) throw error;
    return false;
  }
}
var Pool, pool, pgliteInstance, ready, RLS_DIRECT_TABLES, RLS_PARENT_TABLES, RLS_NULLABLE_ORG_TABLES, RLS_CURRENT_ORG, schemaSql, SERVICE_ELIGIBILITY_TRANSCRIPTION_SQL;
var init_db = __esm({
  "server/db.ts"() {
    init_pglite_location();
    init_database_target();
    init_db_rls();
    init_env();
    init_console_auth();
    init_auth();
    init_default_catalog();
    ({ Pool } = pg);
    pool = null;
    pgliteInstance = null;
    ready = false;
    RLS_DIRECT_TABLES = [
      "subscriptions",
      "organization_members",
      "sites",
      "onboarding_progress",
      "service_categories",
      "vehicle_categories",
      "services",
      "workers",
      "work_schedules",
      "attendance_records",
      "customers",
      "washes",
      "receipt_issues",
      "notifications",
      "product_categories",
      "products",
      "stock_movements",
      "service_consumables",
      "payments",
      "cash_sessions",
      "cash_movements",
      "expenses",
      "utility_meters",
      "utility_readings",
      "utility_reading_photos",
      "suppliers",
      "purchases",
      "purchase_items",
      "idempotency_keys",
      "organization_branding",
      "member_permissions",
      "subscription_reminders",
      "payment_intents",
      "subscription_payments",
      "support_requests",
      "closure_requests",
      "audit_logs"
    ];
    RLS_PARENT_TABLES = [
      { table: "wash_items", parent: "washes", foreignKey: "wash_id" },
      { table: "wash_assignments", parent: "washes", foreignKey: "wash_id" },
      { table: "support_messages", parent: "support_requests", foreignKey: "request_id" },
      { table: "service_vehicle_prices", parent: "services", foreignKey: "service_id" }
    ];
    RLS_NULLABLE_ORG_TABLES = ["error_events", "platform_audit_logs"];
    RLS_CURRENT_ORG = "NULLIF(current_setting('app.current_org', true), '')::uuid";
    schemaSql = `
CREATE TABLE IF NOT EXISTS users (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid, email text NOT NULL, first_name text, last_name text, phone text,
 avatar_url text, status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
 password_hash text,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS organizations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 name text NOT NULL, slug text, onboarding_completed boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE users ADD COLUMN IF NOT EXISTS organization_id uuid;
ALTER TABLE users ADD COLUMN IF NOT EXISTS platform_admin boolean NOT NULL DEFAULT false;
CREATE TABLE IF NOT EXISTS plans (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), code text NOT NULL UNIQUE, name text NOT NULL,
 max_users integer, max_workers integer, max_sites integer, features jsonb NOT NULL DEFAULT '{}'::jsonb
);
ALTER TABLE plans ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE plans ADD COLUMN IF NOT EXISTS price_cents integer NOT NULL DEFAULT 0;
ALTER TABLE plans ADD COLUMN IF NOT EXISTS billing_cycle text NOT NULL DEFAULT 'monthly';
ALTER TABLE plans ADD COLUMN IF NOT EXISTS max_services integer;
ALTER TABLE plans ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;
-- Date de la derniere modification de prix decidee depuis la console.
--
-- Sans cette colonne, le seed ci-dessous ecraserait a chaque demarrage le
-- tarif qu'un operateur vient de changer : il se serait recouche sur la
-- valeur ecrite en dur, et personne n'aurait compris pourquoi. Tant qu'elle
-- est nulle, le forfait suit les valeurs livrees avec le produit ; des
-- qu'un operateur fixe un prix, c'est le sien qui fait foi.
ALTER TABLE plans ADD COLUMN IF NOT EXISTS price_overridden_at timestamptz;
-- Migration du forfait d'entr\xE9e : \xAB free \xBB (0 F) devient \xAB starter \xBB (10 000 F),
-- pour coller \xE0 la grille publique. Le renommage se fait AVANT le seed, sinon
-- ON CONFLICT(code) ins\xE9rerait un doublon en laissant \xAB free \xBB orphelin \u2014
-- or les abonnements existants pointent dessus par plan_id. En renommant,
-- les abonnements en cours suivent sans la moindre r\xE9\xE9criture.
UPDATE plans SET code='starter' WHERE code='free';
-- Chaque forfait est payant et ouvre un essai de 14 jours (voir
-- server/entitlements.ts). Prix en centimes : 10 000 F = 1 000 000.
INSERT INTO plans(code,name,description,price_cents,billing_cycle,max_users,max_workers,max_sites,max_services,sort_order,features) VALUES
 ('starter','Starter','Pour les petites stations qui veulent abandonner le cahier de caisse.',1000000,'monthly',2,3,1,10,1,'{"reports.advanced":false,"reports.export":false,"reports.consolidated":false,"audit.read":false,"sites.multiple":false,"stock.manage":false,"team.tracking":false}'::jsonb),
 ('pro','Pro','Pour les stations qui ont plusieurs laveurs et veulent mieux contr\xF4ler leurs op\xE9rations.',2000000,'monthly',10,20,1,NULL,2,'{"reports.advanced":true,"reports.export":true,"reports.consolidated":false,"audit.read":true,"sites.multiple":false,"stock.manage":true,"team.tracking":true}'::jsonb),
 ('business','Business','Pour les stations importantes ou les propri\xE9taires qui g\xE8rent plusieurs sites.',3500000,'monthly',NULL,NULL,NULL,NULL,3,'{"reports.advanced":true,"reports.export":true,"reports.consolidated":true,"audit.read":true,"sites.multiple":true,"stock.manage":true,"team.tracking":true}'::jsonb)
ON CONFLICT(code) DO UPDATE SET
 name=EXCLUDED.name, description=EXCLUDED.description,
 -- Un prix fixe depuis la console survit au redemarrage ; les autres suivent
 -- la grille livree avec le produit.
 price_cents=CASE WHEN plans.price_overridden_at IS NULL
                  THEN EXCLUDED.price_cents ELSE plans.price_cents END,
 billing_cycle=EXCLUDED.billing_cycle, max_users=EXCLUDED.max_users, max_workers=EXCLUDED.max_workers,
 max_sites=EXCLUDED.max_sites, max_services=EXCLUDED.max_services, sort_order=EXCLUDED.sort_order,
 features=EXCLUDED.features;
CREATE TABLE IF NOT EXISTS subscriptions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL UNIQUE REFERENCES organizations(id),
 plan_id uuid NOT NULL REFERENCES plans(id), status text NOT NULL DEFAULT 'trialing',
 current_period_end timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS plan_changed_at timestamptz;
UPDATE subscriptions SET plan_changed_at = created_at WHERE plan_changed_at IS NULL;
CREATE TABLE IF NOT EXISTS organization_members (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id),
 user_id uuid NOT NULL REFERENCES users(id), role text NOT NULL DEFAULT 'cashier',
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(user_id, organization_id)
);
CREATE TABLE IF NOT EXISTS sites (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id),
 name text NOT NULL, city text NOT NULL, address text, phone text, is_active boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE sites ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE sites ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE sites ADD COLUMN IF NOT EXISTS logo_url text;
ALTER TABLE sites ADD COLUMN IF NOT EXISTS slug text;
-- Identit\xE9 visuelle de la station : logo t\xE9l\xE9vers\xE9 depuis Param\xE8tres.
--
-- Le logo vit dans la base, pas sur un disque ni dans un compartiment objet.
-- L'application n'a jamais eu de stockage de fichiers \u2014 c'est ce qui permet de
-- la lancer en plusieurs exemplaires derri\xE8re un r\xE9partiteur et de sauvegarder
-- l'ensemble avec pg_dump. Un logo de 300 Ko au plus, born\xE9 par un CHECK :
-- la borne est dans la base, pas seulement dans la route qui l'\xE9crit.
--
-- Une seule ligne par organisation (organization_id en cl\xE9 primaire) :
-- t\xE9l\xE9verser un nouveau logo remplace le pr\xE9c\xE9dent, il n'y a jamais d'orphelin
-- \xE0 nettoyer.
CREATE TABLE IF NOT EXISTS organization_branding (
 organization_id uuid PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
 logo_mime_type text CHECK (logo_mime_type IN ('image/png','image/jpeg','image/webp')),
 logo_byte_size integer,
 logo_data bytea,
 logo_updated_at timestamptz,
 -- Couleur d'action choisie par la station (un des th\xE8mes de src/lib/palette.ts).
 -- NULL : l'application garde le bleu WashPilot.
 brand_color text CHECK (brand_color IS NULL OR brand_color IN ('bleu','indigo','violet','teal','emeraude','ambre','rose','ardoise')),
 -- Le logo, son type et sa taille sont indissociables : un octet sans type ne
 -- peut pas \xEAtre servi avec un Content-Type honn\xEAte, un type sans octet ne
 -- s'affiche pas, et une taille absente rendrait la limite inv\xE9rifiable.
 CHECK (
  (logo_data IS NULL AND logo_mime_type IS NULL AND logo_byte_size IS NULL)
  OR (logo_data IS NOT NULL AND logo_mime_type IS NOT NULL
      AND logo_byte_size BETWEEN 1 AND 300000)
 ),
 updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
 updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE organization_branding ADD COLUMN IF NOT EXISTS brand_color text
 CHECK (brand_color IS NULL OR brand_color IN ('bleu','indigo','violet','teal','emeraude','ambre','rose','ardoise'));
CREATE TABLE IF NOT EXISTS onboarding_progress (
  organization_id uuid PRIMARY KEY REFERENCES organizations(id), current_stage text NOT NULL DEFAULT 'station',
  station_data jsonb, services_data jsonb, workers_data jsonb, plan_code text, draft boolean NOT NULL DEFAULT false,
  completed_at timestamptz, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS service_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), category text NOT NULL, name text NOT NULL,
  price_cents integer, sort_order integer NOT NULL DEFAULT 0, is_active boolean NOT NULL DEFAULT true
);
-- Dur\xE9e et description : l'assistant cr\xE9ait des prestations sans dur\xE9e, donc
-- tous les lavages recevaient la m\xEAme heure de fin estim\xE9e, quel que soit le
-- service choisi. Ces deux colonnes viennent du catalogue et suivent la
-- prestation jusqu'\xE0 la station.
ALTER TABLE service_catalog ADD COLUMN IF NOT EXISTS duration_minutes integer;
ALTER TABLE service_catalog ADD COLUMN IF NOT EXISTS description text;
-- Le catalogue de r\xE9f\xE9rence ne doit pas se dupliquer \xE0 chaque d\xE9marrage.
-- Sans contrainte d'unicit\xE9, l'ancien \xAB ON CONFLICT DO NOTHING \xBB ne pouvait
-- jamais entrer en conflit : neuf lignes s'ajoutaient \xE0 chaque initialisation,
-- et l'assistant d'onboarding affichait le m\xEAme lavage plusieurs fois.
-- Le nettoyage pr\xE9c\xE8de l'index : cr\xE9er l'index sur une table d\xE9j\xE0 dupliqu\xE9e
-- \xE9chouerait, et il faut bien garder une ligne par prestation.
DELETE FROM service_catalog a USING service_catalog b
 WHERE a.category = b.category AND a.name = b.name AND a.ctid > b.ctid;
CREATE UNIQUE INDEX IF NOT EXISTS service_catalog_category_name_unique
  ON service_catalog(category, name);
-- Les prestations du catalogue sont sem\xE9es par seedServiceCatalog (voir plus
-- bas) : une seule liste, en TypeScript, partag\xE9e avec l'assistant et la
-- d\xE9monstration.
CREATE TABLE IF NOT EXISTS service_categories (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id),
 name text NOT NULL, is_active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(organization_id,name)
);
CREATE TABLE IF NOT EXISTS vehicle_categories (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id),
 name text NOT NULL, is_active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organization_id,name)
);
-- Famille et rang d'affichage.
--
-- La cat\xE9gorie reste l'unit\xE9 que l'on choisit \xE0 la caisse, mais c'est la
-- FAMILLE qui porte le tarif : une station saisit neuf prix (\xAB motos \xBB,
-- \xAB SUV \xBB, \xAB poids lourds \xBB\u2026) et non soixante et un. Sans cette colonne, le
-- catalogue serait plat et la tarification diff\xE9renci\xE9e ing\xE9rable.
-- Les codes de famille viennent de src/config/vehicle-taxonomy.ts ; la
-- colonne reste du texte libre pour qu'une station puisse ranger ses propres
-- cat\xE9gories dans une famille connue sans migration.
ALTER TABLE vehicle_categories ADD COLUMN IF NOT EXISTS family text;
ALTER TABLE vehicle_categories ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;
-- La table jumelle service_categories avait updated_at, pas celle-ci :
-- l'API renvoyait created_at AS updated_at, c'est-\xE0-dire une date fausse.
ALTER TABLE vehicle_categories ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
-- R\xE9tro-remplissage des cat\xE9gories d\xE9j\xE0 en base (Berline, SUV / 4x4, Moto\u2026).
-- L'ordre des r\xE8gles compte : \xAB Berline compacte \xBB doit rester une berline,
-- et \xAB SUV \xE9lectrique \xBB doit basculer c\xF4t\xE9 \xE9lectrique, pas c\xF4t\xE9 SUV. On
-- n'\xE9crit que sur les lignes sans famille : une famille choisie \xE0 la main
-- n'est jamais r\xE9\xE9crite au d\xE9marrage.
UPDATE vehicle_categories SET family = CASE
  WHEN lower(name) ~ '(\xE9lectrique|electrique|hybride)' THEN 'electriques'
  WHEN lower(name) ~ '(moto|scooter|cyclomoteur|tricycle|quad|deux-roues|deux roues)' THEN 'deux_roues'
  WHEN lower(name) ~ '(berline|break|monospace)' THEN 'berlines'
  WHEN lower(name) ~ '(citadine|mini|coup\xE9|coupe|cabriolet|compacte)' THEN 'petites_voitures'
  WHEN lower(name) ~ '(suv|crossover|4x4|tout-terrain|tout terrain|pick-up|pick up)' THEN 'suv'
  WHEN lower(name) ~ '(fourgon|utilitaire|fourgonnette)' THEN 'utilitaires'
  WHEN lower(name) ~ '(camion|semi-remorque|remorque|poids lourd)' THEN 'poids_lourds'
  WHEN lower(name) ~ '(taxi|vtc|minibus|autocar|bus|car)' THEN 'transport_personnes'
  WHEN lower(name) ~ '(tracteur|pelle|chargeuse|chariot|ambulance|blind\xE9|blinde|secours|chantier)' THEN 'speciaux'
  ELSE NULL END
WHERE family IS NULL;
CREATE INDEX IF NOT EXISTS idx_vehicle_categories_org_family
  ON vehicle_categories(organization_id, family);
CREATE TABLE IF NOT EXISTS services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id),
  category_id uuid REFERENCES service_categories(id), name text NOT NULL, description text,
  price_cents integer NOT NULL CHECK(price_cents >= 0), duration_minutes integer CHECK(duration_minutes BETWEEN 1 AND 1440),
  is_active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE services ADD COLUMN IF NOT EXISTS price_by_vehicle_type jsonb NOT NULL DEFAULT '{}'::jsonb;
-- Le type de service du catalogue choisi dans le formulaire. Le nom de la
-- prestation en d\xE9coule ; la cl\xE9 reste stable m\xEAme si le libell\xE9 du
-- catalogue change. Une ligne de catalogue disparue laisse 'template_id'
-- \xE0 NULL \u2014 jamais un pointeur cass\xE9.
ALTER TABLE services ADD COLUMN IF NOT EXISTS template_id uuid REFERENCES service_catalog(id) ON DELETE SET NULL;
-- \xC9ligibilit\xE9 et tarif, enfin distincts.
--
-- L'ancien mod\xE8le m\xEAlait les deux : 'price_by_vehicle_type' (cl\xE9s UUID de
-- cat\xE9gorie ou codes de famille) avec repli sur le prix de base. Une
-- cat\xE9gorie sans tarif restait donc utilisable \u2014 au prix de base \u2014 et une
-- cl\xE9 de famille rendait \xE9ligible toute la famille sans que personne ne
-- l'ait d\xE9cid\xE9. Ici, une ligne = \xAB cette prestation est autoris\xE9e pour
-- cette cat\xE9gorie de v\xE9hicule, \xE0 ce prix \xBB. Pas de ligne = pas
-- d'utilisation dans un lavage ; aucun repli ne contourne l'interdiction.
--
-- 'price_cents' et 'price_by_vehicle_type' restent en place (affichage,
-- compatibilit\xE9) mais ne d\xE9cident plus de l'\xE9ligibilit\xE9.
CREATE TABLE IF NOT EXISTS service_vehicle_prices (
  service_id uuid NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  vehicle_category_id uuid NOT NULL REFERENCES vehicle_categories(id) ON DELETE CASCADE,
  price_cents integer NOT NULL CHECK(price_cents >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (service_id, vehicle_category_id)
);
CREATE INDEX IF NOT EXISTS idx_service_vehicle_prices_category
  ON service_vehicle_prices(vehicle_category_id);
CREATE TABLE IF NOT EXISTS workers (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id),
 site_id uuid REFERENCES sites(id), first_name text NOT NULL, last_name text NOT NULL, phone text,
 role text NOT NULL DEFAULT 'car_washer', custom_role text, status text NOT NULL DEFAULT 'active',
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE workers ADD COLUMN IF NOT EXISTS district text;
ALTER TABLE workers ADD COLUMN IF NOT EXISTS joined_at date;
ALTER TABLE workers ADD COLUMN IF NOT EXISTS photo_url text;

-- Presences et horaires (module Equipes).
--
-- Les heures sont stockees en timestamptz. La Cote d'Ivoire est a UTC+0 toute
-- l'annee, sans heure d'ete : l'heure locale d'une station et l'heure UTC
-- coincident, et la minute du jour se derive sans conversion. Une station
-- hors de ce fuseau demanderait de porter le fuseau sur la station.
CREATE TABLE IF NOT EXISTS work_schedules (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id),
 site_id uuid REFERENCES sites(id),
 -- NULL : l'horaire vaut pour toute la station. Renseigne : il ne vaut que
 -- pour cette personne et prime sur celui de la station.
 worker_id uuid REFERENCES workers(id),
 -- NULL : tous les jours. 0 = dimanche, conformement a EXTRACT(DOW).
 day_of_week smallint CHECK(day_of_week IS NULL OR (day_of_week BETWEEN 0 AND 6)),
 -- Exception ponctuelle, qui prime sur le jour de la semaine.
 specific_date date,
 start_minute smallint NOT NULL CHECK(start_minute BETWEEN 0 AND 1439),
 end_minute smallint NOT NULL CHECK(end_minute BETWEEN 0 AND 1439),
 break_duration_minutes smallint NOT NULL DEFAULT 0 CHECK(break_duration_minutes >= 0),
 late_tolerance_minutes smallint NOT NULL DEFAULT 15 CHECK(late_tolerance_minutes >= 0),
 valid_from date NOT NULL DEFAULT CURRENT_DATE, valid_to date,
 created_by uuid REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS work_schedules_org_idx ON work_schedules(organization_id, site_id, worker_id);

CREATE TABLE IF NOT EXISTS attendance_records (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id),
 site_id uuid REFERENCES sites(id), worker_id uuid NOT NULL REFERENCES workers(id),
 work_date date NOT NULL,
 check_in_at timestamptz, check_out_at timestamptz,
 -- Pause reellement relevee, et non pause prevue par l'horaire : on ne
 -- retranche pas du temps de travail sur la foi d'un parametre.
 break_minutes smallint CHECK(break_minutes IS NULL OR break_minutes >= 0),
 status text NOT NULL DEFAULT 'present',
 absence_reason text, comment text,
 recorded_by uuid REFERENCES users(id),
 corrected_by uuid REFERENCES users(id), corrected_at timestamptz, correction_reason text,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 -- Un seul releve par personne et par jour. Une station qui ferait deux
 -- vacations dans la meme journee demanderait d'ajouter une plage a la cle ;
 -- le besoin n'existe pas et la contrainte protege des doublons de saisie.
 UNIQUE(worker_id, work_date)
);
ALTER TABLE attendance_records DROP CONSTRAINT IF EXISTS attendance_records_status_check;
ALTER TABLE attendance_records ADD CONSTRAINT attendance_records_status_check
 CHECK(status IN ('present','absent_declared','absent_justified','absent_unjustified','leave'));
CREATE INDEX IF NOT EXISTS attendance_records_org_date_idx ON attendance_records(organization_id, work_date DESC);

CREATE TABLE IF NOT EXISTS customers (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id),
 full_name text NOT NULL, phone text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS washes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id),
 site_id uuid NOT NULL REFERENCES sites(id), vehicle_category_id uuid REFERENCES vehicle_categories(id),
 customer_id uuid REFERENCES customers(id), status text NOT NULL DEFAULT 'completed',
 total_cents integer NOT NULL CHECK(total_cents >= 0), payment_method text NOT NULL DEFAULT 'cash',
 created_by uuid REFERENCES users(id), cancelled_at timestamptz, cancellation_reason text,
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE washes ADD COLUMN IF NOT EXISTS reference text;
ALTER TABLE washes ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'pending';
ALTER TABLE washes ADD COLUMN IF NOT EXISTS cancelled_by uuid REFERENCES users(id);
-- Avancement operationnel du lavage.
--
-- La colonne status reste le statut COMPTABLE : un lavage est enregistre quand
-- il est rendu, il est donc ne "completed" des sa creation, et les rapports,
-- le rendement et les encaissements s'appuient sur cette valeur. La changer
-- viderait les rapports d'une station entiere le jour ou elle commence a
-- enregistrer des lavages "en attente".
--
-- operation_status suit, lui, l'avancement PHYSIQUE de l'operation :
--   pending     -> en attente : le lavage est enregistre, la voiture attend
--   in_progress -> en cours   : le laveur a commence
--   completed   -> termine    : la voiture est prete
--
-- Le defaut est "completed" : les lavages deja enregistres sont termines, et
-- une migration ne doit pas les faire repasser "en attente". Seuls les
-- nouveaux lavages naissent explicitement en "pending".
ALTER TABLE washes ADD COLUMN IF NOT EXISTS operation_status text NOT NULL DEFAULT 'completed';
ALTER TABLE washes DROP CONSTRAINT IF EXISTS washes_operation_status_check;
ALTER TABLE washes ADD CONSTRAINT washes_operation_status_check
  CHECK(operation_status IN ('pending','in_progress','completed','overtime'));
ALTER TABLE washes ADD COLUMN IF NOT EXISTS queue_position integer;
ALTER TABLE washes ADD COLUMN IF NOT EXISTS completed_at timestamptz;
-- Depart du decompte.
--
-- Le decompte du temps de lavage commence quand quelqu'un clique sur la tache
-- a l'ecran : la colonne note cet instant, et l'ecran ne fait que le
-- recomparer a l'heure de l'horloge. Elle est donc remise a zero quand la
-- tache repasse en attente, et elle n'est jamais devinee.
ALTER TABLE washes ADD COLUMN IF NOT EXISTS operation_started_at timestamptz;
-- Duree estimee du lavage, en minutes.
--
-- C'est la somme des durees des prestations choisies au moment de
-- l'enregistrement. Elle est figee a l'ecriture, parce qu'une duree qui change
-- sous les pieds du compteur fait sauter la barre de progression : le
-- laveur verrait son temps restant changer sans qu'il ait rien demande.
ALTER TABLE washes ADD COLUMN IF NOT EXISTS estimated_minutes integer;
-- Nom du client, saisi au comptoir.
--
-- Une etiquette, et rien d'autre : ni telephone, ni historique, ni fiche. Le
-- produit ne tient pas de fichier client ; il note ce que le client veut
-- etre appele pendant que sa voiture est dans la station.
ALTER TABLE washes ADD COLUMN IF NOT EXISTS customer_name text;
-- Plaque du vehicule lave.
--
-- Le produit ne tient pas de fichier client : c'est la plaque, et elle seule,
-- qui permet de reconnaitre un vehicule qui revient. Deux colonnes : la forme
-- affichee, proche de ce qui a ete tape, et la cle reduite aux lettres et aux
-- chiffres, qui sert a regrouper. Sans elle, " 1234 ab 01 " et "1234-AB-01"
-- seraient deux vehicules differents.
ALTER TABLE washes ADD COLUMN IF NOT EXISTS plate text;
ALTER TABLE washes ADD COLUMN IF NOT EXISTS plate_key text;
CREATE UNIQUE INDEX IF NOT EXISTS idx_washes_org_reference ON washes(organization_id,reference);
CREATE INDEX IF NOT EXISTS idx_washes_org_plate ON washes(organization_id,plate_key,created_at DESC);
CREATE TABLE IF NOT EXISTS wash_items (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), wash_id uuid NOT NULL REFERENCES washes(id),
 service_id uuid REFERENCES services(id), service_name text NOT NULL, quantity integer NOT NULL CHECK(quantity > 0),
 unit_price_cents integer NOT NULL CHECK(unit_price_cents >= 0), line_total_cents integer NOT NULL CHECK(line_total_cents >= 0)
);
-- Emissions de recu.
--
-- Une ligne par impression, pas une par lavage : c'est le nombre de copies
-- qui compte. Un recu est une preuve de paiement, et deux papiers
-- indiscernables pour un seul versement permettent de justifier deux fois la
-- meme somme. La copie n.2 et les suivantes portent la mention DUPLICATA.
CREATE TABLE IF NOT EXISTS receipt_issues (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES organizations(id),
 wash_id uuid NOT NULL REFERENCES washes(id),
 copy_number integer NOT NULL CHECK(copy_number > 0),
 issued_by uuid REFERENCES users(id),
 issued_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(wash_id, copy_number)
);
CREATE INDEX IF NOT EXISTS receipt_issues_wash_idx ON receipt_issues(wash_id, copy_number DESC);

-- Notifications persist\xE9es
CREATE TABLE IF NOT EXISTS notifications (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id),
 user_id uuid REFERENCES users(id),
 site_id uuid REFERENCES sites(id),
 type text NOT NULL,
 title text NOT NULL,
 message text NOT NULL,
 entity_type text,
 entity_id uuid,
 read_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notifications_org_user_created ON notifications(organization_id, user_id, created_at DESC);

-- ------------------------------------------------------------------ stock --
-- Regle structurelle : il n'existe NULLE PART une colonne \xAB quantite en
-- stock \xBB. Le stock d'un produit est toujours la somme des mouvements qui le
-- concernent. Aucune ecriture directe n'est donc possible, ni par l'API, ni
-- par une requete manuelle distraite : pour changer un stock il faut laisser
-- une trace datee, signee et motivee.
CREATE TABLE IF NOT EXISTS product_categories (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id),
 name text NOT NULL, is_active boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(organization_id,name)
);
CREATE TABLE IF NOT EXISTS products (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id),
 category_id uuid REFERENCES product_categories(id),
 name text NOT NULL,
 -- Unite de mesure affichee. Les quantites sont stockees en milliemes de
 -- cette unite (1 litre = 1000), pour la meme raison que l'argent est stocke
 -- en centimes : un entier exact plutot qu'un flottant approximatif.
 unit text NOT NULL DEFAULT 'unite' CHECK(unit IN ('unite','litre','kilogramme')),
 unit_cost_cents integer NOT NULL DEFAULT 0 CHECK(unit_cost_cents >= 0),
 low_stock_threshold_milli integer NOT NULL DEFAULT 0 CHECK(low_stock_threshold_milli >= 0),
 is_active boolean NOT NULL DEFAULT true,
 created_by uuid REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organization_id,name)
);
-- Date du dernier realignement du cout de reference sur un prix reellement
-- paye. Sert a dire a l'ecran d'ou vient le chiffre : un cout saisi a la main
-- il y a six mois et un cout confirme par l'achat de mardi ne meritent pas la
-- meme confiance.
ALTER TABLE products ADD COLUMN IF NOT EXISTS unit_cost_updated_at timestamptz;
CREATE TABLE IF NOT EXISTS stock_movements (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id),
 product_id uuid NOT NULL REFERENCES products(id), site_id uuid REFERENCES sites(id),
 -- initial   : stock d'ouverture a la creation du produit
 -- entry     : entree manuelle (correction, retour)
 -- exit      : sortie manuelle (consommation, perte, casse)
 -- inventory : ecart constate lors d'un comptage physique
 -- reversal  : contrepassation d'un mouvement precedent
 kind text NOT NULL CHECK(kind IN ('initial','entry','exit','inventory','reversal')),
 -- Signe : positif pour une entree, negatif pour une sortie. Jamais zero,
 -- un mouvement nul n'aurait rien a dire.
 quantity_milli integer NOT NULL CHECK(quantity_milli <> 0),
 -- Instantane du cout unitaire au moment du mouvement, exactement comme
 -- wash_items fige le prix d'une prestation. Changer le cout d'un produit
 -- demain ne doit pas reecrire la valeur des sorties d'hier.
 unit_cost_cents integer NOT NULL DEFAULT 0 CHECK(unit_cost_cents >= 0),
 reason text, reference text,
 reverses_movement_id uuid REFERENCES stock_movements(id),
 created_by uuid REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS stock_movements_product_idx ON stock_movements(organization_id, product_id, created_at DESC);
-- Un mouvement ne peut etre contrepasse qu'une seule fois.
CREATE UNIQUE INDEX IF NOT EXISTS stock_movements_reversal_idx ON stock_movements(reverses_movement_id) WHERE reverses_movement_id IS NOT NULL;

-- En Cote d'Ivoire les stations achetent de la lessive en sachets : l'unite
-- reelle de comptage est le sachet, pas le litre. Les contraintes posees a la
-- creation des tables sont elargies ici, pour que les bases deja en service
-- soient migrees au demarrage au lieu de refuser les nouvelles valeurs.
ALTER TABLE products DROP CONSTRAINT IF EXISTS products_unit_check;
ALTER TABLE products ADD CONSTRAINT products_unit_check
  CHECK (unit IN ('unite','sachet','litre','kilogramme'));

-- Genre << consumption >> : sortie automatique declenchee par l'enregistrement d'un
-- lavage. Elle se distingue d'une sortie manuelle parce qu'elle n'est jamais
-- refusee : le produit a reellement ete utilise.
ALTER TABLE stock_movements DROP CONSTRAINT IF EXISTS stock_movements_kind_check;
ALTER TABLE stock_movements ADD CONSTRAINT stock_movements_kind_check
  CHECK (kind IN ('initial','entry','exit','inventory','reversal','consumption'));

-- Ce qu'une prestation consomme. C'est une recette : << un lavage complet
-- utilise 2 sachets d'Omo >>. Elle ne touche pas au prix du service, qui
-- reste fixe a la main dans la fiche de prestation.
CREATE TABLE IF NOT EXISTS service_consumables (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id),
 service_id uuid NOT NULL REFERENCES services(id), product_id uuid NOT NULL REFERENCES products(id),
 quantity_milli integer NOT NULL CHECK(quantity_milli > 0),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(service_id, product_id)
);
CREATE INDEX IF NOT EXISTS service_consumables_service_idx ON service_consumables(organization_id, service_id);
-- Rattache un mouvement au lavage qui l'a provoque : indispensable pour
-- contrepasser exactement ce qui a ete deduit quand le lavage est annule.
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS wash_id uuid REFERENCES washes(id);
CREATE INDEX IF NOT EXISTS stock_movements_wash_idx ON stock_movements(wash_id) WHERE wash_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS wash_assignments (
 wash_id uuid NOT NULL REFERENCES washes(id), worker_id uuid NOT NULL REFERENCES workers(id), PRIMARY KEY(wash_id,worker_id)
);
-- La table d'affectation existait deja : on l'etend plutot que d'en creer une
-- seconde. Les colonnes ont une valeur par defaut, donc les affectations
-- deja enregistrees restent valides et deviennent des participations.
ALTER TABLE wash_assignments ADD COLUMN IF NOT EXISTS assignment_role text NOT NULL DEFAULT 'participant';
ALTER TABLE wash_assignments ADD COLUMN IF NOT EXISTS assigned_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE wash_assignments ADD COLUMN IF NOT EXISTS assigned_by uuid REFERENCES users(id);
ALTER TABLE wash_assignments DROP CONSTRAINT IF EXISTS wash_assignments_role_check;
ALTER TABLE wash_assignments ADD CONSTRAINT wash_assignments_role_check
 CHECK(assignment_role IN ('principal','participant'));
-- Un lavage n'a qu'un responsable principal, ou aucun.
CREATE UNIQUE INDEX IF NOT EXISTS wash_assignments_principal_idx
 ON wash_assignments(wash_id) WHERE assignment_role = 'principal';
CREATE TABLE IF NOT EXISTS payments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id),
 wash_id uuid NOT NULL REFERENCES washes(id), method text NOT NULL, amount_cents integer NOT NULL CHECK(amount_cents >= 0),
 status text NOT NULL DEFAULT 'completed', created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS reference text;
CREATE TABLE IF NOT EXISTS cash_sessions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id),
 site_id uuid NOT NULL REFERENCES sites(id), opened_by uuid REFERENCES users(id), closed_by uuid REFERENCES users(id),
 opening_amount_cents integer NOT NULL CHECK(opening_amount_cents >= 0), closing_amount_cents integer,
 expected_amount_cents integer, status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','closed')),
 opened_at timestamptz NOT NULL DEFAULT now(), closed_at timestamptz
);
ALTER TABLE cash_sessions ADD COLUMN IF NOT EXISTS discrepancy_reason text;
CREATE TABLE IF NOT EXISTS cash_movements (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id),
 cash_session_id uuid NOT NULL REFERENCES cash_sessions(id), type text NOT NULL CHECK(type IN ('entry','exit')),
 amount_cents integer NOT NULL CHECK(amount_cents > 0), source text NOT NULL, description text,
 wash_id uuid REFERENCES washes(id), created_by uuid REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now()
);
-- Pas de table \xAB expense_categories \xBB : la liste des cat\xE9gories de d\xE9pense est
-- un vocabulaire ferm\xE9, port\xE9 par le code (EXPENSE_CATEGORIES, c\xF4t\xE9 serveur et
-- c\xF4t\xE9 interface). C'est d\xE9lib\xE9r\xE9 : les rapports agr\xE8gent les d\xE9penses par
-- cat\xE9gorie, et une liste libre par station rendrait ces totaux incomparables
-- d'une station \xE0 l'autre. La table existait sans \xEAtre ni \xE9crite ni lue ; la
-- garder aurait laiss\xE9 croire \xE0 un r\xE9f\xE9rentiel modifiable qui n'existait pas.
CREATE TABLE IF NOT EXISTS expenses (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id),
 site_id uuid NOT NULL REFERENCES sites(id), category text NOT NULL, amount_cents integer NOT NULL CHECK(amount_cents > 0),
 payment_method text NOT NULL, cash_session_id uuid REFERENCES cash_sessions(id), description text,
 status text NOT NULL DEFAULT 'completed', created_by uuid REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE expenses ALTER COLUMN site_id DROP NOT NULL;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS beneficiary text;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS reference text;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS expense_date date NOT NULL DEFAULT CURRENT_DATE;
ALTER TABLE cash_movements ADD COLUMN IF NOT EXISTS expense_id uuid REFERENCES expenses(id);

-- Fournisseurs et achats (L5).
CREATE TABLE IF NOT EXISTS suppliers (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id),
 name text NOT NULL, phone text, contact_name text, notes text,
 is_active boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organization_id,name)
);
CREATE TABLE IF NOT EXISTS purchases (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id),
 site_id uuid REFERENCES sites(id), supplier_id uuid REFERENCES suppliers(id),
 reference text NOT NULL, invoice_reference text,
 purchase_date date NOT NULL DEFAULT CURRENT_DATE,
 total_cents integer NOT NULL CHECK(total_cents >= 0),
 payment_method text NOT NULL, cash_session_id uuid REFERENCES cash_sessions(id),
 status text NOT NULL DEFAULT 'received',
 cancelled_at timestamptz, cancellation_reason text, cancelled_by uuid REFERENCES users(id),
 created_by uuid REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organization_id,reference)
);
CREATE INDEX IF NOT EXISTS purchases_org_date_idx ON purchases(organization_id, purchase_date DESC);
-- La colonne porte le mot \xAB recu \xBB et non \xAB commande \xBB : c'est la regle du
-- metier inscrite dans le schema. Seul ce qui est entre dans le magasin
-- augmente le stock, jamais ce qui a ete commande.
CREATE TABLE IF NOT EXISTS purchase_items (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id),
 purchase_id uuid NOT NULL REFERENCES purchases(id), product_id uuid NOT NULL REFERENCES products(id),
 product_name_snapshot text NOT NULL,
 received_milli integer NOT NULL CHECK(received_milli > 0),
 unit_cost_cents integer NOT NULL CHECK(unit_cost_cents >= 0),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS purchase_items_purchase_idx ON purchase_items(purchase_id);
-- Rattache l'entree de stock a l'achat qui l'a provoquee, exactement comme
-- wash_id rattache une sortie au lavage : meme lecture dans les deux sens.
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS purchase_id uuid REFERENCES purchases(id);
CREATE INDEX IF NOT EXISTS stock_movements_purchase_idx ON stock_movements(purchase_id) WHERE purchase_id IS NOT NULL;
-- Un achat produit UNE depense et une seule. Ce lien est ce qui rend le
-- double comptage impossible : la depense n'est pas ressaisie a la main.
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS purchase_id uuid REFERENCES purchases(id);
CREATE UNIQUE INDEX IF NOT EXISTS expenses_purchase_unique ON expenses(purchase_id) WHERE purchase_id IS NOT NULL;

-- Compteurs d'eau et d'\xE9lectricit\xE9 : un CIE et un SODECI maximum par site.
-- Les index sont stock\xE9s en milli\xE8mes d'unit\xE9 (kWh ou m\xB3) pour conserver
-- exactement les relev\xE9s d\xE9cimaux, sans jamais estimer un tarif fournisseur.
CREATE TABLE IF NOT EXISTS utility_meters (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 site_id uuid NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
 provider text NOT NULL CHECK (provider IN ('cie','sodeci')),
 meter_number text NOT NULL,
 is_active boolean NOT NULL DEFAULT true,
 created_by uuid REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(site_id, provider)
);
CREATE INDEX IF NOT EXISTS utility_meters_org_idx ON utility_meters(organization_id, site_id, provider);

CREATE TABLE IF NOT EXISTS utility_readings (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 meter_id uuid NOT NULL REFERENCES utility_meters(id) ON DELETE CASCADE,
 reading_date date NOT NULL,
 index_milli bigint NOT NULL CHECK (index_milli >= 0),
 notes text,
 anomaly_comment text,
 created_by uuid REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(meter_id, reading_date)
);
CREATE INDEX IF NOT EXISTS utility_readings_org_date_idx ON utility_readings(organization_id, reading_date DESC);
CREATE INDEX IF NOT EXISTS utility_readings_meter_date_idx ON utility_readings(meter_id, reading_date DESC);
ALTER TABLE utility_readings ADD COLUMN IF NOT EXISTS cash_session_id uuid REFERENCES cash_sessions(id);
ALTER TABLE utility_readings ADD COLUMN IF NOT EXISTS anomaly_comment text;
CREATE INDEX IF NOT EXISTS utility_readings_cash_session_idx ON utility_readings(cash_session_id) WHERE cash_session_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS utility_readings_id_org_key ON utility_readings(id, organization_id);

-- Le binaire reste hors des listes de relev\xE9s. La cl\xE9 \xE9trang\xE8re compos\xE9e
-- garantit qu'une photo ne peut pas viser le relev\xE9 d'une autre organisation.
CREATE TABLE IF NOT EXISTS utility_reading_photos (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL,
 reading_id uuid NOT NULL UNIQUE,
 mime_type text NOT NULL CHECK (mime_type IN ('image/jpeg', 'image/webp')),
 byte_size integer NOT NULL CHECK (byte_size BETWEEN 1 AND 300000),
 photo_data bytea NOT NULL,
 created_by uuid REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY (reading_id, organization_id) REFERENCES utility_readings(id, organization_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS utility_reading_photos_org_idx ON utility_reading_photos(organization_id, created_at DESC);

-- La facture r\xE9elle devient une d\xE9pense \xAB utilities \xBB. Ce lien unique emp\xEAche
-- qu'un m\xEAme relev\xE9 factur\xE9 soit comptabilis\xE9 deux fois, m\xEAme en cas de rejeu.
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS utility_reading_id uuid;
DO $$ BEGIN
 ALTER TABLE expenses ADD CONSTRAINT expenses_utility_reading_fk
  FOREIGN KEY (utility_reading_id) REFERENCES utility_readings(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS expenses_utility_reading_unique
 ON expenses(utility_reading_id) WHERE utility_reading_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS idempotency_keys (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id),
 key text NOT NULL, fingerprint text NOT NULL, response_status integer, response_body jsonb,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(organization_id,key)
);
-- D\xE9sactivation d'un membre sans suppression du compte : ses requ\xEAtes
-- prot\xE9g\xE9es sont refus\xE9es d\xE8s le middleware d'appartenance.
ALTER TABLE organization_members ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';
ALTER TABLE organization_members ADD COLUMN IF NOT EXISTS disabled_at timestamptz;
ALTER TABLE organization_members ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES users(id);

-- Exceptions de permissions accord\xE9es (ou retir\xE9es) par le propri\xE9taire \xE0 un
-- membre pr\xE9cis : granted = false retire une permission venant du r\xF4le.
CREATE TABLE IF NOT EXISTS member_permissions (
 organization_id uuid NOT NULL REFERENCES organizations(id),
 user_id uuid NOT NULL REFERENCES users(id),
 permission text NOT NULL,
 granted boolean NOT NULL DEFAULT true,
 granted_by uuid REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (organization_id, user_id, permission)
);
CREATE INDEX IF NOT EXISTS idx_member_permissions_user ON member_permissions(organization_id,user_id);

-- Relances d'\xE9ch\xE9ance d'abonnement : une ligne par relance r\xE9ellement envoy\xE9e,
-- ce qui garantit qu'une m\xEAme station n'est jamais relanc\xE9e deux fois.
CREATE TABLE IF NOT EXISTS subscription_reminders (
 organization_id uuid NOT NULL REFERENCES organizations(id),
 kind text NOT NULL,
 sent_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (organization_id, kind)
);
-- Intentions de paiement d'abonnement.
--
-- Une ligne est creee des que le client declare vouloir payer, AVANT tout
-- encaissement. Elle sert de point de rendez-vous entre trois acteurs qui ne
-- se parlent pas : le client qui paie sur son telephone, l'agregateur qui
-- confirme par webhook, et l'editeur qui valide a la main quand il n'y a pas
-- d'agregateur.
--
-- La colonne reference est UNIQUE : c'est elle qui rend l'encaissement
-- idempotent. Un
-- webhook rejoue deux fois (retransmission reseau, chose courante ici) ne
-- doit jamais activer deux mois au lieu d'un.
CREATE TABLE IF NOT EXISTS payment_intents (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 reference text NOT NULL UNIQUE,
 plan_code text NOT NULL,
 months integer NOT NULL DEFAULT 1,
 amount_cents integer NOT NULL,
 provider text NOT NULL DEFAULT 'manual',
 status text NOT NULL DEFAULT 'pending',
 provider_transaction_id text,
 declared_reference text,
 declared_at timestamptz,
 created_by uuid REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 settled_at timestamptz,
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS payment_intents_org_idx ON payment_intents(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS payment_intents_status_idx ON payment_intents(status, created_at DESC);

-- Registre des encaissements d'abonnement : la seule source de verite du
-- chiffre d'affaires. Toute activation y ecrit une ligne, quel que soit son
-- chemin -- parcours client, saisie console, futur webhook -- parce que
-- 'activateSubscription()' est le point de passage unique.
--
-- Pourquoi une table a part plutot que 'payment_intents' : une intention est
-- une *demande de payer*, qui peut echouer ou rester en attente. Le registre
-- n'accueille que de l'argent recu. Les compter ensemble ferait apparaitre
-- dans le chiffre d'affaires des paiements jamais arrives.
--
-- 'organization_id' est volontairement sans cle etrangere et nullable :
-- l'ecriture comptable doit survivre a la suppression de la station, sinon
-- purger un client ferait disparaitre le chiffre d'affaires deja encaisse.
-- 'organization_name' en conserve une copie lisible.
CREATE TABLE IF NOT EXISTS subscription_payments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid,
 organization_name text NOT NULL,
 plan_code text NOT NULL,
 plan_name text NOT NULL,
 -- Negatif pour une annulation : on contrepasse, on ne supprime pas.
 amount_cents bigint NOT NULL,
 months integer NOT NULL,
 -- Periode couverte par l'encaissement : c'est elle qui permet d'etaler le
 -- revenu reconnu mois par mois, independamment de la date d'encaissement.
 period_start timestamptz NOT NULL,
 period_end timestamptz NOT NULL,
 channel text NOT NULL DEFAULT 'other',
 payment_reference text,
 payment_intent_id uuid,
 source text NOT NULL,
 operator_email text,
 actor_user_id uuid,
 note text,
 -- Contrepassation : 'reverses_id' pointe la ligne annulee.
 reverses_id uuid REFERENCES subscription_payments(id) ON DELETE SET NULL,
 occurred_at timestamptz NOT NULL DEFAULT now(),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS subscription_payments_when_idx ON subscription_payments(occurred_at DESC);
CREATE INDEX IF NOT EXISTS subscription_payments_org_idx ON subscription_payments(organization_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS subscription_payments_period_idx ON subscription_payments(period_start, period_end);

-- Demandes d'assistance.
--
-- Jusqu'ici une demande d'aide etait un message WhatsApp : aucune trace, donc
-- aucun moyen de savoir combien de demandes sont ouvertes, depuis quand, ni
-- si l'engagement de delai a ete tenu. WhatsApp reste le canal de discussion ;
-- cette table lui donne une memoire.
CREATE TABLE IF NOT EXISTS support_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 created_by uuid REFERENCES users(id) ON DELETE SET NULL,
 subject text NOT NULL,
 category text NOT NULL DEFAULT 'autre',
 status text NOT NULL DEFAULT 'open',
 -- Forfait au moment de la demande, fige volontairement : l'engagement a ete
 -- pris sous ce forfait. Si le client retrograde ensuite, la promesse tient.
 plan_code text,
 commitment_hours integer NOT NULL,
 response_due_at timestamptz NOT NULL,
 first_responded_at timestamptz,
 resolved_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
-- La file de la console : les demandes ouvertes, la plus urgente d'abord.
CREATE INDEX IF NOT EXISTS support_requests_queue_idx ON support_requests(status, response_due_at);
CREATE INDEX IF NOT EXISTS support_requests_org_idx ON support_requests(organization_id, created_at DESC);

-- Messages d'un fil d'assistance.
--
-- 'internal' marque une note que le client ne doit jamais voir. Aucune
-- contrainte CHECK ici : 'ON DELETE SET NULL' sur l'auteur declencherait une
-- revalidation et ferait echouer la suppression du compte.
CREATE TABLE IF NOT EXISTS support_messages (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 request_id uuid NOT NULL REFERENCES support_requests(id) ON DELETE CASCADE,
 author_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
 author_operator_email text,
 internal boolean NOT NULL DEFAULT false,
 body text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS support_messages_thread_idx ON support_messages(request_id, created_at);

-- Supervision : compteurs agreges de toutes les requetes.
--
-- Agreger par tranche de cinq minutes plutot qu'echantillonner donne des taux
-- exacts pour un volume borne par le nombre de routes, et non par le trafic.
-- C'est la normalisation des chemins (voir normalizeRoute) qui rend cette
-- borne possible : sans elle, chaque identifiant creerait sa propre ligne.
CREATE TABLE IF NOT EXISTS request_metrics (
 bucket_start timestamptz NOT NULL,
 method text NOT NULL,
 route text NOT NULL,
 status_class text NOT NULL,
 requests bigint NOT NULL DEFAULT 0,
 total_duration_ms bigint NOT NULL DEFAULT 0,
 max_duration_ms integer NOT NULL DEFAULT 0,
 slow_requests integer NOT NULL DEFAULT 0,
 PRIMARY KEY (bucket_start, method, route, status_class)
);
CREATE INDEX IF NOT EXISTS request_metrics_when_idx ON request_metrics(bucket_start DESC);

-- Supervision : detail des pannes et des lenteurs.
--
-- 'request_body' est masque avant ecriture (voir redactBody) : aucun mot de
-- passe n'y entre jamais. Le reste du corps est conserve, parce que c'est ce
-- qui permet de reproduire un bug a l'identique.
--
-- Pas de cle etrangere sur organization_id : l'ecriture a lieu dans le
-- gestionnaire d'erreurs, ou une contrainte qui echoue ferait perdre la trace
-- de l'incident qu'on essaie justement d'enregistrer. La purge d'une station
-- supprime ses lignes (voir PURGE_ORDER).
CREATE TABLE IF NOT EXISTS error_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 kind text NOT NULL DEFAULT 'error',
 method text NOT NULL,
 route text NOT NULL,
 path text NOT NULL,
 status integer NOT NULL,
 code text NOT NULL,
 message text NOT NULL,
 stack text,
 duration_ms integer NOT NULL DEFAULT 0,
 organization_id uuid,
 user_id uuid,
 operator_email text,
 request_body jsonb,
 occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS error_events_when_idx ON error_events(occurred_at DESC);
CREATE INDEX IF NOT EXISTS error_events_route_idx ON error_events(route, occurred_at DESC);
CREATE INDEX IF NOT EXISTS error_events_org_idx ON error_events(organization_id, occurred_at DESC);
-- Une ligne ne peut etre contrepassee qu'une fois.
CREATE UNIQUE INDEX IF NOT EXISTS subscription_payments_reverses_idx
 ON subscription_payments(reverses_id) WHERE reverses_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Console de l'\xE9diteur
--
-- Les comptes d'administration ne sont PAS des lignes de 'users'. C'\xE9tait le
-- cas avant : un drapeau 'platform_admin' pos\xE9 sur un compte de station. Ce
-- mod\xE8le liait l'administration du parc \xE0 l'exploitation d'un lavage \u2014 une
-- session de station ouvrait le back-office, et le compte de l'\xE9diteur
-- tra\xEEnait dans la liste des membres d'une organisation.
--
-- Deux tables s\xE9par\xE9es, donc, avec leurs propres sessions : aucune session de
-- station ne peut ouvrir la console, et aucune session de console ne peut
-- \xE9crire dans une station par les routes ordinaires.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS platform_operators (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 email text NOT NULL UNIQUE, password_hash text, full_name text NOT NULL DEFAULT '',
 status text NOT NULL DEFAULT 'active',
 role text NOT NULL DEFAULT 'admin',
 managed_by text NOT NULL DEFAULT 'bootstrap',
 last_login_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
-- Les comptes historiques deviennent administrateurs : ils avaient d\xE9j\xE0 tous
-- les droits. Les comptes cr\xE9\xE9s depuis la Console sont marqu\xE9s \xAB console \xBB
-- pour ne pas \xEAtre d\xE9sactiv\xE9s par la prochaine synchro PLATFORM_ADMIN_EMAILS.
ALTER TABLE platform_operators ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'admin';
ALTER TABLE platform_operators ADD COLUMN IF NOT EXISTS managed_by text NOT NULL DEFAULT 'bootstrap';
ALTER TABLE platform_operators DROP CONSTRAINT IF EXISTS platform_operators_role_check;
ALTER TABLE platform_operators ADD CONSTRAINT platform_operators_role_check CHECK(role IN ('admin','supervisor','support'));
ALTER TABLE platform_operators DROP CONSTRAINT IF EXISTS platform_operators_managed_by_check;
ALTER TABLE platform_operators ADD CONSTRAINT platform_operators_managed_by_check CHECK(managed_by IN ('bootstrap','console'));
CREATE TABLE IF NOT EXISTS platform_operator_sessions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 operator_id uuid NOT NULL REFERENCES platform_operators(id) ON DELETE CASCADE,
 token_hash text NOT NULL UNIQUE, expires_at timestamptz NOT NULL,
 last_used_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS platform_operator_sessions_op_idx ON platform_operator_sessions(operator_id);

-- Journal de la console. Distinct de 'audit_logs', qui appartient au client.
--
-- Les deux sont aliment\xE9s : le client doit voir chez lui qu'on a touch\xE9 \xE0 son
-- forfait (pas de porte d\xE9rob\xE9e), et l'\xE9diteur doit pouvoir relire ses propres
-- actions sans parcourir les journaux de trois cents stations. Celui-ci
-- survit \xE0 la purge d'une organisation : c'est la trace qu'elle a exist\xE9.
CREATE TABLE IF NOT EXISTS platform_audit_logs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 operator_id uuid REFERENCES platform_operators(id) ON DELETE SET NULL,
 operator_email text NOT NULL, action text NOT NULL,
 organization_id uuid, organization_name text,
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS platform_audit_logs_created_idx ON platform_audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS platform_audit_logs_org_idx ON platform_audit_logs(organization_id, created_at DESC);

-- Alertes proactives de supervision. Les secrets Resend / WhatsApp restent
-- dans l'environnement ; la Console ne r\xE8gle que les seuils et destinataires.
CREATE TABLE IF NOT EXISTS platform_alert_settings (
 id integer PRIMARY KEY DEFAULT 1 CHECK(id = 1),
 enabled boolean NOT NULL DEFAULT false,
 error_rate_percent numeric(6,2) NOT NULL DEFAULT 5,
 min_requests integer NOT NULL DEFAULT 20,
 slow_request_count integer NOT NULL DEFAULT 5,
 window_minutes integer NOT NULL DEFAULT 15,
 cooldown_minutes integer NOT NULL DEFAULT 60,
 email_recipients text[] NOT NULL DEFAULT '{}',
 whatsapp_recipients text[] NOT NULL DEFAULT '{}',
 updated_by uuid REFERENCES platform_operators(id) ON DELETE SET NULL,
 updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO platform_alert_settings(id) VALUES(1) ON CONFLICT(id) DO NOTHING;
CREATE TABLE IF NOT EXISTS platform_alert_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 fingerprint text NOT NULL,
 kind text NOT NULL,
 severity text NOT NULL,
 title text NOT NULL,
 message text NOT NULL,
 metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
 deliveries jsonb NOT NULL DEFAULT '[]'::jsonb,
 triggered_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS platform_alert_events_fingerprint_idx
 ON platform_alert_events(fingerprint, triggered_at DESC);
CREATE INDEX IF NOT EXISTS platform_alert_events_when_idx ON platform_alert_events(triggered_at DESC);

-- Rapprochement avec les relev\xE9s d'un agr\xE9gateur. Aucun montant comptable
-- n'est r\xE9\xE9crit : le moteur rapproche des r\xE9f\xE9rences et consigne les \xE9carts.
CREATE TABLE IF NOT EXISTS reconciliation_batches (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 provider text NOT NULL,
 source_name text,
 period_start timestamptz NOT NULL,
 period_end timestamptz NOT NULL,
 status text NOT NULL DEFAULT 'completed',
 total_rows integer NOT NULL DEFAULT 0,
 matched_rows integer NOT NULL DEFAULT 0,
 discrepancy_rows integer NOT NULL DEFAULT 0,
 ignored_rows integer NOT NULL DEFAULT 0,
 created_by uuid REFERENCES platform_operators(id) ON DELETE SET NULL,
 created_by_email text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS reconciliation_batches_when_idx ON reconciliation_batches(created_at DESC);
CREATE TABLE IF NOT EXISTS provider_statement_entries (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 batch_id uuid NOT NULL REFERENCES reconciliation_batches(id) ON DELETE CASCADE,
 line_number integer NOT NULL,
 provider_reference text,
 merchant_reference text,
 amount_cents bigint NOT NULL,
 currency text NOT NULL DEFAULT 'XOF',
 provider_status text NOT NULL,
 occurred_at timestamptz,
 raw jsonb NOT NULL DEFAULT '{}'::jsonb,
 UNIQUE(batch_id, line_number)
);
CREATE INDEX IF NOT EXISTS provider_statement_merchant_idx ON provider_statement_entries(merchant_reference);
CREATE TABLE IF NOT EXISTS reconciliation_discrepancies (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 batch_id uuid NOT NULL REFERENCES reconciliation_batches(id) ON DELETE CASCADE,
 statement_entry_id uuid REFERENCES provider_statement_entries(id) ON DELETE SET NULL,
 payment_id uuid,
 payment_intent_id uuid,
 kind text NOT NULL,
 reference text,
 organization_name text,
 expected_amount_cents bigint,
 actual_amount_cents bigint,
 details text NOT NULL,
 status text NOT NULL DEFAULT 'open',
 resolution_note text,
 resolved_by uuid REFERENCES platform_operators(id) ON DELETE SET NULL,
 resolved_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS reconciliation_discrepancies_open_idx ON reconciliation_discrepancies(status, created_at DESC);
ALTER TABLE subscription_payments ADD COLUMN IF NOT EXISTS reconciled_at timestamptz;
ALTER TABLE subscription_payments ADD COLUMN IF NOT EXISTS reconciliation_batch_id uuid;
CREATE TABLE IF NOT EXISTS reconciliation_runs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 trigger_kind text NOT NULL,
 status text NOT NULL,
 error text,
 batch_id uuid REFERENCES reconciliation_batches(id) ON DELETE SET NULL,
 started_at timestamptz NOT NULL DEFAULT now(),
 finished_at timestamptz
);
CREATE INDEX IF NOT EXISTS reconciliation_runs_when_idx ON reconciliation_runs(started_at DESC);


-- Suppression en deux temps.
--
-- 'deletion_requested_at' coupe l'acc\xE8s imm\xE9diatement ; l'effacement physique
-- n'a lieu qu'\xE0 'deletion_scheduled_for'. Entre les deux, le client est
-- restaurable d'un clic. Une suppression d\xE9cid\xE9e sur un malentendu \u2014 un
-- paiement cru perdu, un homonyme \u2014 reste rattrapable.
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS deletion_requested_at timestamptz;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS deletion_scheduled_for timestamptz;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS deletion_reason text;
CREATE INDEX IF NOT EXISTS organizations_deletion_idx ON organizations(deletion_scheduled_for)
 WHERE deletion_scheduled_for IS NOT NULL;

-- Demandes de cloture emises par le client lui-meme.
--
-- A distinguer de la suppression ci-dessus, qui est une decision de
-- l'editeur et coupe l'acces aussitot. Ici le gerant signale qu'il veut
-- partir : rien ne s'arrete, il continue d'encaisser normalement. C'est
-- l'editeur qui programmera la cloture, ou qui refusera en expliquant
-- pourquoi. Le client peut se raviser tant que personne n'a tranche.
--
-- Une seule demande ouverte a la fois, garantie par l'index partiel plus bas :
-- deux demandes en attente pour la meme station n'auraient aucun sens et
-- feraient apparaitre la station deux fois dans la file de l'editeur.
CREATE TABLE IF NOT EXISTS closure_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 requested_by uuid REFERENCES users(id) ON DELETE SET NULL,
 requested_by_email text NOT NULL,
 reason text NOT NULL,
 status text NOT NULL DEFAULT 'pending'
   CHECK (status IN ('pending','cancelled','accepted','declined')),
 resolution_note text,
 resolved_by_email text,
 resolved_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS closure_requests_one_pending
 ON closure_requests(organization_id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS closure_requests_feed_idx
 ON closure_requests(status, created_at DESC);
CREATE TABLE IF NOT EXISTS audit_logs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid REFERENCES organizations(id),
 actor_user_id uuid REFERENCES users(id), action text NOT NULL, entity_type text NOT NULL, entity_id text,
 metadata jsonb NOT NULL DEFAULT '{}'::jsonb, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sites_org ON sites(organization_id);
CREATE INDEX IF NOT EXISTS idx_services_org ON services(organization_id);
CREATE INDEX IF NOT EXISTS idx_washes_org_created ON washes(organization_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_expenses_org_created ON expenses(organization_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_workers_org_status ON workers(organization_id,status);
CREATE INDEX IF NOT EXISTS idx_payments_org_created ON payments(organization_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payments_org_status ON payments(organization_id,status);
CREATE INDEX IF NOT EXISTS idx_payments_wash ON payments(wash_id);
CREATE INDEX IF NOT EXISTS idx_wash_assignments_worker ON wash_assignments(worker_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_org_created ON audit_logs(organization_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cash_movements_session ON cash_movements(cash_session_id);
CREATE INDEX IF NOT EXISTS idx_cash_sessions_org_site ON cash_sessions(organization_id,site_id,status);
CREATE INDEX IF NOT EXISTS idx_wash_items_wash ON wash_items(wash_id);
-- Authentification maison (e-mail + mot de passe, sessions en base) ---------
DO $do$ BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_lower ON users (lower(email));
EXCEPTION WHEN others THEN
  RAISE NOTICE 'idx_users_email_lower non cr\xE9\xE9 (e-mails en double existants)';
END $do$;
CREATE TABLE IF NOT EXISTS auth_sessions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 token_hash text NOT NULL UNIQUE,
 expires_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 last_used_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_user ON auth_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_expires ON auth_sessions(expires_at);
-- R\xE9initialisation de mot de passe : seul le SHA-256 du jeton est stock\xE9, ------
-- le jeton en clair ne vit que dans le lien envoy\xE9 par e-mail. ----------------
CREATE TABLE IF NOT EXISTS password_reset_tokens (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 token_hash text NOT NULL UNIQUE,
 expires_at timestamptz NOT NULL,
 used_at timestamptz,
 requested_ip text,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user ON password_reset_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_expires ON password_reset_tokens(expires_at);
` + rlsSchemaSql();
    SERVICE_ELIGIBILITY_TRANSCRIPTION_SQL = `
INSERT INTO service_vehicle_prices(service_id, vehicle_category_id, price_cents)
SELECT s.id, vc.id,
  COALESCE(
    CASE WHEN s.price_by_vehicle_type ->> vc.id::text ~ '^[0-9]+$'
         THEN (s.price_by_vehicle_type ->> vc.id::text)::int END,
    CASE WHEN s.price_by_vehicle_type ->> COALESCE(vc.family, '') ~ '^[0-9]+$'
         THEN (s.price_by_vehicle_type ->> COALESCE(vc.family, ''))::int END,
    s.price_cents
  )
FROM services s
JOIN vehicle_categories vc ON vc.organization_id = s.organization_id
WHERE NOT EXISTS (SELECT 1 FROM service_vehicle_prices p WHERE p.service_id = s.id)
ON CONFLICT (service_id, vehicle_category_id) DO NOTHING`;
  }
});

// server/auth.ts
import { randomBytes as randomBytes2, scrypt as scryptCallback, timingSafeEqual, createHash as createHash2 } from "node:crypto";
import { promisify } from "node:util";
async function hashPassword(password) {
  const salt = randomBytes2(16);
  const derived = await scrypt(password, salt, SCRYPT_KEYLEN);
  return `scrypt:${salt.toString("hex")}:${derived.toString("hex")}`;
}
async function verifyPassword(password, stored) {
  if (!stored) return false;
  const [scheme, saltHex, hashHex] = stored.split(":");
  if (scheme !== "scrypt" || !saltHex || !hashHex) return false;
  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(hashHex, "hex");
  const derived = await scrypt(password, salt, expected.length);
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}
function hashSessionToken(token) {
  return createHash2("sha256").update(token).digest("hex");
}
async function createSession(pool2, userId) {
  const token = randomBytes2(32).toString("base64url");
  await pool2.query(
    `INSERT INTO auth_sessions (user_id, token_hash, expires_at)
     VALUES ($1, $2, NOW() + make_interval(days => $3))`,
    [userId, hashSessionToken(token), SESSION_TTL_DAYS]
  );
  return token;
}
async function destroySession(pool2, token) {
  await pool2.query("DELETE FROM auth_sessions WHERE token_hash = $1", [hashSessionToken(token)]);
}
function hashResetToken(token) {
  return createHash2("sha256").update(token).digest("hex");
}
async function createPasswordResetToken(pool2, userId, ttlMinutes, requestedIp) {
  const token = randomBytes2(32).toString("base64url");
  await pool2.query(
    "UPDATE password_reset_tokens SET used_at = NOW() WHERE user_id = $1 AND used_at IS NULL",
    [userId]
  );
  await pool2.query(
    `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at, requested_ip)
     VALUES ($1, $2, NOW() + make_interval(mins => $3), $4)`,
    [userId, hashResetToken(token), ttlMinutes, requestedIp ?? null]
  );
  return token;
}
async function consumePasswordResetToken(pool2, token) {
  if (!token) return null;
  const q = await pool2.query(
    `UPDATE password_reset_tokens
     SET used_at = NOW()
     WHERE token_hash = $1 AND used_at IS NULL AND expires_at > NOW()
     RETURNING user_id`,
    [hashResetToken(token)]
  );
  const row = q.rows[0];
  return row?.user_id ?? null;
}
async function isPasswordResetTokenValid(pool2, token) {
  if (!token) return false;
  const q = await pool2.query(
    `SELECT 1 FROM password_reset_tokens
     WHERE token_hash = $1 AND used_at IS NULL AND expires_at > NOW()
     LIMIT 1`,
    [hashResetToken(token)]
  );
  return Boolean(q.rowCount);
}
function cookieSecurity2(req) {
  const secure = req.secure || req.get("x-forwarded-proto") === "https";
  return { secure, sameSite: secure ? "none" : "lax" };
}
function setSessionCookie(req, res, token) {
  const { secure, sameSite } = cookieSecurity2(req);
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite,
    secure,
    maxAge: SESSION_TTL_DAYS * 24 * 60 * 60 * 1e3,
    path: "/"
  });
}
function clearSessionCookie(req, res) {
  const { secure, sameSite } = cookieSecurity2(req);
  res.clearCookie(SESSION_COOKIE, { httpOnly: true, sameSite, secure, path: "/" });
}
function readSessionToken(req) {
  const header = req.get("cookie");
  if (header) {
    for (const part of header.split(";")) {
      const separator = part.indexOf("=");
      if (separator === -1) continue;
      const name = part.slice(0, separator).trim();
      if (name !== SESSION_COOKIE) continue;
      const value = part.slice(separator + 1).trim();
      if (value) return decodeURIComponent(value);
    }
  }
  const authorization = req.get("authorization") || "";
  const match = /^Bearer\s+(.+)$/i.exec(authorization);
  if (match) return match[1].trim();
  const custom = req.get("x-session-token");
  return custom ? custom.trim() : null;
}
async function getSessionUser(req) {
  const token = readSessionToken(req);
  if (!token) return null;
  const pool2 = getPool();
  if (!pool2) return null;
  const q = await pool2.query(
    `SELECT s.id AS session_id, u.id AS user_id, u.email, u.first_name, u.last_name, u.phone, u.avatar_url, u.status
     FROM auth_sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = $1 AND s.expires_at > NOW()
     LIMIT 1`,
    [hashSessionToken(token)]
  );
  const row = q.rows[0];
  if (!row || row.status !== "active") return null;
  void pool2.query(
    `UPDATE auth_sessions SET last_used_at = NOW(), expires_at = NOW() + make_interval(days => $2) WHERE id = $1`,
    [row.session_id, SESSION_TTL_DAYS]
  ).catch(() => {
  });
  return {
    sessionId: row.session_id,
    userId: row.user_id,
    email: row.email,
    firstName: row.first_name,
    lastName: row.last_name,
    phone: row.phone,
    avatarUrl: row.avatar_url,
    status: row.status
  };
}
async function requireSession(req, _res, next) {
  try {
    const pool2 = getPool();
    if (!pool2) throw new HttpError(503, "database_not_configured", "La base de donn\xE9es n'est pas configur\xE9e.");
    const user = await getSessionUser(req);
    if (!user) throw new HttpError(401, "authentication_required", "Connectez-vous pour continuer.");
    req.auth = { userId: user.userId, email: user.email, sessionId: user.sessionId };
    next();
  } catch (error) {
    if (error instanceof HttpError) return next(error);
    next(new HttpError(401, "invalid_session", "Votre session a expir\xE9 ou n'est pas valide. Reconnectez-vous."));
  }
}
var scrypt, HttpError, SCRYPT_KEYLEN, SESSION_COOKIE, SESSION_TTL_DAYS;
var init_auth = __esm({
  "server/auth.ts"() {
    init_db();
    scrypt = promisify(scryptCallback);
    HttpError = class extends Error {
      status;
      code;
      constructor(status, code, message) {
        super(message);
        this.name = "HttpError";
        this.status = status;
        this.code = code;
      }
    };
    SCRYPT_KEYLEN = 64;
    SESSION_COOKIE = "washpilot_session";
    SESSION_TTL_DAYS = 30;
  }
});

// server/mailer.ts
function isMailerConfigured() {
  return Boolean(env.RESEND_API_KEY);
}
async function sendMail(message) {
  if (!isMailerConfigured()) {
    console.info(
      `[mail] Aucun fournisseur configur\xE9 (RESEND_API_KEY absent). Message non envoy\xE9 \xE0 ${message.to} \u2014 sujet : ${message.subject}`
    );
    console.info(`[mail] Contenu :
${message.text}`);
    return false;
  }
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: env.MAIL_FROM,
        to: [message.to],
        subject: message.subject,
        text: message.text,
        ...message.html ? { html: message.html } : {}
      })
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.error(`[mail] Envoi refus\xE9 par Resend (${response.status}) : ${detail.slice(0, 500)}`);
      return false;
    }
    return true;
  } catch (error) {
    console.error(
      "[mail] Envoi impossible :",
      error instanceof Error ? error.message : "erreur inconnue"
    );
    return false;
  }
}
function passwordResetMessage(to, resetUrl, ttlMinutes) {
  const validity = ttlMinutes >= 60 ? `${Math.round(ttlMinutes / 60)} heure${ttlMinutes >= 120 ? "s" : ""}` : `${ttlMinutes} minutes`;
  const text = [
    "Bonjour,",
    "",
    "Vous avez demand\xE9 la r\xE9initialisation du mot de passe de votre compte WashPilot CI.",
    `Ouvrez le lien ci-dessous pour choisir un nouveau mot de passe (valable ${validity}) :`,
    "",
    resetUrl,
    "",
    "Si vous n'\xEAtes pas \xE0 l'origine de cette demande, ignorez ce message : votre mot de passe reste inchang\xE9.",
    "",
    "\u2014 L'\xE9quipe WashPilot CI"
  ].join("\n");
  const html = `<!doctype html>
<html lang="fr"><body style="margin:0;background:#f1f5f9;padding:24px;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#0f172a">
  <table role="presentation" style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:16px;padding:32px">
    <tr><td>
      <p style="margin:0 0 16px;font-size:14px">Bonjour,</p>
      <p style="margin:0 0 16px;font-size:14px;line-height:22px">
        Vous avez demand\xE9 la r\xE9initialisation du mot de passe de votre compte <strong>WashPilot CI</strong>.
        Le lien ci-dessous est valable <strong>${validity}</strong> et ne peut servir qu'une seule fois.
      </p>
      <p style="margin:24px 0">
        <a href="${resetUrl}" style="display:inline-block;background:#123d79;color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;padding:14px 22px;border-radius:12px">
          Choisir un nouveau mot de passe
        </a>
      </p>
      <p style="margin:0 0 16px;font-size:12px;color:#64748b;word-break:break-all">${resetUrl}</p>
      <p style="margin:0;font-size:12px;color:#64748b;line-height:20px">
        Si vous n'\xEAtes pas \xE0 l'origine de cette demande, ignorez ce message : votre mot de passe reste inchang\xE9.
      </p>
    </td></tr>
  </table>
</body></html>`;
  return {
    to,
    subject: "R\xE9initialisation de votre mot de passe WashPilot CI",
    text,
    html
  };
}
function formatDay(iso) {
  if (!iso) return "prochainement";
  return new Date(iso).toLocaleDateString("fr-CI", { day: "2-digit", month: "long", year: "numeric" });
}
function trialReminderMessage(kind, context) {
  const greeting = context.firstName ? `Bonjour ${context.firstName},` : "Bonjour,";
  const endDay = formatDay(context.trialEndsAt);
  const copy = {
    trial_j3: {
      subject: `Il vous reste ${context.daysRemaining} jours d'essai WashPilot CI`,
      headline: `Votre essai gratuit se termine le ${endDay}.`,
      body: `Votre station ${context.organizationName} utilise WashPilot CI en essai gratuit. Pass\xE9 cette date, votre espace restera consultable, mais vous ne pourrez plus enregistrer de lavages, de d\xE9penses ni d'op\xE9rations de caisse.`,
      cta: "Choisir un forfait"
    },
    trial_j1: {
      subject: "Dernier jour d'essai WashPilot CI",
      headline: `Votre essai gratuit se termine demain (${endDay}).`,
      body: `Pour que votre \xE9quipe continue d'enregistrer les lavages de ${context.organizationName} sans interruption, activez un forfait d\xE8s aujourd'hui.`,
      cta: "Activer un forfait"
    },
    trial_expired: {
      subject: "Votre essai WashPilot CI est termin\xE9",
      headline: "Votre espace est pass\xE9 en lecture seule.",
      body: `L'essai gratuit de ${context.organizationName} est arriv\xE9 \xE0 \xE9ch\xE9ance. Toutes vos donn\xE9es restent disponibles et consultables : activez un forfait pour reprendre les enregistrements.`,
      cta: "R\xE9activer mon espace"
    }
  }[kind];
  const text = [
    greeting,
    "",
    copy.headline,
    "",
    copy.body,
    "",
    `${copy.cta} : ${context.billingUrl}`,
    "",
    "\u2014 L'\xE9quipe WashPilot CI"
  ].join("\n");
  const html = `<!doctype html>
<html lang="fr"><body style="margin:0;background:#f1f5f9;padding:24px;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#0f172a">
  <table role="presentation" style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:16px;padding:32px">
    <tr><td>
      <p style="margin:0 0 16px;font-size:14px">${greeting}</p>
      <p style="margin:0 0 12px;font-size:18px;font-weight:700">${copy.headline}</p>
      <p style="margin:0 0 16px;font-size:14px;line-height:22px">${copy.body}</p>
      <p style="margin:24px 0">
        <a href="${context.billingUrl}" style="display:inline-block;background:#123d79;color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;padding:14px 22px;border-radius:12px">${copy.cta}</a>
      </p>
      <p style="margin:0;font-size:12px;color:#64748b;line-height:20px">
        Vos donn\xE9es restent conserv\xE9es et exportables \xE0 tout moment depuis Param\xE8tres &gt; Donn\xE9es et sauvegarde.
      </p>
    </td></tr>
  </table>
</body></html>`;
  return { to: context.to, subject: copy.subject, text, html };
}
function renewalReminderMessage(kind, context) {
  const greeting = context.firstName ? `Bonjour ${context.firstName},` : "Bonjour,";
  const endDay = formatDay(context.periodEnd);
  const copy = {
    renewal_j7: {
      subject: `Votre forfait ${context.planName} arrive \xE0 \xE9ch\xE9ance le ${endDay}`,
      headline: `Votre abonnement se termine le ${endDay}.`,
      body: `Le forfait ${context.planName} de ${context.organizationName} arrive \xE0 \xE9ch\xE9ance dans une semaine. Renouvelez d\xE8s maintenant : les jours restants ne sont pas perdus, ils s'ajoutent \xE0 la nouvelle p\xE9riode.`,
      cta: "Renouveler mon forfait"
    },
    renewal_j3: {
      subject: `Plus que 3 jours \u2014 forfait ${context.planName}`,
      headline: `Votre abonnement se termine le ${endDay}.`,
      body: `Pour que ${context.organizationName} continue sans interruption, renouvelez votre forfait ${context.planName}. Le paiement se fait par mobile money, en quelques minutes.`,
      cta: "Renouveler maintenant"
    },
    renewal_j1: {
      subject: `Dernier jour \u2014 forfait ${context.planName}`,
      headline: `Votre abonnement se termine demain (${endDay}).`,
      body: `Renouvelez aujourd'hui pour \xE9viter toute coupure sur ${context.organizationName}. Vos donn\xE9es restent \xE9videmment conserv\xE9es dans tous les cas.`,
      cta: "Renouveler aujourd'hui"
    },
    renewal_read_only: {
      subject: `Forfait ${context.planName} : espace en lecture seule`,
      headline: `Votre espace ${context.organizationName} est pass\xE9 en lecture seule.`,
      body: `Le forfait ${context.planName} n'a pas \xE9t\xE9 renouvel\xE9 et le d\xE9lai de tol\xE9rance est \xE9coul\xE9. Aucune donn\xE9e n'a \xE9t\xE9 supprim\xE9e : tout reste consultable et exportable. R\xE9gularisez votre forfait pour reprendre les enregistrements, sans rien rattraper \u2014 la r\xE9activation est imm\xE9diate.`,
      cta: "R\xE9activer mon espace"
    },
    renewal_overdue: {
      subject: `Forfait ${context.planName} : \xE9ch\xE9ance d\xE9pass\xE9e`,
      headline: `Votre abonnement a expir\xE9 le ${endDay}.`,
      body: `Votre acc\xE8s \xE0 ${context.organizationName} n'a pas \xE9t\xE9 interrompu, mais votre forfait ${context.planName} n'est plus \xE0 jour. Merci de r\xE9gulariser pour que le service continue.`,
      cta: "R\xE9gulariser mon abonnement"
    }
  }[kind];
  const text = [
    greeting,
    "",
    copy.headline,
    "",
    copy.body,
    "",
    `${copy.cta} : ${context.billingUrl}`,
    "",
    "\u2014 L'\xE9quipe WashPilot CI"
  ].join("\n");
  const html = `<!doctype html>
<html lang="fr"><body style="margin:0;background:#f1f5f9;padding:24px;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#0f172a">
  <table role="presentation" style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:16px;padding:32px">
    <tr><td>
      <p style="margin:0 0 16px;font-size:14px">${greeting}</p>
      <p style="margin:0 0 12px;font-size:18px;font-weight:700">${copy.headline}</p>
      <p style="margin:0 0 16px;font-size:14px;line-height:22px">${copy.body}</p>
      <p style="margin:24px 0">
        <a href="${context.billingUrl}" style="display:inline-block;background:#123d79;color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;padding:14px 22px;border-radius:12px">${copy.cta}</a>
      </p>
      <p style="margin:0;font-size:12px;color:#64748b;line-height:20px">
        Vos donnees restent conservees et exportables a tout moment depuis Parametres &gt; Donnees et sauvegarde.
      </p>
    </td></tr>
  </table>
</body></html>`;
  return { to: context.to, subject: copy.subject, text, html };
}
function supportReplyMessage(context) {
  const greeting = context.firstName ? `Bonjour ${context.firstName},` : "Bonjour,";
  const text = [
    greeting,
    "",
    `L'\xE9quipe WashPilot CI a r\xE9pondu \xE0 votre demande \xAB ${context.requestSubject} \xBB pour ${context.organizationName}.`,
    "",
    `Lire la r\xE9ponse : ${context.supportUrl}`,
    "",
    "Ce message concerne uniquement une r\xE9ponse publique de l'assistance.",
    "",
    "\u2014 L'\xE9quipe WashPilot CI"
  ].join("\n");
  return {
    to: context.to,
    subject: `R\xE9ponse de l'assistance \u2014 ${context.requestSubject}`,
    text
  };
}
function upgradeRequestMessage(context) {
  const text = [
    `Nouvelle demande de forfait : ${context.planName}`,
    "",
    `Station : ${context.organizationName}`,
    `Demandeur : ${context.requesterName} (${context.requesterEmail})`,
    `T\xE9l\xE9phone : ${context.phone || "non renseign\xE9"}`,
    context.note ? `Message : ${context.note}` : "",
    "",
    "\u2014 WashPilot CI"
  ].filter(Boolean).join("\n");
  return {
    to: context.to,
    subject: `Demande de forfait ${context.planName} \u2014 ${context.organizationName}`,
    text
  };
}
var init_mailer = __esm({
  "server/mailer.ts"() {
    init_env();
  }
});

// server/entitlements.ts
function toDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
function featureEnabled(features, key) {
  if (!features) return false;
  if (Array.isArray(features)) return features.includes(key);
  return features[key] === true;
}
function computeSubscriptionState(input) {
  const now = input.now ?? /* @__PURE__ */ new Date();
  const storedStatus = (input.status ?? "none").toLowerCase();
  const periodEnd = toDate(input.current_period_end);
  const priceCents = Number(input.plan_price_cents ?? 0);
  const isTrialRecord = storedStatus === "trialing";
  const trialEnded = isTrialRecord && periodEnd != null && periodEnd.getTime() <= now.getTime();
  const paidLapsed = storedStatus === "active" && periodEnd != null && periodEnd.getTime() <= now.getTime();
  const graceEnd = paidLapsed && periodEnd ? new Date(periodEnd.getTime() + PAYMENT_GRACE_MS) : null;
  const withinGrace = graceEnd != null && now.getTime() < graceEnd.getTime();
  const paymentLapsed = paidLapsed && !withinGrace;
  let status;
  if (trialEnded || storedStatus === "expired" || paymentLapsed) status = "expired";
  else if (isTrialRecord) status = "trialing";
  else if (storedStatus === "active") status = "active";
  else if (storedStatus === "pending") status = "pending";
  else if (storedStatus === "cancelled" || storedStatus === "canceled") status = "cancelled";
  else status = "none";
  const isTrial = status === "trialing";
  const isExpired = status === "expired";
  const readOnly = isExpired || status === "cancelled";
  const expiredReason = isExpired ? paymentLapsed ? "payment" : "trial" : status === "cancelled" ? "cancelled" : null;
  const trialContext = isTrial || isExpired && expiredReason === "trial";
  const msRemaining = isTrial && periodEnd ? Math.max(0, periodEnd.getTime() - now.getTime()) : 0;
  const daysRemaining = isTrial ? Math.ceil(msRemaining / 864e5) || 0 : periodEnd ? Math.ceil((periodEnd.getTime() - now.getTime()) / 864e5) || 0 : 0;
  const trialStart = periodEnd ? new Date(periodEnd.getTime() - TRIAL_DURATION_MS) : null;
  const elapsed = trialStart ? now.getTime() - trialStart.getTime() : 0;
  const progress = isTrial ? Math.min(1, Math.max(0, elapsed / TRIAL_DURATION_MS)) : isExpired ? 1 : 0;
  const capabilities = {};
  for (const capability of CAPABILITIES) {
    if (WRITE_CAPABILITIES.includes(capability)) {
      capabilities[capability] = !readOnly;
      continue;
    }
    capabilities[capability] = !readOnly && featureEnabled(input.plan_features, capability);
  }
  return {
    status,
    stored_status: storedStatus,
    past_due: paidLapsed,
    payment_grace_days: PAYMENT_GRACE_DAYS,
    payment_grace_ends_at: paidLapsed && graceEnd ? graceEnd.toISOString() : null,
    payment_grace_days_remaining: paidLapsed && graceEnd ? Math.max(0, Math.ceil((graceEnd.getTime() - now.getTime()) / 864e5)) : 0,
    days_past_due: paidLapsed && periodEnd ? Math.max(0, Math.floor((now.getTime() - periodEnd.getTime()) / 864e5)) : 0,
    expired_reason: expiredReason,
    plan_code: input.plan_code ?? null,
    plan_name: input.plan_name ?? null,
    plan_price_cents: priceCents,
    is_trial: isTrial,
    is_expired: isExpired,
    trial_days: TRIAL_DAYS,
    // Les dates d'essai ne concernent que l'essai : les afficher sur un impayé
    // ferait croire à un essai terminé, et le message serait faux.
    trial_started_at: trialContext ? trialStart?.toISOString() ?? null : null,
    trial_ends_at: trialContext ? periodEnd?.toISOString() ?? null : null,
    ms_remaining: msRemaining,
    days_remaining: daysRemaining,
    progress,
    read_only: readOnly,
    report_window_days: readOnly ? EXPIRED_REPORT_WINDOW_DAYS : null,
    capabilities,
    restricted: CAPABILITIES.filter((capability) => !capabilities[capability]),
    server_time: now.toISOString()
  };
}
function clampReportRange(range, windowDays, today2 = /* @__PURE__ */ new Date()) {
  if (!windowDays) return { ...range, clamped: false };
  const earliest = new Date(today2.getTime() - (windowDays - 1) * 864e5).toISOString().slice(0, 10);
  if (range.from >= earliest) return { ...range, clamped: false };
  return { from: earliest, to: range.to < earliest ? earliest : range.to, clamped: true };
}
function invalidateSubscriptionCache(organizationId) {
  if (organizationId) cache.delete(organizationId);
  else cache.clear();
}
async function loadSubscriptionState(pool2, organizationId, options = {}) {
  const cached = cache.get(organizationId);
  if (!options.fresh && cached && Date.now() - cached.loadedAt < CACHE_TTL_MS) {
    if (!(cached.state.is_trial && cached.state.ms_remaining <= CACHE_TTL_MS)) {
      return cached.state;
    }
  }
  const q = await pool2.query(
    `SELECT s.status, s.current_period_end, p.code AS plan_code, p.name AS plan_name,
            p.price_cents AS plan_price_cents, p.features AS plan_features
     FROM subscriptions s
     JOIN plans p ON p.id = s.plan_id
     WHERE s.organization_id = $1::uuid`,
    [organizationId]
  );
  const row = q.rows[0];
  const state = computeSubscriptionState({
    status: row?.status ?? "none",
    current_period_end: row?.current_period_end ?? null,
    plan_code: row?.plan_code ?? null,
    plan_name: row?.plan_name ?? null,
    plan_price_cents: row?.plan_price_cents ?? 0,
    plan_features: row?.plan_features ?? null
  });
  if (state.is_expired && state.stored_status === "trialing") {
    await pool2.query(
      "UPDATE subscriptions SET status='expired', updated_at=now() WHERE organization_id=$1::uuid AND status='trialing'",
      [organizationId]
    );
  }
  cache.set(organizationId, { state, loadedAt: Date.now() });
  return state;
}
async function attachSubscription(req, _res, next) {
  try {
    const pool2 = getPool();
    if (!pool2 || !req.tenant) return next();
    req.subscription = await loadSubscriptionState(pool2, req.tenant.organizationId);
    next();
  } catch (error) {
    next(error);
  }
}
function blockWritesWhenReadOnly(req, _res, next) {
  const state = req.subscription;
  if (!state?.read_only) return next();
  if (SAFE_METHODS.has(req.method)) return next();
  if (ALWAYS_ALLOWED.some((pattern) => pattern.test(req.path))) return next();
  next(new HttpError(402, readOnlyCode(state), readOnlyMessage(state)));
}
function readOnlyCode(state) {
  return state.expired_reason === "payment" ? "subscription_payment_due" : "trial_expired";
}
function readOnlyMessage(state) {
  if (state.expired_reason === "cancelled") {
    return "Votre abonnement est r\xE9sili\xE9 : l\u2019espace est en lecture seule. Choisissez un forfait pour reprendre les enregistrements.";
  }
  if (state.expired_reason === "payment") {
    return `L\u2019\xE9ch\xE9ance de votre forfait ${state.plan_name ?? "payant"} est d\xE9pass\xE9e depuis ${state.days_past_due} jour(s), au-del\xE0 de la tol\xE9rance de ${PAYMENT_GRACE_DAYS} jours. Vos donn\xE9es restent consultables et exportables ; les nouveaux enregistrements reprennent d\xE8s la validation du paiement.`;
  }
  return `Votre essai gratuit de ${TRIAL_DAYS} jours est termin\xE9. Votre espace reste consultable, mais les nouveaux enregistrements n\xE9cessitent un forfait.`;
}
function requireCapability(capability) {
  return (req, _res, next) => {
    const state = req.subscription;
    if (!state || state.capabilities[capability]) return next();
    next(
      new HttpError(
        402,
        state.read_only ? readOnlyCode(state) : "plan_upgrade_required",
        state.read_only ? state.expired_reason === "payment" ? `\xAB ${CAPABILITY_LABELS[capability]} \xBB n\u2019est plus disponible : l\u2019\xE9ch\xE9ance de votre forfait est d\xE9pass\xE9e.` : `\xAB ${CAPABILITY_LABELS[capability]} \xBB n\u2019est plus disponible : votre essai gratuit est termin\xE9.` : `\xAB ${CAPABILITY_LABELS[capability]} \xBB n\u2019est pas inclus dans votre forfait actuel.`
      )
    );
  };
}
var TRIAL_DAYS, TRIAL_DURATION_MS, EXPIRED_REPORT_WINDOW_DAYS, TRIAL_WARNING_DAYS, PAYMENT_GRACE_DAYS, PAYMENT_GRACE_MS, CAPABILITIES, CAPABILITY_LABELS, WRITE_CAPABILITIES, cache, CACHE_TTL_MS, SAFE_METHODS, ALWAYS_ALLOWED;
var init_entitlements = __esm({
  "server/entitlements.ts"() {
    init_db();
    init_auth();
    init_env();
    TRIAL_DAYS = env.TRIAL_DAYS;
    TRIAL_DURATION_MS = TRIAL_DAYS * 864e5;
    EXPIRED_REPORT_WINDOW_DAYS = 7;
    TRIAL_WARNING_DAYS = 3;
    PAYMENT_GRACE_DAYS = env.PLAN_GRACE_DAYS;
    PAYMENT_GRACE_MS = PAYMENT_GRACE_DAYS * 864e5;
    CAPABILITIES = [
      "washes.create",
      "washes.cancel",
      "payments.manage",
      "expenses.manage",
      "cash.manage",
      "catalog.manage",
      "team.manage",
      "reports.export",
      "reports.advanced",
      "reports.consolidated",
      "audit.read",
      "sites.multiple",
      "stock.manage",
      "team.tracking"
    ];
    CAPABILITY_LABELS = {
      "washes.create": "Enregistrer un lavage",
      "washes.cancel": "Annuler un lavage",
      "payments.manage": "Encaisser et confirmer un paiement",
      "expenses.manage": "G\xE9rer les d\xE9penses",
      "cash.manage": "G\xE9rer la caisse",
      "catalog.manage": "Modifier le catalogue (prestations, cat\xE9gories, sites)",
      "team.manage": "G\xE9rer l\u2019\xE9quipe",
      "reports.export": "Exporter les rapports",
      "reports.advanced": "Rapports avanc\xE9s",
      "reports.consolidated": "Rapports consolid\xE9s et vue multi-stations",
      "audit.read": "Historique des op\xE9rations et tra\xE7abilit\xE9",
      "sites.multiple": "Gestion multi-stations",
      "stock.manage": "Suivi du stock de consommables",
      "team.tracking": "Pr\xE9sences, affectations et rendement des laveurs"
    };
    WRITE_CAPABILITIES = [
      "washes.create",
      "washes.cancel",
      "payments.manage",
      "expenses.manage",
      "cash.manage",
      "catalog.manage",
      "team.manage"
    ];
    cache = /* @__PURE__ */ new Map();
    CACHE_TTL_MS = 1e4;
    SAFE_METHODS = /* @__PURE__ */ new Set(["GET", "HEAD", "OPTIONS"]);
    ALWAYS_ALLOWED = [/^\/subscription/, /^\/onboarding/];
  }
});

// server/support-sla.ts
function commitmentLabel(hours) {
  if (hours < BUSINESS_HOURS_PER_DAY) {
    return `${hours} heures ouvr\xE9es`;
  }
  const days = hours / BUSINESS_HOURS_PER_DAY;
  return days === 1 ? "1 jour ouvr\xE9" : `${days} jours ouvr\xE9s`;
}
function commitmentFor(planCode) {
  if (!planCode) return DEFAULT_COMMITMENT_HOURS;
  return RESPONSE_COMMITMENT_HOURS[planCode] ?? DEFAULT_COMMITMENT_HOURS;
}
function isWorkingDay(date) {
  const day = date.getUTCDay();
  return day >= 1 && day <= 5;
}
function windowStart(date) {
  const d = new Date(date);
  d.setUTCHours(BUSINESS_DAY_START_HOUR, 0, 0, 0);
  return d;
}
function windowEnd(date) {
  const d = new Date(date);
  d.setUTCHours(BUSINESS_DAY_END_HOUR, 0, 0, 0);
  return d;
}
function nextBusinessInstant(date) {
  let cursor = new Date(date);
  for (let guard = 0; guard < 8; guard += 1) {
    if (isWorkingDay(cursor)) {
      const start = windowStart(cursor);
      const end = windowEnd(cursor);
      if (cursor < start) return start;
      if (cursor < end) return cursor;
    }
    cursor = windowStart(new Date(cursor.getTime() + 24 * MS_PER_HOUR));
  }
  return cursor;
}
function addBusinessHours(start, hours) {
  let cursor = nextBusinessInstant(start);
  let remainingMs = hours * MS_PER_HOUR;
  if (remainingMs <= 0) return cursor;
  for (let guard = 0; guard < 400; guard += 1) {
    const end = windowEnd(cursor);
    const availableMs = end.getTime() - cursor.getTime();
    if (remainingMs <= availableMs) {
      return new Date(cursor.getTime() + remainingMs);
    }
    remainingMs -= availableMs;
    cursor = nextBusinessInstant(windowStart(new Date(end.getTime() + 24 * MS_PER_HOUR)));
  }
  return cursor;
}
function businessHoursBetween(from, to) {
  if (to <= from) return 0;
  let total = 0;
  const cursor = new Date(from);
  cursor.setUTCHours(0, 0, 0, 0);
  for (let guard = 0; guard < 4e3 && cursor < to; guard += 1) {
    if (isWorkingDay(cursor)) {
      const open = windowStart(cursor).getTime();
      const close = windowEnd(cursor).getTime();
      const a = Math.max(open, from.getTime());
      const b = Math.min(close, to.getTime());
      if (b > a) total += (b - a) / MS_PER_HOUR;
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return total;
}
function responseDueAt(receivedAt, planCode) {
  return addBusinessHours(receivedAt, commitmentFor(planCode));
}
function slaState(dueAt, firstRespondedAt, now = /* @__PURE__ */ new Date()) {
  const reference = firstRespondedAt ?? now;
  const breached = reference > dueAt;
  const remaining = firstRespondedAt ? 0 : now > dueAt ? -businessHoursBetween(dueAt, now) : businessHoursBetween(now, dueAt);
  return {
    breached,
    hours_remaining: Math.round(remaining * 10) / 10,
    responded: firstRespondedAt !== null
  };
}
var BUSINESS_DAY_START_HOUR, BUSINESS_DAY_END_HOUR, BUSINESS_HOURS_PER_DAY, MS_PER_HOUR, RESPONSE_COMMITMENT_HOURS, DEFAULT_COMMITMENT_HOURS;
var init_support_sla = __esm({
  "server/support-sla.ts"() {
    BUSINESS_DAY_START_HOUR = 8;
    BUSINESS_DAY_END_HOUR = 18;
    BUSINESS_HOURS_PER_DAY = BUSINESS_DAY_END_HOUR - BUSINESS_DAY_START_HOUR;
    MS_PER_HOUR = 36e5;
    RESPONSE_COMMITMENT_HOURS = {
      business: 4,
      pro: BUSINESS_HOURS_PER_DAY,
      // 1 jour ouvré
      starter: BUSINESS_HOURS_PER_DAY * 3
      // 3 jours ouvrés
    };
    DEFAULT_COMMITMENT_HOURS = BUSINESS_HOURS_PER_DAY * 5;
  }
});

// server/support-service.ts
async function threadMessages(pool2, requestId, includeInternal) {
  const q = await pool2.query(
    `SELECT m.id, m.author_user_id, m.author_operator_email, m.internal, m.body, m.created_at,
            nullif(trim(coalesce(u.first_name,'') || ' ' || coalesce(u.last_name,'')), '') AS author_name
       FROM support_messages m
       LEFT JOIN users u ON u.id = m.author_user_id
      WHERE m.request_id = $1::uuid
        AND ($2::boolean OR m.internal = false)
      ORDER BY m.created_at ASC`,
    [requestId, includeInternal]
  );
  return q.rows;
}
function withSla(row, now = /* @__PURE__ */ new Date()) {
  return {
    ...row,
    sla: slaState(
      new Date(row.response_due_at),
      row.first_responded_at ? new Date(row.first_responded_at) : null,
      now
    )
  };
}
async function createSupportRequest(pool2, input) {
  const planQ = await pool2.query(
    `SELECT p.code FROM subscriptions s JOIN plans p ON p.id = s.plan_id
      WHERE s.organization_id = $1::uuid AND s.status = 'active'`,
    [input.organizationId]
  );
  const planCode = planQ.rows[0]?.code ?? null;
  const hours = commitmentFor(planCode);
  const now = /* @__PURE__ */ new Date();
  const inserted = await pool2.query(
    `INSERT INTO support_requests
       (organization_id, created_by, subject, category, plan_code, commitment_hours, response_due_at)
     VALUES($1::uuid,$2::uuid,$3,$4,$5,$6,$7) RETURNING id`,
    [
      input.organizationId,
      input.userId,
      input.subject,
      input.category,
      planCode,
      hours,
      responseDueAt(now, planCode)
    ]
  );
  const requestId = inserted.rows[0].id;
  await pool2.query(
    "INSERT INTO support_messages(request_id, author_user_id, body) VALUES($1::uuid,$2::uuid,$3)",
    [requestId, input.userId, input.body]
  );
  return await getRequest(pool2, requestId);
}
async function getRequest(pool2, requestId) {
  const q = await pool2.query(
    `SELECT ${REQUEST_SELECT} FROM support_requests r
       JOIN organizations o ON o.id = r.organization_id
       LEFT JOIN users u ON u.id = r.created_by
      WHERE r.id = $1::uuid`,
    [requestId]
  );
  return q.rows[0] ?? null;
}
async function addMessage(pool2, input) {
  const internal = input.internal ?? false;
  const inserted = await pool2.query(
    `INSERT INTO support_messages(request_id, author_user_id, author_operator_email, internal, body)
     VALUES($1::uuid,$2::uuid,$3,$4,$5)
     RETURNING id, author_user_id, author_operator_email, internal, body, created_at`,
    [
      input.requestId,
      input.authorUserId ?? null,
      input.authorOperatorEmail ?? null,
      internal,
      input.body
    ]
  );
  const fromOperator = Boolean(input.authorOperatorEmail);
  if (fromOperator && !internal) {
    await pool2.query(
      `UPDATE support_requests
          SET first_responded_at = coalesce(first_responded_at, now()),
              status = CASE WHEN status = 'resolved' THEN status ELSE 'answered' END,
              updated_at = now()
        WHERE id = $1::uuid`,
      [input.requestId]
    );
  } else if (!fromOperator) {
    await pool2.query(
      `UPDATE support_requests SET status = 'open', resolved_at = NULL, updated_at = now()
        WHERE id = $1::uuid`,
      [input.requestId]
    );
  } else {
    await pool2.query("UPDATE support_requests SET updated_at = now() WHERE id = $1::uuid", [
      input.requestId
    ]);
  }
  return inserted.rows[0];
}
async function listForOrganization(pool2, organizationId, options = {}) {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
  const values = [organizationId];
  let filter = "";
  if (options.createdBy) {
    values.push(options.createdBy);
    filter = " AND r.created_by = $2::uuid";
  }
  const q = await pool2.query(
    `SELECT ${REQUEST_SELECT} FROM support_requests r
       JOIN organizations o ON o.id = r.organization_id
       LEFT JOIN users u ON u.id = r.created_by
      WHERE r.organization_id = $1::uuid${filter}
      ORDER BY r.created_at DESC LIMIT ${limit}`,
    values
  );
  return q.rows;
}
async function listQueue(pool2, options = {}) {
  const limit = Math.min(Math.max(options.limit ?? 100, 1), 300);
  const values = [];
  let filter;
  if (options.status) {
    values.push(options.status);
    filter = " WHERE r.status = $1";
  } else {
    filter = " WHERE r.status <> 'resolved'";
  }
  const q = await pool2.query(
    `SELECT ${REQUEST_SELECT} FROM support_requests r
       JOIN organizations o ON o.id = r.organization_id
       LEFT JOIN users u ON u.id = r.created_by
       ${filter}
      ORDER BY r.response_due_at ASC LIMIT ${limit}`,
    values
  );
  return q.rows;
}
var SUPPORT_CATEGORIES, SUPPORT_CATEGORY_LABELS, SUPPORT_STATUSES, REQUEST_SELECT;
var init_support_service = __esm({
  "server/support-service.ts"() {
    init_support_sla();
    SUPPORT_CATEGORIES = ["technique", "facturation", "formation", "autre"];
    SUPPORT_CATEGORY_LABELS = {
      technique: "Probl\xE8me technique",
      facturation: "Abonnement et facturation",
      formation: "Prise en main",
      autre: "Autre"
    };
    SUPPORT_STATUSES = ["open", "answered", "resolved"];
    REQUEST_SELECT = `r.id, r.organization_id, r.created_by, r.subject, r.category, r.status,
  r.plan_code, r.commitment_hours, r.response_due_at, r.first_responded_at, r.resolved_at,
  r.created_at, r.updated_at,
  o.name AS organization_name,
  nullif(trim(coalesce(u.first_name,'') || ' ' || coalesce(u.last_name,'')), '') AS requester_name,
  u.email AS requester_email,
  u.phone AS requester_phone,
  (SELECT count(*)::int FROM support_messages m
    WHERE m.request_id = r.id AND m.internal = false) AS message_count`;
  }
});

// server/support.ts
var support_exports = {};
__export(support_exports, {
  buildWhatsAppUrl: () => buildWhatsAppUrl,
  createSupportRouter: () => createSupportRouter,
  formatWhatsAppNumber: () => formatWhatsAppNumber,
  normalizeWhatsAppNumber: () => normalizeWhatsAppNumber,
  resolveSupportConfig: () => resolveSupportConfig
});
import { Router as Router6 } from "express";
import { z as z9 } from "zod";
function normalizeWhatsAppNumber(raw) {
  return raw.replace(/[^0-9]/g, "");
}
function formatWhatsAppNumber(raw) {
  const digits = normalizeWhatsAppNumber(raw);
  if (!digits) return "";
  if (digits.startsWith("225") && digits.length === 13) {
    const local = digits.slice(3);
    return `+225 ${local.replace(/(\d{2})(?=\d)/g, "$1 ").trim()}`;
  }
  return `+${digits}`;
}
function buildWhatsAppUrl(number, message) {
  const digits = normalizeWhatsAppNumber(number);
  if (!digits) return "";
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}
function resolveSupportConfig() {
  const configured = env.SUPPORT_WHATSAPP.trim();
  const isPlaceholder = !configured && env.NODE_ENV !== "production";
  const number = configured || (isPlaceholder ? DEMO_WHATSAPP : "");
  return {
    whatsapp_number: normalizeWhatsAppNumber(number),
    whatsapp_display: formatWhatsAppNumber(number),
    email: env.SUPPORT_EMAIL,
    is_placeholder: isPlaceholder
  };
}
function db4() {
  const pool2 = getPool();
  if (!pool2) throw new HttpError(503, "database_not_configured", "Base de donn\xE9es indisponible.");
  return pool2;
}
function createSupportRouter() {
  const r = Router6();
  r.get(
    "/support/config",
    asyncRoute(async (req, res) => {
      const t = tenant(req);
      const q = await db4().query(
        `SELECT o.name AS organization_name, u.first_name, u.last_name, u.email, u.phone,
                p.name AS plan_name, s.status AS subscription_status
         FROM organizations o
         JOIN users u ON u.id = $2::uuid
         LEFT JOIN subscriptions s ON s.organization_id = o.id
         LEFT JOIN plans p ON p.id = s.plan_id
         WHERE o.id = $1::uuid`,
        [t.organizationId, t.userId]
      );
      const row = q.rows[0] ?? {};
      const planQ = await db4().query(
        `SELECT p.code FROM subscriptions s JOIN plans p ON p.id = s.plan_id
          WHERE s.organization_id = $1::uuid AND s.status = 'active'`,
        [t.organizationId]
      );
      const activePlan = planQ.rows[0]?.code ?? null;
      const hours = commitmentFor(activePlan);
      res.json({
        ...resolveSupportConfig(),
        commitment: {
          hours,
          label: commitmentLabel(hours),
          plan_code: activePlan,
          // Faux pour un essai ou un abonnement echu : rien n'a ete achete,
          // donc rien n'est promis. Le delai affiche reste indicatif.
          guaranteed: activePlan !== null,
          business_hours: "du lundi au vendredi, 8 h - 18 h (heure d'Abidjan)"
        },
        categories: SUPPORT_CATEGORIES.map((code) => ({
          code,
          label: SUPPORT_CATEGORY_LABELS[code]
        })),
        context: {
          organization_name: row.organization_name ?? null,
          contact_name: [row.first_name, row.last_name].filter(Boolean).join(" ") || null,
          contact_email: row.email ?? null,
          contact_phone: row.phone ?? null,
          plan_name: row.plan_name ?? null,
          subscription_status: row.subscription_status ?? null
        }
      });
    })
  );
  r.post(
    "/support/upgrade-request",
    requirePermission("subscription:manage"),
    asyncRoute(async (req, res) => {
      const t = tenant(req);
      const input = body(
        z9.object({
          plan_code: z9.string().trim().min(1).max(40),
          note: z9.string().trim().max(500).optional()
        }).strip(),
        req.body
      );
      const pool2 = db4();
      const planQ = await pool2.query("SELECT id, code, name, price_cents FROM plans WHERE code=$1", [
        input.plan_code
      ]);
      if (!planQ.rowCount) throw new HttpError(404, "plan_not_found", "Forfait introuvable.");
      const plan = planQ.rows[0];
      const contextQ = await pool2.query(
        `SELECT o.name AS organization_name, u.first_name, u.last_name, u.email, u.phone
         FROM organizations o JOIN users u ON u.id = $2::uuid WHERE o.id = $1::uuid`,
        [t.organizationId, t.userId]
      );
      const context = contextQ.rows[0] ?? {};
      const requesterName = [context.first_name, context.last_name].filter(Boolean).join(" ") || "Un utilisateur";
      await pool2.query(
        `INSERT INTO audit_logs(organization_id, actor_user_id, action, entity_type, entity_id, metadata)
         VALUES($1::uuid,$2::uuid,'subscription.upgrade_requested','plan',$3::text,$4::jsonb)`,
        [
          t.organizationId,
          t.userId,
          plan.id,
          JSON.stringify({ plan_code: plan.code, note: input.note ?? null })
        ]
      );
      invalidateSubscriptionCache(t.organizationId);
      const delivered = await sendMail(
        upgradeRequestMessage({
          to: env.SUPPORT_EMAIL,
          organizationName: context.organization_name ?? "Station",
          planName: plan.name,
          requesterEmail: context.email ?? "",
          requesterName,
          phone: context.phone,
          note: input.note ?? null
        })
      );
      const support = resolveSupportConfig();
      const message = `Bonjour WashPilot CI, je suis ${requesterName} de la station ${context.organization_name ?? ""}. Je souhaite activer le forfait ${plan.name}.`;
      res.status(201).json({
        recorded: true,
        notified: delivered,
        plan: { code: plan.code, name: plan.name, price_cents: plan.price_cents },
        whatsapp_url: buildWhatsAppUrl(support.whatsapp_number, message),
        support_email: support.email
      });
    })
  );
  function seesEverything(role) {
    return role === "owner" || role === "manager";
  }
  r.post(
    "/support/requests",
    asyncRoute(async (req, res) => {
      const t = tenant(req);
      const input = body(
        z9.object({
          subject: z9.string().trim().min(5, "R\xE9sumez votre demande en quelques mots.").max(140),
          category: z9.enum(SUPPORT_CATEGORIES).default("autre"),
          body: z9.string().trim().min(15, "D\xE9crivez le probl\xE8me : ce que vous faisiez, ce qui s'est pass\xE9.").max(4e3)
        }).strip(),
        req.body
      );
      const request = await createSupportRequest(db4(), {
        organizationId: t.organizationId,
        userId: t.userId,
        subject: input.subject,
        category: input.category,
        body: input.body
      });
      const support = resolveSupportConfig();
      const message = `Bonjour WashPilot CI, j'ai ouvert la demande \xAB ${input.subject} \xBB dans l'application.`;
      res.status(201).json({
        request: withSla(request),
        // Le lien WhatsApp reste proposé : la trace est dans l'application,
        // la discussion se fait où le client a l'habitude de la faire.
        whatsapp_url: buildWhatsAppUrl(support.whatsapp_number, message)
      });
    })
  );
  r.get(
    "/support/requests",
    asyncRoute(async (req, res) => {
      const t = tenant(req);
      const rows = await listForOrganization(db4(), t.organizationId, {
        createdBy: seesEverything(t.role) ? null : t.userId
      });
      res.json({ requests: rows.map((row) => withSla(row)), scope: seesEverything(t.role) ? "station" : "mine" });
    })
  );
  r.get(
    "/support/requests/:id",
    asyncRoute(async (req, res) => {
      const t = tenant(req);
      const id = parseId(req.params.id);
      const pool2 = db4();
      const request = await getRequest(pool2, id);
      if (!request || request.organization_id !== t.organizationId) {
        throw new HttpError(404, "not_found", "Cette demande est introuvable.");
      }
      if (!seesEverything(t.role) && request.created_by !== t.userId) {
        throw new HttpError(404, "not_found", "Cette demande est introuvable.");
      }
      res.json({
        request: withSla(request),
        // `false` : jamais les notes internes de l'éditeur.
        messages: await threadMessages(pool2, id, false)
      });
    })
  );
  r.post(
    "/support/requests/:id/messages",
    asyncRoute(async (req, res) => {
      const t = tenant(req);
      const id = parseId(req.params.id);
      const input = body(
        z9.object({ body: z9.string().trim().min(2, "Le message est vide.").max(4e3) }).strip(),
        req.body
      );
      const pool2 = db4();
      const request = await getRequest(pool2, id);
      if (!request || request.organization_id !== t.organizationId) {
        throw new HttpError(404, "not_found", "Cette demande est introuvable.");
      }
      if (!seesEverything(t.role) && request.created_by !== t.userId) {
        throw new HttpError(404, "not_found", "Cette demande est introuvable.");
      }
      const message = await addMessage(pool2, {
        requestId: id,
        body: input.body,
        authorUserId: t.userId
      });
      res.status(201).json({ message, request: withSla(await getRequest(pool2, id)) });
    })
  );
  return r;
}
var DEMO_WHATSAPP;
var init_support = __esm({
  "server/support.ts"() {
    init_db();
    init_http();
    init_env();
    init_mailer();
    init_entitlements();
    init_http();
    init_support_sla();
    init_support_service();
    DEMO_WHATSAPP = "+225 07 00 00 00 00";
  }
});

// server/receipt.ts
var receipt_exports = {};
__export(receipt_exports, {
  RECEIPT_WIDTH: () => RECEIPT_WIDTH,
  centerLine: () => centerLine,
  formatAmount: () => formatAmount,
  issueReceipt: () => issueReceipt,
  methodLabel: () => methodLabel,
  padLine: () => padLine,
  receiptHistory: () => receiptHistory,
  renderReceiptText: () => renderReceiptText,
  sendReceiptViaWhatsApp: () => sendReceiptViaWhatsApp,
  wrapText: () => wrapText
});
function methodLabel(method) {
  return METHOD_LABELS[method] ?? method;
}
function formatAmount(cents) {
  const francs = Math.round(cents / 100);
  return francs.toLocaleString("fr-FR").replace(/\u202f|\u00a0/g, " ");
}
function padLine(left, right, width = RECEIPT_WIDTH) {
  const space = width - right.length;
  if (space <= 1) return `${left} ${right}`.trim();
  const trimmed = left.length > space - 1 ? `${left.slice(0, space - 2)}\u2026` : left;
  return trimmed.padEnd(space, " ") + right;
}
function centerLine(text, width = RECEIPT_WIDTH) {
  if (text.length >= width) return text.slice(0, width);
  const left = Math.floor((width - text.length) / 2);
  return " ".repeat(left) + text;
}
function wrapText(text, width = RECEIPT_WIDTH) {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [""];
  const lines = [];
  let current = "";
  for (const word of words) {
    if (!current) {
      current = word.length > width ? word.slice(0, width) : word;
      continue;
    }
    if (current.length + 1 + word.length <= width) current += ` ${word}`;
    else {
      lines.push(current);
      current = word.length > width ? word.slice(0, width) : word;
    }
  }
  lines.push(current);
  return lines;
}
function rule(char = "-", width = RECEIPT_WIDTH) {
  return char.repeat(width);
}
function shortDateTime(iso) {
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}
function renderReceiptText(receipt, width = RECEIPT_WIDTH) {
  const lines = [];
  lines.push(centerLine(receipt.station.name.toUpperCase(), width));
  lines.push(centerLine(receipt.station.site, width));
  if (receipt.station.address) {
    for (const l of wrapText(receipt.station.address, width)) lines.push(centerLine(l, width));
  }
  lines.push(centerLine(receipt.station.city, width));
  if (receipt.station.phone) lines.push(centerLine(`Tel ${receipt.station.phone}`, width));
  lines.push("");
  lines.push(rule("=", width));
  lines.push(centerLine(`RECU ${receipt.number}`, width));
  lines.push(rule("=", width));
  lines.push(padLine("Date", shortDateTime(receipt.wash.created_at), width));
  if (receipt.cashier) lines.push(padLine("Caissier", receipt.cashier, width));
  if (receipt.wash.vehicle) lines.push(padLine("Vehicule", receipt.wash.vehicle, width));
  if (receipt.wash.plate) lines.push(padLine("Plaque", receipt.wash.plate, width));
  if (receipt.wash.customer) lines.push(padLine("Client", receipt.wash.customer, width));
  lines.push(rule("-", width));
  for (const item of receipt.items) {
    for (const l of wrapText(item.service_name, width)) lines.push(l);
    lines.push(
      padLine(`  ${item.quantity} x ${formatAmount(item.unit_price_cents)}`, formatAmount(item.line_total_cents), width)
    );
  }
  lines.push(rule("-", width));
  lines.push(padLine("TOTAL", `${formatAmount(receipt.total_cents)} FCFA`, width));
  lines.push(rule("-", width));
  if (receipt.payments.length > 0) {
    lines.push("REGLEMENTS");
    for (const payment of receipt.payments) {
      const suffix = payment.status === "pending" ? " (a verifier)" : "";
      lines.push(padLine(`  ${methodLabel(payment.method)}${suffix}`, formatAmount(payment.amount_cents), width));
    }
    lines.push(rule("-", width));
  }
  lines.push(padLine("PAYE", `${formatAmount(receipt.paid_cents)} FCFA`, width));
  if (receipt.remaining_cents > 0) {
    lines.push(padLine("RESTE A PAYER", `${formatAmount(receipt.remaining_cents)} FCFA`, width));
  }
  lines.push(rule("-", width));
  if (receipt.workers.length > 0) {
    for (const l of wrapText(`Laveurs : ${receipt.workers.join(", ")}`, width)) lines.push(l);
    lines.push(rule("-", width));
  }
  if (receipt.duplicate) {
    lines.push(centerLine("*** DUPLICATA ***", width));
    lines.push(centerLine(`Copie n${receipt.copy_number} du ${shortDateTime(receipt.issued_at)}`, width));
    lines.push(rule("-", width));
  }
  lines.push(centerLine("Merci de votre visite", width));
  return lines.join("\n");
}
async function issueReceipt(pool2, params) {
  const client = await pool2.connect();
  try {
    await client.query("BEGIN");
    const washQ = await client.query(
      `SELECT w.id, w.reference, w.created_at, w.status, w.total_cents, w.plate,
              s.name AS site_name, s.city, s.address, s.phone,
              o.name AS organization_name,
              vc.name AS vehicle_name,
              coalesce(c.full_name, w.customer_name) AS customer_name,
              nullif(trim(coalesce(u.first_name,'') || ' ' || coalesce(u.last_name,'')), '') AS cashier
         FROM washes w
         JOIN sites s ON s.id = w.site_id
         JOIN organizations o ON o.id = w.organization_id
         LEFT JOIN vehicle_categories vc ON vc.id = w.vehicle_category_id
         LEFT JOIN customers c ON c.id = w.customer_id
         LEFT JOIN users u ON u.id = w.created_by
        WHERE w.id = $1::uuid AND w.organization_id = $2::uuid
        FOR UPDATE OF w`,
      [params.washId, params.organizationId]
    );
    if (!washQ.rowCount) throw new HttpError(404, "wash_not_found", "Lavage introuvable.");
    const wash = washQ.rows[0];
    if (wash.status === "cancelled") {
      throw new HttpError(409, "wash_cancelled", "Ce lavage est annul\xE9 : aucun re\xE7u ne peut \xEAtre \xE9mis.");
    }
    const itemsQ = await client.query(
      `SELECT service_name, quantity, unit_price_cents, line_total_cents
         FROM wash_items WHERE wash_id = $1::uuid ORDER BY service_name`,
      [params.washId]
    );
    const paymentsQ = await client.query(
      `SELECT method, amount_cents, status, created_at
         FROM payments WHERE wash_id = $1::uuid AND status <> 'refunded'
        ORDER BY created_at ASC`,
      [params.washId]
    );
    const workersQ = await client.query(
      `SELECT trim(wk.first_name || ' ' || wk.last_name) AS full_name
         FROM wash_assignments wa
         JOIN workers wk ON wk.id = wa.worker_id
        WHERE wa.wash_id = $1::uuid ORDER BY wk.first_name, wk.last_name`,
      [params.washId]
    );
    const copyQ = await client.query(
      "SELECT COALESCE(MAX(copy_number),0) + 1 AS next FROM receipt_issues WHERE wash_id = $1::uuid",
      [params.washId]
    );
    const copyNumber = Number(copyQ.rows[0].next);
    const issueQ = await client.query(
      `INSERT INTO receipt_issues(organization_id, wash_id, copy_number, issued_by)
       VALUES($1::uuid,$2::uuid,$3,$4::uuid) RETURNING issued_at`,
      [params.organizationId, params.washId, copyNumber, params.userId]
    );
    await client.query(
      `INSERT INTO audit_logs(organization_id, actor_user_id, action, entity_type, entity_id, metadata)
       VALUES($1,$2,$3,'wash',$4,$5)`,
      [
        params.organizationId,
        params.userId,
        copyNumber === 1 ? "receipt.issued" : "receipt.reprinted",
        params.washId,
        JSON.stringify({ copy_number: copyNumber, reference: wash.reference })
      ]
    );
    await client.query("COMMIT");
    const paid = paymentsQ.rows.reduce((sum, p) => sum + Number(p.amount_cents), 0);
    const total = Number(wash.total_cents);
    return {
      number: wash.reference ?? params.washId.slice(0, 8).toUpperCase(),
      issued_at: new Date(issueQ.rows[0].issued_at).toISOString(),
      copy_number: copyNumber,
      duplicate: copyNumber > 1,
      station: {
        name: wash.organization_name,
        site: wash.site_name,
        city: wash.city,
        address: wash.address,
        phone: wash.phone
      },
      wash: {
        reference: wash.reference,
        created_at: new Date(wash.created_at).toISOString(),
        vehicle: wash.vehicle_name,
        plate: wash.plate,
        customer: wash.customer_name
      },
      cashier: wash.cashier,
      workers: workersQ.rows.map((r) => r.full_name),
      items: itemsQ.rows.map((r) => ({
        service_name: r.service_name,
        quantity: Number(r.quantity),
        unit_price_cents: Number(r.unit_price_cents),
        line_total_cents: Number(r.line_total_cents)
      })),
      total_cents: total,
      payments: paymentsQ.rows.map((r) => ({
        method: r.method,
        amount_cents: Number(r.amount_cents),
        status: r.status,
        created_at: new Date(r.created_at).toISOString()
      })),
      paid_cents: paid,
      remaining_cents: Math.max(total - paid, 0)
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
async function sendReceiptViaWhatsApp(_pool, _organizationId, _washId, receiptText) {
  const { normalizeWhatsAppNumber: normalizeWhatsAppNumber2, buildWhatsAppUrl: buildWhatsAppUrl2 } = await Promise.resolve().then(() => (init_support(), support_exports));
  const { env: env2 } = await Promise.resolve().then(() => (init_env(), env_exports));
  const whatsappNumber = env2.SUPPORT_WHATSAPP?.trim() || "+225 07 00 00 00 00";
  const normalizedNumber = normalizeWhatsAppNumber2(whatsappNumber);
  const whatsappUrl = buildWhatsAppUrl2(normalizedNumber, receiptText);
  return { whatsappUrl, normalizedNumber };
}
async function receiptHistory(pool2, organizationId, washId) {
  const q = await pool2.query(
    `SELECT r.copy_number, r.issued_at,
            nullif(trim(coalesce(u.first_name,'') || ' ' || coalesce(u.last_name,'')), '') AS issued_by
       FROM receipt_issues r
       LEFT JOIN users u ON u.id = r.issued_by
      WHERE r.wash_id = $1::uuid AND r.organization_id = $2::uuid
      ORDER BY r.copy_number ASC`,
    [washId, organizationId]
  );
  return q.rows;
}
var RECEIPT_WIDTH, METHOD_LABELS;
var init_receipt = __esm({
  "server/receipt.ts"() {
    init_auth();
    RECEIPT_WIDTH = 48;
    METHOD_LABELS = {
      cash: "Esp\xE8ces",
      orange_money: "Orange Money",
      mtn_momo: "MTN MoMo",
      moov_money: "Moov Money",
      wave: "Wave",
      card: "Carte",
      bank_transfer: "Virement",
      other: "Autre"
    };
  }
});

// server/vercel-app.ts
import express2 from "express";

// server/app.ts
init_auth();
import express from "express";

// server/tenant.ts
init_db();
init_auth();
init_tenant_context();
init_permissions();
async function requireTenantContext(req, _res, next) {
  try {
    const auth = req.auth;
    if (!auth) throw new HttpError(401, "authentication_required", "Connectez-vous pour continuer.");
    const pool2 = getPool();
    if (!pool2) throw new HttpError(503, "database_not_configured", "La base de donn\xE9es n'est pas configur\xE9e.");
    const q = await pool2.query(
      `SELECT m.organization_id, m.role, m.status, o.deletion_requested_at
       FROM organization_members m
       JOIN organizations o ON o.id = m.organization_id
       WHERE m.user_id = $1::uuid
       ORDER BY (m.status = 'active') DESC, m.created_at ASC
       LIMIT 1`,
      [auth.userId]
    );
    const row = q.rows[0];
    if (!row) {
      throw new HttpError(403, "organization_required", "Votre compte n'est rattach\xE9 \xE0 aucune organisation. Contactez votre administrateur.");
    }
    if (row.status !== "active") {
      throw new HttpError(
        403,
        "membership_disabled",
        "Votre acc\xE8s \xE0 cette station a \xE9t\xE9 d\xE9sactiv\xE9. Contactez le propri\xE9taire."
      );
    }
    if (row.deletion_requested_at) {
      throw new HttpError(
        403,
        "organization_deleted",
        "Cette station a \xE9t\xE9 ferm\xE9e. Contactez WashPilot CI si vous pensez qu'il s'agit d'une erreur."
      );
    }
    const overridesQ = await pool2.query(
      "SELECT permission, granted FROM member_permissions WHERE organization_id=$1::uuid AND user_id=$2::uuid",
      [row.organization_id, auth.userId]
    );
    const permissions = effectivePermissions(row.role, overridesQ.rows);
    req.tenant = {
      organizationId: row.organization_id,
      userId: auth.userId,
      role: row.role,
      permissions,
      can: (permission) => permissions.has(permission)
    };
    runWithTenant(
      { organizationId: row.organization_id, userId: auth.userId },
      () => next()
    );
  } catch (error) {
    next(error);
  }
}
async function assertOrganizationUserCapacity(client, organizationId, userId) {
  await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [organizationId]);
  const exists = await client.query(
    "SELECT 1 FROM organization_members WHERE organization_id=$1::uuid AND user_id=$2::uuid",
    [organizationId, userId]
  );
  if (exists.rowCount) return;
  const q = await client.query(
    `SELECT p.max_users, COUNT(m.id)::int AS active_count FROM organizations o
     LEFT JOIN subscriptions s ON s.organization_id = o.id
     LEFT JOIN plans p ON p.id = s.plan_id
     LEFT JOIN organization_members m ON m.organization_id = o.id AND m.status = 'active'
     WHERE o.id = $1 GROUP BY p.max_users`,
    [organizationId]
  );
  const row = q.rows[0];
  if (row?.max_users != null && Number(row.active_count) >= Number(row.max_users)) {
    throw new HttpError(409, "plan_user_limit", "Le nombre maximal d'utilisateurs de votre forfait est atteint.");
  }
}

// server/auth-router.ts
init_db();
init_env();
init_http();
init_mailer();
init_auth();
import { Router as Router2 } from "express";
import { z as z5 } from "zod";
var MIN_PASSWORD_LENGTH = 5;
var WINDOW_MS = 15 * 60 * 1e3;
var MAX_ATTEMPTS = 30;
var attempts = /* @__PURE__ */ new Map();
function assertRateLimit(req) {
  const key = req.ip || "unknown";
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || entry.resetAt < now) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return;
  }
  entry.count += 1;
  if (entry.count > MAX_ATTEMPTS) {
    throw new HttpError(
      429,
      "too_many_requests",
      "Trop de tentatives. Patientez quelques minutes puis r\xE9essayez."
    );
  }
}
var registerSchema = z5.object({
  firstName: z5.string().trim().min(1, "Le pr\xE9nom est requis.").max(100),
  lastName: z5.string().trim().min(1, "Le nom est requis.").max(100),
  email: z5.string().trim().toLowerCase().email("Adresse e-mail invalide.").max(254),
  password: z5.string().min(
    MIN_PASSWORD_LENGTH,
    `Le mot de passe doit contenir au moins ${MIN_PASSWORD_LENGTH} caract\xE8res.`
  ).max(200),
  phone: z5.string().trim().max(30).optional().nullable(),
  organizationName: z5.string().trim().max(150).optional()
});
var loginSchema = z5.object({
  email: z5.string().trim().toLowerCase().email("Adresse e-mail invalide.").max(254),
  password: z5.string().min(1, "Le mot de passe est requis.").max(200)
});
var profileSchema = z5.object({
  firstName: z5.string().trim().min(1).max(100).optional(),
  lastName: z5.string().trim().min(1).max(100).optional(),
  phone: z5.string().trim().max(30).optional().nullable()
});
var passwordSchema = z5.object({
  currentPassword: z5.string().min(1, "Le mot de passe actuel est requis.").max(200),
  newPassword: z5.string().min(
    MIN_PASSWORD_LENGTH,
    `Le nouveau mot de passe doit contenir au moins ${MIN_PASSWORD_LENGTH} caract\xE8res.`
  ).max(200)
});
var forgotPasswordSchema = z5.object({
  email: z5.string().trim().toLowerCase().email("Adresse e-mail invalide.").max(254)
});
var resetPasswordSchema = z5.object({
  token: z5.string().trim().min(10, "Lien invalide.").max(300),
  password: z5.string().min(
    MIN_PASSWORD_LENGTH,
    `Le mot de passe doit contenir au moins ${MIN_PASSWORD_LENGTH} caract\xE8res.`
  ).max(200)
});
function buildResetUrl(req, token) {
  const candidates = [
    env.APP_URL,
    req.get("origin") && env.CORS_ORIGINS.includes(req.get("origin")) ? req.get("origin") : "",
    `${req.get("x-forwarded-proto") || req.protocol}://${req.get("host") ?? "localhost"}`
  ];
  const base = (candidates.find((value) => Boolean(value)) ?? "").replace(/\/+$/, "");
  return `${base}/auth/reset-password?token=${encodeURIComponent(token)}`;
}
async function buildMePayload(userId) {
  const pool2 = getPool();
  if (!pool2)
    throw new HttpError(
      503,
      "database_not_configured",
      "Base de donn\xE9es indisponible."
    );
  const q = await pool2.query(
    `SELECT u.id, u.email, u.first_name, u.last_name, u.phone, u.avatar_url,
            m.role, o.id AS organization_id, o.name AS organization_name, o.onboarding_completed
     FROM users u
     LEFT JOIN organization_members m ON m.user_id = u.id
     LEFT JOIN organizations o ON o.id = m.organization_id
     WHERE u.id = $1
     ORDER BY m.created_at ASC NULLS LAST
     LIMIT 1`,
    [userId]
  );
  const row = q.rows[0];
  if (!row)
    throw new HttpError(
      401,
      "authentication_required",
      "Connectez-vous pour continuer."
    );
  return {
    user: {
      id: row.id,
      email: row.email,
      first_name: row.first_name,
      last_name: row.last_name,
      phone: row.phone,
      avatar_url: row.avatar_url
      // Administrateur de plateforme (l'éditeur). Exposé ici parce que le
      // back-office vit hors du contexte de station : un administrateur peut
      // n'appartenir à aucune organisation.
    },
    organization: row.organization_id ? {
      id: row.organization_id,
      name: row.organization_name,
      onboarding_completed: Boolean(row.onboarding_completed)
    } : null,
    role: row.role ?? null
  };
}
function createAuthRouter() {
  const r = Router2();
  r.post(
    "/register",
    asyncRoute(async (req, res) => {
      assertRateLimit(req);
      const parsed2 = registerSchema.safeParse(req.body);
      if (!parsed2.success) {
        throw new HttpError(
          400,
          "invalid_data",
          parsed2.error.issues[0]?.message ?? "Donn\xE9es invalides."
        );
      }
      const { firstName, lastName, email, password, phone, organizationName } = parsed2.data;
      const pool2 = getPool();
      if (!pool2)
        throw new HttpError(
          503,
          "database_not_configured",
          "Base de donn\xE9es indisponible."
        );
      const existing = await pool2.query(
        "SELECT 1 FROM users WHERE lower(email) = $1 LIMIT 1",
        [email]
      );
      if (existing.rowCount) {
        throw new HttpError(
          409,
          "email_exists",
          "Un compte existe d\xE9j\xE0 avec cette adresse e-mail. Connectez-vous plut\xF4t."
        );
      }
      const passwordHash = await hashPassword(password);
      const orgName = organizationName?.trim() || `Station de ${firstName}`;
      const client = await pool2.connect();
      let userId;
      try {
        await client.query("BEGIN");
        const orgQ = await client.query(
          `INSERT INTO organizations (name, slug) VALUES ($1, NULL) RETURNING id`,
          [orgName]
        );
        const organizationId = orgQ.rows[0].id;
        const userQ = await client.query(
          `INSERT INTO users (email, first_name, last_name, phone, password_hash, status, organization_id)
           VALUES ($1, $2, $3, $4, $5, 'active', $6) RETURNING id`,
          [
            email,
            firstName,
            lastName,
            phone ?? null,
            passwordHash,
            organizationId
          ]
        );
        userId = userQ.rows[0].id;
        await client.query(
          `INSERT INTO organization_members (organization_id, user_id, role) VALUES ($1, $2, 'owner')`,
          [organizationId, userId]
        );
        await client.query(
          `INSERT INTO onboarding_progress (organization_id, current_stage) VALUES ($1, 'station')
           ON CONFLICT (organization_id) DO NOTHING`,
          [organizationId]
        );
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
      const token = await createSession(pool2, userId);
      setSessionCookie(req, res, token);
      res.status(201).json({ ...await buildMePayload(userId), session_token: token });
    })
  );
  r.post(
    "/login",
    asyncRoute(async (req, res) => {
      assertRateLimit(req);
      const parsed2 = loginSchema.safeParse(req.body);
      if (!parsed2.success) {
        throw new HttpError(
          400,
          "invalid_data",
          parsed2.error.issues[0]?.message ?? "Donn\xE9es invalides."
        );
      }
      const { email, password } = parsed2.data;
      const pool2 = getPool();
      if (!pool2)
        throw new HttpError(
          503,
          "database_not_configured",
          "Base de donn\xE9es indisponible."
        );
      const q = await pool2.query(
        "SELECT id, password_hash, status FROM users WHERE lower(email) = $1 LIMIT 1",
        [email]
      );
      const row = q.rows[0];
      const valid = row ? await verifyPassword(password, row.password_hash) : false;
      if (!row || !valid) {
        throw new HttpError(
          401,
          "invalid_credentials",
          "Adresse e-mail ou mot de passe incorrect."
        );
      }
      if (row.status !== "active") {
        throw new HttpError(
          403,
          "account_disabled",
          "Ce compte a \xE9t\xE9 d\xE9sactiv\xE9. Contactez votre administrateur."
        );
      }
      const token = await createSession(pool2, row.id);
      setSessionCookie(req, res, token);
      res.json({ ...await buildMePayload(row.id), session_token: token });
    })
  );
  r.post(
    "/logout",
    asyncRoute(async (req, res) => {
      const pool2 = getPool();
      const token = readSessionToken(req);
      if (pool2 && token) await destroySession(pool2, token);
      clearSessionCookie(req, res);
      res.status(204).end();
    })
  );
  r.get(
    "/me",
    asyncRoute(async (req, res) => {
      const session = await getSessionUser(req);
      if (!session)
        throw new HttpError(
          401,
          "authentication_required",
          "Connectez-vous pour continuer."
        );
      res.json(await buildMePayload(session.userId));
    })
  );
  r.patch(
    "/profile",
    asyncRoute(async (req, res) => {
      const session = await getSessionUser(req);
      if (!session)
        throw new HttpError(
          401,
          "authentication_required",
          "Connectez-vous pour continuer."
        );
      const parsed2 = profileSchema.safeParse(req.body);
      if (!parsed2.success) {
        throw new HttpError(
          400,
          "invalid_data",
          parsed2.error.issues[0]?.message ?? "Donn\xE9es invalides."
        );
      }
      const pool2 = getPool();
      if (!pool2)
        throw new HttpError(
          503,
          "database_not_configured",
          "Base de donn\xE9es indisponible."
        );
      const { firstName, lastName, phone } = parsed2.data;
      await pool2.query(
        `UPDATE users SET
           first_name = COALESCE($2, first_name),
           last_name = COALESCE($3, last_name),
           phone = CASE WHEN $4::boolean THEN $5 ELSE phone END,
           updated_at = NOW()
         WHERE id = $1`,
        [
          session.userId,
          firstName ?? null,
          lastName ?? null,
          phone !== void 0,
          phone ?? null
        ]
      );
      res.json(await buildMePayload(session.userId));
    })
  );
  r.post(
    "/password",
    asyncRoute(async (req, res) => {
      assertRateLimit(req);
      const session = await getSessionUser(req);
      if (!session)
        throw new HttpError(
          401,
          "authentication_required",
          "Connectez-vous pour continuer."
        );
      const parsed2 = passwordSchema.safeParse(req.body);
      if (!parsed2.success) {
        throw new HttpError(
          400,
          "invalid_data",
          parsed2.error.issues[0]?.message ?? "Donn\xE9es invalides."
        );
      }
      const pool2 = getPool();
      if (!pool2)
        throw new HttpError(
          503,
          "database_not_configured",
          "Base de donn\xE9es indisponible."
        );
      const q = await pool2.query(
        "SELECT password_hash FROM users WHERE id = $1",
        [session.userId]
      );
      const currentHash = q.rows[0]?.password_hash;
      if (!await verifyPassword(parsed2.data.currentPassword, currentHash)) {
        throw new HttpError(
          401,
          "invalid_credentials",
          "Le mot de passe actuel est incorrect."
        );
      }
      const newHash = await hashPassword(parsed2.data.newPassword);
      await pool2.query(
        "UPDATE users SET password_hash = $2, updated_at = NOW() WHERE id = $1",
        [session.userId, newHash]
      );
      await pool2.query(
        "DELETE FROM auth_sessions WHERE user_id = $1 AND id::text <> $2",
        [session.userId, session.sessionId]
      );
      res.json({ ok: true });
    })
  );
  r.post(
    "/forgot-password",
    asyncRoute(async (req, res) => {
      assertRateLimit(req);
      const parsed2 = forgotPasswordSchema.safeParse(req.body);
      if (!parsed2.success) {
        throw new HttpError(
          400,
          "invalid_data",
          parsed2.error.issues[0]?.message ?? "Donn\xE9es invalides."
        );
      }
      const { email } = parsed2.data;
      const pool2 = getPool();
      if (!pool2)
        throw new HttpError(
          503,
          "database_not_configured",
          "Base de donn\xE9es indisponible."
        );
      const genericResponse = {
        ok: true,
        message: "Si un compte existe avec cette adresse, un lien de r\xE9initialisation vient d'\xEAtre envoy\xE9. Pensez \xE0 v\xE9rifier vos ind\xE9sirables.",
        delivery: isMailerConfigured() ? "email" : "manual"
      };
      const q = await pool2.query(
        "SELECT id, email, status FROM users WHERE lower(email) = $1 LIMIT 1",
        [email]
      );
      const row = q.rows[0];
      if (!row || row.status !== "active") {
        res.json(genericResponse);
        return;
      }
      const token = await createPasswordResetToken(
        pool2,
        row.id,
        env.PASSWORD_RESET_TTL_MINUTES,
        req.ip ?? null
      );
      const resetUrl = buildResetUrl(req, token);
      const sent = await sendMail(
        passwordResetMessage(row.email, resetUrl, env.PASSWORD_RESET_TTL_MINUTES)
      );
      if (!sent && env.NODE_ENV !== "production") {
        genericResponse.reset_url = resetUrl;
        genericResponse.message = "Aucun service d'e-mail n'est configur\xE9 sur cet environnement : utilisez le lien ci-dessous pour r\xE9initialiser le mot de passe.";
      }
      res.json(genericResponse);
    })
  );
  r.get(
    "/reset-password",
    asyncRoute(async (req, res) => {
      const token = typeof req.query.token === "string" ? req.query.token : "";
      const pool2 = getPool();
      if (!pool2)
        throw new HttpError(
          503,
          "database_not_configured",
          "Base de donn\xE9es indisponible."
        );
      res.json({ valid: await isPasswordResetTokenValid(pool2, token) });
    })
  );
  r.post(
    "/reset-password",
    asyncRoute(async (req, res) => {
      assertRateLimit(req);
      const parsed2 = resetPasswordSchema.safeParse(req.body);
      if (!parsed2.success) {
        throw new HttpError(
          400,
          "invalid_data",
          parsed2.error.issues[0]?.message ?? "Donn\xE9es invalides."
        );
      }
      const pool2 = getPool();
      if (!pool2)
        throw new HttpError(
          503,
          "database_not_configured",
          "Base de donn\xE9es indisponible."
        );
      const userId = await consumePasswordResetToken(pool2, parsed2.data.token);
      if (!userId) {
        throw new HttpError(
          400,
          "invalid_reset_token",
          "Ce lien de r\xE9initialisation est invalide ou a expir\xE9. Demandez-en un nouveau."
        );
      }
      const newHash = await hashPassword(parsed2.data.password);
      await pool2.query(
        "UPDATE users SET password_hash = $2, updated_at = NOW() WHERE id = $1",
        [userId, newHash]
      );
      await pool2.query("DELETE FROM auth_sessions WHERE user_id = $1", [userId]);
      res.json({
        ok: true,
        message: "Votre mot de passe a \xE9t\xE9 r\xE9initialis\xE9. Vous pouvez maintenant vous connecter."
      });
    })
  );
  return r;
}

// server/onboarding.ts
init_db();
init_http();
init_auth();
init_entitlements();
init_default_catalog();
import { Router as Router3 } from "express";
import { z as z6 } from "zod";
var ONBOARDING_STAGES = ["station", "services", "workers", "plan", "review"];
var workerRoleSchema = z6.enum(["car_washer", "moto_washer", "versatile_washer", "team_lead", "custom"]);
var onboardingValidators = {
  station: z6.object({
    name: z6.string().trim().min(2, "Le nom de la station est obligatoire (2 caract\xE8res minimum)."),
    city: z6.string().trim().min(1, "La ville ou commune est obligatoire."),
    phone: z6.string().trim().max(30).optional().or(z6.literal("")),
    email: z6.string().trim().max(200).optional().or(z6.literal("")),
    address: z6.string().trim().max(300).optional().or(z6.literal("")),
    description: z6.string().trim().max(1e3).optional().or(z6.literal("")),
    logo_url: z6.string().trim().max(500).optional().or(z6.literal(""))
  }).strip(),
  services: z6.object({
    selected: z6.array(
      z6.object({
        template_id: z6.string().uuid().optional(),
        name: z6.string().trim().min(1).max(120),
        price_cents: z6.number().int().min(0).max(1e8).nullable()
      })
    ).default([]),
    custom: z6.array(
      z6.object({
        name: z6.string().trim().min(1).max(120),
        category: z6.string().trim().max(100).optional(),
        price_cents: z6.number().int().min(0).max(1e8).nullable()
      })
    ).default([])
  }).strip().refine((v) => v.selected.length + v.custom.length >= 1, {
    message: "S\xE9lectionnez ou cr\xE9ez au moins un service."
  }),
  workers: z6.object({
    workers: z6.array(
      z6.object({
        first_name: z6.string().trim().min(1).max(100),
        last_name: z6.string().trim().min(1).max(100),
        phone: z6.string().trim().max(30).optional().or(z6.literal("")),
        district: z6.string().trim().max(120).optional().or(z6.literal("")),
        role: workerRoleSchema,
        custom_role: z6.string().trim().max(100).optional().or(z6.literal("")),
        joined_at: z6.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z6.literal(""))
      }).strip().refine((w) => w.role !== "custom" || Boolean(w.custom_role), {
        message: "Pr\xE9cisez la fonction personnalis\xE9e."
      })
    ).default([])
  }).strip(),
  plan: z6.object({ plan: z6.string().trim().min(1) }).strip()
};
var progressUpdateSchema = z6.object({
  stage: z6.enum(["station", "services", "workers", "plan"]),
  data: z6.unknown(),
  plan_code: z6.string().trim().min(1).optional().nullable(),
  draft: z6.boolean().optional().default(false)
}).strip();
function db() {
  const pool2 = getPool();
  if (!pool2) throw new HttpError(503, "database_not_configured", "Base de donn\xE9es indisponible.");
  return pool2;
}
async function ensureProgressRow(pool2, organizationId) {
  await pool2.query(
    "INSERT INTO onboarding_progress (organization_id, current_stage) VALUES ($1::uuid, 'station') ON CONFLICT (organization_id) DO NOTHING",
    [organizationId]
  );
}
async function getProgress(pool2, organizationId) {
  await ensureProgressRow(pool2, organizationId);
  const q = await pool2.query(
    "SELECT current_stage, station_data, services_data, workers_data, plan_code, completed_at FROM onboarding_progress WHERE organization_id=$1::uuid",
    [organizationId]
  );
  return q.rows[0];
}
function nextStage(stage) {
  const index = ONBOARDING_STAGES.indexOf(stage);
  return ONBOARDING_STAGES[Math.min(index + 1, ONBOARDING_STAGES.length - 1)];
}
var PLAN_FIELDS = "id, code, name, description, price_cents, billing_cycle, max_users, max_workers, max_sites, max_services, features, sort_order";
function createOnboardingRouter() {
  const r = Router3();
  r.get(
    "/plans",
    asyncRoute(async (req, res) => {
      tenant(req);
      const q = await db().query(`SELECT ${PLAN_FIELDS} FROM plans ORDER BY sort_order, price_cents`);
      res.json(q.rows);
    })
  );
  r.get(
    "/service-catalog",
    asyncRoute(async (req, res) => {
      tenant(req);
      const q = await db().query(
        `SELECT id, category, name, price_cents, duration_minutes, description, sort_order
           FROM service_catalog WHERE is_active = true ORDER BY sort_order, name`
      );
      res.json(q.rows);
    })
  );
  r.get(
    "/onboarding/status",
    asyncRoute(async (req, res) => {
      const t = tenant(req);
      const pool2 = db();
      const progress = await getProgress(pool2, t.organizationId);
      const orgQ = await pool2.query("SELECT name, onboarding_completed FROM organizations WHERE id=$1::uuid", [t.organizationId]);
      const org = orgQ.rows[0] ?? { name: "Mon organisation", onboarding_completed: false };
      const completed = Boolean(org.onboarding_completed || progress.completed_at);
      const siteQ = await pool2.query(
        "SELECT id, name, phone, email, address, city, description, logo_url, slug FROM sites WHERE organization_id=$1::uuid ORDER BY created_at LIMIT 1",
        [t.organizationId]
      );
      const started = Boolean(
        progress.station_data || progress.services_data || progress.workers_data || progress.plan_code || progress.current_stage !== "station"
      );
      res.json({
        state: completed ? "completed" : started ? "in_progress" : "not_started",
        current_stage: progress.current_stage,
        org_name: org.name,
        station: siteQ.rows[0] ?? void 0
      });
    })
  );
  r.get(
    "/onboarding/progress",
    asyncRoute(async (req, res) => {
      const t = tenant(req);
      const progress = await getProgress(db(), t.organizationId);
      res.json(progress);
    })
  );
  r.put(
    "/onboarding/progress",
    requirePermission("settings:manage"),
    asyncRoute(async (req, res) => {
      const t = tenant(req);
      const pool2 = db();
      const input = body(progressUpdateSchema, req.body);
      await ensureProgressRow(pool2, t.organizationId);
      const columnByStage = {
        station: "station_data",
        services: "services_data",
        workers: "workers_data"
      };
      let planCode = null;
      let stageData = null;
      if (input.stage === "plan") {
        const data = body(onboardingValidators.plan, input.data);
        planCode = input.plan_code || data.plan;
        const planQ = await pool2.query("SELECT code FROM plans WHERE code=$1", [planCode]);
        if (!planQ.rowCount) throw new HttpError(400, "invalid_plan", "Ce forfait n'existe pas.");
      } else {
        stageData = body(onboardingValidators[input.stage], input.data);
      }
      const newStage = input.draft ? input.stage : nextStage(input.stage);
      if (input.stage === "plan") {
        await pool2.query(
          "UPDATE onboarding_progress SET plan_code=$2, current_stage=$3, draft=$4, updated_at=now() WHERE organization_id=$1::uuid",
          [t.organizationId, planCode, newStage, input.draft]
        );
      } else {
        await pool2.query(
          `UPDATE onboarding_progress SET ${columnByStage[input.stage]}=$2::jsonb, current_stage=$3, draft=$4, updated_at=now() WHERE organization_id=$1::uuid`,
          [t.organizationId, JSON.stringify(stageData), newStage, input.draft]
        );
      }
      const progress = await getProgress(pool2, t.organizationId);
      res.json(progress);
    })
  );
  r.get(
    "/onboarding/summary",
    asyncRoute(async (req, res) => {
      const t = tenant(req);
      const pool2 = db();
      const progress = await getProgress(pool2, t.organizationId);
      const orgQ = await pool2.query("SELECT name, onboarding_completed FROM organizations WHERE id=$1::uuid", [t.organizationId]);
      const org = orgQ.rows[0] ?? { name: "Mon organisation", onboarding_completed: false };
      const subscriptionQ = await pool2.query(
        `SELECT s.status, s.current_period_end, ${PLAN_FIELDS.split(", ").map((f) => `p.${f}`).join(", ")}
         FROM subscriptions s JOIN plans p ON p.id = s.plan_id WHERE s.organization_id=$1::uuid`,
        [t.organizationId]
      );
      let plan = null;
      let subscriptionStatus = "none";
      let subscriptionPeriodEnd = null;
      if (subscriptionQ.rowCount) {
        const { status, current_period_end, ...planRow } = subscriptionQ.rows[0];
        plan = planRow;
        subscriptionStatus = status;
        subscriptionPeriodEnd = current_period_end;
      } else if (progress.plan_code) {
        const planQ = await pool2.query(`SELECT ${PLAN_FIELDS} FROM plans WHERE code=$1`, [progress.plan_code]);
        plan = planQ.rows[0] ?? null;
        subscriptionStatus = "pending";
      }
      res.json({
        station: progress.station_data,
        services: progress.services_data,
        workers: progress.workers_data,
        plan,
        subscription_status: subscriptionStatus,
        subscription_period_end: subscriptionPeriodEnd,
        completed: Boolean(org.onboarding_completed || progress.completed_at),
        org_name: org.name
      });
    })
  );
  r.post(
    "/onboarding/confirm",
    requirePermission("settings:manage"),
    asyncRoute(async (req, res) => {
      const t = tenant(req);
      const pool2 = db();
      const orgQ = await pool2.query("SELECT onboarding_completed FROM organizations WHERE id=$1::uuid", [t.organizationId]);
      if (orgQ.rows[0]?.onboarding_completed) {
        res.json({ completed: true, already_completed: true });
        return;
      }
      const progress = await getProgress(pool2, t.organizationId);
      const station = onboardingValidators.station.safeParse(progress.station_data);
      if (!station.success) {
        throw new HttpError(409, "onboarding_incomplete", "Renseignez d'abord les informations de la station.");
      }
      const services = onboardingValidators.services.safeParse(progress.services_data ?? { selected: [], custom: [] });
      const workers = onboardingValidators.workers.safeParse(progress.workers_data ?? { workers: [] });
      const planCode = progress.plan_code ?? "starter";
      const client = await pool2.connect();
      try {
        await client.query("BEGIN");
        await client.query("SELECT pg_advisory_xact_lock(hashtext($1::text))", [t.organizationId]);
        const planQ = await client.query("SELECT id, price_cents FROM plans WHERE code=$1", [planCode]);
        if (!planQ.rowCount) throw new HttpError(400, "invalid_plan", "Ce forfait n'existe pas.");
        const plan = planQ.rows[0];
        const existingSite = await client.query(
          "SELECT id FROM sites WHERE organization_id=$1::uuid ORDER BY created_at LIMIT 1",
          [t.organizationId]
        );
        const s = station.data;
        if (existingSite.rowCount) {
          await client.query(
            `UPDATE sites SET name=$2, city=$3, address=$4, phone=$5, email=$6, description=$7, logo_url=$8, updated_at=now()
             WHERE id=$1::uuid`,
            [existingSite.rows[0].id, s.name, s.city, s.address || null, s.phone || null, s.email || null, s.description || null, s.logo_url || null]
          );
        } else {
          await client.query(
            `INSERT INTO sites(organization_id, name, city, address, phone, email, description, logo_url)
             VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
            [t.organizationId, s.name, s.city, s.address || null, s.phone || null, s.email || null, s.description || null, s.logo_url || null]
          );
        }
        const categoryQ = await client.query(
          "SELECT count(*)::int AS n FROM vehicle_categories WHERE organization_id=$1::uuid",
          [t.organizationId]
        );
        if (needsDefaultVehicleCategories(Number(categoryQ.rows[0]?.n ?? 0))) {
          for (const category of DEFAULT_VEHICLE_CATEGORIES) {
            await client.query(
              `INSERT INTO vehicle_categories(organization_id, name, family, sort_order)
               VALUES($1, $2, $3, $4)
               ON CONFLICT (organization_id, name) DO NOTHING`,
              [t.organizationId, category.name, category.family, category.sort_order]
            );
          }
        }
        const serviceCategoryQ = await client.query(
          "SELECT count(*)::int AS n FROM service_categories WHERE organization_id=$1::uuid",
          [t.organizationId]
        );
        const serviceCategoryByName = /* @__PURE__ */ new Map();
        if (Number(serviceCategoryQ.rows[0]?.n ?? 0) === 0) {
          for (const name of DEFAULT_SERVICE_CATEGORY_NAMES) {
            const inserted = await client.query(
              `INSERT INTO service_categories(organization_id, name)
               VALUES($1,$2)
               ON CONFLICT (organization_id, name) DO NOTHING
               RETURNING id`,
              [t.organizationId, name]
            );
            if (inserted.rowCount) serviceCategoryByName.set(name.toLowerCase(), inserted.rows[0].id);
          }
        } else {
          const existing = await client.query(
            "SELECT id, name FROM service_categories WHERE organization_id=$1::uuid",
            [t.organizationId]
          );
          for (const row of existing.rows) {
            serviceCategoryByName.set(String(row.name).toLowerCase(), row.id);
          }
        }
        if (services.success) {
          const templateIds = services.data.selected.map((item) => item.template_id).filter((id) => Boolean(id));
          const templates = /* @__PURE__ */ new Map();
          if (templateIds.length > 0) {
            const catalogQ = await client.query(
              "SELECT id, category, duration_minutes, description FROM service_catalog WHERE id = ANY($1::uuid[])",
              [templateIds]
            );
            for (const row of catalogQ.rows) {
              templates.set(String(row.id), {
                category: String(row.category),
                duration_minutes: row.duration_minutes == null ? null : Number(row.duration_minutes),
                description: row.description == null ? null : String(row.description)
              });
            }
          }
          const allServices = [
            ...services.data.selected.map((item) => {
              const template = item.template_id ? templates.get(item.template_id) : void 0;
              return {
                name: item.name,
                price_cents: item.price_cents ?? 0,
                categoryName: serviceCategoryName(template?.category),
                duration_minutes: template?.duration_minutes ?? null,
                description: template?.description ?? null,
                template_id: item.template_id ?? null
              };
            }),
            ...services.data.custom.map((item) => ({
              name: item.name,
              price_cents: item.price_cents ?? 0,
              categoryName: serviceCategoryName(item.category),
              duration_minutes: null,
              description: null,
              template_id: null
            }))
          ];
          for (const service of allServices) {
            const categoryId = serviceCategoryByName.get(service.categoryName.toLowerCase()) ?? null;
            await client.query(
              `INSERT INTO services(organization_id, template_id, name, price_cents, category_id, duration_minutes, description)
               SELECT $1, $7::uuid, $2, $3, $4, $5, $6
               WHERE NOT EXISTS (SELECT 1 FROM services WHERE organization_id=$1::uuid AND lower(name)=lower($2))`,
              [
                t.organizationId,
                service.name,
                service.price_cents,
                categoryId,
                service.duration_minutes,
                service.description,
                service.template_id
              ]
            );
          }
          await client.query(SERVICE_ELIGIBILITY_TRANSCRIPTION_SQL);
        }
        if (workers.success) {
          for (const worker of workers.data.workers) {
            await client.query(
              `INSERT INTO workers(organization_id, first_name, last_name, phone, district, role, custom_role, joined_at)
               SELECT $1,$2,$3,$4,$5,$6,$7,$8
               WHERE NOT EXISTS (
                 SELECT 1 FROM workers WHERE organization_id=$1::uuid AND lower(first_name)=lower($2) AND lower(last_name)=lower($3)
               )`,
              [
                t.organizationId,
                worker.first_name,
                worker.last_name,
                worker.phone || null,
                worker.district || null,
                worker.role,
                worker.role === "custom" ? worker.custom_role || null : null,
                worker.joined_at || null
              ]
            );
          }
        }
        await client.query(
          `INSERT INTO subscriptions(organization_id, plan_id, status, current_period_end, plan_changed_at)
           VALUES($1,$2,'trialing', now() + ($3 || ' days')::interval, now())
           ON CONFLICT (organization_id) DO UPDATE SET plan_id=EXCLUDED.plan_id, status=EXCLUDED.status, current_period_end=EXCLUDED.current_period_end, plan_changed_at=now(), updated_at=now()`,
          [t.organizationId, plan.id, String(TRIAL_DAYS)]
        );
        invalidateSubscriptionCache(t.organizationId);
        await client.query(
          "UPDATE onboarding_progress SET completed_at=now(), current_stage='review', draft=false, updated_at=now() WHERE organization_id=$1::uuid",
          [t.organizationId]
        );
        await client.query("UPDATE organizations SET onboarding_completed=true, updated_at=now() WHERE id=$1::uuid", [t.organizationId]);
        await client.query(
          "INSERT INTO audit_logs(organization_id, actor_user_id, action, entity_type, entity_id) VALUES($1,$2,'onboarding.completed','organization',$3)",
          [t.organizationId, t.userId, t.organizationId]
        );
        await client.query("COMMIT");
        res.status(201).json({ completed: true });
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    })
  );
  return r;
}

// server/branding.ts
init_db();
init_auth();
init_http();
import { Router as Router4 } from "express";
import { z as z7 } from "zod";
var BRAND_LOGO_MIME_TYPES = ["image/png", "image/jpeg", "image/webp"];
var BRAND_LOGO_MAX_BYTES = 3e5;
var STATION_COLOR_THEMES = [
  "bleu",
  "indigo",
  "violet",
  "teal",
  "emeraude",
  "ambre",
  "rose",
  "ardoise"
];
function looksLike(mime, data) {
  if (mime === "image/png") {
    return data.length >= 8 && data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  }
  if (mime === "image/jpeg") {
    return data.length >= 3 && data[0] === 255 && data[1] === 216 && data[2] === 255;
  }
  return data.length >= 12 && data.subarray(0, 4).toString("ascii") === "RIFF" && data.subarray(8, 12).toString("ascii") === "WEBP";
}
function decodeBrandLogo(input) {
  if (input.data_base64.length > BRAND_LOGO_MAX_BYTES * 4 / 3 + 4) {
    throw new HttpError(400, "brand_logo_too_large", "Le logo ne doit pas d\xE9passer 300 Ko.");
  }
  if (input.data_base64.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(input.data_base64)) {
    throw new HttpError(400, "invalid_brand_logo", "Le fichier du logo est illisible.");
  }
  const data = Buffer.from(input.data_base64, "base64");
  if (!data.length) {
    throw new HttpError(400, "invalid_brand_logo", "Le fichier du logo est vide.");
  }
  if (data.length > BRAND_LOGO_MAX_BYTES) {
    throw new HttpError(400, "brand_logo_too_large", "Le logo ne doit pas d\xE9passer 300 Ko.");
  }
  if (data.toString("base64") !== input.data_base64) {
    throw new HttpError(400, "invalid_brand_logo", "Le fichier du logo est illisible.");
  }
  if (!looksLike(input.mime_type, data)) {
    throw new HttpError(
      400,
      "invalid_brand_logo",
      "Le contenu du fichier ne correspond pas au format annonc\xE9. Utilisez une image PNG, JPEG ou WebP."
    );
  }
  return data;
}
function toImageBuffer(raw) {
  if (Buffer.isBuffer(raw)) return raw;
  if (raw instanceof Uint8Array) return Buffer.from(raw);
  return Buffer.from(String(raw ?? "").replace(/^\\x/, ""), "hex");
}
var logoValidator = z7.object({
  mime_type: z7.enum(BRAND_LOGO_MIME_TYPES),
  data_base64: z7.string().min(1, "Le fichier du logo est vide.")
}).strip();
var themeValidator = z7.object({
  color_theme: z7.enum(STATION_COLOR_THEMES).nullable()
}).strip();
function summarise(row) {
  if (!row?.logo_mime_type || !row.logo_updated_at) return null;
  const updatedAt = new Date(row.logo_updated_at);
  return {
    mime_type: row.logo_mime_type,
    byte_size: Number(row.logo_byte_size ?? 0),
    updated_at: updatedAt.toISOString(),
    url: logoUrl(updatedAt)
  };
}
function logoUrl(updatedAt) {
  const stamp = new Date(updatedAt).getTime();
  return `/api/v1/branding/logo?v=${Number.isFinite(stamp) ? stamp : 0}`;
}
function db2() {
  const pool2 = getPool();
  if (!pool2) throw new HttpError(503, "database_not_configured", "Base de donn\xE9es indisponible.");
  return pool2;
}
var SELECT_BRANDING = `SELECT logo_mime_type, logo_byte_size, logo_updated_at, brand_color
                           FROM organization_branding WHERE organization_id = $1::uuid`;
async function readBrandingRow(organizationId) {
  const q = await db2().query(SELECT_BRANDING, [organizationId]);
  return q.rows[0];
}
function createBrandingRouter() {
  const r = Router4();
  r.get(
    "/branding",
    asyncRoute(async (req, res) => {
      const t = tenant(req);
      const row = await readBrandingRow(t.organizationId);
      res.json({ logo: summarise(row), color_theme: row?.brand_color ?? null });
    })
  );
  r.get(
    "/branding/logo",
    asyncRoute(async (req, res) => {
      const t = tenant(req);
      const q = await db2().query(
        `SELECT logo_mime_type, logo_byte_size, logo_updated_at, logo_data
           FROM organization_branding WHERE organization_id = $1::uuid`,
        [t.organizationId]
      );
      const row = q.rows[0];
      if (!row?.logo_mime_type || !row.logo_data) {
        throw new HttpError(404, "brand_logo_not_found", "Cette station n'a pas de logo personnalis\xE9.");
      }
      const data = toImageBuffer(row.logo_data);
      const etag = `W/"${new Date(row.logo_updated_at ?? Date.now()).getTime()}-${data.length}"`;
      if (req.headers["if-none-match"] === etag) {
        res.status(304).end();
        return;
      }
      const extension = row.logo_mime_type === "image/webp" ? "webp" : row.logo_mime_type === "image/jpeg" ? "jpg" : "png";
      res.setHeader("Content-Type", row.logo_mime_type);
      res.setHeader("Content-Length", String(data.length));
      res.setHeader("Content-Disposition", `inline; filename="logo.${extension}"`);
      res.setHeader("Cache-Control", "private, max-age=86400");
      res.setHeader("ETag", etag);
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.send(data);
    })
  );
  r.put(
    "/branding/logo",
    requirePermission("settings:manage"),
    asyncRoute(async (req, res) => {
      const t = tenant(req);
      const input = body(logoValidator, req.body);
      const data = decodeBrandLogo(input);
      const pool2 = db2();
      const q = await pool2.query(
        `INSERT INTO organization_branding(organization_id, logo_mime_type, logo_byte_size, logo_data, logo_updated_at, updated_by, updated_at)
         VALUES($1::uuid, $2, $3, $4, now(), $5::uuid, now())
         ON CONFLICT (organization_id) DO UPDATE SET
           logo_mime_type = EXCLUDED.logo_mime_type,
           logo_byte_size = EXCLUDED.logo_byte_size,
           logo_data = EXCLUDED.logo_data,
           logo_updated_at = now(),
           updated_by = EXCLUDED.updated_by,
           updated_at = now()
         RETURNING logo_mime_type, logo_byte_size, logo_updated_at, brand_color`,
        [t.organizationId, input.mime_type, data.length, data, t.userId]
      );
      await pool2.query(
        `INSERT INTO audit_logs(organization_id, actor_user_id, action, entity_type, entity_id, metadata)
         VALUES($1::uuid, $2::uuid, 'branding.logo_updated', 'organization', $1::text, $3::jsonb)`,
        [t.organizationId, t.userId, JSON.stringify({ mime_type: input.mime_type, byte_size: data.length })]
      );
      res.status(200).json({ logo: summarise(q.rows[0]) });
    })
  );
  r.delete(
    "/branding/logo",
    requirePermission("settings:manage"),
    asyncRoute(async (req, res) => {
      const t = tenant(req);
      const pool2 = db2();
      const client = await pool2.connect();
      try {
        await client.query("BEGIN");
        const updated = await client.query(
          `UPDATE organization_branding
              SET logo_mime_type = NULL, logo_byte_size = NULL, logo_data = NULL,
                  logo_updated_at = NULL, updated_at = now()
            WHERE organization_id = $1::uuid AND logo_data IS NOT NULL`,
          [t.organizationId]
        );
        await client.query(
          "DELETE FROM organization_branding WHERE organization_id = $1::uuid AND brand_color IS NULL",
          [t.organizationId]
        );
        if (updated.rowCount) {
          await client.query(
            `INSERT INTO audit_logs(organization_id, actor_user_id, action, entity_type, entity_id)
             VALUES($1::uuid, $2::uuid, 'branding.logo_removed', 'organization', $1::text)`,
            [t.organizationId, t.userId]
          );
        }
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK").catch(() => void 0);
        throw error;
      } finally {
        client.release();
      }
      res.status(200).json({ logo: null });
    })
  );
  r.put(
    "/branding/theme",
    requirePermission("settings:manage"),
    asyncRoute(async (req, res) => {
      const t = tenant(req);
      const input = body(themeValidator, req.body);
      const pool2 = db2();
      const q = await pool2.query(
        `INSERT INTO organization_branding(organization_id, brand_color, updated_by, updated_at)
         VALUES($1::uuid, $2, $3::uuid, now())
         ON CONFLICT (organization_id) DO UPDATE SET
           brand_color = EXCLUDED.brand_color,
           updated_by = EXCLUDED.updated_by,
           updated_at = now()
         RETURNING brand_color`,
        [t.organizationId, input.color_theme, t.userId]
      );
      if (!input.color_theme) {
        await pool2.query(
          "DELETE FROM organization_branding WHERE organization_id = $1::uuid AND brand_color IS NULL AND logo_data IS NULL",
          [t.organizationId]
        );
      }
      await pool2.query(
        `INSERT INTO audit_logs(organization_id, actor_user_id, action, entity_type, entity_id, metadata)
         VALUES($1::uuid, $2::uuid, 'branding.color_updated', 'organization', $1::text, $3::jsonb)`,
        [t.organizationId, t.userId, JSON.stringify({ color_theme: input.color_theme })]
      );
      res.status(200).json({ color_theme: q.rows[0]?.brand_color ?? null });
    })
  );
  return r;
}

// server/api.ts
init_db();
init_http();
import { Router as Router8 } from "express";
import { z as z11 } from "zod";

// server/idempotency.ts
init_auth();
import { createHash as createHash3 } from "node:crypto";
function stableStringify(value) {
  return JSON.stringify(
    value,
    (_key, item) => item && typeof item === "object" && !Array.isArray(item) ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item
  );
}
function fingerprint(value) {
  return createHash3("sha256").update(stableStringify(value)).digest("hex");
}
function requireIdempotencyKey(value) {
  const key = value?.trim();
  if (!key || key.length > 200 || hasControlCharacters(key)) {
    throw new HttpError(400, "idempotency_key_required", "En-t\xEAte Idempotency-Key requis et valide.");
  }
  return key;
}
function hasControlCharacters(value) {
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    if (code < 32 || code >= 127 && code <= 159) return true;
  }
  return false;
}
async function withIdempotency(pool2, req, res, organizationId, payloadFingerprint, handler2) {
  const key = requireIdempotencyKey(req.get("Idempotency-Key") ?? void 0);
  const existing = await pool2.query(
    "SELECT fingerprint, response_status, response_body FROM idempotency_keys WHERE organization_id=$1::uuid AND key=$2",
    [organizationId, key]
  );
  if (existing.rowCount) {
    const row = existing.rows[0];
    if (row.fingerprint !== payloadFingerprint) {
      throw new HttpError(409, "idempotency_key_conflict", "Cette cl\xE9 d\u2019idempotence a d\xE9j\xE0 \xE9t\xE9 utilis\xE9e avec un contenu diff\xE9rent.");
    }
    if (row.response_status == null) {
      throw new HttpError(409, "idempotency_in_progress", "Une requ\xEAte identique est d\xE9j\xE0 en cours de traitement.");
    }
    res.setHeader("Idempotency-Replayed", "true");
    res.status(row.response_status).json(row.response_body);
    return;
  }
  const reserved = await pool2.query(
    "INSERT INTO idempotency_keys(organization_id,key,fingerprint) VALUES($1,$2,$3) ON CONFLICT (organization_id,key) DO NOTHING RETURNING id",
    [organizationId, key, payloadFingerprint]
  );
  if (!reserved.rowCount) {
    throw new HttpError(409, "idempotency_in_progress", "Une requ\xEAte identique est d\xE9j\xE0 en cours de traitement.");
  }
  try {
    const result = await handler2();
    await pool2.query(
      "UPDATE idempotency_keys SET response_status=$3, response_body=$4 WHERE organization_id=$1::uuid AND key=$2",
      [organizationId, key, result.status, JSON.stringify(result.body ?? null)]
    );
    res.status(result.status).json(result.body);
  } catch (error) {
    await pool2.query("DELETE FROM idempotency_keys WHERE organization_id=$1::uuid AND key=$2 AND response_status IS NULL", [organizationId, key]).catch(() => {
    });
    throw error;
  }
}

// server/stock.ts
init_db();
init_http();
init_auth();
init_entitlements();
import { Router as Router5 } from "express";
import { z as z8 } from "zod";

// server/stock-rules.ts
var UNITS = ["unite", "sachet", "litre", "kilogramme"];
function signedQuantity(kind, quantityMilli2) {
  return kind === "exit" ? -Math.abs(quantityMilli2) : Math.abs(quantityMilli2);
}
function isLowStock(stockMilli, thresholdMilli) {
  if (thresholdMilli <= 0) return false;
  return stockMilli <= thresholdMilli;
}
function inventoryDelta(countedMilli, currentMilli) {
  return countedMilli - currentMilli;
}
function canApply(stockMilli, signedQuantityMilli) {
  return stockMilli + signedQuantityMilli >= 0;
}

// server/stock.ts
function db3() {
  const pool2 = getPool();
  if (!pool2) throw new HttpError(503, "database_not_configured", "Base de donn\xE9es indisponible.");
  return pool2;
}
var quantityMilli = z8.number().int().positive().max(1e9);
var stockValidators = {
  category: z8.object({
    name: z8.string().trim().min(1, "Donnez un nom \xE0 la cat\xE9gorie.").max(120)
  }).strip(),
  product: z8.object({
    name: z8.string().trim().min(1, "Donnez un nom au produit.").max(200),
    category_id: z8.string().uuid().nullable().optional(),
    unit: z8.enum(UNITS).default("unite"),
    unit_cost_cents: z8.number().int().min(0).max(1e8).default(0),
    low_stock_threshold_milli: z8.number().int().min(0).max(1e9).default(0),
    initial_quantity_milli: z8.number().int().min(0).max(1e9).default(0)
  }).strip(),
  productPatch: z8.object({
    name: z8.string().trim().min(1).max(200).optional(),
    category_id: z8.string().uuid().nullable().optional(),
    unit_cost_cents: z8.number().int().min(0).max(1e8).optional(),
    low_stock_threshold_milli: z8.number().int().min(0).max(1e9).optional(),
    is_active: z8.boolean().optional()
  }).strip(),
  movement: z8.object({
    product_id: z8.string().uuid(),
    kind: z8.enum(["entry", "exit"]),
    quantity_milli: quantityMilli,
    site_id: z8.string().uuid().nullable().optional(),
    reason: z8.string().trim().max(500).nullable().optional(),
    reference: z8.string().trim().max(120).nullable().optional()
  }).strip(),
  inventory: z8.object({
    counted_milli: z8.number().int().min(0).max(1e9),
    reason: z8.string().trim().max(500).nullable().optional()
  }).strip(),
  consumables: z8.object({
    items: z8.array(
      z8.object({
        product_id: z8.string().uuid(),
        quantity_milli: quantityMilli
      })
    ).max(20)
  }).strip(),
  reversal: z8.object({
    reason: z8.string().trim().min(1, "Indiquez pourquoi ce mouvement est annul\xE9.").max(500)
  }).strip()
};
var PRODUCT_FIELDS = `p.id, p.name, p.category_id, p.unit, p.unit_cost_cents, p.unit_cost_updated_at,
  p.low_stock_threshold_milli, p.is_active, p.created_at`;
var MOVEMENT_FIELDS = `m.id, m.product_id, m.site_id, m.kind, m.quantity_milli,
  m.unit_cost_cents, m.reason, m.reference, m.reverses_movement_id, m.wash_id, m.purchase_id, m.created_at`;
async function lockedStock(client, organizationId, productId) {
  const productQ = await client.query(
    `SELECT id, name, unit, unit_cost_cents, low_stock_threshold_milli, is_active
     FROM products WHERE id=$1::uuid AND organization_id=$2::uuid FOR UPDATE`,
    [productId, organizationId]
  );
  if (!productQ.rowCount) throw new HttpError(404, "product_not_found", "Produit introuvable.");
  const stockQ = await client.query(
    `SELECT COALESCE(SUM(quantity_milli),0)::int AS stock_milli
     FROM stock_movements WHERE product_id=$1::uuid AND organization_id=$2::uuid`,
    [productId, organizationId]
  );
  return {
    product: productQ.rows[0],
    stockMilli: Number(stockQ.rows[0].stock_milli ?? 0)
  };
}
async function assertSite(client, organizationId, siteId) {
  if (!siteId) return;
  const q = await client.query("SELECT 1 FROM sites WHERE id=$1::uuid AND organization_id=$2::uuid", [
    siteId,
    organizationId
  ]);
  if (!q.rowCount) throw new HttpError(400, "invalid_site", "Station invalide.");
}
async function consumeForWash(client, organizationId, washId, items, userId) {
  if (items.length === 0) return;
  const serviceIds = [...new Set(items.map((item) => item.service_id))];
  const recettes = await client.query(
    `SELECT sc.service_id, sc.product_id, sc.quantity_milli, p.unit_cost_cents
     FROM service_consumables sc
     JOIN products p ON p.id = sc.product_id
     WHERE sc.organization_id=$1::uuid AND sc.service_id = ANY($2::uuid[]) AND p.is_active`,
    [organizationId, serviceIds]
  );
  if (!recettes.rowCount) return;
  const parProduit = /* @__PURE__ */ new Map();
  for (const item of items) {
    for (const recette of recettes.rows) {
      if (recette.service_id !== item.service_id) continue;
      const productId = String(recette.product_id);
      const ajout = Number(recette.quantity_milli) * item.quantity;
      const courant = parProduit.get(productId);
      if (courant) courant.quantite += ajout;
      else parProduit.set(productId, { quantite: ajout, cout: Number(recette.unit_cost_cents) });
    }
  }
  for (const [productId, { quantite, cout }] of parProduit) {
    await client.query(
      `INSERT INTO stock_movements(organization_id, product_id, wash_id, kind, quantity_milli,
         unit_cost_cents, reason, created_by)
       VALUES($1,$2,$3,'consumption',$4,$5,'Consommation automatique du lavage',$6)`,
      [organizationId, productId, washId, -quantite, cout, userId]
    );
  }
}
async function reverseWashConsumption(client, organizationId, washId, userId) {
  const aContrepasser = await client.query(
    `SELECT m.id, m.product_id, m.quantity_milli, m.unit_cost_cents
     FROM stock_movements m
     WHERE m.organization_id=$1::uuid AND m.wash_id=$2::uuid AND m.kind='consumption'
       AND NOT EXISTS (SELECT 1 FROM stock_movements r WHERE r.reverses_movement_id = m.id)`,
    [organizationId, washId]
  );
  for (const mouvement of aContrepasser.rows) {
    await client.query(
      `INSERT INTO stock_movements(organization_id, product_id, wash_id, kind, quantity_milli,
         unit_cost_cents, reason, reverses_movement_id, created_by)
       VALUES($1,$2,$3,'reversal',$4,$5,'Lavage annul\xE9 : consommation rendue au stock',$6,$7)`,
      [
        organizationId,
        mouvement.product_id,
        washId,
        -Number(mouvement.quantity_milli),
        mouvement.unit_cost_cents,
        mouvement.id,
        userId
      ]
    );
  }
}
function createStockRouter() {
  const r = Router5();
  r.get(
    "/product-categories",
    requirePermission("stock:read"),
    requireCapability("stock.manage"),
    asyncRoute(async (req, res) => {
      const t = tenant(req);
      const q = await db3().query(
        `SELECT id, name, is_active, created_at FROM product_categories
         WHERE organization_id=$1::uuid ORDER BY name`,
        [t.organizationId]
      );
      res.json(q.rows);
    })
  );
  r.post(
    "/product-categories",
    requirePermission("stock:manage"),
    requireCapability("stock.manage"),
    asyncRoute(async (req, res) => {
      const t = tenant(req);
      const input = body(stockValidators.category, req.body);
      const existing = await db3().query(
        "SELECT 1 FROM product_categories WHERE organization_id=$1::uuid AND lower(name)=lower($2)",
        [t.organizationId, input.name]
      );
      if (existing.rowCount) {
        throw new HttpError(409, "category_exists", "Une cat\xE9gorie porte d\xE9j\xE0 ce nom.");
      }
      const q = await db3().query(
        `INSERT INTO product_categories(organization_id, name) VALUES($1,$2)
         RETURNING id, name, is_active, created_at`,
        [t.organizationId, input.name]
      );
      res.status(201).json(q.rows[0]);
    })
  );
  r.get(
    "/products",
    requirePermission("stock:read"),
    requireCapability("stock.manage"),
    asyncRoute(async (req, res) => {
      const t = tenant(req);
      const q = await db3().query(
        `SELECT ${PRODUCT_FIELDS}, c.name AS category_name,
                COALESCE(SUM(m.quantity_milli),0)::int AS stock_milli
         FROM products p
         LEFT JOIN product_categories c ON c.id = p.category_id
         LEFT JOIN stock_movements m ON m.product_id = p.id
         WHERE p.organization_id=$1::uuid
         GROUP BY p.id, c.name
         ORDER BY p.is_active DESC, p.name`,
        [t.organizationId]
      );
      res.json(
        q.rows.map((row) => ({
          ...row,
          low_stock: isLowStock(Number(row.stock_milli), Number(row.low_stock_threshold_milli))
        }))
      );
    })
  );
  r.post(
    "/products",
    requirePermission("stock:manage"),
    requireCapability("stock.manage"),
    asyncRoute(async (req, res) => {
      const t = tenant(req);
      const input = body(stockValidators.product, req.body);
      const pool2 = db3();
      const client = await pool2.connect();
      try {
        await client.query("BEGIN");
        const existing = await client.query(
          "SELECT 1 FROM products WHERE organization_id=$1::uuid AND lower(name)=lower($2)",
          [t.organizationId, input.name]
        );
        if (existing.rowCount) {
          throw new HttpError(409, "product_exists", "Un produit porte d\xE9j\xE0 ce nom.");
        }
        if (input.category_id) {
          const catQ = await client.query(
            "SELECT 1 FROM product_categories WHERE id=$1::uuid AND organization_id=$2::uuid",
            [input.category_id, t.organizationId]
          );
          if (!catQ.rowCount) throw new HttpError(400, "invalid_category", "Cat\xE9gorie invalide.");
        }
        const q = await client.query(
          `INSERT INTO products(organization_id, category_id, name, unit, unit_cost_cents,
             low_stock_threshold_milli, created_by)
           VALUES($1,$2,$3,$4,$5,$6,$7)
           RETURNING id, name, category_id, unit, unit_cost_cents, low_stock_threshold_milli, is_active, created_at`,
          [
            t.organizationId,
            input.category_id ?? null,
            input.name,
            input.unit,
            input.unit_cost_cents,
            input.low_stock_threshold_milli,
            t.userId
          ]
        );
        const product = q.rows[0];
        if (input.initial_quantity_milli > 0) {
          await client.query(
            `INSERT INTO stock_movements(organization_id, product_id, kind, quantity_milli,
               unit_cost_cents, reason, created_by)
             VALUES($1,$2,'initial',$3,$4,'Stock initial \xE0 la cr\xE9ation du produit',$5)`,
            [t.organizationId, product.id, input.initial_quantity_milli, input.unit_cost_cents, t.userId]
          );
        }
        await client.query(
          `INSERT INTO audit_logs(organization_id, actor_user_id, action, entity_type, entity_id, metadata)
           VALUES($1,$2,'product.created','product',$3,$4)`,
          [
            t.organizationId,
            t.userId,
            product.id,
            JSON.stringify({ name: product.name, initial_quantity_milli: input.initial_quantity_milli })
          ]
        );
        await client.query("COMMIT");
        res.status(201).json({ ...product, stock_milli: input.initial_quantity_milli });
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    })
  );
  r.patch(
    "/products/:id",
    requirePermission("stock:manage"),
    requireCapability("stock.manage"),
    asyncRoute(async (req, res) => {
      const t = tenant(req);
      const id = parseId(req.params.id);
      const input = body(stockValidators.productPatch, req.body);
      const client = await db3().connect();
      try {
        await client.query("BEGIN");
        const oldQ = await client.query(
          `SELECT id, name, category_id, unit, unit_cost_cents, low_stock_threshold_milli, is_active
           FROM products WHERE id=$1::uuid AND organization_id=$2::uuid FOR UPDATE`,
          [id, t.organizationId]
        );
        if (!oldQ.rowCount) throw new HttpError(404, "product_not_found", "Produit introuvable.");
        const old = oldQ.rows[0];
        if (input.category_id) {
          const catQ = await client.query(
            "SELECT 1 FROM product_categories WHERE id=$1::uuid AND organization_id=$2::uuid",
            [input.category_id, t.organizationId]
          );
          if (!catQ.rowCount) throw new HttpError(400, "invalid_category", "Cat\xE9gorie invalide.");
        }
        if (input.name && input.name.toLowerCase() !== String(old.name).toLowerCase()) {
          const dup = await client.query(
            "SELECT 1 FROM products WHERE organization_id=$1::uuid AND lower(name)=lower($2) AND id <> $3::uuid",
            [t.organizationId, input.name, id]
          );
          if (dup.rowCount) throw new HttpError(409, "product_exists", "Un produit porte d\xE9j\xE0 ce nom.");
        }
        const merged = { ...old, ...input };
        const q = await client.query(
          // Corriger le cout a la main efface la marque laissee par le dernier
          // achat : l'ecran ne doit pas continuer a annoncer « prix paye le... »
          // alors que le chiffre vient d'etre retape.
          `UPDATE products SET name=$3, category_id=$4, unit_cost_cents=$5,
             low_stock_threshold_milli=$6, is_active=$7,
             unit_cost_updated_at = CASE WHEN $5 <> unit_cost_cents THEN NULL ELSE unit_cost_updated_at END
           WHERE id=$1::uuid AND organization_id=$2::uuid
           RETURNING id, name, category_id, unit, unit_cost_cents, unit_cost_updated_at,
                     low_stock_threshold_milli, is_active, created_at`,
          [
            id,
            t.organizationId,
            merged.name,
            merged.category_id ?? null,
            merged.unit_cost_cents,
            merged.low_stock_threshold_milli,
            merged.is_active
          ]
        );
        await client.query(
          `INSERT INTO audit_logs(organization_id, actor_user_id, action, entity_type, entity_id, metadata)
           VALUES($1,$2,'product.updated','product',$3,$4)`,
          [
            t.organizationId,
            t.userId,
            id,
            JSON.stringify({
              unit_cost_cents: { from: old.unit_cost_cents, to: merged.unit_cost_cents }
            })
          ]
        );
        await client.query("COMMIT");
        res.json(q.rows[0]);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    })
  );
  r.get(
    "/stock-movements",
    requirePermission("stock:read"),
    requireCapability("stock.manage"),
    asyncRoute(async (req, res) => {
      const t = tenant(req);
      const productId = typeof req.query.product_id === "string" ? parseId(req.query.product_id) : null;
      const q = await db3().query(
        `SELECT ${MOVEMENT_FIELDS}, p.name AS product_name, p.unit,
                u.first_name, u.last_name, w.reference AS wash_reference,
                pu.reference AS purchase_reference
         FROM stock_movements m
         JOIN products p ON p.id = m.product_id
         LEFT JOIN users u ON u.id = m.created_by
         LEFT JOIN washes w ON w.id = m.wash_id AND w.organization_id = m.organization_id
         LEFT JOIN purchases pu ON pu.id = m.purchase_id AND pu.organization_id = m.organization_id
         WHERE m.organization_id=$1::uuid AND ($2::uuid IS NULL OR m.product_id=$2::uuid)
         ORDER BY m.created_at DESC LIMIT 200`,
        [t.organizationId, productId]
      );
      res.json(q.rows);
    })
  );
  r.post(
    "/stock-movements",
    requirePermission("stock:move"),
    requireCapability("stock.manage"),
    asyncRoute(async (req, res) => {
      const t = tenant(req);
      const input = body(stockValidators.movement, req.body);
      const pool2 = db3();
      await withIdempotency(
        pool2,
        req,
        res,
        t.organizationId,
        fingerprint({ op: "stock_movement", ...input }),
        async () => {
          const client = await pool2.connect();
          try {
            await client.query("BEGIN");
            await assertSite(client, t.organizationId, input.site_id ?? null);
            const { product, stockMilli } = await lockedStock(client, t.organizationId, input.product_id);
            if (!product.is_active) {
              throw new HttpError(409, "product_archived", "Ce produit est archiv\xE9. R\xE9activez-le avant de le mouvementer.");
            }
            const signed = signedQuantity(input.kind, input.quantity_milli);
            if (!canApply(stockMilli, signed)) {
              throw new HttpError(
                409,
                "insufficient_stock",
                "Le stock disponible ne permet pas cette sortie. Enregistrez un inventaire si le stock r\xE9el est diff\xE9rent."
              );
            }
            const q = await client.query(
              `INSERT INTO stock_movements(organization_id, product_id, site_id, kind, quantity_milli,
                 unit_cost_cents, reason, reference, created_by)
               VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING ${MOVEMENT_FIELDS.replace(/m\./g, "")}`,
              [
                t.organizationId,
                input.product_id,
                input.site_id ?? null,
                input.kind,
                signed,
                product.unit_cost_cents,
                input.reason || null,
                input.reference || null,
                t.userId
              ]
            );
            const movement = q.rows[0];
            await client.query(
              `INSERT INTO audit_logs(organization_id, actor_user_id, action, entity_type, entity_id, metadata)
               VALUES($1,$2,'stock.moved','stock_movement',$3,$4)`,
              [
                t.organizationId,
                t.userId,
                movement.id,
                JSON.stringify({
                  product_id: input.product_id,
                  kind: input.kind,
                  quantity_milli: signed,
                  stock_after_milli: stockMilli + signed
                })
              ]
            );
            await client.query("COMMIT");
            return { status: 201, body: { ...movement, stock_milli: stockMilli + signed } };
          } catch (error) {
            await client.query("ROLLBACK");
            throw error;
          } finally {
            client.release();
          }
        }
      );
    })
  );
  r.post(
    "/products/:id/inventory",
    requirePermission("stock:move"),
    requireCapability("stock.manage"),
    asyncRoute(async (req, res) => {
      const t = tenant(req);
      const id = parseId(req.params.id);
      const input = body(stockValidators.inventory, req.body);
      const client = await db3().connect();
      try {
        await client.query("BEGIN");
        const { product, stockMilli } = await lockedStock(client, t.organizationId, id);
        const delta = inventoryDelta(input.counted_milli, stockMilli);
        if (delta === 0) {
          await client.query("COMMIT");
          res.json({ movement: null, stock_milli: stockMilli, delta_milli: 0 });
          return;
        }
        const q = await client.query(
          `INSERT INTO stock_movements(organization_id, product_id, kind, quantity_milli,
             unit_cost_cents, reason, created_by)
           VALUES($1,$2,'inventory',$3,$4,$5,$6) RETURNING ${MOVEMENT_FIELDS.replace(/m\./g, "")}`,
          [
            t.organizationId,
            id,
            delta,
            product.unit_cost_cents,
            input.reason || `Inventaire physique : ${input.counted_milli} milli\xE8mes compt\xE9s`,
            t.userId
          ]
        );
        await client.query(
          `INSERT INTO audit_logs(organization_id, actor_user_id, action, entity_type, entity_id, metadata)
           VALUES($1,$2,'stock.inventory','stock_movement',$3,$4)`,
          [
            t.organizationId,
            t.userId,
            q.rows[0].id,
            JSON.stringify({
              product_id: id,
              theorique_milli: stockMilli,
              compte_milli: input.counted_milli,
              ecart_milli: delta
            })
          ]
        );
        await client.query("COMMIT");
        res.status(201).json({ movement: q.rows[0], stock_milli: input.counted_milli, delta_milli: delta });
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    })
  );
  r.post(
    "/stock-movements/:id/reverse",
    requirePermission("stock:move"),
    requireCapability("stock.manage"),
    asyncRoute(async (req, res) => {
      const t = tenant(req);
      const id = parseId(req.params.id);
      const input = body(stockValidators.reversal, req.body);
      const client = await db3().connect();
      try {
        await client.query("BEGIN");
        const originalQ = await client.query(
          `SELECT id, product_id, site_id, kind, quantity_milli, unit_cost_cents
           FROM stock_movements WHERE id=$1::uuid AND organization_id=$2::uuid FOR UPDATE`,
          [id, t.organizationId]
        );
        if (!originalQ.rowCount) throw new HttpError(404, "movement_not_found", "Mouvement introuvable.");
        const original = originalQ.rows[0];
        if (original.kind === "reversal") {
          throw new HttpError(409, "already_reversal", "Une contrepassation ne peut pas \xEAtre contrepass\xE9e.");
        }
        const alreadyQ = await client.query(
          "SELECT 1 FROM stock_movements WHERE reverses_movement_id=$1::uuid AND organization_id=$2::uuid",
          [id, t.organizationId]
        );
        if (alreadyQ.rowCount) {
          throw new HttpError(409, "already_reversed", "Ce mouvement a d\xE9j\xE0 \xE9t\xE9 contrepass\xE9.");
        }
        const { stockMilli } = await lockedStock(client, t.organizationId, String(original.product_id));
        const inverse = -Number(original.quantity_milli);
        if (!canApply(stockMilli, inverse)) {
          throw new HttpError(
            409,
            "insufficient_stock",
            "Annuler cette entr\xE9e rendrait le stock n\xE9gatif : une partie a d\xE9j\xE0 \xE9t\xE9 consomm\xE9e."
          );
        }
        const q = await client.query(
          `INSERT INTO stock_movements(organization_id, product_id, site_id, kind, quantity_milli,
             unit_cost_cents, reason, reverses_movement_id, created_by)
           VALUES($1,$2,$3,'reversal',$4,$5,$6,$7,$8) RETURNING ${MOVEMENT_FIELDS.replace(/m\./g, "")}`,
          [
            t.organizationId,
            original.product_id,
            original.site_id,
            inverse,
            original.unit_cost_cents,
            input.reason,
            id,
            t.userId
          ]
        );
        await client.query(
          `INSERT INTO audit_logs(organization_id, actor_user_id, action, entity_type, entity_id, metadata)
           VALUES($1,$2,'stock.reversed','stock_movement',$3,$4)`,
          [
            t.organizationId,
            t.userId,
            q.rows[0].id,
            JSON.stringify({ reverses: id, reason: input.reason, quantity_milli: inverse })
          ]
        );
        await client.query("COMMIT");
        res.status(201).json({ ...q.rows[0], stock_milli: stockMilli + inverse });
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    })
  );
  r.get(
    "/services/:id/consumables",
    requirePermission("service:read"),
    requireCapability("stock.manage"),
    asyncRoute(async (req, res) => {
      const t = tenant(req);
      const id = parseId(req.params.id);
      const q = await db3().query(
        `SELECT sc.product_id, sc.quantity_milli, p.name AS product_name, p.unit, p.is_active
         FROM service_consumables sc
         JOIN products p ON p.id = sc.product_id
         WHERE sc.organization_id=$1::uuid AND sc.service_id=$2::uuid
         ORDER BY p.name`,
        [t.organizationId, id]
      );
      res.json(q.rows);
    })
  );
  r.put(
    "/services/:id/consumables",
    requirePermission("service:manage"),
    requireCapability("stock.manage"),
    asyncRoute(async (req, res) => {
      const t = tenant(req);
      const id = parseId(req.params.id);
      const input = body(stockValidators.consumables, req.body);
      const client = await db3().connect();
      try {
        await client.query("BEGIN");
        const serviceQ = await client.query(
          "SELECT id FROM services WHERE id=$1::uuid AND organization_id=$2::uuid FOR UPDATE",
          [id, t.organizationId]
        );
        if (!serviceQ.rowCount) throw new HttpError(404, "service_not_found", "Prestation introuvable.");
        const productIds = input.items.map((item) => item.product_id);
        if (new Set(productIds).size !== productIds.length) {
          throw new HttpError(400, "duplicate_product", "Un m\xEAme produit ne peut figurer qu'une fois dans la recette.");
        }
        if (productIds.length > 0) {
          const connus = await client.query(
            "SELECT id FROM products WHERE organization_id=$1::uuid AND id = ANY($2::uuid[])",
            [t.organizationId, productIds]
          );
          if (connus.rowCount !== productIds.length) {
            throw new HttpError(400, "invalid_product", "Produit inconnu dans cette station.");
          }
        }
        await client.query(
          "DELETE FROM service_consumables WHERE organization_id=$1::uuid AND service_id=$2::uuid",
          [t.organizationId, id]
        );
        for (const item of input.items) {
          await client.query(
            `INSERT INTO service_consumables(organization_id, service_id, product_id, quantity_milli)
             VALUES($1,$2,$3,$4)`,
            [t.organizationId, id, item.product_id, item.quantity_milli]
          );
        }
        await client.query(
          `INSERT INTO audit_logs(organization_id, actor_user_id, action, entity_type, entity_id, metadata)
           VALUES($1,$2,'service.consumables_updated','service',$3,$4)`,
          [t.organizationId, t.userId, id, JSON.stringify({ count: input.items.length })]
        );
        await client.query("COMMIT");
        const q = await client.query(
          `SELECT sc.product_id, sc.quantity_milli, p.name AS product_name, p.unit, p.is_active
           FROM service_consumables sc JOIN products p ON p.id = sc.product_id
           WHERE sc.organization_id=$1::uuid AND sc.service_id=$2::uuid ORDER BY p.name`,
          [t.organizationId, id]
        );
        res.json(q.rows);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    })
  );
  return r;
}

// server/payments.ts
init_db();
init_http();
import { Router as Router7 } from "express";
import { z as z10 } from "zod";
init_receipt();
var PAYMENT_METHODS = [
  "cash",
  "orange_money",
  "mtn_momo",
  "moov_money",
  "wave",
  "other"
];
var paymentValidators = {
  /** Remboursement : le motif est obligatoire, c'est lui qui rend l'opération auditable. */
  refund: z10.object({
    reason: z10.string().trim().min(3).max(300)
  }).strip(),
  create: z10.object({
    method: z10.enum(PAYMENT_METHODS),
    amount_cents: z10.number().int().min(1, "Le montant doit \xEAtre sup\xE9rieur \xE0 z\xE9ro.").max(1e8),
    reference: z10.string().trim().max(80).nullable().optional(),
    cash_session_id: z10.string().uuid().optional()
  }).strip(),
  verify: z10.object({
    reference: z10.string().trim().max(80).nullable().optional()
  }).strip()
};
function initialPaymentStatus(method) {
  return method === "cash" ? "verified" : "pending";
}
function resolvePaymentStatus(totalCents, paidCents) {
  if (totalCents <= 0) return "paid";
  if (paidCents <= 0) return "unpaid";
  if (paidCents >= totalCents) return "paid";
  return "partial";
}
function db5() {
  const pool2 = getPool();
  if (!pool2) throw new HttpError(503, "database_not_configured", "Base de donn\xE9es indisponible.");
  return pool2;
}
var PAYMENT_FIELDS = `p.id, p.wash_id, p.method, p.amount_cents, p.status, p.reference,
  p.created_at, w.reference AS wash_reference, w.site_id, w.total_cents AS wash_total_cents`;
function createPaymentsRouter() {
  const r = Router7();
  r.post(
    "/washes/:id/receipt",
    requirePermission("payment:read"),
    asyncRoute(async (req, res) => {
      const t = tenant(req);
      const washId = parseId(req.params.id);
      const receipt = await issueReceipt(db5(), {
        organizationId: t.organizationId,
        washId,
        userId: t.userId
      });
      const text = renderReceiptText(receipt);
      const jsonResponse = { receipt, text };
      if (req.query.send_whatsapp === "true") {
        const { sendReceiptViaWhatsApp: sendReceiptViaWhatsApp2 } = await Promise.resolve().then(() => (init_receipt(), receipt_exports));
        const result = await sendReceiptViaWhatsApp2(db5(), t.organizationId, washId, text);
        jsonResponse.whatsappUrl = result.whatsappUrl;
      }
      res.status(201).json(jsonResponse);
    })
  );
  r.get(
    "/washes/:id/receipt/history",
    requirePermission("payment:read"),
    asyncRoute(async (req, res) => {
      const t = tenant(req);
      const washId = parseId(req.params.id);
      res.json({ issues: await receiptHistory(db5(), t.organizationId, washId) });
    })
  );
  r.get(
    "/payments",
    requirePermission("payment:read"),
    asyncRoute(async (req, res) => {
      const t = tenant(req);
      const filters = body(
        z10.object({
          status: z10.enum(["pending", "verified", "refunded", "all"]).default("all"),
          method: z10.enum([...PAYMENT_METHODS, "all"]).default("all"),
          limit: z10.coerce.number().int().min(1).max(200).default(100)
        }).strip(),
        {
          status: req.query.status ?? "all",
          method: req.query.method ?? "all",
          limit: req.query.limit ?? 100
        }
      );
      const conditions = ["p.organization_id=$1::uuid"];
      const args = [t.organizationId];
      if (filters.status !== "all") {
        args.push(filters.status);
        conditions.push(`p.status=$${args.length}`);
      }
      if (filters.method !== "all") {
        args.push(filters.method);
        conditions.push(`p.method=$${args.length}`);
      }
      args.push(filters.limit);
      const [list, totals] = await Promise.all([
        db5().query(
          `SELECT ${PAYMENT_FIELDS}
           FROM payments p JOIN washes w ON w.id = p.wash_id
           WHERE ${conditions.join(" AND ")}
           ORDER BY p.created_at DESC
           LIMIT $${args.length}`,
          args
        ),
        // Totaux par canal : la réponse sert directement de tableau de suivi.
        db5().query(
          `SELECT method,
             COUNT(*)::int AS payment_count,
             COALESCE(SUM(amount_cents),0)::int AS amount_cents,
             COALESCE(SUM(amount_cents) FILTER (WHERE status='verified'),0)::int AS verified_cents,
             COALESCE(SUM(amount_cents) FILTER (WHERE status='pending'),0)::int AS pending_cents
           FROM payments
           WHERE organization_id=$1::uuid AND status <> 'refunded'
           GROUP BY method ORDER BY amount_cents DESC`,
          [t.organizationId]
        )
      ]);
      res.json({ payments: list.rows, totals_by_method: totals.rows });
    })
  );
  r.post(
    "/washes/:id/payments",
    requirePermission("payment:create"),
    asyncRoute(async (req, res) => {
      const t = tenant(req);
      const washId = parseId(req.params.id);
      const input = body(paymentValidators.create, req.body);
      const pool2 = db5();
      await withIdempotency(
        pool2,
        req,
        res,
        t.organizationId,
        fingerprint({ op: "wash-payment", wash: washId, ...input }),
        async () => {
          const client = await pool2.connect();
          try {
            await client.query("BEGIN");
            const washQ = await client.query(
              `SELECT id, reference, site_id, status, total_cents
               FROM washes WHERE id=$1::uuid AND organization_id=$2::uuid FOR UPDATE`,
              [washId, t.organizationId]
            );
            if (!washQ.rowCount) throw new HttpError(404, "wash_not_found", "Lavage introuvable.");
            const wash = washQ.rows[0];
            if (wash.status === "cancelled") {
              throw new HttpError(409, "wash_cancelled", "Ce lavage est annul\xE9 : aucun encaissement n\u2019est possible.");
            }
            const paidQ = await client.query(
              "SELECT COALESCE(SUM(amount_cents),0)::int AS paid FROM payments WHERE wash_id=$1::uuid AND status <> 'refunded'",
              [washId]
            );
            const alreadyPaid = Number(paidQ.rows[0].paid);
            const due = Number(wash.total_cents) - alreadyPaid;
            if (due <= 0) {
              throw new HttpError(409, "wash_already_paid", "Ce lavage est d\xE9j\xE0 int\xE9gralement r\xE9gl\xE9.");
            }
            if (input.amount_cents > due) {
              throw new HttpError(
                400,
                "amount_exceeds_due",
                `Le montant d\xE9passe le solde restant (${(due / 100).toLocaleString("fr-CI")} FCFA).`
              );
            }
            let cashSessionId = null;
            if (input.method === "cash") {
              const sessionQ = input.cash_session_id ? await client.query(
                `SELECT id FROM cash_sessions
                     WHERE id=$1::uuid AND organization_id=$2::uuid AND site_id=$3::uuid AND status='open'
                     FOR UPDATE`,
                [input.cash_session_id, t.organizationId, wash.site_id]
              ) : await client.query(
                `SELECT id FROM cash_sessions
                     WHERE organization_id=$1::uuid AND site_id=$2::uuid AND status='open'
                     ORDER BY opened_at DESC LIMIT 1 FOR UPDATE`,
                [t.organizationId, wash.site_id]
              );
              if (!sessionQ.rowCount) {
                throw new HttpError(
                  400,
                  input.cash_session_id ? "cash_session_invalid" : "cash_session_required",
                  input.cash_session_id ? "Session de caisse introuvable, ferm\xE9e ou d\u2019une autre station." : "Aucune session de caisse ouverte sur cette station : ouvrez la caisse avant d\u2019encaisser des esp\xE8ces."
                );
              }
              cashSessionId = sessionQ.rows[0].id;
            }
            const status = initialPaymentStatus(input.method);
            const paymentQ = await client.query(
              `INSERT INTO payments(organization_id, wash_id, method, amount_cents, status, reference)
               VALUES($1,$2,$3,$4,$5,$6)
               RETURNING id, wash_id, method, amount_cents, status, reference, created_at`,
              [t.organizationId, washId, input.method, input.amount_cents, status, input.reference?.trim() || null]
            );
            const payment = paymentQ.rows[0];
            if (cashSessionId) {
              await client.query(
                `INSERT INTO cash_movements(organization_id, cash_session_id, type, amount_cents, source, description, wash_id, created_by)
                 VALUES($1,$2,'entry',$3,'wash',$4,$5,$6)`,
                [t.organizationId, cashSessionId, input.amount_cents, `Encaissement lavage ${wash.reference}`, washId, t.userId]
              );
            }
            const paymentStatus = resolvePaymentStatus(Number(wash.total_cents), alreadyPaid + input.amount_cents);
            await client.query("UPDATE washes SET payment_status=$2 WHERE id=$1::uuid", [washId, paymentStatus]);
            await client.query(
              `INSERT INTO audit_logs(organization_id, actor_user_id, action, entity_type, entity_id, metadata)
               VALUES($1,$2,'payment.recorded','payment',$3,$4)`,
              [
                t.organizationId,
                t.userId,
                payment.id,
                JSON.stringify({ wash_id: washId, method: input.method, amount_cents: input.amount_cents })
              ]
            );
            await client.query("COMMIT");
            return {
              status: 201,
              body: {
                payment,
                wash: { id: washId, payment_status: paymentStatus, remaining_cents: due - input.amount_cents }
              }
            };
          } catch (error) {
            await client.query("ROLLBACK");
            throw error;
          } finally {
            client.release();
          }
        }
      );
    })
  );
  r.post(
    "/payments/:id/verify",
    requirePermission("payment:verify"),
    asyncRoute(async (req, res) => {
      const t = tenant(req);
      const id = parseId(req.params.id);
      const input = body(paymentValidators.verify, req.body ?? {});
      const pool2 = db5();
      const client = await pool2.connect();
      try {
        await client.query("BEGIN");
        const paymentQ = await client.query(
          "SELECT id, status, method, amount_cents, wash_id FROM payments WHERE id=$1::uuid AND organization_id=$2::uuid FOR UPDATE",
          [id, t.organizationId]
        );
        if (!paymentQ.rowCount) throw new HttpError(404, "payment_not_found", "Encaissement introuvable.");
        const payment = paymentQ.rows[0];
        if (payment.status === "verified") {
          throw new HttpError(409, "payment_already_verified", "Cet encaissement est d\xE9j\xE0 confirm\xE9.");
        }
        if (payment.status === "refunded") {
          throw new HttpError(409, "payment_refunded", "Cet encaissement a \xE9t\xE9 rembours\xE9.");
        }
        const updatedQ = await client.query(
          `UPDATE payments SET status='verified', reference=COALESCE($3, reference)
           WHERE id=$1::uuid AND organization_id=$2::uuid
           RETURNING id, wash_id, method, amount_cents, status, reference, created_at`,
          [id, t.organizationId, input.reference?.trim() || null]
        );
        await client.query(
          `INSERT INTO audit_logs(organization_id, actor_user_id, action, entity_type, entity_id, metadata)
           VALUES($1,$2,'payment.verified','payment',$3,$4)`,
          [t.organizationId, t.userId, id, JSON.stringify({ method: payment.method, amount_cents: payment.amount_cents })]
        );
        await client.query("COMMIT");
        res.json(updatedQ.rows[0]);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    })
  );
  r.post(
    "/payments/:id/refund",
    requirePermission("payment:cancel"),
    asyncRoute(async (req, res) => {
      const t = tenant(req);
      const id = parseId(req.params.id);
      const input = body(paymentValidators.refund, req.body ?? {});
      const pool2 = db5();
      const client = await pool2.connect();
      try {
        await client.query("BEGIN");
        const paymentQ = await client.query(
          `SELECT p.id, p.status, p.method, p.amount_cents, p.wash_id,
                  w.reference AS wash_reference, w.site_id, w.total_cents
           FROM payments p JOIN washes w ON w.id = p.wash_id
           WHERE p.id=$1::uuid AND p.organization_id=$2::uuid FOR UPDATE OF p`,
          [id, t.organizationId]
        );
        if (!paymentQ.rowCount) throw new HttpError(404, "payment_not_found", "Encaissement introuvable.");
        const payment = paymentQ.rows[0];
        if (payment.status === "refunded") {
          throw new HttpError(409, "payment_already_refunded", "Cet encaissement est d\xE9j\xE0 rembours\xE9.");
        }
        if (payment.method === "cash") {
          const sessionQ = await client.query(
            `SELECT id FROM cash_sessions
             WHERE organization_id=$1::uuid AND site_id=$2::uuid AND status='open'
             ORDER BY opened_at DESC LIMIT 1 FOR UPDATE`,
            [t.organizationId, payment.site_id]
          );
          if (!sessionQ.rowCount) {
            throw new HttpError(
              400,
              "cash_session_required",
              "Ouvrez la caisse avant de rembourser un encaissement en esp\xE8ces."
            );
          }
          await client.query(
            `INSERT INTO cash_movements(organization_id, cash_session_id, type, amount_cents, source, description, wash_id, created_by)
             VALUES($1,$2,'exit',$3,'refund',$4,$5,$6)`,
            [
              t.organizationId,
              sessionQ.rows[0].id,
              payment.amount_cents,
              `Remboursement lavage ${payment.wash_reference} \u2014 ${input.reason}`,
              payment.wash_id,
              t.userId
            ]
          );
        }
        const updatedQ = await client.query(
          `UPDATE payments SET status='refunded'
           WHERE id=$1::uuid AND organization_id=$2::uuid
           RETURNING id, wash_id, method, amount_cents, status, reference, created_at`,
          [id, t.organizationId]
        );
        const paidQ = await client.query(
          `SELECT COALESCE(SUM(amount_cents),0)::int AS paid FROM payments
           WHERE wash_id=$1::uuid AND status <> 'refunded'`,
          [payment.wash_id]
        );
        const paymentStatus = resolvePaymentStatus(Number(payment.total_cents), Number(paidQ.rows[0].paid));
        await client.query("UPDATE washes SET payment_status=$2 WHERE id=$1::uuid", [
          payment.wash_id,
          paymentStatus
        ]);
        await client.query(
          `INSERT INTO audit_logs(organization_id, actor_user_id, action, entity_type, entity_id, metadata)
           VALUES($1,$2,'payment.refunded','payment',$3,$4)`,
          [
            t.organizationId,
            t.userId,
            id,
            JSON.stringify({
              method: payment.method,
              amount_cents: payment.amount_cents,
              reason: input.reason,
              wash_id: payment.wash_id
            })
          ]
        );
        await client.query("COMMIT");
        res.json({
          payment: updatedQ.rows[0],
          wash: { id: payment.wash_id, payment_status: paymentStatus }
        });
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    })
  );
  return r;
}

// server/plate.ts
var MAX_PLATE_LENGTH = 16;
function plateKey(raw) {
  if (raw === null || raw === void 0) return null;
  const key = raw.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!key) return null;
  return key.slice(0, MAX_PLATE_LENGTH);
}
function plateDisplay(raw) {
  if (raw === null || raw === void 0) return null;
  const display = raw.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().replace(/\s+/g, " ").toUpperCase();
  if (!display) return null;
  if (!plateKey(display)) return null;
  return display.slice(0, MAX_PLATE_LENGTH * 2);
}

// server/plan-limits.ts
init_auth();
var DOWNGRADE_GRACE_DAYS = 14;
var DAY_MS = 864e5;
function toDate2(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
function resolveLimitState(input) {
  const now = input.now ?? /* @__PURE__ */ new Date();
  const { limit, activeCount } = input;
  if (limit === null || limit === void 0) {
    return {
      limit: null,
      active_count: activeCount,
      remaining: null,
      over_limit: false,
      excess: 0,
      grace_ends_at: null,
      grace_days_remaining: 0,
      enforced: false,
      creation_blocked: false
    };
  }
  const excess = Math.max(0, activeCount - limit);
  const overLimit = excess > 0;
  const changedAt = toDate2(input.planChangedAt);
  const graceEnd = changedAt ? new Date(changedAt.getTime() + DOWNGRADE_GRACE_DAYS * DAY_MS) : null;
  const graceExpired = !graceEnd || graceEnd.getTime() <= now.getTime();
  const msRemaining = graceEnd ? Math.max(0, graceEnd.getTime() - now.getTime()) : 0;
  return {
    limit,
    active_count: activeCount,
    remaining: Math.max(0, limit - activeCount),
    over_limit: overLimit,
    excess,
    grace_ends_at: overLimit && graceEnd ? graceEnd.toISOString() : null,
    grace_days_remaining: overLimit ? Math.ceil(msRemaining / DAY_MS) : 0,
    enforced: overLimit && graceExpired,
    // On bloque la création dès que le plafond est atteint, délai de grâce ou
    // non : le délai sert à réorganiser l'existant, pas à l'étendre.
    creation_blocked: activeCount >= limit
  };
}
async function loadSiteLimitRow(client, organizationId) {
  const q = await client.query(
    `SELECT p.max_sites, s.plan_changed_at,
            (SELECT COUNT(*)::int FROM sites WHERE organization_id=$1::uuid AND is_active=true) AS active_count
     FROM organizations o
     LEFT JOIN subscriptions s ON s.organization_id = o.id
     LEFT JOIN plans p ON p.id = s.plan_id
     WHERE o.id = $1::uuid`,
    [organizationId]
  );
  const row = q.rows[0];
  return {
    max_sites: row?.max_sites ?? null,
    plan_changed_at: row?.plan_changed_at ?? null,
    active_count: Number(row?.active_count ?? 0)
  };
}
async function loadSiteLimitState(client, organizationId, now = /* @__PURE__ */ new Date()) {
  const row = await loadSiteLimitRow(client, organizationId);
  return resolveLimitState({
    limit: row.max_sites,
    activeCount: row.active_count,
    planChangedAt: row.plan_changed_at,
    now
  });
}
async function assertSiteCapacity(client, organizationId) {
  await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [organizationId]);
  const state = await loadSiteLimitState(client, organizationId);
  if (state.creation_blocked) {
    throw new HttpError(
      409,
      "plan_site_limit",
      state.limit === 1 ? "Votre forfait couvre une seule station. Passez au forfait Business pour en g\xE9rer plusieurs." : `Votre forfait couvre ${state.limit} stations actives. D\xE9sactivez-en une ou changez de forfait.`
    );
  }
}
async function writableSiteIds(client, organizationId, now = /* @__PURE__ */ new Date()) {
  const state = await loadSiteLimitState(client, organizationId, now);
  if (!state.enforced || state.limit === null) return { state, ids: null };
  const q = await client.query(
    `SELECT id FROM sites WHERE organization_id=$1::uuid AND is_active=true
     ORDER BY created_at, id LIMIT $2::int`,
    [organizationId, state.limit]
  );
  return { state, ids: q.rows.map((row) => row.id) };
}
async function assertSiteWritable(client, organizationId, siteId, now = /* @__PURE__ */ new Date()) {
  if (!siteId) return;
  const { state, ids } = await writableSiteIds(client, organizationId, now);
  if (!ids || ids.includes(siteId)) return;
  const covered = state.limit === 1 ? "la station couverte par votre forfait" : `les ${state.limit} stations couvertes par votre forfait`;
  throw new HttpError(
    402,
    "site_over_plan_limit",
    `Cette station d\xE9passe ${covered} : son historique reste consultable et exportable, mais elle n\u2019accepte plus de nouvelle op\xE9ration. D\xE9sactivez une autre station pour lui rendre la main, ou repassez au forfait sup\xE9rieur.`
  );
}

// server/api.ts
init_vehicle_taxonomy();
var catalogValidators = {
  category: z11.object({
    name: z11.string().trim().min(1, "Le nom est obligatoire.").max(100),
    is_active: z11.boolean().optional()
  }).strip(),
  service: z11.object({
    template_id: z11.string().uuid().nullable().optional(),
    name: z11.string().trim().min(1, "Le nom est obligatoire.").max(120),
    description: z11.string().max(1e3).nullable().optional(),
    category_id: z11.string().uuid().nullable().optional(),
    duration_minutes: z11.number().int().min(1).max(1440).nullable().optional(),
    is_active: z11.boolean().optional(),
    /**
     * Éligibilité + tarif, inséparables : une entrée = « cette catégorie de
     * véhicule peut bénéficier de la prestation, à ce prix ». Au moins une
     * catégorie ; un prix obligatoire par catégorie — jamais de zéro par
     * silence. Les anciens champs `price_cents` / `price_by_vehicle_type`
     * n'entrent plus dans ce contrat : eux seuls ne distinguaient pas
     * l'éligibilité du tarif.
     */
    vehicle_pricing: z11.array(
      z11.object({
        vehicle_category_id: z11.string().uuid(),
        // Absent ou nul passe le schéma pour que le refus métier puisse
        // nommer la catégorie (« Renseignez le prix pour la catégorie
        // Berline. »). `assertVehiclePricing` refuse ensuite toujours
        // une sauvegarde sans tarif : jamais de zéro par silence.
        price_cents: z11.number().int().min(0).max(1e8).nullish()
      }).strip()
    ).max(200).optional()
  }).strip(),
  /**
   * Catégorie de véhicule : même socle que les autres catégories, plus la
   * famille (qui porte le tarif) et le rang d'affichage.
   *
   * `family` reste un texte libre validé contre le référentiel : la base
   * n'impose pas de clé étrangère, une station peut donc ranger une catégorie
   * maison dans une famille connue sans migration.
   */
  vehicleCategory: z11.object({
    name: z11.string().trim().min(1, "Le nom est obligatoire.").max(100),
    is_active: z11.boolean().optional(),
    family: z11.string().trim().max(40).nullable().optional(),
    sort_order: z11.number().int().min(0).max(999).optional()
  }).strip(),
  /** Ajout en lot depuis le référentiel : codes de types (`suv_familial`) ou libellés. */
  vehicleCategoryImport: z11.object({
    types: z11.array(z11.string().trim().min(1).max(120)).min(1, "S\xE9lectionnez au moins un type.").max(200)
  }).strip(),
  site: z11.object({
    name: z11.string().trim().min(2).max(120),
    city: z11.string().trim().min(1).max(120),
    address: z11.string().trim().max(300).nullable().optional(),
    phone: z11.string().trim().max(30).nullable().optional(),
    email: z11.string().trim().max(200).nullable().optional(),
    description: z11.string().trim().max(1e3).nullable().optional(),
    is_active: z11.boolean().optional()
  }).strip()
};
function assertVehicleFamily(family) {
  if (family == null || family === "") return;
  if (!isVehicleFamily(family)) {
    throw new HttpError(
      400,
      "invalid_vehicle_family",
      `Famille de v\xE9hicules inconnue : \xAB ${family} \xBB. Choisissez-en une dans la liste propos\xE9e.`
    );
  }
}
async function assertVehiclePricing(vehiclePricing, organizationId, keepExisting = /* @__PURE__ */ new Set()) {
  if (!vehiclePricing || vehiclePricing.length === 0) {
    throw new HttpError(
      400,
      "vehicle_pricing_required",
      "S\xE9lectionnez au moins une cat\xE9gorie de v\xE9hicule."
    );
  }
  const seen = /* @__PURE__ */ new Set();
  for (const entry of vehiclePricing) {
    if (seen.has(entry.vehicle_category_id)) {
      throw new HttpError(
        400,
        "duplicate_vehicle_category",
        "Une cat\xE9gorie de v\xE9hicule est list\xE9e deux fois."
      );
    }
    seen.add(entry.vehicle_category_id);
  }
  const q = await db6().query(
    "SELECT id, name, is_active FROM vehicle_categories WHERE organization_id=$1::uuid AND id = ANY($2::uuid[])",
    [organizationId, [...seen]]
  );
  const found = new Map(q.rows.map((row) => [String(row.id), row]));
  for (const entry of vehiclePricing) {
    const category = found.get(entry.vehicle_category_id);
    if (!category) {
      throw new HttpError(
        400,
        "invalid_vehicle_category",
        "Cette cat\xE9gorie de v\xE9hicule n'est plus disponible."
      );
    }
    if (!category.is_active && !keepExisting.has(entry.vehicle_category_id)) {
      throw new HttpError(
        400,
        "inactive_vehicle_category",
        `Cette cat\xE9gorie de v\xE9hicule n'est plus disponible : \xAB ${category.name} \xBB.`
      );
    }
    const price = entry.price_cents;
    if (price === void 0 || price === null || typeof price === "number" && Number.isNaN(price)) {
      throw new HttpError(
        400,
        "vehicle_price_required",
        `Renseignez le prix pour la cat\xE9gorie ${category.name}.`
      );
    }
    if (typeof price !== "number" || !Number.isInteger(price) || price < 0 || price > 1e8) {
      throw new HttpError(400, "invalid_vehicle_price", "Le prix doit \xEAtre un montant valide en FCFA.");
    }
  }
}
async function assertServiceTemplate(templateId) {
  if (!templateId) return;
  const q = await db6().query("SELECT 1 FROM service_catalog WHERE id=$1::uuid AND is_active", [templateId]);
  if (!q.rowCount) {
    throw new HttpError(
      400,
      "invalid_service_template",
      "Ce type de service n'est plus disponible."
    );
  }
}
function serviceResponse(row, pricing) {
  return {
    ...row,
    vehicle_pricing: pricing,
    vehicle_prices: Object.fromEntries(pricing.map((entry) => [entry.vehicle_category_id, entry.price_cents]))
  };
}
async function loadServicePricing(serviceIds) {
  const byService = /* @__PURE__ */ new Map();
  if (serviceIds.length === 0) return byService;
  const q = await db6().query(
    "SELECT service_id, vehicle_category_id, price_cents FROM service_vehicle_prices WHERE service_id = ANY($1::uuid[]) ORDER BY created_at",
    [serviceIds]
  );
  for (const row of q.rows) {
    const list = byService.get(String(row.service_id)) ?? [];
    list.push({ vehicle_category_id: String(row.vehicle_category_id), price_cents: Number(row.price_cents) });
    byService.set(String(row.service_id), list);
  }
  return byService;
}
async function auditService(q, t, action, entityId, metadata) {
  await q.query(
    `INSERT INTO audit_logs(organization_id, actor_user_id, action, entity_type, entity_id, metadata)
     VALUES($1,$2,$3,'service',$4,$5)`,
    [t.organizationId, t.userId, action, entityId, JSON.stringify(metadata)]
  );
}
async function auditVehicleCategory(t, action, entityId, metadata) {
  await db6().query(
    `INSERT INTO audit_logs(organization_id, actor_user_id, action, entity_type, entity_id, metadata)
     VALUES($1,$2,$3,'vehicle_category',$4,$5)`,
    [t.organizationId, t.userId, action, entityId, JSON.stringify(metadata)]
  );
}
var washValidators = {
  create: z11.object({
    site_id: z11.string().uuid(),
    vehicle_category_id: z11.string().uuid(),
    items: z11.array(
      z11.object({
        service_id: z11.string().uuid(),
        quantity: z11.number().int().min(1).max(100)
      })
    ).min(1, "S\xE9lectionnez au moins une prestation."),
    worker_ids: z11.array(z11.string().uuid()).max(50).default([]),
    // Responsable principal, facultatif. Il doit figurer parmi les laveurs
    // affectés : désigner un responsable absent de l'équipe du lavage
    // produirait une statistique que personne ne pourrait expliquer.
    principal_worker_id: z11.string().uuid().nullable().optional(),
    payment_method: z11.enum(PAYMENT_METHODS),
    amount_received_cents: z11.number().int().min(0).max(1e8),
    cash_session_id: z11.string().uuid().optional(),
    // Plaque du vehicule, facultative. Aucun format n'est impose : une
    // saisie refusee bloquerait un encaissement.
    plate: z11.string().trim().max(32).nullable().optional(),
    // Nom du client, facultatif. Une etiquette de comptoir, pas une fiche :
    // ni telephone, ni historique, ni rien qui fasse un dossier client.
    customer_name: z11.string().trim().max(80).nullable().optional()
  }).strip(),
  cancel: z11.object({
    reason: z11.string().trim().min(3, "Indiquez le motif de l\u2019annulation.").max(500)
  }).strip(),
  // Avancement operationnel du lavage. Valeurs volontairement fermees : ce
  // sont les trois etats que l'interface propose, et rien d'autre ne doit
  // pouvoir etre ecrit dans la colonne. Le message d'erreur est produit par
  // server/validation-messages.ts : « Le statut ne fait pas partie des
  // choix possibles. »
  status: z11.object({
    status: z11.enum(["pending", "in_progress", "completed", "overtime"])
  }).strip()
};
function db6() {
  const pool2 = getPool();
  if (!pool2) throw new HttpError(503, "database_not_configured", "Base de donn\xE9es indisponible.");
  return pool2;
}
async function loadWashWorkers(pool2, organizationId, washIds) {
  const parLavage = /* @__PURE__ */ new Map();
  if (washIds.length === 0) return parLavage;
  const q = await pool2.query(
    `SELECT a.wash_id, w.id, w.first_name, w.last_name, a.assignment_role
       FROM wash_assignments a
       JOIN workers w ON w.id = a.worker_id
      WHERE w.organization_id=$1::uuid AND a.wash_id = ANY($2::uuid[])
      ORDER BY (a.assignment_role = 'principal') DESC, w.first_name, w.last_name`,
    [organizationId, washIds]
  );
  for (const row of q.rows) {
    const nom = [row.first_name, row.last_name].filter(Boolean).join(" ").trim();
    const liste = parLavage.get(row.wash_id) ?? [];
    liste.push({ id: row.id, name: nom, role: row.assignment_role });
    parLavage.set(row.wash_id, liste);
  }
  return parLavage;
}
var WASH_FIELDS = `id, reference, site_id, vehicle_category_id, customer_id, plate, status, payment_status,
  operation_status, operation_started_at, estimated_minutes, customer_name,
  total_cents, payment_method, created_by AS author_id, cancelled_by AS cancelled_by_id,
  cancelled_at, cancellation_reason, created_at, completed_at`;
var MAX_ACTIVE_WASH_TASKS = 5;
var DEFAULT_ESTIMATED_MINUTES = 30;
function createApiRouter() {
  const r = Router8();
  r.get(
    "/sites",
    requirePermission("wash:read"),
    asyncRoute(async (req, res) => {
      const t = tenant(req);
      const pool2 = db6();
      const q = await pool2.query(
        "SELECT id, name, city, address, phone, email, description, logo_url, slug, is_active, created_at, updated_at FROM sites WHERE organization_id=$1::uuid ORDER BY created_at",
        [t.organizationId]
      );
      const limit = await loadSiteLimitState(pool2, t.organizationId);
      const writableIds = limit.enforced && limit.limit !== null ? new Set(
        q.rows.filter((row) => row.is_active).slice(0, limit.limit).map((row) => row.id)
      ) : null;
      res.json(
        q.rows.map((row) => ({
          ...row,
          writable: writableIds ? writableIds.has(row.id) : true
        }))
      );
    })
  );
  r.get(
    "/sites/:id",
    requirePermission("wash:read"),
    asyncRoute(async (req, res) => {
      const t = tenant(req);
      const id = parseId(req.params.id);
      const q = await db6().query("SELECT * FROM sites WHERE id=$1::uuid AND organization_id=$2::uuid", [id, t.organizationId]);
      if (!q.rowCount) throw new HttpError(404, "site_not_found", "Station introuvable.");
      res.json(q.rows[0]);
    })
  );
  r.post(
    "/sites",
    requirePermission("settings:manage"),
    asyncRoute(async (req, res) => {
      const t = tenant(req);
      const input = body(catalogValidators.site, req.body);
      const client = await db6().connect();
      try {
        await client.query("BEGIN");
        await assertSiteCapacity(client, t.organizationId);
        const created = await client.query(
          `INSERT INTO sites(organization_id, name, city, address, phone, email, description, is_active)
           VALUES($1,$2,$3,$4,$5,$6,$7,COALESCE($8,true)) RETURNING *`,
          [t.organizationId, input.name, input.city, input.address ?? null, input.phone ?? null, input.email ?? null, input.description ?? null, input.is_active ?? null]
        );
        await client.query("COMMIT");
        res.status(201).json(created.rows[0]);
        return;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    })
  );
  r.patch(
    "/sites/:id",
    requirePermission("settings:manage"),
    asyncRoute(async (req, res) => {
      const t = tenant(req);
      const id = parseId(req.params.id);
      const input = body(catalogValidators.site.partial(), req.body);
      const oldQ = await db6().query("SELECT * FROM sites WHERE id=$1::uuid AND organization_id=$2::uuid", [id, t.organizationId]);
      if (!oldQ.rowCount) throw new HttpError(404, "site_not_found", "Station introuvable.");
      const merged = { ...oldQ.rows[0], ...input };
      const reactivating = oldQ.rows[0].is_active === false && merged.is_active === true;
      const client = await db6().connect();
      try {
        await client.query("BEGIN");
        if (reactivating) await assertSiteCapacity(client, t.organizationId);
        const q = await client.query(
          `UPDATE sites SET name=$3, city=$4, address=$5, phone=$6, email=$7, description=$8, is_active=$9, updated_at=now()
           WHERE id=$1::uuid AND organization_id=$2::uuid RETURNING *`,
          [id, t.organizationId, merged.name, merged.city, merged.address, merged.phone, merged.email, merged.description, merged.is_active]
        );
        await client.query("COMMIT");
        res.json(q.rows[0]);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    })
  );
  r.delete(
    "/sites/:id",
    requirePermission("settings:manage"),
    asyncRoute(async (req, res) => {
      const t = tenant(req);
      const id = parseId(req.params.id);
      const pool2 = db6();
      const siteQ = await pool2.query("SELECT 1 FROM sites WHERE id=$1::uuid AND organization_id=$2::uuid", [id, t.organizationId]);
      if (!siteQ.rowCount) throw new HttpError(404, "site_not_found", "Station introuvable.");
      const refs = await pool2.query(
        `SELECT
           (SELECT COUNT(*) FROM washes WHERE site_id=$1::uuid) +
           (SELECT COUNT(*) FROM cash_sessions WHERE site_id=$1::uuid) +
           (SELECT COUNT(*) FROM expenses WHERE site_id=$1::uuid) +
           (SELECT COUNT(*) FROM utility_meters WHERE site_id=$1::uuid) +
           (SELECT COUNT(*) FROM workers WHERE site_id=$1::uuid)::int AS ref_count`,
        [id]
      );
      if (Number(refs.rows[0].ref_count) > 0) {
        throw new HttpError(409, "site_in_use", "Des lavages, caisses, d\xE9penses, compteurs ou travailleurs r\xE9f\xE9rencent cette station. D\xE9sactivez-la plut\xF4t.");
      }
      await pool2.query("DELETE FROM sites WHERE id=$1::uuid AND organization_id=$2::uuid", [id, t.organizationId]);
      res.status(204).send();
    })
  );
  r.get(
    "/service-categories",
    requirePermission("service:read"),
    asyncRoute(async (req, res) => {
      const t = tenant(req);
      const q = await db6().query(
        "SELECT id, name, is_active, created_at, updated_at FROM service_categories WHERE organization_id=$1::uuid ORDER BY name",
        [t.organizationId]
      );
      res.json(q.rows);
    })
  );
  r.post(
    "/service-categories",
    requirePermission("service:manage"),
    asyncRoute(async (req, res) => {
      const t = tenant(req);
      const input = body(catalogValidators.category, req.body);
      try {
        const q = await db6().query(
          "INSERT INTO service_categories(organization_id, name, is_active) VALUES($1,$2,COALESCE($3,true)) RETURNING id, name, is_active, created_at, updated_at",
          [t.organizationId, input.name, input.is_active ?? null]
        );
        res.status(201).json(q.rows[0]);
      } catch (error) {
        if (error.code === "23505") {
          throw new HttpError(409, "category_exists", "Une cat\xE9gorie portant ce nom existe d\xE9j\xE0.");
        }
        throw error;
      }
    })
  );
  r.patch(
    "/service-categories/:id",
    requirePermission("service:manage"),
    asyncRoute(async (req, res) => {
      const t = tenant(req);
      const id = parseId(req.params.id);
      const input = body(catalogValidators.category.partial(), req.body);
      const oldQ = await db6().query("SELECT * FROM service_categories WHERE id=$1::uuid AND organization_id=$2::uuid", [id, t.organizationId]);
      if (!oldQ.rowCount) throw new HttpError(404, "category_not_found", "Cat\xE9gorie introuvable.");
      const merged = { ...oldQ.rows[0], ...input };
      try {
        const q = await db6().query(
          "UPDATE service_categories SET name=$3, is_active=$4, updated_at=now() WHERE id=$1::uuid AND organization_id=$2::uuid RETURNING id, name, is_active, created_at, updated_at",
          [id, t.organizationId, merged.name, merged.is_active]
        );
        res.json(q.rows[0]);
      } catch (error) {
        if (error.code === "23505") {
          throw new HttpError(409, "category_exists", "Une cat\xE9gorie portant ce nom existe d\xE9j\xE0.");
        }
        throw error;
      }
    })
  );
  r.delete(
    "/service-categories/:id",
    requirePermission("service:manage"),
    asyncRoute(async (req, res) => {
      const t = tenant(req);
      const id = parseId(req.params.id);
      const used = await db6().query("SELECT 1 FROM services WHERE category_id=$1::uuid AND organization_id=$2::uuid LIMIT 1", [id, t.organizationId]);
      if (used.rowCount) {
        throw new HttpError(409, "category_in_use", "Des prestations utilisent cette cat\xE9gorie. D\xE9sactivez-la plut\xF4t.");
      }
      const q = await db6().query("DELETE FROM service_categories WHERE id=$1::uuid AND organization_id=$2::uuid", [id, t.organizationId]);
      if (!q.rowCount) throw new HttpError(404, "category_not_found", "Cat\xE9gorie introuvable.");
      res.status(204).send();
    })
  );
  r.get(
    "/vehicle-categories",
    requirePermission("service:read"),
    asyncRoute(async (req, res) => {
      const t = tenant(req);
      const q = await db6().query(
        "SELECT id, name, family, sort_order, is_active, created_at, updated_at FROM vehicle_categories WHERE organization_id=$1::uuid",
        [t.organizationId]
      );
      res.json(sortVehicleCategories(q.rows));
    })
  );
  r.get(
    "/vehicle-categories/catalog",
    requirePermission("service:read"),
    asyncRoute(async (req, res) => {
      const t = tenant(req);
      const q = await db6().query(
        "SELECT id, name FROM vehicle_categories WHERE organization_id=$1::uuid",
        [t.organizationId]
      );
      const existing = new Map(q.rows.map((row) => [String(row.name).toLowerCase(), row.id]));
      const families = VEHICLE_FAMILIES.map((family) => ({
        code: family.code,
        label: family.label,
        description: family.description,
        types: family.types.map((type) => ({
          code: type.code,
          name: type.name,
          category_id: existing.get(type.name.toLowerCase()) ?? null,
          added: existing.has(type.name.toLowerCase())
        }))
      }));
      res.json({
        families,
        total_types: VEHICLE_TYPES.length,
        total_categories: q.rowCount ?? 0,
        added_types: families.reduce(
          (total, family) => total + family.types.filter((type) => type.added).length,
          0
        )
      });
    })
  );
  r.post(
    "/vehicle-categories/catalog",
    requirePermission("service:manage"),
    asyncRoute(async (req, res) => {
      const t = tenant(req);
      const input = body(catalogValidators.vehicleCategoryImport, req.body);
      const resolved = input.types.map((value) => vehicleType(value));
      const unknown = input.types.filter((_, index) => !resolved[index]);
      if (unknown.length > 0) {
        throw new HttpError(
          400,
          "invalid_vehicle_type",
          `Type de v\xE9hicule inconnu : \xAB ${unknown[0]} \xBB. Choisissez-le dans la liste propos\xE9e.`
        );
      }
      let added = 0;
      for (const type of resolved) {
        if (!type) continue;
        const q = await db6().query(
          `INSERT INTO vehicle_categories(organization_id, name, family, sort_order)
           VALUES($1,$2,$3,$4)
           ON CONFLICT (organization_id, name) DO NOTHING
           RETURNING id`,
          [t.organizationId, type.name, type.family, type.sort_order]
        );
        added += q.rowCount ?? 0;
      }
      await db6().query(
        `INSERT INTO audit_logs(organization_id, actor_user_id, action, entity_type, entity_id, metadata)
         VALUES($1,$2,'vehicle_category.imported','vehicle_category',$3,$4)`,
        [t.organizationId, t.userId, t.organizationId, JSON.stringify({ requested: input.types.length, added })]
      );
      res.status(201).json({ requested: input.types.length, added, skipped: input.types.length - added });
    })
  );
  r.post(
    "/vehicle-categories",
    requirePermission("service:manage"),
    asyncRoute(async (req, res) => {
      const t = tenant(req);
      const input = body(catalogValidators.vehicleCategory, req.body);
      assertVehicleFamily(input.family);
      try {
        const q = await db6().query(
          `INSERT INTO vehicle_categories(organization_id, name, family, sort_order, is_active)
           VALUES($1,$2,$3,COALESCE($4,0),COALESCE($5,true))
           RETURNING id, name, family, sort_order, is_active, created_at, updated_at`,
          [t.organizationId, input.name, input.family ?? null, input.sort_order ?? null, input.is_active ?? null]
        );
        await auditVehicleCategory(t, "vehicle_category.created", q.rows[0].id, {
          name: input.name,
          family: input.family ?? null
        });
        res.status(201).json(q.rows[0]);
      } catch (error) {
        if (error.code === "23505") {
          throw new HttpError(409, "category_exists", "Une cat\xE9gorie portant ce nom existe d\xE9j\xE0.");
        }
        throw error;
      }
    })
  );
  r.patch(
    "/vehicle-categories/:id",
    requirePermission("service:manage"),
    asyncRoute(async (req, res) => {
      const t = tenant(req);
      const id = parseId(req.params.id);
      const input = body(catalogValidators.vehicleCategory.partial(), req.body);
      if (input.family !== void 0) assertVehicleFamily(input.family);
      const oldQ = await db6().query("SELECT * FROM vehicle_categories WHERE id=$1::uuid AND organization_id=$2::uuid", [id, t.organizationId]);
      if (!oldQ.rowCount) throw new HttpError(404, "category_not_found", "Cat\xE9gorie introuvable.");
      const merged = { ...oldQ.rows[0], ...input };
      try {
        const q = await db6().query(
          `UPDATE vehicle_categories SET name=$3, family=$4, sort_order=$5, is_active=$6, updated_at=now()
           WHERE id=$1::uuid AND organization_id=$2::uuid
           RETURNING id, name, family, sort_order, is_active, created_at, updated_at`,
          [id, t.organizationId, merged.name, merged.family ?? null, merged.sort_order ?? 0, merged.is_active]
        );
        await auditVehicleCategory(t, "vehicle_category.updated", id, {
          before: { name: oldQ.rows[0].name, family: oldQ.rows[0].family, is_active: oldQ.rows[0].is_active },
          after: { name: merged.name, family: merged.family ?? null, is_active: merged.is_active }
        });
        res.json(q.rows[0]);
      } catch (error) {
        if (error.code === "23505") {
          throw new HttpError(409, "category_exists", "Une cat\xE9gorie portant ce nom existe d\xE9j\xE0.");
        }
        throw error;
      }
    })
  );
  r.delete(
    "/vehicle-categories/:id",
    requirePermission("service:manage"),
    asyncRoute(async (req, res) => {
      const t = tenant(req);
      const id = parseId(req.params.id);
      const used = await db6().query("SELECT 1 FROM washes WHERE vehicle_category_id=$1::uuid AND organization_id=$2::uuid LIMIT 1", [id, t.organizationId]);
      if (used.rowCount) {
        throw new HttpError(409, "category_in_use", "Des lavages utilisent cette cat\xE9gorie. D\xE9sactivez-la plut\xF4t.");
      }
      const q = await db6().query("DELETE FROM vehicle_categories WHERE id=$1::uuid AND organization_id=$2::uuid", [id, t.organizationId]);
      if (!q.rowCount) throw new HttpError(404, "category_not_found", "Cat\xE9gorie introuvable.");
      const purged = await db6().query(
        `UPDATE services SET price_by_vehicle_type = price_by_vehicle_type - $2::text, updated_at=now()
         WHERE organization_id=$1::uuid AND price_by_vehicle_type ? $2::text
         RETURNING id`,
        [t.organizationId, id]
      );
      await auditVehicleCategory(t, "vehicle_category.deleted", id, {
        services_with_cleaned_price: purged.rowCount ?? 0
      });
      res.status(204).send();
    })
  );
  r.get(
    "/services",
    requirePermission("service:read"),
    asyncRoute(async (req, res) => {
      const t = tenant(req);
      const q = await db6().query(
        "SELECT id, template_id, name, description, category_id, price_cents, price_by_vehicle_type, duration_minutes, is_active, created_at, updated_at FROM services WHERE organization_id=$1::uuid ORDER BY name",
        [t.organizationId]
      );
      const pricing = await loadServicePricing(q.rows.map((row) => String(row.id)));
      res.json(q.rows.map((row) => serviceResponse(row, pricing.get(String(row.id)) ?? [])));
    })
  );
  r.get(
    "/services/:id",
    requirePermission("service:read"),
    asyncRoute(async (req, res) => {
      const t = tenant(req);
      const id = parseId(req.params.id);
      const q = await db6().query("SELECT * FROM services WHERE id=$1::uuid AND organization_id=$2::uuid", [id, t.organizationId]);
      if (!q.rowCount) throw new HttpError(404, "service_not_found", "Prestation introuvable.");
      const pricing = await loadServicePricing([id]);
      res.json(serviceResponse(q.rows[0], pricing.get(id) ?? []));
    })
  );
  r.post(
    "/services",
    requirePermission("service:manage"),
    asyncRoute(async (req, res) => {
      const t = tenant(req);
      const input = body(catalogValidators.service, req.body);
      await assertVehiclePricing(input.vehicle_pricing, t.organizationId);
      await assertServiceTemplate(input.template_id);
      if (input.category_id) {
        const categoryQ = await db6().query("SELECT 1 FROM service_categories WHERE id=$1::uuid AND organization_id=$2::uuid", [input.category_id, t.organizationId]);
        if (!categoryQ.rowCount) throw new HttpError(400, "invalid_category", "Cat\xE9gorie de prestation invalide.");
      }
      const client = await db6().connect();
      try {
        await client.query("BEGIN");
        const pricing = (input.vehicle_pricing ?? []).map((entry) => ({
          vehicle_category_id: entry.vehicle_category_id,
          price_cents: entry.price_cents
        }));
        const displayPrice = Math.min(...pricing.map((entry) => entry.price_cents));
        const q = await client.query(
          `INSERT INTO services(organization_id, template_id, name, description, category_id, price_cents, price_by_vehicle_type, duration_minutes, is_active)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8,COALESCE($9,true)) RETURNING *`,
          [t.organizationId, input.template_id ?? null, input.name, input.description ?? null, input.category_id ?? null, displayPrice, JSON.stringify(Object.fromEntries(pricing.map((e) => [e.vehicle_category_id, e.price_cents]))), input.duration_minutes ?? null, input.is_active ?? null]
        );
        const service = q.rows[0];
        for (const entry of pricing) {
          await client.query(
            "INSERT INTO service_vehicle_prices(service_id, vehicle_category_id, price_cents) VALUES($1,$2,$3)",
            [service.id, entry.vehicle_category_id, entry.price_cents]
          );
        }
        await auditService(client, t, "service.created", service.id, {
          name: input.name,
          vehicle_pricing: pricing
        });
        await client.query("COMMIT");
        res.status(201).json(serviceResponse(service, pricing));
      } catch (error) {
        await client.query("ROLLBACK").catch(() => {
        });
        throw error;
      } finally {
        client.release();
      }
    })
  );
  r.patch(
    "/services/:id",
    requirePermission("service:manage"),
    asyncRoute(async (req, res) => {
      const t = tenant(req);
      const id = parseId(req.params.id);
      const input = body(catalogValidators.service.partial(), req.body);
      const oldQ = await db6().query("SELECT * FROM services WHERE id=$1::uuid AND organization_id=$2::uuid", [id, t.organizationId]);
      if (!oldQ.rowCount) throw new HttpError(404, "service_not_found", "Prestation introuvable.");
      if (input.template_id !== void 0) await assertServiceTemplate(input.template_id);
      if (input.category_id) {
        const categoryQ = await db6().query("SELECT 1 FROM service_categories WHERE id=$1::uuid AND organization_id=$2::uuid", [input.category_id, t.organizationId]);
        if (!categoryQ.rowCount) throw new HttpError(400, "invalid_category", "Cat\xE9gorie de prestation invalide.");
      }
      const oldPricingQ = await db6().query(
        "SELECT vehicle_category_id, price_cents FROM service_vehicle_prices WHERE service_id=$1::uuid ORDER BY created_at",
        [id]
      );
      const oldPricing = oldPricingQ.rows.map((row) => ({
        vehicle_category_id: String(row.vehicle_category_id),
        price_cents: Number(row.price_cents)
      }));
      const keepExisting = new Set(oldPricing.map((entry) => entry.vehicle_category_id));
      const replacesPricing = input.vehicle_pricing !== void 0;
      if (input.vehicle_pricing !== void 0) {
        await assertVehiclePricing(input.vehicle_pricing, t.organizationId, keepExisting);
      }
      const pricing = replacesPricing ? input.vehicle_pricing.map((entry) => ({
        vehicle_category_id: entry.vehicle_category_id,
        price_cents: entry.price_cents
      })) : oldPricing;
      const merged = { ...oldQ.rows[0], ...input };
      const displayPrice = pricing.length > 0 ? Math.min(...pricing.map((entry) => entry.price_cents)) : Number(oldQ.rows[0].price_cents);
      const client = await db6().connect();
      let updated;
      try {
        await client.query("BEGIN");
        const q = await client.query(
          `UPDATE services SET template_id=$3, name=$4, description=$5, category_id=$6::uuid, price_cents=$7, price_by_vehicle_type=$8, duration_minutes=$9, is_active=$10, updated_at=now()
           WHERE id=$1::uuid AND organization_id=$2::uuid RETURNING *`,
          [id, t.organizationId, merged.template_id ?? null, merged.name, merged.description ?? null, merged.category_id ?? null, displayPrice, JSON.stringify(Object.fromEntries(pricing.map((e) => [e.vehicle_category_id, e.price_cents]))), merged.duration_minutes ?? null, merged.is_active]
        );
        updated = q.rows[0];
        if (replacesPricing) {
          const keep = new Set(pricing.map((entry) => entry.vehicle_category_id));
          for (const entry of oldPricing) {
            if (!keep.has(entry.vehicle_category_id)) {
              await client.query(
                "DELETE FROM service_vehicle_prices WHERE service_id=$1::uuid AND vehicle_category_id=$2::uuid",
                [id, entry.vehicle_category_id]
              );
            }
          }
          for (const entry of pricing) {
            await client.query(
              `INSERT INTO service_vehicle_prices(service_id, vehicle_category_id, price_cents)
               VALUES($1,$2,$3)
               ON CONFLICT (service_id, vehicle_category_id)
               DO UPDATE SET price_cents=EXCLUDED.price_cents, updated_at=now()`,
              [id, entry.vehicle_category_id, entry.price_cents]
            );
          }
        }
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK").catch(() => {
        });
        throw error;
      } finally {
        client.release();
      }
      const changed = {};
      if (String(oldQ.rows[0].name) !== String(merged.name)) {
        changed.name_before = oldQ.rows[0].name;
        changed.name_after = merged.name;
      }
      if (Boolean(oldQ.rows[0].is_active) !== Boolean(merged.is_active)) {
        changed.is_active = merged.is_active;
      }
      if (replacesPricing && JSON.stringify(oldPricing) !== JSON.stringify(pricing)) {
        changed.vehicle_pricing = pricing;
      }
      if (Object.keys(changed).length > 0) {
        await auditService(db6(), t, "service.updated", id, changed);
      }
      res.json(serviceResponse(updated, pricing));
    })
  );
  r.delete(
    "/services/:id",
    requirePermission("service:manage"),
    asyncRoute(async (req, res) => {
      const t = tenant(req);
      const id = parseId(req.params.id);
      const pool2 = db6();
      const serviceQ = await pool2.query(
        "SELECT name FROM services WHERE id=$1::uuid AND organization_id=$2::uuid",
        [id, t.organizationId]
      );
      if (!serviceQ.rowCount) throw new HttpError(404, "service_not_found", "Prestation introuvable.");
      const deletedName = String(serviceQ.rows[0].name);
      const client = await pool2.connect();
      try {
        await client.query("BEGIN");
        const used = await client.query("SELECT 1 FROM wash_items WHERE service_id=$1::uuid LIMIT 1", [id]);
        if (used.rowCount) {
          throw new HttpError(409, "service_in_use", "Des lavages r\xE9f\xE9rencent cette prestation. D\xE9sactivez-la plut\xF4t.");
        }
        await client.query(
          "DELETE FROM service_consumables WHERE service_id=$1::uuid AND organization_id=$2::uuid",
          [id, t.organizationId]
        );
        await client.query("DELETE FROM services WHERE id=$1::uuid AND organization_id=$2::uuid", [id, t.organizationId]);
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
      await auditService(db6(), t, "service.deleted", id, { name: deletedName });
      res.status(204).send();
    })
  );
  r.get(
    "/washes",
    requirePermission("wash:read"),
    asyncRoute(async (req, res) => {
      const t = tenant(req);
      const plate = typeof req.query.plate === "string" ? plateKey(req.query.plate) : null;
      const q = await db6().query(
        `SELECT ${WASH_FIELDS} FROM washes
         WHERE organization_id=$1::uuid AND ($2::text IS NULL OR plate_key = $2::text)
         ORDER BY created_at DESC LIMIT 200`,
        [t.organizationId, plate]
      );
      const washers = await loadWashWorkers(
        db6(),
        t.organizationId,
        q.rows.map((row) => row.id)
      );
      res.json(q.rows.map((row) => ({ ...row, washers: washers.get(row.id) ?? [] })));
    })
  );
  r.get(
    "/vehicles/:plate",
    requirePermission("wash:read"),
    asyncRoute(async (req, res) => {
      const t = tenant(req);
      const raw = req.params.plate;
      const key = plateKey(typeof raw === "string" ? raw : null);
      if (!key) throw new HttpError(400, "invalid_data", "Indiquez une plaque.");
      const pool2 = db6();
      const summaryQ = await pool2.query(
        `SELECT count(*) FILTER (WHERE cancelled_at IS NULL) AS visits,
                count(*) FILTER (WHERE cancelled_at IS NOT NULL) AS cancelled,
                COALESCE(sum(total_cents) FILTER (WHERE cancelled_at IS NULL), 0) AS total_cents,
                min(created_at) FILTER (WHERE cancelled_at IS NULL) AS first_visit_at,
                max(created_at) FILTER (WHERE cancelled_at IS NULL) AS last_visit_at,
                max(plate) AS plate
         FROM washes WHERE organization_id=$1::uuid AND plate_key=$2::text`,
        [t.organizationId, key]
      );
      const row = summaryQ.rows[0] ?? {};
      const washesQ = await pool2.query(
        `SELECT ${WASH_FIELDS} FROM washes
         WHERE organization_id=$1::uuid AND plate_key=$2::text
         ORDER BY created_at DESC LIMIT 50`,
        [t.organizationId, key]
      );
      res.json({
        plate_key: key,
        plate: row.plate ?? null,
        visits: Number(row.visits ?? 0),
        cancelled: Number(row.cancelled ?? 0),
        total_cents: Number(row.total_cents ?? 0),
        first_visit_at: row.first_visit_at ?? null,
        last_visit_at: row.last_visit_at ?? null,
        washes: washesQ.rows
      });
    })
  );
  r.get(
    "/washes/:id",
    requirePermission("wash:read"),
    asyncRoute(async (req, res) => {
      const t = tenant(req);
      const id = parseId(req.params.id);
      const pool2 = db6();
      const washQ = await pool2.query(`SELECT ${WASH_FIELDS} FROM washes WHERE id=$1::uuid AND organization_id=$2::uuid`, [id, t.organizationId]);
      if (!washQ.rowCount) throw new HttpError(404, "wash_not_found", "Lavage introuvable.");
      const [items, workers, payments] = await Promise.all([
        pool2.query(
          "SELECT id, service_id, service_name AS service_name_snapshot, unit_price_cents AS price_cents_snapshot, quantity, line_total_cents FROM wash_items WHERE wash_id=$1::uuid",
          [id]
        ),
        pool2.query(
          `SELECT w.id, w.first_name, w.last_name, w.role FROM wash_assignments a
           JOIN workers w ON w.id = a.worker_id WHERE a.wash_id=$1::uuid`,
          [id]
        ),
        pool2.query(
          "SELECT id, amount_cents, method, status, reference, created_at AS received_at FROM payments WHERE wash_id=$1::uuid ORDER BY created_at",
          [id]
        )
      ]);
      const peutVoirLeStock = t.can("stock:read") && req.subscription?.capabilities["stock.manage"] === true;
      const consumables = peutVoirLeStock ? (await pool2.query(
        `SELECT m.id, m.product_id, m.kind, m.quantity_milli, m.created_at,
                      p.name AS product_name, p.unit
               FROM stock_movements m
               JOIN products p ON p.id = m.product_id
               WHERE m.wash_id=$1::uuid AND m.organization_id=$2::uuid
               ORDER BY m.created_at, p.name`,
        [id, t.organizationId]
      )).rows : void 0;
      res.json({
        wash: washQ.rows[0],
        items: items.rows,
        workers: workers.rows,
        payments: payments.rows,
        ...consumables === void 0 ? {} : { consumables }
      });
    })
  );
  r.post(
    "/washes",
    requirePermission("wash:create"),
    asyncRoute(async (req, res) => {
      const t = tenant(req);
      const input = body(washValidators.create, req.body);
      const pool2 = db6();
      await withIdempotency(pool2, req, res, t.organizationId, fingerprint(input), async () => {
        const client = await pool2.connect();
        try {
          await client.query("BEGIN");
          const siteQ = await client.query("SELECT id FROM sites WHERE id=$1::uuid AND organization_id=$2::uuid AND is_active", [input.site_id, t.organizationId]);
          if (!siteQ.rowCount) throw new HttpError(400, "invalid_site", "Station invalide.");
          const categoryQ = await client.query(
            "SELECT id, family FROM vehicle_categories WHERE id=$1::uuid AND organization_id=$2::uuid AND is_active",
            [input.vehicle_category_id, t.organizationId]
          );
          if (!categoryQ.rowCount) throw new HttpError(400, "invalid_vehicle_category", "Cat\xE9gorie de v\xE9hicule invalide.");
          const serviceIds = input.items.map((item) => item.service_id);
          const servicesQ = await client.query(
            `SELECT s.id, s.name, s.duration_minutes, p.price_cents AS configured_price_cents
               FROM services s
               LEFT JOIN service_vehicle_prices p
                 ON p.service_id = s.id AND p.vehicle_category_id = $3::uuid
              WHERE s.organization_id=$1::uuid AND s.id = ANY($2::uuid[]) AND s.is_active`,
            [t.organizationId, serviceIds, input.vehicle_category_id]
          );
          if (servicesQ.rowCount !== new Set(serviceIds).size) {
            throw new HttpError(400, "invalid_service", "Une prestation s\xE9lectionn\xE9e est invalide ou inactive.");
          }
          const serviceById = new Map(servicesQ.rows.map((row) => [row.id, row]));
          for (const item of input.items) {
            const service = serviceById.get(item.service_id);
            if (service.configured_price_cents == null) {
              throw new HttpError(
                400,
                "service_not_available_for_vehicle",
                `La prestation \xAB ${service.name} \xBB n'est pas disponible pour la cat\xE9gorie de v\xE9hicule s\xE9lectionn\xE9e.`
              );
            }
          }
          if (input.worker_ids.length) {
            const workersQ = await client.query(
              "SELECT id FROM workers WHERE organization_id=$1::uuid AND id = ANY($2::uuid[]) AND status='active'",
              [t.organizationId, input.worker_ids]
            );
            if (workersQ.rowCount !== new Set(input.worker_ids).size) {
              throw new HttpError(400, "invalid_worker", "Un travailleur s\xE9lectionn\xE9 est invalide ou inactif.");
            }
          }
          const totalCents = input.items.reduce((total, item) => {
            const service = serviceById.get(item.service_id);
            return total + Number(service.configured_price_cents) * item.quantity;
          }, 0);
          if (input.amount_received_cents > totalCents) {
            throw new HttpError(400, "amount_exceeds_total", "Le montant re\xE7u d\xE9passe le total du lavage.");
          }
          const estimatedMinutes = input.items.reduce((total, item) => {
            const service = serviceById.get(item.service_id);
            const minutes = Number(service.duration_minutes ?? 0);
            return total + (Number.isFinite(minutes) && minutes > 0 ? minutes * item.quantity : 0);
          }, 0) || DEFAULT_ESTIMATED_MINUTES;
          const isCash = input.payment_method === "cash" && input.amount_received_cents > 0;
          let cashSessionId = null;
          if (isCash) {
            if (!input.cash_session_id) {
              throw new HttpError(400, "cash_session_required", "Une session de caisse ouverte est requise pour un paiement en esp\xE8ces.");
            }
            const sessionQ = await client.query(
              "SELECT id FROM cash_sessions WHERE id=$1::uuid AND organization_id=$2::uuid AND site_id=$3::uuid AND status='open' FOR UPDATE",
              [input.cash_session_id, t.organizationId, input.site_id]
            );
            if (!sessionQ.rowCount) {
              throw new HttpError(400, "cash_session_invalid", "Session de caisse introuvable, ferm\xE9e ou d'une autre station.");
            }
            cashSessionId = sessionQ.rows[0].id;
          }
          const paymentStatus = resolvePaymentStatus(totalCents, input.amount_received_cents);
          await assertSiteWritable(client, t.organizationId, input.site_id);
          const activeCountQ = await client.query(
            `SELECT COUNT(*)::int as cnt FROM washes 
             WHERE organization_id=$1::uuid AND site_id=$2::uuid 
             AND status != 'cancelled' 
             AND operation_status IN ('pending','in_progress','overtime')`,
            [t.organizationId, input.site_id]
          );
          const activeCount = activeCountQ.rows[0]?.cnt || 0;
          let queuePos = null;
          if (activeCount >= MAX_ACTIVE_WASH_TASKS) {
            const maxQueueQ = await client.query(
              `SELECT COALESCE(MAX(queue_position), 0) as maxq FROM washes 
               WHERE organization_id=$1::uuid AND site_id=$2::uuid`,
              [t.organizationId, input.site_id]
            );
            queuePos = (maxQueueQ.rows[0]?.maxq || 0) + 1;
          }
          const washQ = await client.query(
            `INSERT INTO washes(organization_id, site_id, vehicle_category_id, status, payment_status, operation_status, estimated_minutes, customer_name, total_cents, payment_method, created_by, plate, plate_key, reference, queue_position)
             VALUES($1,$2,$3,'completed',$4,'pending',$5,$6,$7,$8,$9,$10,$11,
               'LAV-' || to_char(now(),'YYYYMMDD') || '-' || upper(substr(md5(random()::text),1,6)), $12)
             RETURNING ${WASH_FIELDS}`,
            [
              t.organizationId,
              input.site_id,
              input.vehicle_category_id,
              paymentStatus,
              estimatedMinutes,
              input.customer_name ?? null,
              totalCents,
              input.payment_method,
              t.userId,
              plateDisplay(input.plate ?? null),
              plateKey(input.plate ?? null),
              queuePos
            ]
          );
          const wash = washQ.rows[0];
          for (const item of input.items) {
            const service = serviceById.get(item.service_id);
            const unitPrice = Number(service.configured_price_cents);
            await client.query(
              "INSERT INTO wash_items(wash_id, service_id, service_name, quantity, unit_price_cents, line_total_cents) VALUES($1,$2,$3,$4,$5,$6)",
              [wash.id, item.service_id, service.name, item.quantity, unitPrice, unitPrice * item.quantity]
            );
          }
          if (req.subscription?.capabilities["stock.manage"]) {
            await consumeForWash(client, t.organizationId, wash.id, input.items, t.userId);
          }
          const principal = input.principal_worker_id ?? null;
          if (principal && !input.worker_ids.includes(principal)) {
            throw new HttpError(
              400,
              "invalid_principal",
              "Le responsable principal doit faire partie des laveurs affect\xE9s \xE0 ce lavage."
            );
          }
          for (const workerId of new Set(input.worker_ids)) {
            await client.query(
              "INSERT INTO wash_assignments(wash_id, worker_id, assignment_role, assigned_by) VALUES($1,$2,$3,$4)",
              [wash.id, workerId, workerId === principal ? "principal" : "participant", t.userId]
            );
          }
          if (input.amount_received_cents > 0) {
            await client.query(
              "INSERT INTO payments(organization_id, wash_id, method, amount_cents, status) VALUES($1,$2,$3,$4,$5)",
              [t.organizationId, wash.id, input.payment_method, input.amount_received_cents, initialPaymentStatus(input.payment_method)]
            );
          }
          if (isCash && cashSessionId) {
            await client.query(
              `INSERT INTO cash_movements(organization_id, cash_session_id, type, amount_cents, source, description, wash_id, created_by)
               VALUES($1,$2,'entry',$3,'wash',$4,$5,$6)`,
              [t.organizationId, cashSessionId, input.amount_received_cents, `Encaissement lavage ${wash.reference}`, wash.id, t.userId]
            );
          }
          await client.query(
            "INSERT INTO audit_logs(organization_id, actor_user_id, action, entity_type, entity_id) VALUES($1,$2,'wash.created','wash',$3)",
            [t.organizationId, t.userId, wash.id]
          );
          await client.query("COMMIT");
          return { status: 201, body: wash };
        } catch (error) {
          await client.query("ROLLBACK");
          throw error;
        } finally {
          client.release();
        }
      });
    })
  );
  r.patch(
    "/washes/:id/status",
    requirePermission("wash:status"),
    asyncRoute(async (req, res) => {
      const t = tenant(req);
      const id = parseId(req.params.id);
      const input = body(washValidators.status, req.body);
      const pool2 = db6();
      const client = await pool2.connect();
      try {
        await client.query("BEGIN");
        const washQ = await client.query(
          "SELECT id, reference, status, operation_status, site_id FROM washes WHERE id=$1::uuid AND organization_id=$2::uuid FOR UPDATE",
          [id, t.organizationId]
        );
        if (!washQ.rowCount) throw new HttpError(404, "wash_not_found", "Lavage introuvable.");
        if (washQ.rows[0].status === "cancelled") {
          throw new HttpError(409, "wash_cancelled", "Ce lavage est annul\xE9 : son avancement ne se change plus.");
        }
        if (washQ.rows[0].operation_status === input.status) {
          await client.query("COMMIT");
          res.json(washQ.rows[0]);
          return;
        }
        const q = await client.query(
          `UPDATE washes
              SET operation_status=$3,
                  operation_started_at = CASE
                    WHEN $3 = 'pending' THEN NULL
                    WHEN $3 = 'in_progress' THEN COALESCE(operation_started_at, now())
                    ELSE operation_started_at
                  END,
                  completed_at = CASE WHEN $3 = 'completed' THEN COALESCE(completed_at, now()) ELSE completed_at END
            WHERE id=$1::uuid AND organization_id=$2::uuid RETURNING ${WASH_FIELDS}`,
          [id, t.organizationId, input.status]
        );
        await client.query(
          "INSERT INTO audit_logs(organization_id, actor_user_id, action, entity_type, entity_id, metadata) VALUES($1,$2,'wash.status_changed','wash',$3,$4)",
          [
            t.organizationId,
            t.userId,
            id,
            JSON.stringify({ from: washQ.rows[0].operation_status, to: input.status })
          ]
        );
        if (input.status === "completed") {
          try {
            await client.query(
              `INSERT INTO notifications(organization_id, site_id, type, title, message, entity_type, entity_id)
               VALUES($1,$2,'WASH_COMPLETED',$3,$4,'wash',$5)`,
              [
                t.organizationId,
                washQ.rows[0].site_id,
                "Lavage termin\xE9",
                `Le lavage ${washQ.rows[0].reference} est termin\xE9.`,
                id
              ]
            );
          } catch {
          }
        }
        await client.query("COMMIT");
        res.json(q.rows[0]);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    })
  );
  r.post(
    "/washes/:id/cancel",
    requirePermission("wash:cancel"),
    asyncRoute(async (req, res) => {
      const t = tenant(req);
      const id = parseId(req.params.id);
      const input = body(washValidators.cancel, req.body);
      const pool2 = db6();
      const client = await pool2.connect();
      try {
        await client.query("BEGIN");
        const washQ = await client.query(
          "SELECT id, reference, status FROM washes WHERE id=$1::uuid AND organization_id=$2::uuid FOR UPDATE",
          [id, t.organizationId]
        );
        if (!washQ.rowCount) throw new HttpError(404, "wash_not_found", "Lavage introuvable.");
        if (washQ.rows[0].status === "cancelled") {
          throw new HttpError(409, "wash_already_cancelled", "Ce lavage est d\xE9j\xE0 annul\xE9.");
        }
        const movementQ = await client.query(
          `SELECT m.cash_session_id, m.amount_cents FROM cash_movements m
           JOIN cash_sessions s ON s.id = m.cash_session_id
           WHERE m.wash_id=$1::uuid AND m.type='entry' AND s.status='open'`,
          [id]
        );
        for (const movement of movementQ.rows) {
          await client.query(
            `INSERT INTO cash_movements(organization_id, cash_session_id, type, amount_cents, source, description, wash_id, created_by)
             VALUES($1,$2,'exit',$3,'wash_cancellation',$4,$5,$6)`,
            [t.organizationId, movement.cash_session_id, movement.amount_cents, `Annulation lavage ${washQ.rows[0].reference}`, id, t.userId]
          );
        }
        const hadPayments = await client.query("SELECT 1 FROM payments WHERE wash_id=$1::uuid LIMIT 1", [id]);
        await client.query("UPDATE payments SET status='refunded' WHERE wash_id=$1::uuid", [id]);
        await reverseWashConsumption(client, t.organizationId, id, t.userId);
        const q = await client.query(
          `UPDATE washes SET status='cancelled', payment_status=CASE WHEN $4 THEN 'refunded' ELSE payment_status END,
             cancelled_at=now(), cancelled_by=$3, cancellation_reason=$5
           WHERE id=$1::uuid AND organization_id=$2::uuid RETURNING ${WASH_FIELDS}`,
          [id, t.organizationId, t.userId, Boolean(hadPayments.rowCount), input.reason]
        );
        await client.query(
          "INSERT INTO audit_logs(organization_id, actor_user_id, action, entity_type, entity_id, metadata) VALUES($1,$2,'wash.cancelled','wash',$3,$4)",
          [t.organizationId, t.userId, id, JSON.stringify({ reason: input.reason })]
        );
        await client.query("COMMIT");
        res.json(q.rows[0]);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    })
  );
  return r;
}

// server/operations.ts
init_db();
init_http();
init_auth();
import { Router as Router10 } from "express";
import { z as z13 } from "zod";

// server/utilities.ts
init_db();
init_auth();
init_http();
import { Router as Router9 } from "express";
import { z as z12 } from "zod";
var UTILITY_PROVIDERS = ["cie", "sodeci"];
var PROVIDER_LABEL = { cie: "CIE", sodeci: "SODECI" };
var PAYMENT_METHODS2 = ["cash", "orange_money", "mtn_momo", "moov_money", "wave", "other"];
var calendarDate = z12.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date attendue au format AAAA-MM-JJ.").refine((value) => {
  const date = /* @__PURE__ */ new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, "Cette date n'existe pas.");
function hasAtMostThreeDecimals(value) {
  const scaled = value * 1e3;
  return Math.abs(scaled - Math.round(scaled)) <= Math.max(1, Math.abs(scaled)) * Number.EPSILON * 4;
}
var utilityIndexValueSchema = z12.number().finite().min(0).max(1e9).refine(hasAtMostThreeDecimals, "Trois d\xE9cimales maximum.");
var invoiceSchema = z12.object({
  amount_cents: z12.number().int().positive().max(1e8),
  expense_date: calendarDate,
  payment_method: z12.enum(PAYMENT_METHODS2),
  reference: z12.string().trim().max(120).optional(),
  cash_session_id: z12.string().uuid().optional()
}).strip();
var utilityValidators = {
  meter: z12.object({
    site_id: z12.string().uuid(),
    provider: z12.enum(UTILITY_PROVIDERS),
    meter_number: z12.string().trim().min(2).max(80)
  }).strip(),
  reading: z12.object({
    reading_date: calendarDate,
    index_value: utilityIndexValueSchema,
    notes: z12.string().trim().max(500).optional(),
    invoice: invoiceSchema.optional()
  }).strip(),
  invoice: invoiceSchema
};
function db7() {
  const pool2 = getPool();
  if (!pool2) throw new HttpError(503, "database_not_configured", "Base de donn\xE9es indisponible.");
  return pool2;
}
function isUniqueViolation(error) {
  return typeof error === "object" && error !== null && error.code === "23505";
}
function indexToMilli(value) {
  return Math.round(value * 1e3);
}
function assertNotFuture(value, label) {
  if (value > (/* @__PURE__ */ new Date()).toISOString().slice(0, 10)) {
    throw new HttpError(400, "future_date", `${label} ne peut pas \xEAtre dans le futur.`);
  }
}
function monthBounds(month) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    throw new HttpError(400, "invalid_month", "Mois attendu au format AAAA-MM.");
  }
  const start = `${month}-01`;
  const date = /* @__PURE__ */ new Date(`${start}T00:00:00.000Z`);
  date.setUTCMonth(date.getUTCMonth() + 1);
  return { start, end: date.toISOString().slice(0, 10) };
}
function dateOnly(value) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}
function mapReading(row) {
  return {
    id: String(row.id),
    meter_id: String(row.meter_id),
    cash_session_id: row.cash_session_id ? String(row.cash_session_id) : null,
    reading_date: dateOnly(row.reading_date),
    index_milli: Number(row.index_milli),
    consumption_milli: row.consumption_milli == null ? null : Number(row.consumption_milli),
    notes: row.notes ?? null,
    anomaly_comment: row.anomaly_comment ?? null,
    has_photo: Boolean(row.has_photo),
    created_at: row.created_at,
    expense: row.expense_id ? {
      id: String(row.expense_id),
      amount_cents: Number(row.amount_cents),
      expense_date: dateOnly(row.expense_date),
      payment_method: String(row.payment_method),
      reference: row.invoice_reference == null ? null : String(row.invoice_reference),
      status: String(row.expense_status)
    } : null
  };
}
var READING_SELECT = `
  SELECT ordered.id, ordered.meter_id, ordered.cash_session_id, ordered.reading_date, ordered.index_milli::text,
         (ordered.index_milli - ordered.previous_index_milli)::text AS consumption_milli,
         ordered.notes, ordered.anomaly_comment, (p.reading_id IS NOT NULL) AS has_photo, ordered.created_at,
         e.id AS expense_id, e.amount_cents, e.expense_date, e.payment_method,
         e.reference AS invoice_reference, e.status AS expense_status
  FROM (
    SELECT r.*, LAG(r.index_milli) OVER (PARTITION BY r.meter_id ORDER BY r.reading_date) AS previous_index_milli
    FROM utility_readings r
    WHERE r.organization_id=$1::uuid
  ) ordered
  LEFT JOIN expenses e ON e.utility_reading_id=ordered.id
  LEFT JOIN utility_reading_photos p ON p.reading_id=ordered.id`;
async function readingForResponse(client, organizationId, readingId) {
  const q = await client.query(`${READING_SELECT} WHERE ordered.id=$2::uuid`, [organizationId, readingId]);
  if (!q.rowCount) throw new HttpError(404, "reading_not_found", "Relev\xE9 introuvable.");
  return mapReading(q.rows[0]);
}
async function lockedMeter(client, organizationId, meterId) {
  const q = await client.query(
    `SELECT id, organization_id, site_id, provider, meter_number, is_active
     FROM utility_meters WHERE id=$1::uuid AND organization_id=$2::uuid FOR UPDATE`,
    [meterId, organizationId]
  );
  if (!q.rowCount) throw new HttpError(404, "meter_not_found", "Compteur introuvable.");
  if (!q.rows[0].is_active) throw new HttpError(409, "meter_inactive", "Ce compteur n'est plus actif.");
  return q.rows[0];
}
async function assertChronology(client, meterId, readingDate, indexMilli) {
  const [previous, next] = await Promise.all([
    client.query(
      "SELECT index_milli::text FROM utility_readings WHERE meter_id=$1::uuid AND reading_date<$2::date ORDER BY reading_date DESC LIMIT 1",
      [meterId, readingDate]
    ),
    client.query(
      "SELECT index_milli::text FROM utility_readings WHERE meter_id=$1::uuid AND reading_date>$2::date ORDER BY reading_date LIMIT 1",
      [meterId, readingDate]
    )
  ]);
  if (previous.rowCount && Number(previous.rows[0].index_milli) > indexMilli) {
    throw new HttpError(400, "index_regresses", "Le nouvel index est inf\xE9rieur au relev\xE9 pr\xE9c\xE9dent. V\xE9rifiez la date ou la valeur saisie.");
  }
  if (next.rowCount && Number(next.rows[0].index_milli) < indexMilli) {
    throw new HttpError(400, "index_exceeds_next", "Le nouvel index d\xE9passe le relev\xE9 suivant. V\xE9rifiez la date ou la valeur saisie.");
  }
}
async function createUtilityExpense(client, input, meter, reading, organizationId, userId) {
  let cashSessionId = null;
  if (input.payment_method === "cash") {
    if (!input.cash_session_id) {
      throw new HttpError(400, "cash_session_required", "S\xE9lectionnez une caisse ouverte pour r\xE9gler cette facture en esp\xE8ces.");
    }
    const session = await client.query(
      "SELECT id, site_id, status FROM cash_sessions WHERE id=$1::uuid AND organization_id=$2::uuid FOR UPDATE",
      [input.cash_session_id, organizationId]
    );
    if (!session.rowCount || session.rows[0].status !== "open") {
      throw new HttpError(400, "cash_session_invalid", "Session de caisse introuvable ou cl\xF4tur\xE9e.");
    }
    if (session.rows[0].site_id !== meter.site_id) {
      throw new HttpError(400, "cash_session_wrong_site", "La caisse s\xE9lectionn\xE9e appartient \xE0 une autre station.");
    }
    cashSessionId = String(session.rows[0].id);
  }
  const provider = PROVIDER_LABEL[meter.provider];
  const description = `Facture ${provider} \u2014 compteur ${meter.meter_number}, relev\xE9 du ${reading.reading_date}`;
  const q = await client.query(
    `INSERT INTO expenses(organization_id, site_id, category, amount_cents, payment_method,
       cash_session_id, description, beneficiary, reference, expense_date, utility_reading_id, created_by)
     VALUES($1,$2,'utilities',$3,$4,$5,$6,$7,$8,$9::date,$10,$11)
     RETURNING id, amount_cents, expense_date, payment_method, reference, status`,
    [
      organizationId,
      meter.site_id,
      input.amount_cents,
      input.payment_method,
      cashSessionId,
      description,
      provider,
      input.reference || null,
      input.expense_date,
      reading.id,
      userId
    ]
  );
  const expense = q.rows[0];
  if (cashSessionId) {
    await client.query(
      `INSERT INTO cash_movements(organization_id, cash_session_id, type, amount_cents, source, description, expense_id, created_by)
       VALUES($1,$2,'exit',$3,'expense',$4,$5,$6)`,
      [organizationId, cashSessionId, input.amount_cents, description, expense.id, userId]
    );
  }
  return expense;
}
function createUtilitiesRouter() {
  const r = Router9();
  r.get(
    "/utilities",
    requirePermission("expense:read"),
    asyncRoute(async (req, res) => {
      const t = tenant(req);
      const month = typeof req.query.month === "string" ? req.query.month : (/* @__PURE__ */ new Date()).toISOString().slice(0, 7);
      const { start, end } = monthBounds(month);
      const siteId = req.query.site_id === void 0 || req.query.site_id === "" ? null : parseId(req.query.site_id);
      const pool2 = db7();
      const [metersQ, readingsQ, invoicesQ] = await Promise.all([
        pool2.query(
          `SELECT m.id, m.site_id, s.name AS site_name, m.provider, m.meter_number, m.is_active, m.created_at,
                  latest.reading_date AS latest_reading_date, latest.index_milli::text AS latest_index_milli
           FROM utility_meters m
           JOIN sites s ON s.id=m.site_id AND s.organization_id=m.organization_id
           LEFT JOIN LATERAL (
             SELECT r.reading_date, r.index_milli FROM utility_readings r
             WHERE r.meter_id=m.id ORDER BY r.reading_date DESC LIMIT 1
           ) latest ON true
           WHERE m.organization_id=$1::uuid AND ($2::uuid IS NULL OR m.site_id=$2::uuid)
           ORDER BY s.name, m.provider`,
          [t.organizationId, siteId]
        ),
        pool2.query(
          `${READING_SELECT}
           JOIN utility_meters m ON m.id=ordered.meter_id
           WHERE ordered.reading_date>=$2::date AND ordered.reading_date<$3::date
             AND ($4::uuid IS NULL OR m.site_id=$4::uuid)
           ORDER BY ordered.meter_id, ordered.reading_date DESC`,
          [t.organizationId, start, end, siteId]
        ),
        pool2.query(
          `SELECT r.meter_id, SUM(e.amount_cents)::int AS invoiced_cents
           FROM expenses e
           JOIN utility_readings r ON r.id=e.utility_reading_id
           WHERE e.organization_id=$1::uuid AND e.expense_date>=$2::date AND e.expense_date<$3::date
             AND e.status<>'cancelled' AND ($4::uuid IS NULL OR e.site_id=$4::uuid)
           GROUP BY r.meter_id`,
          [t.organizationId, start, end, siteId]
        )
      ]);
      const readingsByMeter = /* @__PURE__ */ new Map();
      for (const row of readingsQ.rows) {
        const reading = mapReading(row);
        const list = readingsByMeter.get(reading.meter_id) ?? [];
        list.push(reading);
        readingsByMeter.set(reading.meter_id, list);
      }
      const invoicedByMeter = new Map(invoicesQ.rows.map((row) => [String(row.meter_id), Number(row.invoiced_cents)]));
      const meters = metersQ.rows.map((row) => {
        const readings = readingsByMeter.get(String(row.id)) ?? [];
        return {
          id: String(row.id),
          site_id: String(row.site_id),
          site_name: String(row.site_name),
          provider: row.provider,
          meter_number: row.meter_number,
          is_active: row.is_active,
          latest_reading: row.latest_reading_date ? { reading_date: dateOnly(row.latest_reading_date), index_milli: Number(row.latest_index_milli) } : null,
          month_consumption_milli: readings.reduce((sum, reading) => sum + (reading.consumption_milli ?? 0), 0),
          month_invoiced_cents: invoicedByMeter.get(String(row.id)) ?? 0,
          readings
        };
      });
      const totals = {
        electricity_milli: meters.filter((m) => m.provider === "cie").reduce((sum, m) => sum + m.month_consumption_milli, 0),
        water_milli: meters.filter((m) => m.provider === "sodeci").reduce((sum, m) => sum + m.month_consumption_milli, 0),
        invoiced_cents: meters.reduce((sum, m) => sum + m.month_invoiced_cents, 0)
      };
      res.json({ month, totals, meters });
    })
  );
  r.get(
    "/utility-readings/:id/photo",
    requirePermission("expense:read"),
    asyncRoute(async (req, res) => {
      const t = tenant(req);
      const readingId = parseId(req.params.id);
      const q = await db7().query(
        `SELECT p.mime_type, p.photo_data
         FROM utility_reading_photos p
         JOIN utility_readings r ON r.id=p.reading_id AND r.organization_id=p.organization_id
         WHERE p.reading_id=$1::uuid AND p.organization_id=$2::uuid`,
        [readingId, t.organizationId]
      );
      if (!q.rowCount) throw new HttpError(404, "utility_photo_not_found", "Aucune photo n'est jointe \xE0 ce relev\xE9.");
      const row = q.rows[0];
      const raw = row.photo_data;
      const data = Buffer.isBuffer(raw) ? raw : raw instanceof Uint8Array ? Buffer.from(raw) : Buffer.from(String(raw).replace(/^\\x/, ""), "hex");
      const extension = row.mime_type === "image/webp" ? "webp" : "jpg";
      res.setHeader("Content-Type", String(row.mime_type));
      res.setHeader("Content-Length", String(data.length));
      res.setHeader("Content-Disposition", `inline; filename="releve-${readingId}.${extension}"`);
      res.setHeader("Cache-Control", "private, max-age=300");
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.send(data);
    })
  );
  r.post(
    "/utility-meters",
    requirePermission("expense:create"),
    asyncRoute(async (req, res) => {
      const t = tenant(req);
      const input = body(utilityValidators.meter, req.body);
      const pool2 = db7();
      await withIdempotency(pool2, req, res, t.organizationId, fingerprint({ op: "utility-meter", ...input }), async () => {
        const client = await pool2.connect();
        try {
          await client.query("BEGIN");
          const site = await client.query("SELECT 1 FROM sites WHERE id=$1::uuid AND organization_id=$2::uuid", [input.site_id, t.organizationId]);
          if (!site.rowCount) throw new HttpError(400, "invalid_site", "Station invalide.");
          await assertSiteWritable(client, t.organizationId, input.site_id);
          const q = await client.query(
            `INSERT INTO utility_meters(organization_id, site_id, provider, meter_number, created_by)
             VALUES($1,$2,$3,$4,$5) RETURNING id, site_id, provider, meter_number, is_active, created_at`,
            [t.organizationId, input.site_id, input.provider, input.meter_number, t.userId]
          );
          await client.query(
            "INSERT INTO audit_logs(organization_id,actor_user_id,action,entity_type,entity_id) VALUES($1,$2,'utility_meter.created','utility_meter',$3)",
            [t.organizationId, t.userId, q.rows[0].id]
          );
          await client.query("COMMIT");
          return { status: 201, body: q.rows[0] };
        } catch (error) {
          await client.query("ROLLBACK");
          if (isUniqueViolation(error)) {
            throw new HttpError(409, "meter_exists", "Ce fournisseur a d\xE9j\xE0 un compteur dans cette station.");
          }
          throw error;
        } finally {
          client.release();
        }
      });
    })
  );
  r.post(
    "/utility-meters/:id/readings",
    requirePermission("expense:create"),
    asyncRoute(async (req, res) => {
      const t = tenant(req);
      const meterId = parseId(req.params.id);
      const input = body(utilityValidators.reading, req.body);
      assertNotFuture(input.reading_date, "La date du relev\xE9");
      if (input.invoice) assertNotFuture(input.invoice.expense_date, "La date de la facture");
      const indexMilli = indexToMilli(input.index_value);
      const pool2 = db7();
      await withIdempotency(pool2, req, res, t.organizationId, fingerprint({ op: "utility-reading", meterId, ...input }), async () => {
        const client = await pool2.connect();
        try {
          await client.query("BEGIN");
          const meter = await lockedMeter(client, t.organizationId, meterId);
          await assertSiteWritable(client, t.organizationId, meter.site_id);
          await assertChronology(client, meterId, input.reading_date, indexMilli);
          const inserted = await client.query(
            `INSERT INTO utility_readings(organization_id, meter_id, reading_date, index_milli, notes, created_by)
             VALUES($1,$2,$3::date,$4,$5,$6) RETURNING id, reading_date::text`,
            [t.organizationId, meterId, input.reading_date, indexMilli, input.notes || null, t.userId]
          );
          const reading = { id: String(inserted.rows[0].id), reading_date: String(inserted.rows[0].reading_date) };
          if (input.invoice) await createUtilityExpense(client, input.invoice, meter, reading, t.organizationId, t.userId);
          await client.query(
            `INSERT INTO audit_logs(organization_id,actor_user_id,action,entity_type,entity_id,metadata)
             VALUES($1,$2,'utility_reading.created','utility_reading',$3,$4::jsonb)`,
            [t.organizationId, t.userId, reading.id, JSON.stringify({ meter_id: meterId, reading_date: input.reading_date, index_milli: indexMilli, invoiced: Boolean(input.invoice) })]
          );
          const response = await readingForResponse(client, t.organizationId, reading.id);
          await client.query("COMMIT");
          return { status: 201, body: response };
        } catch (error) {
          await client.query("ROLLBACK");
          if (isUniqueViolation(error)) throw new HttpError(409, "reading_exists", "Un relev\xE9 existe d\xE9j\xE0 \xE0 cette date pour ce compteur.");
          throw error;
        } finally {
          client.release();
        }
      });
    })
  );
  r.post(
    "/utility-readings/:id/invoice",
    requirePermission("expense:create"),
    asyncRoute(async (req, res) => {
      const t = tenant(req);
      const readingId = parseId(req.params.id);
      const input = body(utilityValidators.invoice, req.body);
      assertNotFuture(input.expense_date, "La date de la facture");
      const pool2 = db7();
      await withIdempotency(pool2, req, res, t.organizationId, fingerprint({ op: "utility-invoice", readingId, ...input }), async () => {
        const client = await pool2.connect();
        try {
          await client.query("BEGIN");
          const readingQ = await client.query(
            `SELECT r.id, r.meter_id, r.reading_date FROM utility_readings r
             WHERE r.id=$1::uuid AND r.organization_id=$2::uuid FOR UPDATE`,
            [readingId, t.organizationId]
          );
          if (!readingQ.rowCount) throw new HttpError(404, "reading_not_found", "Relev\xE9 introuvable.");
          const existing = await client.query("SELECT id FROM expenses WHERE utility_reading_id=$1::uuid", [readingId]);
          if (existing.rowCount) throw new HttpError(409, "invoice_already_recorded", "Cette facture est d\xE9j\xE0 comptabilis\xE9e dans les d\xE9penses.");
          const meter = await lockedMeter(client, t.organizationId, String(readingQ.rows[0].meter_id));
          await assertSiteWritable(client, t.organizationId, meter.site_id);
          const expense = await createUtilityExpense(client, input, meter, readingQ.rows[0], t.organizationId, t.userId);
          await client.query(
            `INSERT INTO audit_logs(organization_id,actor_user_id,action,entity_type,entity_id,metadata)
             VALUES($1,$2,'utility_invoice.recorded','utility_reading',$3,$4::jsonb)`,
            [t.organizationId, t.userId, readingId, JSON.stringify({ expense_id: expense.id, amount_cents: expense.amount_cents, expense_date: input.expense_date })]
          );
          const response = await readingForResponse(client, t.organizationId, readingId);
          await client.query("COMMIT");
          return { status: 201, body: response };
        } catch (error) {
          await client.query("ROLLBACK");
          if (isUniqueViolation(error)) throw new HttpError(409, "invoice_already_recorded", "Cette facture est d\xE9j\xE0 comptabilis\xE9e dans les d\xE9penses.");
          throw error;
        } finally {
          client.release();
        }
      });
    })
  );
  return r;
}

// server/utility-analysis.ts
init_auth();
var PROVIDER_LABEL2 = { cie: "CIE", sodeci: "SODECI" };
var BASELINE_DAYS = 7;
var BASELINE_MIN_READINGS = 7;
var BASELINE_MIN_WASHES = 5;
var ANOMALY_THRESHOLD = 0.3;
var UTILITY_PHOTO_MAX_BYTES = 3e5;
function dateOnly2(value) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}
function addUtilityDays(value, days) {
  const date = /* @__PURE__ */ new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
function dayDifference(start, end) {
  return Math.round((Date.parse(`${end}T00:00:00.000Z`) - Date.parse(`${start}T00:00:00.000Z`)) / 864e5);
}
function periodStart(row) {
  return row.previous_reading_date ? addUtilityDays(dateOnly2(row.previous_reading_date), 1) : dateOnly2(row.reading_date);
}
function ratioPerWash(provider, consumptionMilli, washCount) {
  if (washCount <= 0) return null;
  return provider === "cie" ? consumptionMilli / 1e3 / washCount : consumptionMilli / washCount;
}
function sumWashCount(washes, start, end) {
  let total = 0;
  for (const [date, count] of Object.entries(washes)) {
    if (date >= start && date <= end) total += count;
  }
  return total;
}
function makePeriod(row, washes) {
  const readingDate = dateOnly2(row.reading_date);
  const start = periodStart(row);
  const previous = row.previous_index_milli == null ? null : Number(row.previous_index_milli);
  const index = Number(row.index_milli);
  const consumption = previous == null ? null : index - previous;
  const washCount = sumWashCount(washes, start, readingDate);
  return {
    reading_id: row.reading_id ? String(row.reading_id) : null,
    meter_id: String(row.meter_id),
    meter_number: String(row.meter_number),
    provider: row.provider,
    reading_date: readingDate,
    period_start: start,
    period_end: readingDate,
    period_days: Math.max(1, dayDifference(start, readingDate) + 1),
    index_milli: index,
    previous_index_milli: previous,
    consumption_milli: consumption,
    wash_count: washCount,
    ratio_per_wash: consumption == null ? null : ratioPerWash(row.provider, consumption, washCount),
    baseline: null,
    alerts: [],
    anomaly_comment: row.anomaly_comment?.trim() || null,
    has_photo: Boolean(row.has_photo)
  };
}
function baselineFor(period, history) {
  const start = addUtilityDays(period.period_start, -BASELINE_DAYS);
  const hasFourteenDaysHistory = history.some(
    (candidate) => candidate.meter_id === period.meter_id && candidate.reading_date <= addUtilityDays(period.period_start, -14)
  );
  if (!hasFourteenDaysHistory) return null;
  const eligible = history.filter(
    (candidate) => candidate.meter_id === period.meter_id && candidate.reading_date >= start && candidate.reading_date < period.period_start && candidate.consumption_milli != null
  );
  if (eligible.length < BASELINE_MIN_READINGS) return null;
  const consumption = eligible.reduce((sum, candidate) => sum + Number(candidate.consumption_milli), 0);
  const washCount = eligible.reduce((sum, candidate) => sum + candidate.wash_count, 0);
  if (consumption <= 0 || washCount < BASELINE_MIN_WASHES) return null;
  const ratio = ratioPerWash(period.provider, consumption, washCount);
  if (ratio == null || ratio <= 0) return null;
  return {
    consumption_milli: consumption,
    wash_count: washCount,
    ratio_per_wash: ratio,
    reading_count: eligible.length
  };
}
function utilityAlerts(period) {
  if (period.consumption_milli == null) return [];
  const alerts = [];
  const duration = period.period_days > 1 ? ` sur la p\xE9riode de ${period.period_days} jours` : "";
  if (period.consumption_milli > 0 && period.wash_count === 0) {
    alerts.push({
      code: "consumption_without_wash",
      message: `Consommation mesur\xE9e sans lavage termin\xE9${duration}. V\xE9rifiez une fuite, un essai ou un usage non enregistr\xE9.`
    });
  }
  if (period.consumption_milli === 0 && period.wash_count > 0) {
    alerts.push({
      code: "zero_consumption_with_washes",
      message: `Consommation nulle avec ${period.wash_count} lavage${period.wash_count > 1 ? "s" : ""}${duration}. V\xE9rifiez l'index et le compteur.`
    });
  }
  if (period.baseline && period.ratio_per_wash != null && period.baseline.ratio_per_wash > 0) {
    const variation = period.ratio_per_wash / period.baseline.ratio_per_wash - 1;
    if (variation > ANOMALY_THRESHOLD) {
      alerts.push({
        code: "high_per_wash",
        message: `Consommation par lavage en hausse de ${Math.round(variation * 100)} % par rapport \xE0 la moyenne mobile sur sept jours.`
      });
    } else if (variation < -ANOMALY_THRESHOLD) {
      alerts.push({
        code: "low_per_wash",
        message: `Consommation par lavage en baisse de ${Math.round(Math.abs(variation) * 100)} % par rapport \xE0 la moyenne mobile sur sept jours. V\xE9rifiez le relev\xE9.`
      });
    }
  }
  return alerts;
}
function enrichPeriod(period, history) {
  const enriched = { ...period, baseline: baselineFor(period, history) };
  enriched.alerts = utilityAlerts(enriched);
  return enriched;
}
async function periodRows(client, organizationId, siteId, fromDate, toDate3) {
  const q = await client.query(
    `SELECT * FROM (
       SELECT r.id AS reading_id, r.meter_id, m.meter_number, m.provider,
              r.reading_date, r.index_milli,
              LAG(r.index_milli) OVER (PARTITION BY r.meter_id ORDER BY r.reading_date) AS previous_index_milli,
              LAG(r.reading_date) OVER (PARTITION BY r.meter_id ORDER BY r.reading_date) AS previous_reading_date,
              r.anomaly_comment,
              EXISTS(SELECT 1 FROM utility_reading_photos p WHERE p.reading_id=r.id) AS has_photo
       FROM utility_readings r
       JOIN utility_meters m ON m.id=r.meter_id
       WHERE r.organization_id=$1::uuid AND m.site_id=$2::uuid AND r.reading_date<=$3::date
     ) ordered
     WHERE reading_date>=$4::date
     ORDER BY reading_date, provider`,
    [organizationId, siteId, toDate3, fromDate]
  );
  return q.rows;
}
async function dailyWashCounts(client, organizationId, siteId, startDate, endDate) {
  const q = await client.query(
    `SELECT COALESCE(completed_at, created_at)::date AS wash_date, COUNT(*)::int AS wash_count
     FROM washes
     WHERE organization_id=$1::uuid AND site_id=$2::uuid
       AND status='completed' AND operation_status='completed'
       AND COALESCE(completed_at, created_at)>=$3::date
       AND COALESCE(completed_at, created_at)<($4::date + INTERVAL '1 day')
     GROUP BY COALESCE(completed_at, created_at)::date`,
    [organizationId, siteId, startDate, endDate]
  );
  return Object.fromEntries(q.rows.map((row) => [dateOnly2(row.wash_date), Number(row.wash_count)]));
}
function earliestPeriodStart(rows, fallback) {
  return rows.reduce((earliest, row) => {
    const start = periodStart(row);
    return start < earliest ? start : earliest;
  }, fallback);
}
async function analyzeClosingUtilityReadings(client, organizationId, siteId, readingDate, inputs, options) {
  const metersQ = await client.query(
    `SELECT id, organization_id, site_id, provider, meter_number, is_active
     FROM utility_meters
     WHERE organization_id=$1::uuid AND site_id=$2::uuid AND is_active
     ORDER BY provider ${options.forUpdate ? "FOR UPDATE" : ""}`,
    [organizationId, siteId]
  );
  const meters = metersQ.rows;
  const meterById = new Map(meters.map((meter) => [String(meter.id), meter]));
  const inputByMeter = /* @__PURE__ */ new Map();
  for (const input of inputs) {
    if (inputByMeter.has(input.meter_id)) {
      throw new HttpError(400, "duplicate_utility_meter", "Un compteur ne peut \xEAtre relev\xE9 qu'une fois \xE0 la cl\xF4ture.");
    }
    if (!meterById.has(input.meter_id)) {
      throw new HttpError(400, "invalid_utility_meter", "Un compteur transmis n'appartient pas \xE0 la station de cette caisse.");
    }
    inputByMeter.set(input.meter_id, input);
  }
  if (!meters.length) return [];
  const currentRows = [];
  const missing = [];
  for (const meter of meters) {
    const meterId = String(meter.id);
    const input = inputByMeter.get(meterId);
    const existing = await client.query(
      `SELECT id, index_milli::text, anomaly_comment,
              EXISTS(SELECT 1 FROM utility_reading_photos p WHERE p.reading_id=utility_readings.id) AS has_photo
       FROM utility_readings WHERE meter_id=$1::uuid AND reading_date=$2::date`,
      [meterId, readingDate]
    );
    if (existing.rowCount) {
      const indexMilli = Number(existing.rows[0].index_milli);
      if (input && indexToMilli(input.index_value) !== indexMilli) {
        throw new HttpError(409, "daily_reading_exists", `Le relev\xE9 ${PROVIDER_LABEL2[meter.provider]} du jour existe d\xE9j\xE0 avec un autre index.`);
      }
      const previous2 = await client.query(
        `SELECT index_milli::text, reading_date FROM utility_readings
         WHERE meter_id=$1::uuid AND reading_date<$2::date ORDER BY reading_date DESC LIMIT 1`,
        [meterId, readingDate]
      );
      currentRows.push({
        reading_id: String(existing.rows[0].id),
        meter_id: meterId,
        meter_number: meter.meter_number,
        provider: meter.provider,
        reading_date: readingDate,
        index_milli: indexMilli,
        previous_index_milli: previous2.rowCount ? String(previous2.rows[0].index_milli) : null,
        previous_reading_date: previous2.rowCount ? previous2.rows[0].reading_date : null,
        anomaly_comment: input?.anomaly_comment?.trim() || existing.rows[0].anomaly_comment,
        has_photo: Boolean(existing.rows[0].has_photo || input?.photo)
      });
      continue;
    }
    if (!input) {
      missing.push(PROVIDER_LABEL2[meter.provider]);
      continue;
    }
    const previous = await client.query(
      `SELECT index_milli::text, reading_date FROM utility_readings
       WHERE meter_id=$1::uuid AND reading_date<$2::date ORDER BY reading_date DESC LIMIT 1`,
      [meterId, readingDate]
    );
    currentRows.push({
      reading_id: null,
      meter_id: meterId,
      meter_number: meter.meter_number,
      provider: meter.provider,
      reading_date: readingDate,
      index_milli: indexToMilli(input.index_value),
      previous_index_milli: previous.rowCount ? String(previous.rows[0].index_milli) : null,
      previous_reading_date: previous.rowCount ? previous.rows[0].reading_date : null,
      anomaly_comment: input.anomaly_comment?.trim() || null,
      has_photo: Boolean(input.photo)
    });
  }
  if (missing.length) {
    throw new HttpError(400, "utility_readings_required", `Relevez les index du jour avant de cl\xF4turer la caisse : ${missing.join(", ")}.`);
  }
  for (const row of currentRows) {
    if (!row.reading_id) {
      await assertChronology(client, String(row.meter_id), readingDate, Number(row.index_milli));
    }
  }
  const historyRows = await periodRows(client, organizationId, siteId, addUtilityDays(readingDate, -21), readingDate);
  const allRows = [...historyRows, ...currentRows.filter((row) => !row.reading_id)];
  const washStart = earliestPeriodStart(allRows, addUtilityDays(readingDate, -21));
  const washes = await dailyWashCounts(client, organizationId, siteId, washStart, readingDate);
  const history = historyRows.map((row) => makePeriod(row, washes));
  const analyses = currentRows.map((row) => enrichPeriod(makePeriod(row, washes), history));
  if (options.requireComments) {
    const uncommented = analyses.filter((analysis) => analysis.alerts.length > 0 && !analysis.anomaly_comment);
    if (uncommented.length) {
      throw new HttpError(
        400,
        "utility_anomaly_comment_required",
        `Une anomalie doit \xEAtre v\xE9rifi\xE9e et comment\xE9e avant la cl\xF4ture : ${uncommented.map((analysis) => PROVIDER_LABEL2[analysis.provider]).join(", ")}.`
      );
    }
  }
  return analyses;
}
function decodeUtilityPhoto(photo) {
  if (photo.data_base64.length > UTILITY_PHOTO_MAX_BYTES * 4 / 3 + 4) {
    throw new HttpError(400, "utility_photo_too_large", "La photo compress\xE9e ne doit pas d\xE9passer 300 Ko.");
  }
  if (photo.data_base64.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(photo.data_base64)) {
    throw new HttpError(400, "invalid_utility_photo", "Le justificatif photo est invalide.");
  }
  const data = Buffer.from(photo.data_base64, "base64");
  if (data.length > UTILITY_PHOTO_MAX_BYTES) {
    throw new HttpError(400, "utility_photo_too_large", "La photo compress\xE9e ne doit pas d\xE9passer 300 Ko.");
  }
  if (!data.length || data.toString("base64") !== photo.data_base64) {
    throw new HttpError(400, "invalid_utility_photo", "Le justificatif photo est invalide.");
  }
  const jpeg = data.length >= 4 && data[0] === 255 && data[1] === 216 && data[2] === 255;
  const webp = data.length >= 12 && data.subarray(0, 4).toString("ascii") === "RIFF" && data.subarray(8, 12).toString("ascii") === "WEBP";
  if (photo.mime_type === "image/jpeg" && !jpeg || photo.mime_type === "image/webp" && !webp) {
    throw new HttpError(400, "invalid_utility_photo", "Le contenu de la photo ne correspond pas \xE0 son format.");
  }
  return data;
}
async function saveUtilityPhoto(client, organizationId, userId, readingId, photo) {
  const data = decodeUtilityPhoto(photo);
  await client.query(
    `INSERT INTO utility_reading_photos(organization_id, reading_id, mime_type, byte_size, photo_data, created_by)
     VALUES($1,$2,$3,$4,$5,$6)
     ON CONFLICT (reading_id) DO UPDATE SET
       mime_type=EXCLUDED.mime_type, byte_size=EXCLUDED.byte_size,
       photo_data=EXCLUDED.photo_data, created_by=EXCLUDED.created_by, created_at=now()`,
    [organizationId, readingId, photo.mime_type, data.length, data, userId]
  );
}
async function recordClosingUtilityReadings(client, organizationId, userId, siteId, cashSessionId, readingDate, inputs) {
  const analyses = await analyzeClosingUtilityReadings(
    client,
    organizationId,
    siteId,
    readingDate,
    inputs,
    { forUpdate: true, requireComments: true }
  );
  const inputByMeter = new Map(inputs.map((input) => [input.meter_id, input]));
  const results = [];
  for (const analysis of analyses) {
    const input = inputByMeter.get(analysis.meter_id);
    let readingId = analysis.reading_id;
    if (readingId) {
      if (input?.anomaly_comment?.trim()) {
        await client.query(
          "UPDATE utility_readings SET anomaly_comment=$2 WHERE id=$1::uuid AND organization_id=$3::uuid",
          [readingId, input.anomaly_comment.trim(), organizationId]
        );
      }
      if (input?.photo) await saveUtilityPhoto(client, organizationId, userId, readingId, input.photo);
      if (input?.anomaly_comment?.trim() || input?.photo) {
        await client.query(
          `INSERT INTO audit_logs(organization_id,actor_user_id,action,entity_type,entity_id,metadata)
           VALUES($1,$2,'utility_reading.reviewed','utility_reading',$3,$4::jsonb)`,
          [organizationId, userId, readingId, JSON.stringify({ cash_session_id: cashSessionId, alerts: analysis.alerts.map((alert) => alert.code), has_photo: analysis.has_photo })]
        );
      }
      results.push({ id: readingId, meter_id: analysis.meter_id, index_milli: analysis.index_milli, created: false });
      continue;
    }
    const inserted = await client.query(
      `INSERT INTO utility_readings(organization_id, meter_id, cash_session_id, reading_date, index_milli, notes, anomaly_comment, created_by)
       VALUES($1,$2,$3,$4::date,$5,'Relev\xE9 quotidien \xE0 la cl\xF4ture de caisse',$6,$7) RETURNING id`,
      [organizationId, analysis.meter_id, cashSessionId, readingDate, analysis.index_milli, analysis.anomaly_comment, userId]
    );
    readingId = String(inserted.rows[0].id);
    if (input?.photo) await saveUtilityPhoto(client, organizationId, userId, readingId, input.photo);
    await client.query(
      `INSERT INTO audit_logs(organization_id,actor_user_id,action,entity_type,entity_id,metadata)
       VALUES($1,$2,'utility_reading.created','utility_reading',$3,$4::jsonb)`,
      [organizationId, userId, readingId, JSON.stringify({
        meter_id: analysis.meter_id,
        cash_session_id: cashSessionId,
        reading_date: readingDate,
        index_milli: analysis.index_milli,
        consumption_milli: analysis.consumption_milli,
        ratio_per_wash: analysis.ratio_per_wash,
        alerts: analysis.alerts.map((alert) => alert.code),
        has_photo: Boolean(input?.photo),
        source: "cash_close"
      })]
    );
    results.push({ id: readingId, meter_id: analysis.meter_id, index_milli: analysis.index_milli, created: true });
  }
  return results;
}
function aggregatePeriods(provider, periods) {
  const measured = periods.filter((period) => period.consumption_milli != null);
  if (!measured.length) return { consumption_milli: null, wash_count: 0, ratio_per_wash: null };
  const consumption = measured.reduce((sum, period) => sum + Number(period.consumption_milli), 0);
  const washCount = measured.reduce((sum, period) => sum + period.wash_count, 0);
  return {
    consumption_milli: consumption,
    wash_count: washCount,
    ratio_per_wash: ratioPerWash(provider, consumption, washCount)
  };
}
function trendPercent(current, previous) {
  if (current == null || previous == null || previous <= 0) return null;
  return Math.round((current / previous - 1) * 1e3) / 10;
}
async function getUtilityInsights(client, organizationId, siteId, endDate) {
  const startDate = addUtilityDays(endDate, -6);
  const previousStartDate = addUtilityDays(startDate, -7);
  const historyFromDate = addUtilityDays(previousStartDate, -14);
  const metersQ = await client.query(
    `SELECT id, provider, meter_number FROM utility_meters
     WHERE organization_id=$1::uuid AND site_id=$2::uuid AND is_active ORDER BY provider`,
    [organizationId, siteId]
  );
  const rows = await periodRows(client, organizationId, siteId, historyFromDate, endDate);
  const washStart = earliestPeriodStart(rows, startDate);
  const washes = await dailyWashCounts(client, organizationId, siteId, washStart < startDate ? washStart : startDate, endDate);
  const periods = rows.map((row) => makePeriod(row, washes));
  const annotated = periods.map(
    (period) => period.reading_date >= startDate ? enrichPeriod(period, periods) : period
  );
  const current = annotated.filter((period) => period.reading_date >= startDate);
  const previous = annotated.filter((period) => period.reading_date >= previousStartDate && period.reading_date < startDate);
  const providers = metersQ.rows.map((meter) => {
    const currentProvider = current.filter((period) => period.meter_id === String(meter.id));
    const previousProvider = previous.filter((period) => period.meter_id === String(meter.id));
    const currentTotal = aggregatePeriods(meter.provider, currentProvider);
    const previousTotal = aggregatePeriods(meter.provider, previousProvider);
    const coveredDates = new Set(currentProvider.map((period) => period.reading_date));
    return {
      meter_id: String(meter.id),
      provider: meter.provider,
      meter_number: meter.meter_number,
      consumption_milli: currentTotal.consumption_milli,
      daily_average_milli: currentTotal.consumption_milli == null ? null : currentTotal.consumption_milli / 7,
      wash_count: currentTotal.wash_count,
      ratio_per_wash: currentTotal.ratio_per_wash,
      previous_consumption_milli: previousTotal.consumption_milli,
      previous_ratio_per_wash: previousTotal.ratio_per_wash,
      consumption_trend_percent: trendPercent(currentTotal.consumption_milli, previousTotal.consumption_milli),
      ratio_trend_percent: trendPercent(currentTotal.ratio_per_wash, previousTotal.ratio_per_wash),
      alert_count: currentProvider.filter((period) => period.alerts.length > 0).length,
      reading_count: currentProvider.length,
      missing_days: Math.max(0, 7 - coveredDates.size),
      multi_day_periods: currentProvider.filter((period) => period.period_days > 1).length
    };
  });
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = addUtilityDays(startDate, index);
    return {
      date,
      wash_count: washes[date] ?? 0,
      readings: UTILITY_PROVIDERS.map((provider) => current.find((period) => period.reading_date === date && period.provider === provider) ?? null)
    };
  });
  return { start_date: startDate, end_date: endDate, providers, days };
}

// server/operations.ts
var closingUtilityReadingSchema = z13.object({
  meter_id: z13.string().uuid(),
  index_value: utilityIndexValueSchema,
  anomaly_comment: z13.string().trim().max(500).optional(),
  photo: z13.object({
    mime_type: z13.enum(["image/jpeg", "image/webp"]),
    data_base64: z13.string().min(4).max(400004)
  }).strip().optional()
}).strip();
var operationValidators = {
  openSession: z13.object({
    site_id: z13.string().uuid(),
    opening_amount_cents: z13.number().int().min(0).max(1e8)
  }).strip(),
  movement: z13.object({
    type: z13.enum(["entry", "exit"]),
    amount_cents: z13.number().int().positive().max(1e8),
    description: z13.string().trim().max(500).nullable().optional()
  }).strip(),
  closeSession: z13.object({
    counted_amount_cents: z13.number().int().min(0).max(1e8),
    discrepancy_reason: z13.string().trim().max(500).nullable().optional(),
    utility_readings: z13.array(closingUtilityReadingSchema).max(2).optional()
  }).strip(),
  utilityPreview: z13.object({ utility_readings: z13.array(closingUtilityReadingSchema).max(2).optional() }).strip(),
  expense: z13.object({
    category: z13.enum(["supply", "salary", "maintenance", "utilities", "rent", "tax", "marketing", "other"]),
    amount_cents: z13.number().int().positive().max(1e8),
    payment_method: z13.enum(["cash", "orange_money", "mtn_momo", "moov_money", "wave", "other"]),
    site_id: z13.string().uuid().optional(),
    beneficiary: z13.string().trim().max(200).optional(),
    description: z13.string().trim().max(1e3).optional(),
    reference: z13.string().trim().max(120).optional(),
    cash_session_id: z13.string().uuid().optional()
  }).strip(),
  expensePatch: z13.object({
    category: z13.enum(["supply", "salary", "maintenance", "utilities", "rent", "tax", "marketing", "other"]).optional(),
    amount_cents: z13.number().int().positive().max(1e8).optional(),
    payment_method: z13.enum(["cash", "orange_money", "mtn_momo", "moov_money", "wave", "other"]).optional(),
    site_id: z13.string().uuid().optional(),
    beneficiary: z13.string().trim().max(200).nullable().optional(),
    description: z13.string().trim().max(1e3).nullable().optional(),
    reference: z13.string().trim().max(120).nullable().optional(),
    cash_session_id: z13.string().uuid().optional()
  }).strip()
};
function db8() {
  const pool2 = getPool();
  if (!pool2) throw new HttpError(503, "database_not_configured", "Base de donn\xE9es indisponible.");
  return pool2;
}
var SESSION_SELECT = `
  SELECT cs.id, cs.organization_id, cs.site_id, cs.opened_by, cs.closed_by,
    cs.opening_amount_cents, cs.status, cs.opened_at, cs.closed_at, cs.discrepancy_reason,
    cs.closing_amount_cents AS counted_amount_cents,
    (cs.opening_amount_cents + COALESCE(m.entries,0) - COALESCE(m.exits,0))::int AS theoretical_balance_cents,
    CASE WHEN cs.closing_amount_cents IS NULL THEN NULL
         ELSE (cs.closing_amount_cents - (cs.opening_amount_cents + COALESCE(m.entries,0) - COALESCE(m.exits,0)))::int
    END AS discrepancy_cents
  FROM cash_sessions cs
  LEFT JOIN LATERAL (
    SELECT COALESCE(SUM(amount_cents) FILTER (WHERE type='entry'),0)::int AS entries,
           COALESCE(SUM(amount_cents) FILTER (WHERE type='exit'),0)::int AS exits
    FROM cash_movements WHERE cash_session_id = cs.id
  ) m ON true`;
var EXPENSE_FIELDS = "id, site_id, category, amount_cents, payment_method, cash_session_id, description, beneficiary, reference, status, expense_date, purchase_id, utility_reading_id, created_at";
function createOperationsRouter() {
  const r = Router10();
  r.get(
    "/cash-sessions",
    requirePermission("cash_session:read"),
    asyncRoute(async (req, res) => {
      const t = tenant(req);
      const status = typeof req.query.status === "string" && ["open", "closed"].includes(req.query.status) ? req.query.status : null;
      const q = await db8().query(
        `${SESSION_SELECT} WHERE cs.organization_id=$1::uuid AND ($2::text IS NULL OR cs.status=$2) ORDER BY cs.opened_at DESC LIMIT 100`,
        [t.organizationId, status]
      );
      res.json(q.rows);
    })
  );
  r.get(
    "/cash-sessions/current",
    requirePermission("cash_session:read"),
    asyncRoute(async (req, res) => {
      const t = tenant(req);
      const siteId = typeof req.query.site_id === "string" && req.query.site_id ? parseId(req.query.site_id) : null;
      const q = await db8().query(
        `${SESSION_SELECT} WHERE cs.organization_id=$1::uuid AND cs.status='open' AND ($2::uuid IS NULL OR cs.site_id=$2::uuid)
         ORDER BY cs.opened_at DESC LIMIT 1`,
        [t.organizationId, siteId]
      );
      res.json(q.rows[0] ?? null);
    })
  );
  r.post(
    "/cash-sessions/open",
    requirePermission("cash_session:manage"),
    asyncRoute(async (req, res) => {
      const t = tenant(req);
      const input = body(operationValidators.openSession, req.body);
      const pool2 = db8();
      await withIdempotency(pool2, req, res, t.organizationId, fingerprint({ op: "cash-session-open", ...input }), async () => {
        const client = await pool2.connect();
        try {
          await client.query("BEGIN");
          await client.query("SELECT pg_advisory_xact_lock(hashtext($1 || $2))", [t.organizationId, input.site_id]);
          const siteQ = await client.query("SELECT id FROM sites WHERE id=$1::uuid AND organization_id=$2::uuid AND is_active", [input.site_id, t.organizationId]);
          if (!siteQ.rowCount) throw new HttpError(400, "invalid_site", "Station invalide.");
          const openQ = await client.query(
            "SELECT 1 FROM cash_sessions WHERE organization_id=$1::uuid AND site_id=$2::uuid AND status='open' LIMIT 1",
            [t.organizationId, input.site_id]
          );
          if (openQ.rowCount) {
            throw new HttpError(409, "cash_session_already_open", "Une session de caisse est d\xE9j\xE0 ouverte pour cette station.");
          }
          await assertSiteWritable(client, t.organizationId, input.site_id);
          const insertQ = await client.query(
            "INSERT INTO cash_sessions(organization_id, site_id, opened_by, opening_amount_cents) VALUES($1,$2,$3,$4) RETURNING id",
            [t.organizationId, input.site_id, t.userId, input.opening_amount_cents]
          );
          const sessionQ = await client.query(`${SESSION_SELECT} WHERE cs.id=$1::uuid`, [insertQ.rows[0].id]);
          await client.query("COMMIT");
          return { status: 201, body: sessionQ.rows[0] };
        } catch (error) {
          await client.query("ROLLBACK");
          throw error;
        } finally {
          client.release();
        }
      });
    })
  );
  r.get(
    "/cash-sessions/:id",
    requirePermission("cash_session:read"),
    asyncRoute(async (req, res) => {
      const t = tenant(req);
      const id = parseId(req.params.id);
      const q = await db8().query(`${SESSION_SELECT} WHERE cs.id=$1::uuid AND cs.organization_id=$2::uuid`, [id, t.organizationId]);
      if (!q.rowCount) throw new HttpError(404, "cash_session_not_found", "Session introuvable.");
      res.json(q.rows[0]);
    })
  );
  r.get(
    "/cash-sessions/:id/movements",
    requirePermission("cash_session:read"),
    asyncRoute(async (req, res) => {
      const t = tenant(req);
      const id = parseId(req.params.id);
      const sessionQ = await db8().query("SELECT 1 FROM cash_sessions WHERE id=$1::uuid AND organization_id=$2::uuid", [id, t.organizationId]);
      if (!sessionQ.rowCount) throw new HttpError(404, "cash_session_not_found", "Session introuvable.");
      const q = await db8().query(
        "SELECT id, type, amount_cents, source, description, wash_id, created_at FROM cash_movements WHERE cash_session_id=$1::uuid ORDER BY created_at DESC",
        [id]
      );
      res.json(q.rows);
    })
  );
  r.post(
    "/cash-sessions/:id/movements",
    requirePermission("cash_session:manage"),
    asyncRoute(async (req, res) => {
      const t = tenant(req);
      const id = parseId(req.params.id);
      const input = body(operationValidators.movement, req.body);
      const pool2 = db8();
      await withIdempotency(pool2, req, res, t.organizationId, fingerprint({ op: "cash-movement", session: id, ...input }), async () => {
        const client = await pool2.connect();
        try {
          await client.query("BEGIN");
          const sessionQ = await client.query(
            "SELECT id, status FROM cash_sessions WHERE id=$1::uuid AND organization_id=$2::uuid FOR UPDATE",
            [id, t.organizationId]
          );
          if (!sessionQ.rowCount) throw new HttpError(404, "cash_session_not_found", "Session introuvable.");
          if (sessionQ.rows[0].status !== "open") {
            throw new HttpError(409, "cash_session_closed", "Cette session de caisse est cl\xF4tur\xE9e.");
          }
          const q = await client.query(
            `INSERT INTO cash_movements(organization_id, cash_session_id, type, amount_cents, source, description, created_by)
             VALUES($1,$2,$3,$4,'manual',$5,$6)
             RETURNING id, type, amount_cents, source, description, wash_id, created_at`,
            [t.organizationId, id, input.type, input.amount_cents, input.description || null, t.userId]
          );
          await client.query("COMMIT");
          return { status: 201, body: q.rows[0] };
        } catch (error) {
          await client.query("ROLLBACK");
          throw error;
        } finally {
          client.release();
        }
      });
    })
  );
  r.post(
    "/cash-sessions/:id/utility-preview",
    requirePermission("cash_session:manage"),
    asyncRoute(async (req, res) => {
      const t = tenant(req);
      const id = parseId(req.params.id);
      const input = body(operationValidators.utilityPreview, req.body);
      const pool2 = db8();
      const client = await pool2.connect();
      try {
        const sessionQ = await client.query(
          "SELECT id, site_id, status FROM cash_sessions WHERE id=$1::uuid AND organization_id=$2::uuid",
          [id, t.organizationId]
        );
        if (!sessionQ.rowCount) throw new HttpError(404, "cash_session_not_found", "Session introuvable.");
        if (sessionQ.rows[0].status !== "open") {
          throw new HttpError(409, "cash_session_closed", "Cette session de caisse est d\xE9j\xE0 cl\xF4tur\xE9e.");
        }
        const dateQ = await client.query("SELECT CURRENT_DATE::text AS reading_date");
        const readingDate = String(dateQ.rows[0].reading_date).slice(0, 10);
        const readings = await analyzeClosingUtilityReadings(
          client,
          t.organizationId,
          String(sessionQ.rows[0].site_id),
          readingDate,
          input.utility_readings ?? [],
          { forUpdate: false, requireComments: false }
        );
        res.json({ reading_date: readingDate, readings });
      } finally {
        client.release();
      }
    })
  );
  r.post(
    "/cash-sessions/:id/close",
    requirePermission("cash_session:manage"),
    asyncRoute(async (req, res) => {
      const t = tenant(req);
      const id = parseId(req.params.id);
      const input = body(operationValidators.closeSession, req.body);
      const pool2 = db8();
      const client = await pool2.connect();
      try {
        await client.query("BEGIN");
        const lockQ = await client.query(
          "SELECT id FROM cash_sessions WHERE id=$1::uuid AND organization_id=$2::uuid FOR UPDATE",
          [id, t.organizationId]
        );
        if (!lockQ.rowCount) throw new HttpError(404, "cash_session_not_found", "Session introuvable.");
        const sessionQ = await client.query(`${SESSION_SELECT} WHERE cs.id=$1::uuid`, [id]);
        const session = sessionQ.rows[0];
        if (session.status !== "open") {
          throw new HttpError(409, "cash_session_closed", "Cette session de caisse est d\xE9j\xE0 cl\xF4tur\xE9e.");
        }
        const theoretical = Number(session.theoretical_balance_cents);
        const discrepancy = input.counted_amount_cents - theoretical;
        if (discrepancy !== 0 && !input.discrepancy_reason?.trim()) {
          throw new HttpError(400, "discrepancy_reason_required", "Justifiez l\u2019\xE9cart avant de cl\xF4turer la session.");
        }
        const dateQ = await client.query("SELECT CURRENT_DATE::text AS reading_date");
        const closingReadings = await recordClosingUtilityReadings(
          client,
          t.organizationId,
          t.userId,
          String(session.site_id),
          id,
          String(dateQ.rows[0].reading_date).slice(0, 10),
          input.utility_readings ?? []
        );
        await client.query(
          `UPDATE cash_sessions SET status='closed', closed_by=$3, closed_at=now(),
             closing_amount_cents=$4, expected_amount_cents=$5, discrepancy_reason=$6
           WHERE id=$1::uuid AND organization_id=$2::uuid`,
          [id, t.organizationId, t.userId, input.counted_amount_cents, theoretical, discrepancy !== 0 ? input.discrepancy_reason?.trim() || null : null]
        );
        await client.query(
          "INSERT INTO audit_logs(organization_id, actor_user_id, action, entity_type, entity_id, metadata) VALUES($1,$2,'cash_session.closed','cash_session',$3,$4)",
          [t.organizationId, t.userId, id, JSON.stringify({
            counted_amount_cents: input.counted_amount_cents,
            discrepancy_cents: discrepancy,
            utility_reading_ids: closingReadings.map((reading) => reading.id),
            utility_readings_created: closingReadings.filter((reading) => reading.created).length
          })]
        );
        const closedQ = await client.query(`${SESSION_SELECT} WHERE cs.id=$1::uuid`, [id]);
        await client.query("COMMIT");
        res.json(closedQ.rows[0]);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    })
  );
  r.get(
    "/expenses",
    requirePermission("expense:read"),
    asyncRoute(async (req, res) => {
      const t = tenant(req);
      const q = await db8().query(
        `SELECT ${EXPENSE_FIELDS} FROM expenses WHERE organization_id=$1::uuid ORDER BY created_at DESC LIMIT 200`,
        [t.organizationId]
      );
      res.json(q.rows);
    })
  );
  r.post(
    "/expenses",
    requirePermission("expense:create"),
    asyncRoute(async (req, res) => {
      const t = tenant(req);
      const input = body(operationValidators.expense, req.body);
      const pool2 = db8();
      await withIdempotency(pool2, req, res, t.organizationId, fingerprint({ op: "expense", ...input }), async () => {
        const client = await pool2.connect();
        try {
          await client.query("BEGIN");
          let siteId = input.site_id ?? null;
          if (siteId) {
            const siteQ = await client.query("SELECT 1 FROM sites WHERE id=$1::uuid AND organization_id=$2::uuid", [siteId, t.organizationId]);
            if (!siteQ.rowCount) throw new HttpError(400, "invalid_site", "Station invalide.");
          }
          let cashSessionId = null;
          if (input.payment_method === "cash") {
            if (!input.cash_session_id) {
              throw new HttpError(400, "cash_session_required", "Une session de caisse ouverte est requise pour une d\xE9pense en esp\xE8ces.");
            }
            const sessionQ = await client.query(
              "SELECT id, site_id, status FROM cash_sessions WHERE id=$1::uuid AND organization_id=$2::uuid FOR UPDATE",
              [input.cash_session_id, t.organizationId]
            );
            if (!sessionQ.rowCount || sessionQ.rows[0].status !== "open") {
              throw new HttpError(400, "cash_session_invalid", "Session de caisse introuvable ou cl\xF4tur\xE9e.");
            }
            cashSessionId = sessionQ.rows[0].id;
            if (!siteId) siteId = sessionQ.rows[0].site_id;
          }
          await assertSiteWritable(client, t.organizationId, siteId);
          const q = await client.query(
            `INSERT INTO expenses(organization_id, site_id, category, amount_cents, payment_method, cash_session_id, description, beneficiary, reference, created_by)
             VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING ${EXPENSE_FIELDS}`,
            [
              t.organizationId,
              siteId,
              input.category,
              input.amount_cents,
              input.payment_method,
              cashSessionId,
              input.description || null,
              input.beneficiary || null,
              input.reference || null,
              t.userId
            ]
          );
          const expense = q.rows[0];
          if (cashSessionId) {
            await client.query(
              `INSERT INTO cash_movements(organization_id, cash_session_id, type, amount_cents, source, description, expense_id, created_by)
               VALUES($1,$2,'exit',$3,'expense',$4,$5,$6)`,
              [t.organizationId, cashSessionId, input.amount_cents, input.description || `D\xE9pense ${input.category}`, expense.id, t.userId]
            );
          }
          await client.query(
            "INSERT INTO audit_logs(organization_id, actor_user_id, action, entity_type, entity_id) VALUES($1,$2,'expense.created','expense',$3)",
            [t.organizationId, t.userId, expense.id]
          );
          await client.query("COMMIT");
          return { status: 201, body: expense };
        } catch (error) {
          await client.query("ROLLBACK");
          throw error;
        } finally {
          client.release();
        }
      });
    })
  );
  r.patch(
    "/expenses/:id",
    requirePermission("expense:manage"),
    asyncRoute(async (req, res) => {
      const t = tenant(req);
      const id = parseId(req.params.id);
      const input = body(operationValidators.expensePatch, req.body);
      const client = await db8().connect();
      try {
        await client.query("BEGIN");
        const oldQ = await client.query(
          "SELECT * FROM expenses WHERE id=$1::uuid AND organization_id=$2::uuid FOR UPDATE",
          [id, t.organizationId]
        );
        if (!oldQ.rowCount) throw new HttpError(404, "expense_not_found", "D\xE9pense introuvable.");
        const old = oldQ.rows[0];
        if (old.purchase_id) {
          throw new HttpError(
            409,
            "expense_from_purchase",
            "Cette d\xE9pense provient d'un achat. Pour la corriger, annulez l'achat correspondant : la marchandise sera reprise en m\xEAme temps."
          );
        }
        if (old.utility_reading_id && (input.category !== void 0 && input.category !== "utilities" || input.site_id !== void 0 && input.site_id !== old.site_id)) {
          throw new HttpError(409, "expense_from_utility", "Cette d\xE9pense reste rattach\xE9e \xE0 son relev\xE9 CIE/SODECI : sa cat\xE9gorie et sa station ne peuvent pas \xEAtre chang\xE9es ici.");
        }
        if (old.cash_session_id) {
          const sessionQ = await client.query(
            "SELECT status FROM cash_sessions WHERE id=$1::uuid AND organization_id=$2::uuid FOR UPDATE",
            [old.cash_session_id, t.organizationId]
          );
          if (!sessionQ.rowCount || sessionQ.rows[0].status !== "open") {
            throw new HttpError(409, "expense_locked", "La session de caisse de cette d\xE9pense est cl\xF4tur\xE9e. Elle n'est plus modifiable.");
          }
        }
        if (input.site_id) {
          const siteQ = await client.query("SELECT 1 FROM sites WHERE id=$1::uuid AND organization_id=$2::uuid", [input.site_id, t.organizationId]);
          if (!siteQ.rowCount) throw new HttpError(400, "invalid_site", "Station invalide.");
        }
        let cashSessionId = old.cash_session_id ?? null;
        const wantsCash = input.payment_method === "cash" || input.payment_method === void 0 && old.payment_method === "cash";
        if (wantsCash) {
          const sessionId = input.cash_session_id ?? old.cash_session_id ?? null;
          if (!sessionId) {
            throw new HttpError(400, "cash_session_required", "Une session de caisse ouverte est requise pour une d\xE9pense en esp\xE8ces.");
          }
          const sessionQ = await client.query(
            "SELECT status FROM cash_sessions WHERE id=$1::uuid AND organization_id=$2::uuid FOR UPDATE",
            [sessionId, t.organizationId]
          );
          if (!sessionQ.rowCount || sessionQ.rows[0].status !== "open") {
            throw new HttpError(400, "cash_session_invalid", "Session de caisse introuvable ou cl\xF4tur\xE9e.");
          }
          cashSessionId = sessionId;
        } else {
          cashSessionId = null;
        }
        const merged = { ...old, ...input, cash_session_id: cashSessionId };
        const q = await client.query(
          `UPDATE expenses SET site_id=$3, category=$4, amount_cents=$5, payment_method=$6, cash_session_id=$7,
             description=$8, beneficiary=$9, reference=$10
           WHERE id=$1::uuid AND organization_id=$2::uuid RETURNING ${EXPENSE_FIELDS}`,
          [
            id,
            t.organizationId,
            merged.site_id ?? null,
            merged.category,
            merged.amount_cents,
            merged.payment_method,
            merged.cash_session_id,
            merged.description || null,
            merged.beneficiary || null,
            merged.reference || null
          ]
        );
        const expense = q.rows[0];
        const movementQ = await client.query(
          `SELECT id FROM cash_movements
           WHERE expense_id=$1::uuid OR (expense_id IS NULL AND cash_session_id=$2::uuid AND source='expense' AND amount_cents=$3::int AND description=$4)
           FOR UPDATE`,
          [id, old.cash_session_id, old.amount_cents, old.description || `D\xE9pense ${old.category}`]
        );
        const movement = movementQ.rows[0] ?? null;
        if (cashSessionId) {
          if (movement) {
            await client.query(
              "UPDATE cash_movements SET cash_session_id=$2, amount_cents=$3, expense_id=$4 WHERE id=$1::uuid",
              [movement.id, cashSessionId, merged.amount_cents, id]
            );
          } else {
            await client.query(
              `INSERT INTO cash_movements(organization_id, cash_session_id, type, amount_cents, source, description, expense_id, created_by)
               VALUES($1,$2,'exit',$3,'expense',$4,$5,$6)`,
              [t.organizationId, cashSessionId, merged.amount_cents, merged.description || `D\xE9pense ${merged.category}`, id, t.userId]
            );
          }
        } else if (movement) {
          await client.query("DELETE FROM cash_movements WHERE id=$1::uuid", [movement.id]);
        }
        await client.query(
          "INSERT INTO audit_logs(organization_id, actor_user_id, action, entity_type, entity_id, metadata) VALUES($1,$2,'expense.updated','expense',$3,$4)",
          [t.organizationId, t.userId, id, JSON.stringify({ amount_cents: { from: old.amount_cents, to: merged.amount_cents } })]
        );
        await client.query("COMMIT");
        res.json(expense);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    })
  );
  r.delete(
    "/expenses/:id",
    requirePermission("expense:manage"),
    asyncRoute(async (req, res) => {
      const t = tenant(req);
      const id = parseId(req.params.id);
      const client = await db8().connect();
      try {
        await client.query("BEGIN");
        const oldQ = await client.query(
          "SELECT * FROM expenses WHERE id=$1::uuid AND organization_id=$2::uuid FOR UPDATE",
          [id, t.organizationId]
        );
        if (!oldQ.rowCount) throw new HttpError(404, "expense_not_found", "D\xE9pense introuvable.");
        const old = oldQ.rows[0];
        if (old.purchase_id) {
          throw new HttpError(
            409,
            "expense_from_purchase",
            "Cette d\xE9pense provient d'un achat. Pour la corriger, annulez l'achat correspondant : la marchandise sera reprise en m\xEAme temps."
          );
        }
        if (old.cash_session_id) {
          const sessionQ = await client.query(
            "SELECT status FROM cash_sessions WHERE id=$1::uuid AND organization_id=$2::uuid FOR UPDATE",
            [old.cash_session_id, t.organizationId]
          );
          if (!sessionQ.rowCount || sessionQ.rows[0].status !== "open") {
            throw new HttpError(409, "expense_locked", "La session de caisse de cette d\xE9pense est cl\xF4tur\xE9e. Elle n'est plus supprimable.");
          }
          await client.query(
            `DELETE FROM cash_movements
             WHERE id IN (
               SELECT id FROM cash_movements
               WHERE expense_id=$1::uuid OR (expense_id IS NULL AND cash_session_id=$2::uuid AND source='expense' AND amount_cents=$3::int AND description=$4)
             )`,
            [id, old.cash_session_id, old.amount_cents, old.description || `D\xE9pense ${old.category}`]
          );
        }
        await client.query("DELETE FROM expenses WHERE id=$1::uuid AND organization_id=$2::uuid", [id, t.organizationId]);
        await client.query(
          "INSERT INTO audit_logs(organization_id, actor_user_id, action, entity_type, entity_id) VALUES($1,$2,'expense.deleted','expense',$3)",
          [t.organizationId, t.userId, id]
        );
        await client.query("COMMIT");
        res.status(204).send();
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    })
  );
  return r;
}

// server/utility-insights.ts
init_db();
init_auth();
init_http();
import { Router as Router11 } from "express";
function createUtilityInsightsRouter() {
  const r = Router11();
  r.get(
    "/utility-insights",
    requirePermission("expense:read"),
    asyncRoute(async (req, res) => {
      const t = tenant(req);
      const siteId = parseId(req.query.site_id);
      const pool2 = getPool();
      if (!pool2) throw new HttpError(503, "database_not_configured", "Base de donn\xE9es indisponible.");
      const client = await pool2.connect();
      try {
        const site = await client.query(
          "SELECT 1 FROM sites WHERE id=$1::uuid AND organization_id=$2::uuid",
          [siteId, t.organizationId]
        );
        if (!site.rowCount) throw new HttpError(404, "site_not_found", "Station introuvable.");
        const dateQ = await client.query("SELECT CURRENT_DATE::text AS end_date");
        const insights = await getUtilityInsights(
          client,
          t.organizationId,
          siteId,
          String(dateQ.rows[0].end_date).slice(0, 10)
        );
        res.json(insights);
      } finally {
        client.release();
      }
    })
  );
  return r;
}

// server/team.ts
init_db();
init_http();
init_auth();
import { Router as Router12 } from "express";
import { z as z14 } from "zod";
var workerRoleSchema2 = z14.enum(["car_washer", "moto_washer", "versatile_washer", "team_lead", "custom"]);
var dateSchema = z14.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide (AAAA-MM-JJ).");
var workerValidators = {
  create: z14.object({
    first_name: z14.string().trim().min(1, "Le pr\xE9nom est obligatoire.").max(100),
    last_name: z14.string().trim().min(1, "Le nom est obligatoire.").max(100),
    phone: z14.string().trim().max(30).nullable().optional(),
    district: z14.string().trim().max(120).nullable().optional(),
    role: workerRoleSchema2,
    custom_role: z14.string().trim().min(2).max(100).nullable().optional(),
    joined_at: dateSchema.nullable().optional()
  }).strip().refine((w) => w.role !== "custom" || Boolean(w.custom_role), {
    message: "Pr\xE9cisez la fonction personnalis\xE9e."
  }),
  patch: z14.object({
    first_name: z14.string().trim().min(1).max(100).optional(),
    last_name: z14.string().trim().min(1).max(100).optional(),
    phone: z14.string().trim().max(30).nullable().optional(),
    district: z14.string().trim().max(120).nullable().optional(),
    status: z14.enum(["active", "inactive"]).optional(),
    role: workerRoleSchema2.optional(),
    custom_role: z14.string().trim().max(100).nullable().optional(),
    joined_at: dateSchema.nullable().optional()
  }).strip()
};
async function assertWorkerCapacity(client, organizationId) {
  await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [organizationId]);
  const q = await client.query(
    `SELECT p.max_workers, COUNT(w.id)::int AS active_count
     FROM organizations o
     LEFT JOIN subscriptions s ON s.organization_id = o.id
     LEFT JOIN plans p ON p.id = s.plan_id
     LEFT JOIN workers w ON w.organization_id = o.id AND w.status = 'active'
     WHERE o.id = $1 GROUP BY p.max_workers`,
    [organizationId]
  );
  const row = q.rows[0];
  if (row?.max_workers != null && Number(row.active_count) >= Number(row.max_workers)) {
    throw new HttpError(409, "plan_worker_limit", "Le nombre maximal de travailleurs de votre forfait est atteint.");
  }
}
function db9() {
  const pool2 = getPool();
  if (!pool2) throw new HttpError(503, "database_not_configured", "Base de donn\xE9es indisponible.");
  return pool2;
}
var WORKER_FIELDS = "id, organization_id, site_id, first_name, last_name, phone, district, role, custom_role, status, joined_at, created_at, updated_at";
function createTeamRouter() {
  const r = Router12();
  r.get(
    "/workers",
    requirePermission("worker:read"),
    asyncRoute(async (req, res) => {
      const t = tenant(req);
      const q = await db9().query(
        `SELECT ${WORKER_FIELDS} FROM workers WHERE organization_id=$1::uuid ORDER BY status, first_name, last_name`,
        [t.organizationId]
      );
      res.json(q.rows);
    })
  );
  r.get(
    "/workers/:id",
    requirePermission("worker:read"),
    asyncRoute(async (req, res) => {
      const t = tenant(req);
      const id = parseId(req.params.id);
      const q = await db9().query(`SELECT ${WORKER_FIELDS} FROM workers WHERE id=$1::uuid AND organization_id=$2::uuid`, [id, t.organizationId]);
      if (!q.rowCount) throw new HttpError(404, "worker_not_found", "Travailleur introuvable.");
      res.json(q.rows[0]);
    })
  );
  r.post(
    "/workers",
    requirePermission("worker:create"),
    asyncRoute(async (req, res) => {
      const t = tenant(req);
      const input = body(workerValidators.create, req.body);
      const client = await db9().connect();
      try {
        await client.query("BEGIN");
        await assertWorkerCapacity(client, t.organizationId);
        const q = await client.query(
          `INSERT INTO workers(organization_id, first_name, last_name, phone, district, role, custom_role, joined_at)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING ${WORKER_FIELDS}`,
          [
            t.organizationId,
            input.first_name,
            input.last_name,
            input.phone || null,
            input.district || null,
            input.role,
            input.role === "custom" ? input.custom_role || null : null,
            input.joined_at || null
          ]
        );
        await client.query("COMMIT");
        res.status(201).json(q.rows[0]);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    })
  );
  r.patch(
    "/workers/:id",
    requirePermission("worker:update"),
    asyncRoute(async (req, res) => {
      const t = tenant(req);
      const id = parseId(req.params.id);
      const input = body(workerValidators.patch, req.body);
      const client = await db9().connect();
      try {
        await client.query("BEGIN");
        const oldQ = await client.query(`SELECT ${WORKER_FIELDS} FROM workers WHERE id=$1::uuid AND organization_id=$2::uuid FOR UPDATE`, [id, t.organizationId]);
        if (!oldQ.rowCount) throw new HttpError(404, "worker_not_found", "Travailleur introuvable.");
        const current = oldQ.rows[0];
        if (input.status === "active" && current.status === "inactive") {
          await assertWorkerCapacity(client, t.organizationId);
        }
        const merged = { ...current, ...input };
        if (merged.role !== "custom") merged.custom_role = null;
        if (merged.role === "custom" && !merged.custom_role) {
          throw new HttpError(400, "invalid_data", "Pr\xE9cisez la fonction personnalis\xE9e.");
        }
        const q = await client.query(
          `UPDATE workers SET first_name=$3, last_name=$4, phone=$5, district=$6, role=$7, custom_role=$8, status=$9, joined_at=$10, updated_at=now()
           WHERE id=$1::uuid AND organization_id=$2::uuid RETURNING ${WORKER_FIELDS}`,
          [
            id,
            t.organizationId,
            merged.first_name,
            merged.last_name,
            merged.phone,
            merged.district,
            merged.role,
            merged.custom_role,
            merged.status,
            merged.joined_at
          ]
        );
        await client.query("COMMIT");
        res.json(q.rows[0]);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    })
  );
  r.delete(
    "/workers/:id",
    requirePermission("worker:delete"),
    asyncRoute(async (req, res) => {
      const t = tenant(req);
      const id = parseId(req.params.id);
      const used = await db9().query("SELECT 1 FROM wash_assignments WHERE worker_id=$1::uuid LIMIT 1", [id]);
      if (used.rowCount) {
        throw new HttpError(409, "worker_in_use", "Des lavages assignent ce travailleur. D\xE9sactivez-le plut\xF4t.");
      }
      const q = await db9().query("DELETE FROM workers WHERE id=$1::uuid AND organization_id=$2::uuid", [id, t.organizationId]);
      if (!q.rowCount) throw new HttpError(404, "worker_not_found", "Travailleur introuvable.");
      res.status(204).send();
    })
  );
  r.get(
    "/users",
    requirePermission("user:manage"),
    asyncRoute(async (req, res) => {
      const t = tenant(req);
      const q = await db9().query(
        `SELECT u.id, u.first_name, u.last_name, u.email, m.role, u.status, u.created_at, u.updated_at
         FROM organization_members m JOIN users u ON u.id = m.user_id
         WHERE m.organization_id=$1::uuid ORDER BY m.created_at`,
        [t.organizationId]
      );
      res.json(q.rows);
    })
  );
  return r;
}

// server/reports.ts
init_db();
init_http();
init_auth();
init_entitlements();
import { Router as Router13 } from "express";
import { z as z15 } from "zod";
function parseReportRange(query) {
  const schema2 = z15.object({
    from: z15.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    to: z15.string().regex(/^\d{4}-\d{2}-\d{2}$/)
  }).refine(
    (v) => !Number.isNaN(Date.parse(v.from)) && !Number.isNaN(Date.parse(v.to)) && new Date(v.from).toISOString().slice(0, 10) === v.from && new Date(v.to).toISOString().slice(0, 10) === v.to && v.from <= v.to,
    { message: "invalid range" }
  ).refine((v) => (Date.parse(v.to) - Date.parse(v.from)) / 864e5 <= 366, { message: "range too long" });
  const result = schema2.safeParse(query);
  if (!result.success) throw new HttpError(400, "invalid_report_range", "P\xE9riode de rapport invalide ou trop longue.");
  return result.data;
}
var REPORT_GRANULARITIES = ["day", "week", "month"];
function parseGranularity(value) {
  if (value == null || value === "") return "day";
  const parsed2 = z15.enum(REPORT_GRANULARITIES).safeParse(value);
  if (!parsed2.success) {
    throw new HttpError(400, "invalid_granularity", "Granularit\xE9 invalide : utilisez day, week ou month.");
  }
  return parsed2.data;
}
function granularityStep(granularity) {
  return { day: "1 day", week: "1 week", month: "1 month" }[granularity];
}
function db10() {
  const pool2 = getPool();
  if (!pool2) throw new HttpError(503, "database_not_configured", "Base de donn\xE9es indisponible.");
  return pool2;
}
function createReportsRouter() {
  const r = Router13();
  r.get(
    "/dashboard/metrics",
    requirePermission("dashboard:read"),
    asyncRoute(async (req, res) => {
      const t = tenant(req);
      const [
        totalWashes,
        completedWashes,
        cancelledWashes,
        revenue,
        monthlyRevenue2,
        recentWashes
      ] = await Promise.all([
        db10().query(
          "SELECT COUNT(*)::int AS count FROM washes WHERE organization_id=$1::uuid",
          [t.organizationId]
        ),
        db10().query(
          "SELECT COUNT(*)::int AS count FROM washes WHERE organization_id=$1::uuid AND status = 'completed'",
          [t.organizationId]
        ),
        db10().query(
          "SELECT COUNT(*)::int AS count FROM washes WHERE organization_id=$1::uuid AND status = 'cancelled'",
          [t.organizationId]
        ),
        // Même règle que les rapports : tout encaissement non remboursé compte,
        // avec le détail de ce qui reste à confirmer (mobile money).
        db10().query(
          `SELECT COALESCE(SUM(amount_cents),0)::int AS total_cents,
             COALESCE(SUM(amount_cents) FILTER (WHERE status='verified'),0)::int AS verified_cents,
             COALESCE(SUM(amount_cents) FILTER (WHERE status='pending'),0)::int AS pending_cents,
             COUNT(*) FILTER (WHERE status='pending')::int AS pending_count
           FROM payments WHERE organization_id=$1::uuid AND status <> 'refunded'`,
          [t.organizationId]
        ),
        db10().query(
          `SELECT TO_CHAR(created_at, 'Mon YYYY') AS month, SUM(amount_cents)::int AS revenue
           FROM payments
           WHERE organization_id=$1::uuid AND status <> 'refunded'
           GROUP BY TO_CHAR(created_at, 'Mon YYYY')
           ORDER BY MIN(created_at)`,
          [t.organizationId]
        ),
        db10().query(
          `SELECT w.id, w.reference AS vehicle_plate,
                  COALESCE((SELECT wi.service_name FROM wash_items wi WHERE wi.wash_id = w.id LIMIT 1), 'Service') AS service,
                  w.total_cents AS amount_cents, w.status, w.created_at
           FROM washes w
           WHERE w.organization_id=$1::uuid
           ORDER BY w.created_at DESC
           LIMIT 5`,
          [t.organizationId]
        )
      ]);
      const financial = t.can("report:financial");
      res.json({
        financial_access: financial,
        total_washes: totalWashes.rows[0].count,
        completed_washes: completedWashes.rows[0].count,
        cancelled_washes: cancelledWashes.rows[0].count,
        total_revenue_cents: revenue.rows[0].total_cents,
        verified_revenue_cents: revenue.rows[0].verified_cents,
        pending_payments_cents: revenue.rows[0].pending_cents,
        pending_payments_count: revenue.rows[0].pending_count,
        monthly_revenue: monthlyRevenue2.rows,
        recent_washes: recentWashes.rows
      });
    })
  );
  r.get(
    "/reports/summary",
    requirePermission("report:operational"),
    asyncRoute(async (req, res) => {
      const t = tenant(req);
      const today2 = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
      const requested = parseReportRange({ from: req.query.from || today2, to: req.query.to || today2 });
      const granularity = parseGranularity(req.query.granularity);
      const advanced = req.subscription?.capabilities["reports.advanced"] ?? true;
      if (granularity !== "day" && !advanced) {
        throw new HttpError(
          402,
          "plan_upgrade_required",
          "Le regroupement par semaine ou par mois fait partie des rapports d\xE9taill\xE9s du forfait Pro. Votre forfait couvre le rapport quotidien."
        );
      }
      const windowDays = req.subscription?.report_window_days ?? null;
      const { clamped, ...range } = clampReportRange(requested, windowDays);
      const pool2 = db10();
      const siteId = typeof req.query.site_id === "string" ? req.query.site_id.trim() : "";
      let site = null;
      if (siteId) {
        if (!/^[0-9a-f-]{36}$/i.test(siteId)) {
          throw new HttpError(400, "invalid_site", "Identifiant de site invalide.");
        }
        const siteQ = await pool2.query(
          "SELECT id, name FROM sites WHERE id=$1::uuid AND organization_id=$2::uuid",
          [siteId, t.organizationId]
        );
        if (!siteQ.rowCount) throw new HttpError(404, "site_not_found", "Site introuvable.");
        site = siteQ.rows[0];
      }
      const args = [t.organizationId, range.from, range.to];
      if (site) args.push(site.id);
      const siteWashes = site ? " AND site_id = $4::uuid" : "";
      const siteExpenses = site ? " AND site_id = $4::uuid" : "";
      const sitePayments = site ? " AND EXISTS (SELECT 1 FROM washes sw WHERE sw.id = p.wash_id AND sw.site_id = $4::uuid)" : "";
      const sitePaymentsBare = site ? " AND EXISTS (SELECT 1 FROM washes sw WHERE sw.id = payments.wash_id AND sw.site_id = $4::uuid)" : "";
      const siteWashesJoined = site ? " AND w.site_id = $4::uuid" : "";
      const step = granularityStep(granularity);
      const [summaryQ, expensesQ, seriesQ, servicesQ, paymentsQ, expenseCategoriesQ, workersQ, bySiteQ] = await Promise.all([
        pool2.query(
          `SELECT COUNT(*)::int AS total_washes,
               COUNT(*) FILTER (WHERE status='completed')::int AS completed_washes,
               COUNT(*) FILTER (WHERE payment_status='paid')::int AS paid_washes,
               COUNT(*) FILTER (WHERE payment_status IN ('unpaid','partial') AND status <> 'cancelled')::int AS unpaid_washes,
               (SELECT COALESCE(SUM(p.amount_cents),0)::int FROM payments p
                 WHERE p.organization_id=$1::uuid AND p.status <> 'refunded'
                   AND p.created_at >= $2::date AND p.created_at < ($3::date + interval '1 day')${sitePayments}) AS revenue_cents,
               (SELECT COALESCE(SUM(p.amount_cents),0)::int FROM payments p
                 WHERE p.organization_id=$1::uuid AND p.status = 'pending'
                   AND p.created_at >= $2::date AND p.created_at < ($3::date + interval '1 day')${sitePayments}) AS pending_cents
             FROM washes
             WHERE organization_id=$1::uuid AND created_at >= $2::date AND created_at < ($3::date + interval '1 day')${siteWashes}`,
          args
        ),
        pool2.query(
          `SELECT COALESCE(SUM(amount_cents),0)::int AS expenses_cents FROM expenses
             WHERE organization_id=$1::uuid AND status='completed' AND created_at >= $2::date AND created_at < ($3::date + interval '1 day')${siteExpenses}`,
          args
        ),
        // Série temporelle : un point par jour, par semaine ou par mois.
        pool2.query(
          `SELECT d.bucket::date::text AS date,
               (d.bucket + interval '${step}' - interval '1 day')::date::text AS period_end,
               COALESCE(w.wash_count,0)::int AS wash_count,
               COALESCE(p.revenue_cents,0)::int AS revenue_cents,
               COALESCE(e.expenses_cents,0)::int AS expenses_cents
             FROM generate_series(
                    date_trunc('${granularity}', $2::timestamp),
                    $3::timestamp,
                    interval '${step}') AS d(bucket)
             LEFT JOIN (
               SELECT date_trunc('${granularity}', created_at) AS bucket, COUNT(*)::int AS wash_count FROM washes
               WHERE organization_id=$1::uuid AND status <> 'cancelled'${siteWashes} GROUP BY 1
             ) w ON w.bucket = d.bucket
             LEFT JOIN (
               SELECT date_trunc('${granularity}', created_at) AS bucket, SUM(amount_cents)::int AS revenue_cents FROM payments
               WHERE organization_id=$1::uuid AND status <> 'refunded'${sitePaymentsBare} GROUP BY 1
             ) p ON p.bucket = d.bucket
             LEFT JOIN (
               SELECT date_trunc('${granularity}', created_at) AS bucket, SUM(amount_cents)::int AS expenses_cents FROM expenses
               WHERE organization_id=$1::uuid AND status='completed'${siteExpenses} GROUP BY 1
             ) e ON e.bucket = d.bucket
             ORDER BY d.bucket`,
          args
        ),
        pool2.query(
          `SELECT i.service_name AS name,
               COUNT(DISTINCT i.wash_id)::int AS wash_count,
               SUM(i.quantity)::int AS quantity,
               SUM(i.line_total_cents)::int AS amount_cents
             FROM wash_items i JOIN washes w ON w.id = i.wash_id
             WHERE w.organization_id=$1::uuid AND w.status <> 'cancelled'
               AND w.created_at >= $2::date AND w.created_at < ($3::date + interval '1 day')${siteWashesJoined}
             GROUP BY i.service_name ORDER BY amount_cents DESC LIMIT 10`,
          args
        ),
        // Suivi par canal, avec la part encore à confirmer.
        pool2.query(
          `SELECT method, COUNT(*)::int AS payment_count,
               SUM(amount_cents)::int AS amount_cents,
               COALESCE(SUM(amount_cents) FILTER (WHERE status='verified'),0)::int AS verified_cents,
               COALESCE(SUM(amount_cents) FILTER (WHERE status='pending'),0)::int AS pending_cents
             FROM payments
             WHERE organization_id=$1::uuid AND status <> 'refunded'
               AND created_at >= $2::date AND created_at < ($3::date + interval '1 day')${sitePaymentsBare}
             GROUP BY method ORDER BY amount_cents DESC`,
          args
        ),
        pool2.query(
          `SELECT category, COUNT(*)::int AS expense_count, SUM(amount_cents)::int AS amount_cents
             FROM expenses
             WHERE organization_id=$1::uuid AND status='completed'
               AND created_at >= $2::date AND created_at < ($3::date + interval '1 day')${siteExpenses}
             GROUP BY category ORDER BY amount_cents DESC`,
          args
        ),
        // Activité par laveur : nombre de lavages et chiffre d'affaires
        // associé. Un lavage à plusieurs laveurs est réparti à parts égales.
        pool2.query(
          `SELECT wk.id AS worker_id,
               (wk.first_name || ' ' || wk.last_name) AS name,
               wk.role,
               COUNT(DISTINCT w.id)::int AS wash_count,
               COALESCE(SUM(w.total_cents::numeric / NULLIF(a.team_size,0)),0)::int AS amount_cents
             FROM wash_assignments wa
             JOIN washes w ON w.id = wa.wash_id
             JOIN workers wk ON wk.id = wa.worker_id
             JOIN (SELECT wash_id, COUNT(*)::int AS team_size FROM wash_assignments GROUP BY wash_id) a
               ON a.wash_id = wa.wash_id
             WHERE w.organization_id=$1::uuid AND w.status <> 'cancelled'
               AND w.created_at >= $2::date AND w.created_at < ($3::date + interval '1 day')${siteWashesJoined}
             GROUP BY wk.id, wk.first_name, wk.last_name, wk.role
             ORDER BY amount_cents DESC LIMIT 20`,
          args
        ),
        // Vue consolidée : une ligne par site, quel que soit le filtre en
        // cours. Le propriétaire multi-sites compare ses stations d'un
        // coup d'œil au lieu de changer de filtre trois fois.
        //
        // `LEFT JOIN` sur les trois agrégats : un site ouvert mais sans
        // activité doit apparaître à zéro, pas disparaître du tableau.
        pool2.query(
          `SELECT s.id AS site_id, s.name AS site_name, s.city,
               COALESCE(w.wash_count,0)::int AS wash_count,
               COALESCE(p.revenue_cents,0)::int AS revenue_cents,
               COALESCE(e.expenses_cents,0)::int AS expenses_cents
             FROM sites s
             LEFT JOIN (
               SELECT site_id, COUNT(*)::int AS wash_count FROM washes
               WHERE organization_id=$1::uuid AND status <> 'cancelled'
                 AND created_at >= $2::date AND created_at < ($3::date + interval '1 day')
               GROUP BY site_id
             ) w ON w.site_id = s.id
             LEFT JOIN (
               SELECT sw.site_id, SUM(pm.amount_cents)::int AS revenue_cents
               FROM payments pm JOIN washes sw ON sw.id = pm.wash_id
               WHERE pm.organization_id=$1::uuid AND pm.status <> 'refunded'
                 AND pm.created_at >= $2::date AND pm.created_at < ($3::date + interval '1 day')
               GROUP BY sw.site_id
             ) p ON p.site_id = s.id
             LEFT JOIN (
               SELECT site_id, SUM(amount_cents)::int AS expenses_cents FROM expenses
               WHERE organization_id=$1::uuid AND status='completed'
                 AND created_at >= $2::date AND created_at < ($3::date + interval '1 day')
               GROUP BY site_id
             ) e ON e.site_id = s.id
             WHERE s.organization_id=$1::uuid AND s.is_active = true
             ORDER BY revenue_cents DESC, s.name`,
          [t.organizationId, range.from, range.to]
        )
      ]);
      const summary = summaryQ.rows[0];
      const expensesCents = expensesQ.rows[0].expenses_cents;
      const financial = t.can("report:financial");
      const consolidated = req.subscription?.capabilities["reports.consolidated"] ?? true;
      res.json({
        period: { from: range.from, to: range.to, granularity },
        granularity,
        financial_access: financial,
        // Informe l'interface que la période affichée a été réduite.
        restriction: clamped ? {
          reason: "trial_expired",
          requested_from: requested.from,
          window_days: windowDays ?? EXPIRED_REPORT_WINDOW_DAYS,
          message: `Essai termin\xE9 : l\u2019historique est limit\xE9 aux ${windowDays ?? EXPIRED_REPORT_WINDOW_DAYS} derniers jours.`
        } : null,
        summary: {
          total_washes: summary.total_washes,
          completed_washes: summary.completed_washes,
          paid_washes: summary.paid_washes,
          unpaid_washes: summary.unpaid_washes,
          revenue_cents: summary.revenue_cents,
          pending_cents: summary.pending_cents,
          expenses_cents: financial ? expensesCents : null,
          net_cents: financial ? summary.revenue_cents - expensesCents : null
        },
        series: financial ? seriesQ.rows : seriesQ.rows.map((row) => ({ ...row, expenses_cents: null })),
        top_services: servicesQ.rows,
        top_workers: workersQ.rows,
        payment_methods: paymentsQ.rows,
        expense_categories: financial ? expenseCategoriesQ.rows : [],
        // Site filtré, le cas échéant : l'interface affiche de quoi elle parle.
        site: site ? { id: site.id, name: site.name } : null,
        // Ventilation par site : fonction Business. Sur les autres forfaits
        // le tableau est vide plutôt qu'absent, pour que l'interface puisse
        // afficher l'argumentaire au lieu d'un écran qui ne réagit pas.
        consolidated_access: consolidated,
        by_site: (consolidated ? bySiteQ.rows : []).map((row) => ({
          site_id: row.site_id,
          site_name: row.site_name,
          city: row.city,
          wash_count: row.wash_count,
          revenue_cents: row.revenue_cents,
          expenses_cents: financial ? row.expenses_cents : null,
          net_cents: financial ? row.revenue_cents - row.expenses_cents : null
        }))
      });
    })
  );
  return r;
}

// server/subscription.ts
init_db();
init_http();
import { Router as Router14 } from "express";
import { z as z17 } from "zod";

// server/closure.ts
init_db();
init_http();
import { z as z16 } from "zod";

// server/platform-admin.ts
init_db();
init_auth();
function adminDb() {
  const pool2 = getPool();
  if (!pool2) throw new HttpError(503, "database_not_configured", "Base de donn\xE9es indisponible.");
  return pool2;
}
async function auditPlatformAction(client, organizationId, operatorEmail, action, entityId, metadata) {
  await client.query(
    `INSERT INTO audit_logs(organization_id, actor_user_id, action, entity_type, entity_id, metadata)
     VALUES($1::uuid, NULL, $2, 'subscription', $3::text, $4::jsonb)`,
    [
      organizationId,
      action,
      entityId,
      JSON.stringify({ ...metadata, by: "platform_admin", operator_email: operatorEmail })
    ]
  );
}

// server/closure.ts
init_console_auth();
var PENDING = "pending";
function db11() {
  const pool2 = getPool();
  if (!pool2) throw new HttpError(503, "database_not_configured", "Base de donn\xE9es indisponible.");
  return pool2;
}
function publicShape(row) {
  return {
    id: row.id,
    reason: row.reason,
    status: row.status,
    created_at: row.created_at,
    requested_by_email: row.requested_by_email,
    resolution_note: row.resolution_note,
    resolved_at: row.resolved_at
  };
}
async function acceptPendingClosure(pool2, organizationId, operatorEmail, note) {
  const q = await pool2.query(
    `UPDATE closure_requests
        SET status = 'accepted', resolved_by_email = $2, resolution_note = $3, resolved_at = now()
      WHERE organization_id = $1::uuid AND status = '${PENDING}'`,
    [organizationId, operatorEmail, note]
  );
  return (q.rowCount ?? 0) > 0;
}
function registerClosureRoutes(r) {
  r.get(
    "/subscription/closure",
    requirePermission("subscription:manage"),
    asyncRoute(async (req, res) => {
      const t = tenant(req);
      const q = await db11().query(
        `SELECT id, reason, status, created_at, requested_by_email, resolution_note, resolved_at
           FROM closure_requests
          WHERE organization_id = $1::uuid
          ORDER BY created_at DESC
          LIMIT 1`,
        [t.organizationId]
      );
      const row = q.rows[0];
      res.json({
        request: row ? publicShape(row) : null,
        pending: row?.status === PENDING
      });
    })
  );
  r.post(
    "/subscription/closure",
    requirePermission("subscription:manage"),
    asyncRoute(async (req, res) => {
      const t = tenant(req);
      const input = body(
        z16.object({ reason: z16.string().trim().min(20).max(1e3) }).strip(),
        req.body
      );
      const pool2 = db11();
      const who = await pool2.query("SELECT email FROM users WHERE id = $1::uuid", [t.userId]);
      const email = String(who.rows[0]?.email ?? "");
      try {
        const q = await pool2.query(
          `INSERT INTO closure_requests(organization_id, requested_by, requested_by_email, reason)
           VALUES($1::uuid, $2::uuid, $3, $4)
           RETURNING id, reason, status, created_at, requested_by_email, resolution_note, resolved_at`,
          [t.organizationId, t.userId, email, input.reason]
        );
        await pool2.query(
          `INSERT INTO audit_logs(organization_id, actor_user_id, action, entity_type, entity_id, metadata)
           VALUES($1::uuid, $2::uuid, 'account.closure_requested', 'organization', $1::text, $3::jsonb)`,
          [t.organizationId, t.userId, JSON.stringify({ reason: input.reason })]
        );
        res.status(201).json({ request: publicShape(q.rows[0]), pending: true });
      } catch (error) {
        const code = error.code;
        if (code === "23505") {
          throw new HttpError(
            409,
            "closure_already_requested",
            "Une demande de cl\xF4ture est d\xE9j\xE0 en cours d'examen."
          );
        }
        throw error;
      }
    })
  );
  r.post(
    "/subscription/closure/cancel",
    requirePermission("subscription:manage"),
    asyncRoute(async (req, res) => {
      const t = tenant(req);
      const pool2 = db11();
      const q = await pool2.query(
        `UPDATE closure_requests
            SET status = 'cancelled', resolved_at = now()
          WHERE organization_id = $1::uuid AND status = '${PENDING}'
          RETURNING id`,
        [t.organizationId]
      );
      if (!q.rowCount) {
        throw new HttpError(
          404,
          "closure_request_not_found",
          "Aucune demande de cl\xF4ture en cours."
        );
      }
      await pool2.query(
        `INSERT INTO audit_logs(organization_id, actor_user_id, action, entity_type, entity_id, metadata)
         VALUES($1::uuid, $2::uuid, 'account.closure_cancelled', 'organization', $1::text, '{}'::jsonb)`,
        [t.organizationId, t.userId]
      );
      res.json({ request: null, pending: false });
    })
  );
}
function registerClosureConsoleRoutes(r) {
  r.get(
    "/closure-requests",
    asyncRoute(async (req, res) => {
      const status = String(req.query.status ?? PENDING);
      if (!["pending", "cancelled", "accepted", "declined", "all"].includes(status)) {
        throw new HttpError(400, "invalid_status", "Statut de filtre inconnu.");
      }
      const q = await adminDb().query(
        `SELECT c.id, c.organization_id, o.name AS organization_name, c.reason, c.status,
                c.requested_by_email, c.created_at, c.resolution_note, c.resolved_at,
                c.resolved_by_email
           FROM closure_requests c
           JOIN organizations o ON o.id = c.organization_id
          WHERE ($1 = 'all' OR c.status = $1)
          ORDER BY c.created_at DESC
          LIMIT 200`,
        [status]
      );
      res.json({ requests: q.rows });
    })
  );
  r.post(
    "/closure-requests/:id/decline",
    asyncRoute(async (req, res) => {
      const id = parseId(req.params.id);
      const operator = req.operator;
      const input = body(
        z16.object({ note: z16.string().trim().min(10).max(1e3) }).strip(),
        req.body
      );
      const pool2 = adminDb();
      const q = await pool2.query(
        `UPDATE closure_requests
            SET status = 'declined', resolved_by_email = $2, resolution_note = $3, resolved_at = now()
          WHERE id = $1::uuid AND status = '${PENDING}'
          RETURNING organization_id`,
        [id, operator.email, input.note]
      );
      if (!q.rowCount) {
        throw new HttpError(
          404,
          "closure_request_not_found",
          "Cette demande n'existe pas ou a d\xE9j\xE0 \xE9t\xE9 trait\xE9e."
        );
      }
      const organizationId = String(q.rows[0].organization_id);
      await logConsoleAction(pool2, operator, "closure.declined", organizationId, null, {
        note: input.note
      });
      res.json({ id, status: "declined" });
    })
  );
}

// server/subscription.ts
init_env();
init_entitlements();
function db12() {
  const pool2 = getPool();
  if (!pool2) throw new HttpError(503, "database_not_configured", "Base de donn\xE9es indisponible.");
  return pool2;
}
function createSubscriptionRouter() {
  const r = Router14();
  r.get(
    "/subscription",
    asyncRoute(async (req, res) => {
      const t = tenant(req);
      const pool2 = db12();
      const state = await loadSubscriptionState(pool2, t.organizationId, { fresh: true });
      const sites = await loadSiteLimitState(pool2, t.organizationId);
      res.json({
        ...state,
        warning_days: TRIAL_WARNING_DAYS,
        capability_labels: CAPABILITY_LABELS,
        limits: { sites },
        downgrade_grace_days: DOWNGRADE_GRACE_DAYS
      });
    })
  );
  if (env.NODE_ENV !== "production") {
    r.post(
      "/subscription/simulate",
      requirePermission("subscription:manage"),
      asyncRoute(async (req, res) => {
        const payload = body(
          z17.object({
            // Jours restants : négatif ou nul = essai terminé.
            days_left: z17.number().min(-365).max(TRIAL_DAYS),
            plan_code: z17.string().trim().min(1).max(40).optional(),
            // Recule la date du changement de forfait, pour observer la fin
            // du délai de grâce sans attendre 14 jours.
            plan_changed_days_ago: z17.number().min(0).max(400).optional(),
            // Simule un **forfait payant** échu plutôt qu'un essai : c'est
            // le seul moyen de voir la tolérance de paiement et le bandeau
            // d'impayé sans attendre trente jours.
            paid: z17.boolean().optional()
          }).strip(),
          req.body
        );
        const t = tenant(req);
        const pool2 = db12();
        const planQ = await pool2.query("SELECT id FROM plans WHERE code=$1", [
          payload.plan_code ?? "starter"
        ]);
        if (!planQ.rowCount) throw new HttpError(404, "plan_not_found", "Forfait introuvable.");
        const expired = payload.days_left <= 0 && !payload.paid;
        const nextStatus = payload.paid ? "active" : expired ? "expired" : "trialing";
        await pool2.query(
          `INSERT INTO subscriptions(organization_id, plan_id, status, current_period_end, plan_changed_at)
           VALUES($1::uuid, $2, $3, now() + ($4 || ' days')::interval, now())
           ON CONFLICT (organization_id) DO UPDATE
             SET plan_id=EXCLUDED.plan_id, status=EXCLUDED.status,
                 current_period_end=EXCLUDED.current_period_end,
                 plan_changed_at=CASE WHEN subscriptions.plan_id <> EXCLUDED.plan_id THEN now() ELSE subscriptions.plan_changed_at END,
                 updated_at=now()`,
          [t.organizationId, planQ.rows[0].id, nextStatus, String(payload.days_left)]
        );
        if (payload.plan_changed_days_ago !== void 0) {
          await pool2.query(
            "UPDATE subscriptions SET plan_changed_at = now() - ($2 || ' days')::interval WHERE organization_id=$1::uuid",
            [t.organizationId, String(payload.plan_changed_days_ago)]
          );
        }
        invalidateSubscriptionCache(t.organizationId);
        const state = await loadSubscriptionState(pool2, t.organizationId, { fresh: true });
        res.json({ ...state, simulated: true });
      })
    );
  }
  registerClosureRoutes(r);
  return r;
}

// server/backup.ts
init_db();
init_http();
import { Router as Router15 } from "express";
function db13() {
  const pool2 = getPool();
  if (!pool2) throw new HttpError(503, "database_not_configured", "Base de donn\xE9es indisponible.");
  return pool2;
}
var EXPORT_QUERIES = [
  { key: "organization", sql: "SELECT id, name, slug, onboarding_completed, created_at FROM organizations WHERE id=$1::uuid" },
  {
    key: "members",
    sql: `SELECT m.id, m.role, m.created_at, u.email, u.first_name, u.last_name, u.phone, u.status
          FROM organization_members m JOIN users u ON u.id = m.user_id
          WHERE m.organization_id=$1::uuid ORDER BY m.created_at`
  },
  { key: "subscription", sql: `SELECT s.status, s.current_period_end, s.created_at, s.updated_at, p.code AS plan_code, p.name AS plan_name
          FROM subscriptions s JOIN plans p ON p.id = s.plan_id WHERE s.organization_id=$1::uuid` },
  // Le logo est utile dans une sauvegarde : c'est la seule copie de
  // l'identité de la station en dehors de la base.
  { key: "organization_branding", sql: "SELECT * FROM organization_branding WHERE organization_id=$1::uuid" },
  { key: "sites", sql: "SELECT * FROM sites WHERE organization_id=$1::uuid ORDER BY created_at" },
  { key: "service_categories", sql: "SELECT * FROM service_categories WHERE organization_id=$1::uuid ORDER BY created_at" },
  { key: "vehicle_categories", sql: "SELECT * FROM vehicle_categories WHERE organization_id=$1::uuid ORDER BY created_at" },
  { key: "services", sql: "SELECT * FROM services WHERE organization_id=$1::uuid ORDER BY created_at" },
  {
    key: "service_vehicle_prices",
    sql: `SELECT p.* FROM service_vehicle_prices p JOIN services s ON s.id = p.service_id
          WHERE s.organization_id=$1::uuid ORDER BY p.service_id`
  },
  { key: "workers", sql: "SELECT * FROM workers WHERE organization_id=$1::uuid ORDER BY created_at" },
  { key: "customers", sql: "SELECT * FROM customers WHERE organization_id=$1::uuid ORDER BY created_at" },
  { key: "washes", sql: "SELECT * FROM washes WHERE organization_id=$1::uuid ORDER BY created_at" },
  { key: "notifications", sql: "SELECT * FROM notifications WHERE organization_id=$1::uuid ORDER BY created_at" },
  {
    key: "wash_items",
    sql: `SELECT i.* FROM wash_items i JOIN washes w ON w.id = i.wash_id
          WHERE w.organization_id=$1::uuid ORDER BY i.wash_id`
  },
  {
    key: "wash_assignments",
    sql: `SELECT a.* FROM wash_assignments a JOIN washes w ON w.id = a.wash_id
          WHERE w.organization_id=$1::uuid ORDER BY a.wash_id`
  },
  { key: "payments", sql: "SELECT * FROM payments WHERE organization_id=$1::uuid ORDER BY created_at" },
  { key: "cash_sessions", sql: "SELECT * FROM cash_sessions WHERE organization_id=$1::uuid ORDER BY opened_at" },
  { key: "cash_movements", sql: "SELECT * FROM cash_movements WHERE organization_id=$1::uuid ORDER BY created_at" },
  { key: "utility_meters", sql: "SELECT * FROM utility_meters WHERE organization_id=$1::uuid ORDER BY created_at" },
  { key: "utility_readings", sql: "SELECT * FROM utility_readings WHERE organization_id=$1::uuid ORDER BY reading_date, created_at" },
  { key: "utility_reading_photos", sql: "SELECT * FROM utility_reading_photos WHERE organization_id=$1::uuid ORDER BY created_at" },
  { key: "expenses", sql: "SELECT * FROM expenses WHERE organization_id=$1::uuid ORDER BY created_at" },
  { key: "product_categories", sql: "SELECT * FROM product_categories WHERE organization_id=$1::uuid ORDER BY created_at" },
  { key: "products", sql: "SELECT * FROM products WHERE organization_id=$1::uuid ORDER BY created_at" },
  { key: "stock_movements", sql: "SELECT * FROM stock_movements WHERE organization_id=$1::uuid ORDER BY created_at" },
  { key: "service_consumables", sql: "SELECT * FROM service_consumables WHERE organization_id=$1::uuid ORDER BY created_at" },
  { key: "suppliers", sql: "SELECT * FROM suppliers WHERE organization_id=$1::uuid ORDER BY created_at" },
  { key: "purchases", sql: "SELECT * FROM purchases WHERE organization_id=$1::uuid ORDER BY created_at" },
  { key: "purchase_items", sql: "SELECT * FROM purchase_items WHERE organization_id=$1::uuid ORDER BY created_at" },
  { key: "work_schedules", sql: "SELECT * FROM work_schedules WHERE organization_id=$1::uuid ORDER BY created_at" },
  { key: "attendance_records", sql: "SELECT * FROM attendance_records WHERE organization_id=$1::uuid ORDER BY work_date" },
  { key: "closure_requests", sql: "SELECT * FROM closure_requests WHERE organization_id=$1::uuid ORDER BY created_at" },
  {
    key: "audit_logs",
    sql: `SELECT action, entity_type, entity_id, metadata, created_at FROM audit_logs
          WHERE organization_id=$1::uuid ORDER BY created_at DESC LIMIT 5000`
  }
];
async function buildOrganizationBackup(pool2, organizationId) {
  const data = {};
  const counts = {};
  for (const { key, sql } of EXPORT_QUERIES) {
    const result = await pool2.query(sql, [organizationId]);
    if (key === "organization" || key === "subscription") {
      data[key] = result.rows[0] ?? null;
      counts[key] = result.rowCount ?? 0;
    } else {
      data[key] = result.rows;
      counts[key] = result.rows.length;
    }
  }
  return {
    format: "washpilot.backup",
    version: 1,
    exported_at: (/* @__PURE__ */ new Date()).toISOString(),
    organization_id: organizationId,
    counts,
    data
  };
}
function backupFileName(organizationName, date = /* @__PURE__ */ new Date()) {
  const slug = (organizationName ?? "washpilot").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "washpilot";
  return `washpilot-sauvegarde-${slug}-${date.toISOString().slice(0, 10)}.json`;
}
function createBackupRouter() {
  const r = Router15();
  r.get(
    "/backup/summary",
    requirePermission("data:export"),
    asyncRoute(async (req, res) => {
      const t = tenant(req);
      const pool2 = db13();
      const [counts, last] = await Promise.all([
        pool2.query(
          `SELECT
             (SELECT COUNT(*)::int FROM washes WHERE organization_id=$1::uuid) AS washes,
             (SELECT COUNT(*)::int FROM payments WHERE organization_id=$1::uuid) AS payments,
             (SELECT COUNT(*)::int FROM expenses WHERE organization_id=$1::uuid) AS expenses,
             (SELECT COUNT(*)::int FROM utility_readings WHERE organization_id=$1::uuid) AS utility_readings,
             (SELECT COUNT(*)::int FROM cash_sessions WHERE organization_id=$1::uuid) AS cash_sessions,
             (SELECT COUNT(*)::int FROM workers WHERE organization_id=$1::uuid) AS workers,
             (SELECT COUNT(*)::int FROM services WHERE organization_id=$1::uuid) AS services,
             (SELECT COUNT(*)::int FROM sites WHERE organization_id=$1::uuid) AS sites`,
          [t.organizationId]
        ),
        pool2.query(
          `SELECT created_at FROM audit_logs
           WHERE organization_id=$1::uuid AND action='backup.exported'
           ORDER BY created_at DESC LIMIT 1`,
          [t.organizationId]
        )
      ]);
      res.json({
        counts: counts.rows[0],
        last_export_at: last.rows[0]?.created_at ?? null
      });
    })
  );
  r.get(
    "/backup/export",
    requirePermission("data:export"),
    asyncRoute(async (req, res) => {
      const t = tenant(req);
      const pool2 = db13();
      const payload = await buildOrganizationBackup(pool2, t.organizationId);
      const organizationName = payload.data.organization?.name ?? null;
      await pool2.query(
        `INSERT INTO audit_logs(organization_id, actor_user_id, action, entity_type, entity_id, metadata)
         VALUES($1::uuid,$2::uuid,'backup.exported','organization',$1::text,$3::jsonb)`,
        [t.organizationId, t.userId, JSON.stringify({ counts: payload.counts })]
      );
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${backupFileName(organizationName)}"`);
      res.send(JSON.stringify(payload, null, 2));
    })
  );
  return r;
}

// server/app.ts
init_support();

// server/checkout.ts
init_http();
init_auth();
init_db();
init_env();
import { Router as Router16 } from "express";
import { z as z18 } from "zod";
import { randomBytes as randomBytes3 } from "node:crypto";
function db14() {
  const pool2 = getPool();
  if (!pool2) {
    throw new HttpError(503, "database_not_configured", "Base de donn\xE9es indisponible.");
  }
  return pool2;
}
function newReference() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes3(8);
  let out = "";
  for (const byte of bytes) out += alphabet[byte % alphabet.length];
  return `WP-${out}`;
}
var INTENT_TTL_HOURS = 48;
function createCheckoutRouter() {
  const r = Router16();
  r.post(
    "/subscription/checkout",
    requirePermission("subscription:manage"),
    asyncRoute(async (req, res) => {
      const t = tenant(req);
      const input = body(
        z18.object({
          plan_code: z18.string().trim().min(1).max(40),
          months: z18.number().int().min(1).max(12).default(1)
        }).strip(),
        req.body
      );
      const pool2 = db14();
      const planQ = await pool2.query(
        "SELECT code, name, price_cents FROM plans WHERE code = $1",
        [input.plan_code]
      );
      if (!planQ.rowCount) throw new HttpError(404, "plan_not_found", "Forfait introuvable.");
      const plan = planQ.rows[0];
      if (plan.price_cents <= 0) {
        throw new HttpError(
          400,
          "plan_not_payable",
          "Ce forfait n'est pas payant : aucune intention de paiement n'est n\xE9cessaire."
        );
      }
      const existing = await pool2.query(
        `SELECT reference, plan_code, months, amount_cents, provider, status, created_at
           FROM payment_intents
          WHERE organization_id = $1::uuid
            AND status = 'pending'
            AND plan_code = $2
            AND months = $3
            AND created_at > now() - ($4 || ' hours')::interval
          ORDER BY created_at DESC
          LIMIT 1`,
        [t.organizationId, plan.code, input.months, String(INTENT_TTL_HOURS)]
      );
      const amountCents = plan.price_cents * input.months;
      let row = existing.rows[0];
      if (!row) {
        const inserted = await pool2.query(
          `INSERT INTO payment_intents(
             organization_id, reference, plan_code, months, amount_cents, provider, created_by, metadata)
           VALUES($1::uuid, $2, $3, $4, $5, $6, $7::uuid, $8::jsonb)
           RETURNING reference, amount_cents, provider`,
          [
            t.organizationId,
            newReference(),
            plan.code,
            input.months,
            amountCents,
            env.PAYMENT_PROVIDER,
            t.userId,
            JSON.stringify({ plan_name: plan.name })
          ]
        );
        row = inserted.rows[0];
      }
      res.status(201).json({
        reference: row.reference,
        plan_code: plan.code,
        plan_name: plan.name,
        months: input.months,
        amount_cents: row.amount_cents,
        provider: row.provider,
        expires_in_hours: INTENT_TTL_HOURS,
        // En mode manuel, le serveur rend les coordonnées d'encaissement.
        // Un agrégateur rendrait ici une `payment_url`.
        instructions: row.provider === "manual" ? {
          merchant_number: env.PAYMENT_MERCHANT_NUMBER || null,
          merchant_name: env.PAYMENT_MERCHANT_NAME || null,
          channels: ["Orange Money", "MTN MoMo", "Moov Money", "Wave"],
          message: "Indiquez la r\xE9f\xE9rence ci-dessus dans le motif du transfert, puis d\xE9clarez votre paiement."
        } : null
      });
    })
  );
  r.post(
    "/subscription/checkout/:reference/declare",
    requirePermission("subscription:manage"),
    asyncRoute(async (req, res) => {
      const t = tenant(req);
      const input = body(
        z18.object({
          transaction_reference: z18.string().trim().min(3).max(120),
          paid_with: z18.string().trim().max(40).optional()
        }).strip(),
        req.body
      );
      const pool2 = db14();
      const updated = await pool2.query(
        `UPDATE payment_intents
            SET declared_reference = $3,
                declared_at = now(),
                metadata = metadata || $4::jsonb
          WHERE reference = $1
            AND organization_id = $2::uuid
            AND status = 'pending'
          RETURNING reference, plan_code, months, amount_cents`,
        [
          req.params.reference,
          t.organizationId,
          input.transaction_reference,
          JSON.stringify({ paid_with: input.paid_with ?? null })
        ]
      );
      if (!updated.rowCount) {
        throw new HttpError(
          404,
          "payment_intent_not_found",
          "Aucune demande de paiement en attente ne correspond \xE0 cette r\xE9f\xE9rence."
        );
      }
      await pool2.query(
        `INSERT INTO audit_logs(organization_id, actor_user_id, action, entity_type, entity_id, metadata)
         VALUES($1::uuid, $2::uuid, 'subscription.payment_declared', 'subscription', $3::text, $4::jsonb)`,
        [
          t.organizationId,
          t.userId,
          req.params.reference,
          JSON.stringify({
            transaction_reference: input.transaction_reference,
            paid_with: input.paid_with ?? null
          })
        ]
      );
      res.json({
        reference: updated.rows[0].reference,
        status: "pending",
        message: "Paiement d\xE9clar\xE9. L'activation intervient d\xE8s v\xE9rification, en g\xE9n\xE9ral sous quelques heures ouvr\xE9es."
      });
    })
  );
  r.get(
    "/subscription/checkout",
    asyncRoute(async (req, res) => {
      const t = tenant(req);
      const q = await db14().query(
        `SELECT reference, plan_code, months, amount_cents, provider, status,
                declared_reference, declared_at, created_at, settled_at
           FROM payment_intents
          WHERE organization_id = $1::uuid
          ORDER BY created_at DESC
          LIMIT 20`,
        [t.organizationId]
      );
      res.json({ intents: q.rows });
    })
  );
  return r;
}

// server/access.ts
init_db();
init_http();
init_auth();
import { Router as Router17 } from "express";
import { z as z19 } from "zod";
init_permissions();
function db15() {
  const pool2 = getPool();
  if (!pool2) throw new HttpError(503, "database_not_configured", "Base de donn\xE9es indisponible.");
  return pool2;
}
async function audit(client, organizationId, actorUserId, action, entityId, metadata) {
  await client.query(
    `INSERT INTO audit_logs(organization_id, actor_user_id, action, entity_type, entity_id, metadata)
     VALUES($1::uuid,$2::uuid,$3,'member',$4::text,$5::jsonb)`,
    [organizationId, actorUserId, action, entityId, JSON.stringify(metadata)]
  );
}
var MEMBER_SELECT = `m.user_id, m.role, m.status, m.created_at, m.disabled_at,
  u.email, u.first_name, u.last_name, u.phone`;
async function activeOwnerCount(client, organizationId, excludeUserId) {
  const q = await client.query(
    `SELECT COUNT(*)::text AS count FROM organization_members
     WHERE organization_id=$1::uuid AND role='owner' AND status='active'
       AND ($2::uuid IS NULL OR user_id <> $2::uuid)`,
    [organizationId, excludeUserId ?? null]
  );
  return Number(q.rows[0].count);
}
function createAccessRouter() {
  const r = Router17();
  r.get(
    "/me/permissions",
    asyncRoute(async (req, res) => {
      const t = tenant(req);
      res.json({
        user_id: t.userId,
        organization_id: t.organizationId,
        role: t.role,
        role_label: isRole(t.role) ? ROLE_LABELS[t.role] : t.role,
        permissions: [...t.permissions].sort(),
        permission_labels: PERMISSION_LABELS
      });
    })
  );
  r.get(
    "/access/roles",
    requirePermission("user:manage"),
    asyncRoute(async (req, res) => {
      tenant(req);
      res.json({
        roles: ROLES.map((role) => ({
          code: role,
          label: ROLE_LABELS[role],
          description: ROLE_DESCRIPTIONS[role],
          permissions: [...ROLE_PERMISSIONS[role]]
        })),
        permissions: PERMISSIONS.map((permission) => ({
          code: permission,
          label: PERMISSION_LABELS[permission],
          grantable: GRANTABLE_PERMISSIONS.includes(permission)
        })),
        owner_only: [...OWNER_ONLY_PERMISSIONS]
      });
    })
  );
  r.get(
    "/access/capacity",
    requirePermission("worker:create"),
    asyncRoute(async (req, res) => {
      const t = tenant(req);
      const q = await db15().query(
        `SELECT p.max_users, COUNT(m.id)::int AS active_count FROM organizations o
         LEFT JOIN subscriptions s ON s.organization_id = o.id
         LEFT JOIN plans p ON p.id = s.plan_id
         LEFT JOIN organization_members m ON m.organization_id = o.id AND m.status = 'active'
         WHERE o.id = $1::uuid GROUP BY p.max_users`,
        [t.organizationId]
      );
      const row = q.rows[0];
      const maxUsers = row?.max_users == null ? null : Number(row.max_users);
      const activeUsers = Number(row?.active_count ?? 0);
      const remainingUsers = maxUsers === null ? null : Math.max(maxUsers - activeUsers, 0);
      res.json({
        max_users: maxUsers,
        active_users: activeUsers,
        remaining_users: remainingUsers,
        can_create: maxUsers === null || (remainingUsers ?? 0) > 0
      });
    })
  );
  r.get(
    "/access/members",
    requirePermission("user:manage"),
    asyncRoute(async (req, res) => {
      const t = tenant(req);
      const pool2 = db15();
      const [membersQ, overridesQ] = await Promise.all([
        pool2.query(
          `SELECT ${MEMBER_SELECT} FROM organization_members m
           JOIN users u ON u.id = m.user_id
           WHERE m.organization_id=$1::uuid
           ORDER BY CASE m.role WHEN 'owner' THEN 0 WHEN 'manager' THEN 1 WHEN 'cashier' THEN 2 ELSE 3 END,
                    m.created_at`,
          [t.organizationId]
        ),
        pool2.query(
          "SELECT user_id, permission, granted FROM member_permissions WHERE organization_id=$1::uuid",
          [t.organizationId]
        )
      ]);
      const members = membersQ.rows.map((member) => {
        const overrides = overridesQ.rows.filter((o) => o.user_id === member.user_id);
        return {
          ...member,
          is_self: member.user_id === t.userId,
          overrides: overrides.map(({ permission, granted }) => ({ permission, granted })),
          permissions: [...effectivePermissions(member.role, overrides)].sort()
        };
      });
      res.json({ members });
    })
  );
  r.patch(
    "/access/members/:userId",
    requirePermission("user:manage"),
    asyncRoute(async (req, res) => {
      const t = tenant(req);
      const targetUserId = parseId(req.params.userId);
      const input = body(
        z19.object({
          role: z19.enum(ROLES).optional(),
          status: z19.enum(["active", "disabled"]).optional()
        }).strip().refine((value) => value.role !== void 0 || value.status !== void 0, {
          message: "Indiquez un r\xF4le ou un statut."
        }),
        req.body
      );
      const pool2 = db15();
      if (targetUserId === t.userId) {
        await audit(pool2, t.organizationId, t.userId, "access.denied", targetUserId, {
          attempted: input,
          reason: "self_modification"
        });
        throw new HttpError(
          403,
          "self_modification_forbidden",
          "Vous ne pouvez pas modifier votre propre r\xF4le ni votre propre acc\xE8s."
        );
      }
      const client = await pool2.connect();
      try {
        await client.query("BEGIN");
        const currentQ = await client.query(
          `SELECT ${MEMBER_SELECT} FROM organization_members m
           JOIN users u ON u.id = m.user_id
           WHERE m.organization_id=$1::uuid AND m.user_id=$2::uuid FOR UPDATE OF m`,
          [t.organizationId, targetUserId]
        );
        const current = currentQ.rows[0];
        if (!current) throw new HttpError(404, "member_not_found", "Ce membre n\u2019appartient pas \xE0 votre station.");
        const nextRole = input.role ?? current.role;
        const nextStatus = input.status ?? current.status;
        const losesOwner = current.role === "owner" && (nextRole !== "owner" || nextStatus !== "active");
        if (losesOwner && await activeOwnerCount(client, t.organizationId, targetUserId) === 0) {
          throw new HttpError(
            409,
            "last_owner",
            "Cette station doit conserver au moins un propri\xE9taire actif."
          );
        }
        await client.query(
          `UPDATE organization_members
           SET role=$3, status=$4, disabled_at = CASE WHEN $4 = 'disabled' THEN now() ELSE NULL END,
               updated_by=$5::uuid, updated_at=now()
           WHERE organization_id=$1::uuid AND user_id=$2::uuid`,
          [t.organizationId, targetUserId, nextRole, nextStatus, t.userId]
        );
        if (input.role && input.role !== current.role) {
          await client.query(
            "DELETE FROM member_permissions WHERE organization_id=$1::uuid AND user_id=$2::uuid",
            [t.organizationId, targetUserId]
          );
        }
        await audit(client, t.organizationId, t.userId, "member.access_updated", targetUserId, {
          before: { role: current.role, status: current.status },
          after: { role: nextRole, status: nextStatus }
        });
        await client.query("COMMIT");
        res.json({
          user_id: targetUserId,
          role: nextRole,
          status: nextStatus,
          permissions: [...effectivePermissions(nextRole)].sort()
        });
      } catch (error) {
        await client.query("ROLLBACK").catch(() => {
        });
        throw error;
      } finally {
        client.release();
      }
    })
  );
  r.put(
    "/access/members/:userId/permissions/:permission",
    requirePermission("user:manage"),
    asyncRoute(async (req, res) => {
      const t = tenant(req);
      const targetUserId = parseId(req.params.userId);
      const permission = req.params.permission;
      const input = body(
        z19.object({ granted: z19.boolean().nullable() }).strip(),
        req.body
      );
      const pool2 = db15();
      if (!isPermission(permission)) {
        throw new HttpError(400, "unknown_permission", "Permission inconnue.");
      }
      if (targetUserId === t.userId) {
        await audit(pool2, t.organizationId, t.userId, "access.denied", targetUserId, {
          attempted: { permission, granted: input.granted },
          reason: "self_modification"
        });
        throw new HttpError(
          403,
          "self_modification_forbidden",
          "Vous ne pouvez pas modifier vos propres droits."
        );
      }
      if (input.granted === true && OWNER_ONLY_PERMISSIONS.includes(permission)) {
        await audit(pool2, t.organizationId, t.userId, "access.denied", targetUserId, {
          attempted: { permission },
          reason: "owner_only_permission"
        });
        throw new HttpError(
          403,
          "permission_not_grantable",
          `La permission \xAB ${PERMISSION_LABELS[permission]} \xBB est r\xE9serv\xE9e au propri\xE9taire.`
        );
      }
      const memberQ = await pool2.query(
        "SELECT role FROM organization_members WHERE organization_id=$1::uuid AND user_id=$2::uuid",
        [t.organizationId, targetUserId]
      );
      if (!memberQ.rowCount) {
        throw new HttpError(404, "member_not_found", "Ce membre n\u2019appartient pas \xE0 votre station.");
      }
      if (input.granted === null) {
        await pool2.query(
          "DELETE FROM member_permissions WHERE organization_id=$1::uuid AND user_id=$2::uuid AND permission=$3",
          [t.organizationId, targetUserId, permission]
        );
      } else {
        await pool2.query(
          `INSERT INTO member_permissions(organization_id, user_id, permission, granted, granted_by)
           VALUES($1::uuid,$2::uuid,$3,$4,$5::uuid)
           ON CONFLICT (organization_id, user_id, permission)
           DO UPDATE SET granted = EXCLUDED.granted, granted_by = EXCLUDED.granted_by, created_at = now()`,
          [t.organizationId, targetUserId, permission, input.granted, t.userId]
        );
      }
      await audit(
        pool2,
        t.organizationId,
        t.userId,
        input.granted === null ? "member.permission_reset" : input.granted ? "member.permission_granted" : "member.permission_revoked",
        targetUserId,
        { permission }
      );
      const overridesQ = await pool2.query(
        "SELECT permission, granted FROM member_permissions WHERE organization_id=$1::uuid AND user_id=$2::uuid",
        [t.organizationId, targetUserId]
      );
      res.json({
        user_id: targetUserId,
        overrides: overridesQ.rows,
        permissions: [...effectivePermissions(memberQ.rows[0].role, overridesQ.rows)].sort()
      });
    })
  );
  r.post(
    "/access/members",
    // Deux niveaux d'autorisation, dans la route elle-même :
    //   • créer un agent de lavage exige `worker:create` (gérant inclus) ;
    //   • créer un gérant ou un caissier exige `user:manage`, permission
    //     réservée au propriétaire (OWNER_ONLY_PERMISSIONS) : c'est lui seul
    //     qui délègue l'accès aux encaissements et au contrôle des comptes.
    // La vérification fine est faite plus bas, une fois le corps lu.
    asyncRoute(async (req, res) => {
      const t = tenant(req);
      const input = body(
        z19.object({
          email: z19.string().trim().toLowerCase().email("Adresse e-mail invalide.").max(254),
          first_name: z19.string().trim().min(1, "Le pr\xE9nom est requis.").max(100),
          last_name: z19.string().trim().min(1, "Le nom est requis.").max(100),
          phone: z19.string().trim().max(30).optional().nullable(),
          role: z19.enum(["manager", "cashier", "washer"]),
          // Mot de passe initial posé par le propriétaire. La longueur suit
          // la politique du produit (MIN_PASSWORD_LENGTH) : passer par la
          // constante éviterait que les deux règles divergent.
          password: z19.string().min(5, "Le mot de passe doit contenir au moins 5 caract\xE8res.").max(200)
        }).strip(),
        req.body
      );
      const pool2 = db15();
      if (input.role === "washer") {
        assertPermission(req, "worker:create");
      } else {
        assertPermission(req, "user:manage");
      }
      const assignableRoles = t.role === "owner" ? ["manager", "cashier", "washer"] : ["washer"];
      if (!assignableRoles.includes(input.role)) {
        await audit(pool2, t.organizationId, t.userId, "access.denied", input.email, {
          attempted: { role: input.role },
          reason: "role_not_assignable"
        });
        throw new HttpError(
          403,
          "role_not_assignable",
          "Seul le propri\xE9taire peut cr\xE9er un compte g\xE9rant ou caissier. Vous pouvez cr\xE9er des comptes agent de lavage."
        );
      }
      const client = await pool2.connect();
      let userId;
      try {
        await client.query("BEGIN");
        const existing = await client.query(
          "SELECT id FROM users WHERE lower(email) = $1 LIMIT 1",
          [input.email]
        );
        if (existing.rowCount) {
          await audit(client, t.organizationId, t.userId, "access.denied", input.email, {
            attempted: { role: input.role },
            reason: "email_exists"
          });
          throw new HttpError(
            409,
            "email_exists",
            "Un compte existe d\xE9j\xE0 avec cette adresse e-mail."
          );
        }
        const passwordHash = await hashPassword(input.password);
        const userQ = await client.query(
          `INSERT INTO users (email, first_name, last_name, phone, password_hash, status, organization_id)
           VALUES ($1, $2, $3, $4, $5, 'active', $6) RETURNING id`,
          [input.email, input.first_name, input.last_name, input.phone ?? null, passwordHash, t.organizationId]
        );
        userId = userQ.rows[0].id;
        await assertOrganizationUserCapacity(client, t.organizationId, userId);
        await client.query(
          "INSERT INTO organization_members (organization_id, user_id, role) VALUES ($1, $2, $3)",
          [t.organizationId, userId, input.role]
        );
        await audit(client, t.organizationId, t.userId, "member.created", userId, {
          email: input.email,
          role: input.role
        });
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK").catch(() => {
        });
        throw error;
      } finally {
        client.release();
      }
      res.status(201).json({ user_id: userId, role: input.role, email: input.email });
    })
  );
  return r;
}

// server/notifications.ts
init_http();
init_db();
import { Router as Router18 } from "express";
import { z as z20 } from "zod";
var notificationValidators = {
  list: z20.object({
    limit: z20.coerce.number().int().min(1).max(50).default(20),
    unread_only: z20.enum(["true", "false"]).default("false").transform((value) => value === "true")
  }).strip()
};
var NOTIFICATION_FIELDS = `id, type, title, message, site_id, entity_type, entity_id, read_at, created_at`;
function visible(userParam) {
  return `(user_id IS NULL OR user_id = $${userParam}::uuid)`;
}
function createNotificationsRouter() {
  const r = Router18();
  r.get(
    "/notifications",
    requirePermission("wash:read"),
    asyncRoute(async (req, res) => {
      const t = tenant(req);
      const query = body(notificationValidators.list, req.query);
      const pool2 = getPool();
      if (!pool2) throw new HttpError(503, "database_not_configured", "Base de donn\xE9es indisponible.");
      const q = await pool2.query(
        `SELECT ${NOTIFICATION_FIELDS}
           FROM notifications
          WHERE organization_id = $1::uuid
            AND ${visible(2)}
            ${query.unread_only ? "AND read_at IS NULL" : ""}
          ORDER BY created_at DESC
          LIMIT $3`,
        [t.organizationId, t.userId, query.limit]
      );
      const unread = await pool2.query(
        `SELECT COUNT(*)::text AS count
           FROM notifications
          WHERE organization_id = $1::uuid AND ${visible(2)} AND read_at IS NULL`,
        [t.organizationId, t.userId]
      );
      res.json({
        notifications: q.rows.map((row) => ({
          id: String(row.id),
          type: String(row.type),
          title: String(row.title),
          message: String(row.message),
          site_id: row.site_id ? String(row.site_id) : null,
          entity_type: row.entity_type ? String(row.entity_type) : null,
          entity_id: row.entity_id ? String(row.entity_id) : null,
          read_at: row.read_at ? new Date(row.read_at).toISOString() : null,
          created_at: new Date(row.created_at).toISOString()
        })),
        unread_count: Number(unread.rows[0]?.count ?? 0)
      });
    })
  );
  r.post(
    "/notifications/read-all",
    requirePermission("wash:read"),
    asyncRoute(async (req, res) => {
      const t = tenant(req);
      const pool2 = getPool();
      if (!pool2) throw new HttpError(503, "database_not_configured", "Base de donn\xE9es indisponible.");
      const q = await pool2.query(
        `UPDATE notifications
            SET read_at = now()
          WHERE organization_id = $1::uuid AND ${visible(2)} AND read_at IS NULL
          RETURNING id`,
        [t.organizationId, t.userId]
      );
      res.json({ updated: q.rowCount ?? 0 });
    })
  );
  r.post(
    "/notifications/:id/read",
    requirePermission("wash:read"),
    asyncRoute(async (req, res) => {
      const t = tenant(req);
      const pool2 = getPool();
      if (!pool2) throw new HttpError(503, "database_not_configured", "Base de donn\xE9es indisponible.");
      const q = await pool2.query(
        `UPDATE notifications
            SET read_at = COALESCE(read_at, now())
          WHERE id = $1::uuid AND organization_id = $2::uuid AND ${visible(3)}
          RETURNING id, read_at`,
        [req.params.id, t.organizationId, t.userId]
      );
      if (!q.rowCount) {
        throw new HttpError(404, "notification_not_found", "Cette notification n'existe pas.");
      }
      res.json({
        id: String(q.rows[0].id),
        read_at: new Date(q.rows[0].read_at).toISOString()
      });
    })
  );
  return r;
}

// server/audit-log.ts
init_db();
init_http();
init_entitlements();
init_auth();
import { Router as Router19 } from "express";
import { z as z21 } from "zod";
function db16() {
  const pool2 = getPool();
  if (!pool2) {
    throw new HttpError(503, "database_not_configured", "Base de donn\xE9es indisponible.");
  }
  return pool2;
}
var AUDIT_ACTION_LABELS = {
  "wash.created": "Lavage enregistr\xE9",
  "wash.cancelled": "Lavage annul\xE9",
  "payment.refunded": "Encaissement rembours\xE9",
  "cash_session.closed": "Caisse cl\xF4tur\xE9e",
  "expense.created": "D\xE9pense enregistr\xE9e",
  "expense.updated": "D\xE9pense modifi\xE9e",
  "expense.deleted": "D\xE9pense supprim\xE9e",
  "member.access_updated": "Acc\xE8s d\u2019un membre modifi\xE9",
  "member.permission_granted": "Permission accord\xE9e",
  "member.permission_revoked": "Permission retir\xE9e",
  "member.permission_reset": "Permission r\xE9initialis\xE9e",
  "access.denied": "Tentative refus\xE9e",
  "onboarding.completed": "Mise en service termin\xE9e",
  "backup.exported": "Sauvegarde export\xE9e",
  // Référentiel du catalogue. Un changement de tarif ou de catégorie touche
  // l'argent du client : il doit laisser une trace, comme un lavage annulé.
  "vehicle_category.created": "Cat\xE9gorie de v\xE9hicule cr\xE9\xE9e",
  "vehicle_category.updated": "Cat\xE9gorie de v\xE9hicule modifi\xE9e",
  "vehicle_category.deleted": "Cat\xE9gorie de v\xE9hicule supprim\xE9e",
  "vehicle_category.imported": "Types de v\xE9hicules ajout\xE9s au catalogue",
  "service.created": "Prestation cr\xE9\xE9e",
  "service.updated": "Prestation modifi\xE9e",
  "service.consumables_updated": "Consommation de stock d\u2019une prestation modifi\xE9e",
  "service.deleted": "Prestation supprim\xE9e",
  // Interventions de l'éditeur sur l'abonnement. Elles sont journalisées chez
  // le client et non dans un registre séparé : une action invisible de celui
  // qui la subit serait une porte dérobée, pas une administration.
  "subscription.upgrade_requested": "Activation demand\xE9e",
  "subscription.activated": "Forfait activ\xE9",
  "subscription.suspended": "Abonnement suspendu",
  "subscription.trial_extended": "Essai prolong\xE9",
  "subscription.request_declined": "Demande d\u2019activation d\xE9clin\xE9e"
};
var AUDIT_ENTITY_LABELS = {
  wash: "Lavage",
  payment: "Encaissement",
  cash_session: "Caisse",
  expense: "D\xE9pense",
  organization_member: "Membre",
  organization: "Station",
  backup: "Sauvegarde",
  subscription: "Abonnement",
  plan: "Forfait",
  vehicle_category: "Cat\xE9gorie de v\xE9hicule",
  service: "Prestation"
};
function auditActionLabel(action) {
  return AUDIT_ACTION_LABELS[action] ?? action;
}
function auditEntityLabel(entityType) {
  return AUDIT_ENTITY_LABELS[entityType] ?? entityType;
}
function auditSeverity(action) {
  return action === "access.denied" || action === "subscription.suspended" ? "warning" : "info";
}
var querySchema = z21.object({
  action: z21.string().trim().max(60).optional(),
  entity_type: z21.string().trim().max(40).optional(),
  actor_user_id: z21.string().uuid().optional(),
  from: z21.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date de d\xE9but invalide (AAAA-MM-JJ).").optional(),
  to: z21.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date de fin invalide (AAAA-MM-JJ).").optional(),
  limit: z21.coerce.number().int().min(1).max(200).default(50),
  offset: z21.coerce.number().int().min(0).default(0)
});
function createAuditLogRouter() {
  const r = Router19();
  r.get(
    "/audit-logs",
    requirePermission("audit:read"),
    requireCapability("audit.read"),
    asyncRoute(async (req, res) => {
      const t = tenant(req);
      const parsed2 = querySchema.safeParse(req.query);
      if (!parsed2.success) {
        throw new HttpError(
          400,
          "invalid_query",
          parsed2.error.issues[0]?.message ?? "Filtres invalides."
        );
      }
      const q = parsed2.data;
      if (q.from && q.to && q.from > q.to) {
        throw new HttpError(
          400,
          "invalid_range",
          "La date de d\xE9but doit pr\xE9c\xE9der la date de fin."
        );
      }
      const where = ["a.organization_id = $1::uuid"];
      const params = [t.organizationId];
      if (q.action) {
        params.push(q.action);
        where.push(`a.action = $${params.length}`);
      }
      if (q.entity_type) {
        params.push(q.entity_type);
        where.push(`a.entity_type = $${params.length}`);
      }
      if (q.actor_user_id) {
        params.push(q.actor_user_id);
        where.push(`a.actor_user_id = $${params.length}::uuid`);
      }
      if (q.from) {
        params.push(q.from);
        where.push(`a.created_at >= $${params.length}::date`);
      }
      if (q.to) {
        params.push(q.to);
        where.push(`a.created_at < ($${params.length}::date + INTERVAL '1 day')`);
      }
      const whereSql = where.join(" AND ");
      const totalQ = await db16().query(
        `SELECT COUNT(*)::int AS count FROM audit_logs a WHERE ${whereSql}`,
        params
      );
      const rowsQ = await db16().query(
        `SELECT a.id, a.action, a.entity_type, a.entity_id, a.metadata,
                a.created_at, a.actor_user_id,
                COALESCE(NULLIF(TRIM(CONCAT(u.first_name, ' ', u.last_name)), ''), u.email)
                  AS actor_name
           FROM audit_logs a
           LEFT JOIN users u ON u.id = a.actor_user_id
          WHERE ${whereSql}
          ORDER BY a.created_at DESC, a.id DESC
          LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, q.limit, q.offset]
      );
      res.json({
        entries: rowsQ.rows.map((row) => ({
          id: row.id,
          action: row.action,
          action_label: auditActionLabel(row.action),
          entity_type: row.entity_type,
          entity_label: auditEntityLabel(row.entity_type),
          entity_id: row.entity_id,
          actor_user_id: row.actor_user_id,
          // Une opération automatique ou un compte supprimé n'a pas de nom.
          actor_name: row.actor_name ?? "Syst\xE8me",
          severity: auditSeverity(row.action),
          metadata: row.metadata ?? {},
          created_at: row.created_at
        })),
        total: totalQ.rows[0]?.count ?? 0,
        limit: q.limit,
        offset: q.offset
      });
    })
  );
  r.get(
    "/audit-logs/filters",
    requirePermission("audit:read"),
    requireCapability("audit.read"),
    asyncRoute(async (req, res) => {
      const t = tenant(req);
      const actionsQ = await db16().query(
        `SELECT action, COUNT(*)::int AS count
           FROM audit_logs WHERE organization_id = $1::uuid
          GROUP BY action ORDER BY action`,
        [t.organizationId]
      );
      const entitiesQ = await db16().query(
        `SELECT DISTINCT entity_type FROM audit_logs
          WHERE organization_id = $1::uuid ORDER BY entity_type`,
        [t.organizationId]
      );
      const actorsQ = await db16().query(
        `SELECT DISTINCT a.actor_user_id AS id,
                COALESCE(NULLIF(TRIM(CONCAT(u.first_name, ' ', u.last_name)), ''), u.email)
                  AS name
           FROM audit_logs a
           JOIN users u ON u.id = a.actor_user_id
          WHERE a.organization_id = $1::uuid
          ORDER BY name`,
        [t.organizationId]
      );
      res.json({
        actions: actionsQ.rows.map((row) => ({
          value: row.action,
          label: auditActionLabel(row.action),
          count: row.count
        })),
        entity_types: entitiesQ.rows.map((row) => ({
          value: row.entity_type,
          label: auditEntityLabel(row.entity_type)
        })),
        actors: actorsQ.rows.map((row) => ({ value: row.id, label: row.name }))
      });
    })
  );
  return r;
}

// server/purchases.ts
init_db();
init_http();
init_auth();
init_entitlements();
import { Router as Router20 } from "express";
import { z as z22 } from "zod";
function db17() {
  const pool2 = getPool();
  if (!pool2) throw new HttpError(503, "database_not_configured", "Base de donn\xE9es indisponible.");
  return pool2;
}
var receivedMilli = z22.number().int().positive().max(1e7);
var unitCost = z22.number().int().min(0).max(1e7);
var TOTAL_MAX_CENTS = 2e9;
var purchaseValidators = {
  supplier: z22.object({
    name: z22.string().trim().min(2).max(160),
    phone: z22.string().trim().max(40).optional(),
    contact_name: z22.string().trim().max(160).optional(),
    notes: z22.string().trim().max(1e3).optional()
  }).strip(),
  supplierUpdate: z22.object({
    name: z22.string().trim().min(2).max(160).optional(),
    phone: z22.string().trim().max(40).nullable().optional(),
    contact_name: z22.string().trim().max(160).nullable().optional(),
    notes: z22.string().trim().max(1e3).nullable().optional(),
    is_active: z22.boolean().optional()
  }).strip(),
  purchase: z22.object({
    supplier_id: z22.string().uuid().nullable().optional(),
    site_id: z22.string().uuid().optional(),
    invoice_reference: z22.string().trim().max(120).optional(),
    purchase_date: z22.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date attendue au format AAAA-MM-JJ.").optional(),
    payment_method: z22.enum(["cash", "orange_money", "mtn_momo", "moov_money", "wave", "other"]),
    cash_session_id: z22.string().uuid().optional(),
    items: z22.array(
      z22.object({
        product_id: z22.string().uuid(),
        received_milli: receivedMilli,
        unit_cost_cents: unitCost
      }).strip()
    ).min(1).max(50)
  }).strip(),
  cancel: z22.object({ reason: z22.string().trim().min(3).max(500) }).strip()
};
var SUPPLIER_FIELDS = `id, name, phone, contact_name, notes, is_active, created_at`;
function lineTotalCents(receivedMilliValue, unitCostCents) {
  return Math.round(receivedMilliValue * unitCostCents / 1e3);
}
function createPurchaseRouter() {
  const r = Router20();
  r.get(
    "/suppliers",
    requirePermission("supplier:manage"),
    requireCapability("stock.manage"),
    asyncRoute(async (req, res) => {
      const t = tenant(req);
      const q = await db17().query(
        `SELECT ${SUPPLIER_FIELDS} FROM suppliers WHERE organization_id=$1::uuid ORDER BY is_active DESC, name`,
        [t.organizationId]
      );
      res.json(q.rows);
    })
  );
  r.post(
    "/suppliers",
    requirePermission("supplier:manage"),
    requireCapability("stock.manage"),
    asyncRoute(async (req, res) => {
      const t = tenant(req);
      const input = body(purchaseValidators.supplier, req.body);
      const pool2 = db17();
      const existing = await pool2.query(
        "SELECT 1 FROM suppliers WHERE organization_id=$1::uuid AND lower(name)=lower($2)",
        [t.organizationId, input.name]
      );
      if (existing.rowCount) {
        throw new HttpError(409, "duplicate_supplier", "Un fournisseur porte d\xE9j\xE0 ce nom.");
      }
      const q = await pool2.query(
        `INSERT INTO suppliers(organization_id, name, phone, contact_name, notes)
         VALUES($1,$2,$3,$4,$5) RETURNING ${SUPPLIER_FIELDS}`,
        [t.organizationId, input.name, input.phone || null, input.contact_name || null, input.notes || null]
      );
      await pool2.query(
        "INSERT INTO audit_logs(organization_id, actor_user_id, action, entity_type, entity_id) VALUES($1,$2,'supplier.created','supplier',$3)",
        [t.organizationId, t.userId, q.rows[0].id]
      );
      res.status(201).json(q.rows[0]);
    })
  );
  r.patch(
    "/suppliers/:id",
    requirePermission("supplier:manage"),
    requireCapability("stock.manage"),
    asyncRoute(async (req, res) => {
      const t = tenant(req);
      const id = parseId(req.params.id);
      const input = body(purchaseValidators.supplierUpdate, req.body);
      const pool2 = db17();
      const current = await pool2.query("SELECT id FROM suppliers WHERE id=$1::uuid AND organization_id=$2::uuid", [
        id,
        t.organizationId
      ]);
      if (!current.rowCount) throw new HttpError(404, "supplier_not_found", "Fournisseur introuvable.");
      if (input.name !== void 0) {
        const clash = await pool2.query(
          "SELECT 1 FROM suppliers WHERE organization_id=$1::uuid AND lower(name)=lower($2) AND id<>$3::uuid",
          [t.organizationId, input.name, id]
        );
        if (clash.rowCount) throw new HttpError(409, "duplicate_supplier", "Un fournisseur porte d\xE9j\xE0 ce nom.");
      }
      const q = await pool2.query(
        `UPDATE suppliers SET
           name = COALESCE($3, name),
           phone = CASE WHEN $4::boolean THEN $5 ELSE phone END,
           contact_name = CASE WHEN $6::boolean THEN $7 ELSE contact_name END,
           notes = CASE WHEN $8::boolean THEN $9 ELSE notes END,
           is_active = COALESCE($10, is_active),
           updated_at = now()
         WHERE id=$1::uuid AND organization_id=$2::uuid
         RETURNING ${SUPPLIER_FIELDS}`,
        [
          id,
          t.organizationId,
          input.name ?? null,
          input.phone !== void 0,
          input.phone ?? null,
          input.contact_name !== void 0,
          input.contact_name ?? null,
          input.notes !== void 0,
          input.notes ?? null,
          input.is_active ?? null
        ]
      );
      res.json(q.rows[0]);
    })
  );
  r.get(
    "/purchases",
    requirePermission("purchase:manage"),
    requireCapability("stock.manage"),
    asyncRoute(async (req, res) => {
      const t = tenant(req);
      const q = await db17().query(
        `SELECT pu.id, pu.reference, pu.invoice_reference, pu.purchase_date, pu.total_cents,
                pu.payment_method, pu.status, pu.cancelled_at, pu.cancellation_reason, pu.created_at,
                pu.supplier_id, s.name AS supplier_name,
                u.first_name, u.last_name,
                (SELECT count(*) FROM purchase_items pi WHERE pi.purchase_id = pu.id) AS line_count
         FROM purchases pu
         LEFT JOIN suppliers s ON s.id = pu.supplier_id AND s.organization_id = pu.organization_id
         LEFT JOIN users u ON u.id = pu.created_by
         WHERE pu.organization_id=$1::uuid
         ORDER BY pu.purchase_date DESC, pu.created_at DESC LIMIT 200`,
        [t.organizationId]
      );
      res.json(q.rows);
    })
  );
  r.get(
    "/purchases/:id",
    requirePermission("purchase:manage"),
    requireCapability("stock.manage"),
    asyncRoute(async (req, res) => {
      const t = tenant(req);
      const id = parseId(req.params.id);
      const pool2 = db17();
      const q = await pool2.query(
        `SELECT pu.id, pu.reference, pu.invoice_reference, pu.purchase_date, pu.total_cents,
                pu.payment_method, pu.status, pu.cancelled_at, pu.cancellation_reason, pu.created_at,
                pu.site_id, pu.supplier_id, s.name AS supplier_name,
                u.first_name, u.last_name
         FROM purchases pu
         LEFT JOIN suppliers s ON s.id = pu.supplier_id AND s.organization_id = pu.organization_id
         LEFT JOIN users u ON u.id = pu.created_by
         WHERE pu.id=$1::uuid AND pu.organization_id=$2::uuid`,
        [id, t.organizationId]
      );
      if (!q.rowCount) throw new HttpError(404, "purchase_not_found", "Achat introuvable.");
      const items = await pool2.query(
        `SELECT pi.id, pi.product_id, pi.product_name_snapshot, pi.received_milli, pi.unit_cost_cents,
                p.unit
         FROM purchase_items pi
         LEFT JOIN products p ON p.id = pi.product_id
         WHERE pi.purchase_id=$1::uuid AND pi.organization_id=$2::uuid
         ORDER BY pi.created_at, pi.product_name_snapshot`,
        [id, t.organizationId]
      );
      res.json({ purchase: q.rows[0], items: items.rows });
    })
  );
  r.post(
    "/purchases",
    requirePermission("purchase:manage"),
    requireCapability("stock.manage"),
    asyncRoute(async (req, res) => {
      const t = tenant(req);
      const input = body(purchaseValidators.purchase, req.body);
      const pool2 = db17();
      const ids = input.items.map((item) => item.product_id);
      if (new Set(ids).size !== ids.length) {
        throw new HttpError(400, "duplicate_product", "Un m\xEAme produit figure deux fois. Regroupez-le sur une seule ligne.");
      }
      const total = input.items.reduce((sum, item) => sum + lineTotalCents(item.received_milli, item.unit_cost_cents), 0);
      if (total > TOTAL_MAX_CENTS) {
        throw new HttpError(400, "amount_too_large", "Le montant total de cet achat d\xE9passe la limite autoris\xE9e.");
      }
      await withIdempotency(pool2, req, res, t.organizationId, fingerprint({ op: "purchase", ...input }), async () => {
        const client = await pool2.connect();
        try {
          await client.query("BEGIN");
          let siteId = input.site_id ?? null;
          if (siteId) {
            const siteQ = await client.query("SELECT 1 FROM sites WHERE id=$1::uuid AND organization_id=$2::uuid", [
              siteId,
              t.organizationId
            ]);
            if (!siteQ.rowCount) throw new HttpError(400, "invalid_site", "Station invalide.");
          }
          if (input.supplier_id) {
            const supplierQ = await client.query(
              "SELECT is_active FROM suppliers WHERE id=$1::uuid AND organization_id=$2::uuid",
              [input.supplier_id, t.organizationId]
            );
            if (!supplierQ.rowCount) throw new HttpError(404, "supplier_not_found", "Fournisseur introuvable.");
            if (!supplierQ.rows[0].is_active) {
              throw new HttpError(409, "supplier_archived", "Ce fournisseur est archiv\xE9. R\xE9activez-le pour lui rattacher un achat.");
            }
          }
          let cashSessionId = null;
          if (input.payment_method === "cash") {
            if (!input.cash_session_id) {
              throw new HttpError(400, "cash_session_required", "Une session de caisse ouverte est requise pour un achat r\xE9gl\xE9 en esp\xE8ces.");
            }
            const sessionQ = await client.query(
              "SELECT id, site_id, status FROM cash_sessions WHERE id=$1::uuid AND organization_id=$2::uuid FOR UPDATE",
              [input.cash_session_id, t.organizationId]
            );
            if (!sessionQ.rowCount || sessionQ.rows[0].status !== "open") {
              throw new HttpError(400, "cash_session_invalid", "Session de caisse introuvable ou cl\xF4tur\xE9e.");
            }
            cashSessionId = String(sessionQ.rows[0].id);
            if (!siteId) siteId = sessionQ.rows[0].site_id;
          }
          const ordered = [...input.items].sort((a, b) => a.product_id.localeCompare(b.product_id));
          const produits = /* @__PURE__ */ new Map();
          for (const item of ordered) {
            const productQ = await client.query(
              "SELECT id, name, is_active, unit_cost_cents FROM products WHERE id=$1::uuid AND organization_id=$2::uuid FOR UPDATE",
              [item.product_id, t.organizationId]
            );
            if (!productQ.rowCount) throw new HttpError(404, "product_not_found", "Produit introuvable.");
            if (!productQ.rows[0].is_active) {
              throw new HttpError(409, "product_archived", "Un produit de cet achat est archiv\xE9. R\xE9activez-le avant de l'approvisionner.");
            }
            produits.set(item.product_id, {
              name: String(productQ.rows[0].name),
              unitCostCents: Number(productQ.rows[0].unit_cost_cents)
            });
          }
          const purchaseQ = await client.query(
            `INSERT INTO purchases(organization_id, site_id, supplier_id, reference, invoice_reference,
               purchase_date, total_cents, payment_method, cash_session_id, created_by)
             VALUES($1,$2,$3,
               'ACH-' || to_char(now(),'YYYYMMDD') || '-' || upper(substr(md5(random()::text),1,6)),
               $4, COALESCE($5::date, CURRENT_DATE), $6, $7, $8, $9)
             RETURNING id, reference, purchase_date, total_cents, payment_method, status, created_at`,
            [
              t.organizationId,
              siteId,
              input.supplier_id ?? null,
              input.invoice_reference || null,
              input.purchase_date ?? null,
              total,
              input.payment_method,
              cashSessionId,
              t.userId
            ]
          );
          const purchase = purchaseQ.rows[0];
          const purchaseId = String(purchase.id);
          for (const item of input.items) {
            const nom = produits.get(item.product_id)?.name ?? "Produit";
            await client.query(
              `INSERT INTO purchase_items(organization_id, purchase_id, product_id, product_name_snapshot,
                 received_milli, unit_cost_cents)
               VALUES($1,$2,$3,$4,$5,$6)`,
              [t.organizationId, purchaseId, item.product_id, nom, item.received_milli, item.unit_cost_cents]
            );
            await client.query(
              `INSERT INTO stock_movements(organization_id, product_id, site_id, purchase_id, kind,
                 quantity_milli, unit_cost_cents, reason, created_by)
               VALUES($1,$2,$3,$4,'entry',$5,$6,'R\xE9ception d''un achat',$7)`,
              [t.organizationId, item.product_id, siteId, purchaseId, item.received_milli, item.unit_cost_cents, t.userId]
            );
            const ancienCout = produits.get(item.product_id)?.unitCostCents ?? 0;
            if (item.unit_cost_cents > 0 && item.unit_cost_cents !== ancienCout) {
              await client.query(
                "UPDATE products SET unit_cost_cents=$1, unit_cost_updated_at=now() WHERE id=$2::uuid AND organization_id=$3::uuid",
                [item.unit_cost_cents, item.product_id, t.organizationId]
              );
              await client.query(
                `INSERT INTO audit_logs(organization_id, actor_user_id, action, entity_type, entity_id, metadata)
                 VALUES($1,$2,'product.cost_changed','product',$3::text,$4::jsonb)`,
                [
                  t.organizationId,
                  t.userId,
                  item.product_id,
                  JSON.stringify({
                    from_cents: ancienCout,
                    to_cents: item.unit_cost_cents,
                    purchase_id: purchaseId,
                    purchase_reference: purchase.reference ?? null
                  })
                ]
              );
            }
          }
          let expenseId = null;
          if (total > 0) {
            const libelle = `Achat ${purchase.reference}`;
            const expenseQ = await client.query(
              `INSERT INTO expenses(organization_id, site_id, category, amount_cents, payment_method,
                 cash_session_id, description, reference, purchase_id, created_by)
               VALUES($1,$2,'supply',$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
              [
                t.organizationId,
                siteId,
                total,
                input.payment_method,
                cashSessionId,
                libelle,
                input.invoice_reference || null,
                purchaseId,
                t.userId
              ]
            );
            expenseId = String(expenseQ.rows[0].id);
            if (cashSessionId) {
              await client.query(
                `INSERT INTO cash_movements(organization_id, cash_session_id, type, amount_cents, source, description, expense_id, created_by)
                 VALUES($1,$2,'exit',$3,'expense',$4,$5,$6)`,
                [t.organizationId, cashSessionId, total, libelle, expenseId, t.userId]
              );
            }
          }
          await client.query(
            "INSERT INTO audit_logs(organization_id, actor_user_id, action, entity_type, entity_id) VALUES($1,$2,'purchase.created','purchase',$3)",
            [t.organizationId, t.userId, purchaseId]
          );
          await client.query("COMMIT");
          return { status: 201, body: { ...purchase, expense_id: expenseId } };
        } catch (error) {
          await client.query("ROLLBACK");
          throw error;
        } finally {
          client.release();
        }
      });
    })
  );
  r.post(
    "/purchases/:id/cancel",
    requirePermission("purchase:manage"),
    requireCapability("stock.manage"),
    asyncRoute(async (req, res) => {
      const t = tenant(req);
      const id = parseId(req.params.id);
      const input = body(purchaseValidators.cancel, req.body);
      const pool2 = db17();
      const client = await pool2.connect();
      try {
        await client.query("BEGIN");
        const purchaseQ = await client.query(
          "SELECT id, status, cash_session_id, reference FROM purchases WHERE id=$1::uuid AND organization_id=$2::uuid FOR UPDATE",
          [id, t.organizationId]
        );
        if (!purchaseQ.rowCount) throw new HttpError(404, "purchase_not_found", "Achat introuvable.");
        if (purchaseQ.rows[0].status === "cancelled") {
          throw new HttpError(409, "purchase_already_cancelled", "Cet achat est d\xE9j\xE0 annul\xE9.");
        }
        const purchase = purchaseQ.rows[0];
        const rendu = await reversePurchaseEntries(client, t.organizationId, id, t.userId);
        await client.query(
          "UPDATE expenses SET status='cancelled' WHERE organization_id=$1::uuid AND purchase_id=$2::uuid AND status<>'cancelled'",
          [t.organizationId, id]
        );
        let caisseRecreditee = false;
        if (purchase.cash_session_id) {
          const sessionQ = await client.query("SELECT status FROM cash_sessions WHERE id=$1::uuid AND organization_id=$2::uuid", [
            purchase.cash_session_id,
            t.organizationId
          ]);
          if (sessionQ.rowCount && sessionQ.rows[0].status === "open") {
            const montant = await client.query(
              "SELECT amount_cents FROM expenses WHERE organization_id=$1::uuid AND purchase_id=$2::uuid",
              [t.organizationId, id]
            );
            if (montant.rowCount) {
              await client.query(
                `INSERT INTO cash_movements(organization_id, cash_session_id, type, amount_cents, source, description, created_by)
                 VALUES($1,$2,'entry',$3,'adjustment',$4,$5)`,
                [
                  t.organizationId,
                  purchase.cash_session_id,
                  montant.rows[0].amount_cents,
                  `Achat ${purchase.reference} annul\xE9 : remboursement en caisse`,
                  t.userId
                ]
              );
              caisseRecreditee = true;
            }
          }
        }
        await client.query(
          `UPDATE purchases SET status='cancelled', cancelled_at=now(), cancellation_reason=$3, cancelled_by=$4
           WHERE id=$1::uuid AND organization_id=$2::uuid`,
          [id, t.organizationId, input.reason, t.userId]
        );
        await client.query(
          `INSERT INTO audit_logs(organization_id, actor_user_id, action, entity_type, entity_id, metadata)
           VALUES($1,$2,'purchase.cancelled','purchase',$3,$4)`,
          [t.organizationId, t.userId, id, JSON.stringify({ reason: input.reason, lignes_rendues: rendu })]
        );
        await client.query("COMMIT");
        res.json({
          id,
          status: "cancelled",
          reversed_lines: rendu,
          cash_refunded: caisseRecreditee
        });
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    })
  );
  return r;
}
async function reversePurchaseEntries(client, organizationId, purchaseId, userId) {
  const aContrepasser = await client.query(
    `SELECT m.id, m.product_id, m.site_id, m.quantity_milli, m.unit_cost_cents
     FROM stock_movements m
     WHERE m.organization_id=$1::uuid AND m.purchase_id=$2::uuid AND m.kind='entry'
       AND NOT EXISTS (SELECT 1 FROM stock_movements r WHERE r.reverses_movement_id = m.id)`,
    [organizationId, purchaseId]
  );
  for (const mouvement of aContrepasser.rows) {
    await client.query(
      `INSERT INTO stock_movements(organization_id, product_id, site_id, purchase_id, kind, quantity_milli,
         unit_cost_cents, reason, reverses_movement_id, created_by)
       VALUES($1,$2,$3,$4,'reversal',$5,$6,'Achat annul\xE9 : entr\xE9e reprise',$7,$8)`,
      [
        organizationId,
        mouvement.product_id,
        mouvement.site_id,
        purchaseId,
        -Number(mouvement.quantity_milli),
        mouvement.unit_cost_cents,
        mouvement.id,
        userId
      ]
    );
  }
  return aContrepasser.rows.length;
}

// server/attendance.ts
init_db();
init_http();
init_auth();
init_entitlements();
import { Router as Router21 } from "express";
import { z as z23 } from "zod";

// server/attendance-rules.ts
var ATTENDANCE_STATUSES = [
  "present",
  "absent_declared",
  "absent_justified",
  "absent_unjustified",
  "leave"
];
function evaluateLateness(checkInMinute, schedule) {
  if (checkInMinute === null || schedule === null) {
    return { late: false, lateMinutes: null, unknown: true };
  }
  const limite = schedule.startMinute + schedule.lateToleranceMinutes;
  if (checkInMinute <= limite) return { late: false, lateMinutes: 0, unknown: false };
  return { late: true, lateMinutes: checkInMinute - schedule.startMinute, unknown: false };
}
function workedMinutes(checkInMinute, checkOutMinute, recordedBreakMinutes) {
  if (checkInMinute === null || checkOutMinute === null) return null;
  const brut = checkOutMinute - checkInMinute;
  if (brut < 0) return null;
  const pause = recordedBreakMinutes ?? 0;
  return Math.max(0, brut - pause);
}
function isCoherent(checkInMinute, checkOutMinute) {
  if (checkInMinute === null || checkOutMinute === null) return true;
  return checkOutMinute >= checkInMinute;
}
function dayState(record, schedule) {
  if (record === null) return "not_recorded";
  if (record.status !== "present") return record.status;
  if (record.checkInMinute === null) return "incomplete";
  if (record.checkOutMinute !== null) return "left";
  return evaluateLateness(record.checkInMinute, schedule).late ? "late" : "present";
}
function shareMilli(participantCount) {
  if (participantCount <= 0) return 0;
  return Math.round(1e3 / participantCount);
}
function perPresentDay(shareMilliTotal, presentDays) {
  if (presentDays <= 0) return null;
  return Math.round(shareMilliTotal / presentDays);
}
function perWorkedHour(shareMilliTotal, workedMinutesTotal) {
  if (workedMinutesTotal === null || workedMinutesTotal <= 0) return null;
  return Math.round(shareMilliTotal * 60 / workedMinutesTotal);
}
function resolveSchedule(rows, workerId, siteId, isoDate2, dayOfWeek) {
  let meilleur = null;
  for (const row of rows) {
    if (row.validFrom > isoDate2) continue;
    if (row.validTo !== null && row.validTo < isoDate2) continue;
    if (row.workerId !== null && row.workerId !== workerId) continue;
    if (row.workerId === null && row.siteId !== null && row.siteId !== siteId) continue;
    if (row.specificDate !== null && row.specificDate !== isoDate2) continue;
    if (row.specificDate === null && row.dayOfWeek !== null && row.dayOfWeek !== dayOfWeek) continue;
    const score = (row.workerId !== null ? 100 : 0) + (row.specificDate !== null ? 10 : 0) + (row.dayOfWeek !== null ? 1 : 0);
    if (meilleur === null || score > meilleur.score) meilleur = { score, row };
  }
  if (meilleur === null) return null;
  const { startMinute, endMinute, lateToleranceMinutes, breakDurationMinutes } = meilleur.row;
  return { startMinute, endMinute, lateToleranceMinutes, breakDurationMinutes };
}

// server/attendance.ts
function db18() {
  const pool2 = getPool();
  if (!pool2) throw new HttpError(503, "database_not_configured", "Base de donn\xE9es indisponible.");
  return pool2;
}
var isoDate = z23.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date attendue au format AAAA-MM-JJ.");
var minuteOfDaySchema = z23.number().int().min(0).max(1439);
var attendanceValidators = {
  schedule: z23.object({
    site_id: z23.string().uuid().nullable().optional(),
    worker_id: z23.string().uuid().nullable().optional(),
    day_of_week: z23.number().int().min(0).max(6).nullable().optional(),
    specific_date: isoDate.nullable().optional(),
    start_minute: minuteOfDaySchema,
    end_minute: minuteOfDaySchema,
    break_duration_minutes: z23.number().int().min(0).max(600).default(0),
    late_tolerance_minutes: z23.number().int().min(0).max(240).default(15),
    valid_from: isoDate.optional(),
    valid_to: isoDate.nullable().optional()
  }).strip(),
  checkIn: z23.object({
    worker_id: z23.string().uuid(),
    work_date: isoDate.optional(),
    at: z23.string().datetime().optional()
  }).strip(),
  checkOut: z23.object({
    worker_id: z23.string().uuid(),
    work_date: isoDate.optional(),
    at: z23.string().datetime().optional(),
    break_minutes: z23.number().int().min(0).max(600).optional()
  }).strip(),
  absence: z23.object({
    worker_id: z23.string().uuid(),
    work_date: isoDate.optional(),
    // On ne peut *déclarer* qu'une absence ou un congé. Qualifier une
    // absence de justifiée ou non justifiée est une décision, pas une
    // saisie : elle passe par la correction, qui exige un motif et laisse
    // une trace nominative.
    status: z23.enum(["absent_declared", "leave"]),
    reason: z23.string().trim().max(500).optional()
  }).strip(),
  correction: z23.object({
    status: z23.enum(ATTENDANCE_STATUSES).optional(),
    check_in_at: z23.string().datetime().nullable().optional(),
    check_out_at: z23.string().datetime().nullable().optional(),
    break_minutes: z23.number().int().min(0).max(600).nullable().optional(),
    absence_reason: z23.string().trim().max(500).nullable().optional(),
    reason: z23.string().trim().min(3).max(500)
  }).strip()
};
function minuteFrom(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}
function isoFrom(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
function dateKey(value) {
  const d = value instanceof Date ? value : new Date(value);
  return d.toISOString().slice(0, 10);
}
function today() {
  return (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
}
async function loadSchedules(pool2, organizationId) {
  const q = await pool2.query(
    `SELECT site_id, worker_id, day_of_week, specific_date, start_minute, end_minute,
            break_duration_minutes, late_tolerance_minutes, valid_from, valid_to
     FROM work_schedules WHERE organization_id=$1::uuid`,
    [organizationId]
  );
  return q.rows.map((r) => ({
    siteId: r.site_id === null ? null : String(r.site_id),
    workerId: r.worker_id === null ? null : String(r.worker_id),
    dayOfWeek: r.day_of_week === null ? null : Number(r.day_of_week),
    specificDate: r.specific_date === null ? null : dateKey(r.specific_date),
    startMinute: Number(r.start_minute),
    endMinute: Number(r.end_minute),
    breakDurationMinutes: Number(r.break_duration_minutes),
    lateToleranceMinutes: Number(r.late_tolerance_minutes),
    validFrom: dateKey(r.valid_from),
    validTo: r.valid_to === null ? null : dateKey(r.valid_to)
  }));
}
async function assertWorker(pool2, organizationId, workerId) {
  const q = await pool2.query(
    "SELECT id, site_id, status FROM workers WHERE id=$1::uuid AND organization_id=$2::uuid",
    [workerId, organizationId]
  );
  if (!q.rowCount) throw new HttpError(404, "worker_not_found", "Laveur introuvable.");
  return q.rows[0];
}
function createAttendanceRouter() {
  const r = Router21();
  r.get(
    "/work-schedules",
    requirePermission("attendance:read"),
    requireCapability("team.tracking"),
    asyncRoute(async (req, res) => {
      const t = tenant(req);
      const q = await db18().query(
        `SELECT s.id, s.site_id, s.worker_id, s.day_of_week, s.specific_date, s.start_minute, s.end_minute,
                s.break_duration_minutes, s.late_tolerance_minutes, s.valid_from, s.valid_to,
                w.first_name, w.last_name
         FROM work_schedules s
         LEFT JOIN workers w ON w.id = s.worker_id AND w.organization_id = s.organization_id
         WHERE s.organization_id=$1::uuid
         ORDER BY s.worker_id NULLS FIRST, s.day_of_week NULLS FIRST`,
        [t.organizationId]
      );
      res.json(q.rows);
    })
  );
  r.post(
    "/work-schedules",
    requirePermission("attendance:correct"),
    requireCapability("team.tracking"),
    asyncRoute(async (req, res) => {
      const t = tenant(req);
      const input = body(attendanceValidators.schedule, req.body);
      const pool2 = db18();
      if (input.end_minute <= input.start_minute) {
        throw new HttpError(400, "invalid_schedule", "L'heure de fin doit suivre l'heure de d\xE9but.");
      }
      if (input.worker_id) await assertWorker(pool2, t.organizationId, input.worker_id);
      if (input.site_id) {
        const site = await pool2.query("SELECT 1 FROM sites WHERE id=$1::uuid AND organization_id=$2::uuid", [
          input.site_id,
          t.organizationId
        ]);
        if (!site.rowCount) throw new HttpError(400, "invalid_site", "Station invalide.");
      }
      const q = await pool2.query(
        `INSERT INTO work_schedules(organization_id, site_id, worker_id, day_of_week, specific_date,
           start_minute, end_minute, break_duration_minutes, late_tolerance_minutes, valid_from, valid_to, created_by)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,COALESCE($10::date, CURRENT_DATE),$11,$12)
         RETURNING id, site_id, worker_id, day_of_week, specific_date, start_minute, end_minute,
                   break_duration_minutes, late_tolerance_minutes, valid_from, valid_to`,
        [
          t.organizationId,
          input.site_id ?? null,
          input.worker_id ?? null,
          input.day_of_week ?? null,
          input.specific_date ?? null,
          input.start_minute,
          input.end_minute,
          input.break_duration_minutes,
          input.late_tolerance_minutes,
          input.valid_from ?? null,
          input.valid_to ?? null,
          t.userId
        ]
      );
      await pool2.query(
        "INSERT INTO audit_logs(organization_id, actor_user_id, action, entity_type, entity_id) VALUES($1,$2,'schedule.created','work_schedule',$3)",
        [t.organizationId, t.userId, q.rows[0].id]
      );
      res.status(201).json(q.rows[0]);
    })
  );
  r.delete(
    "/work-schedules/:id",
    requirePermission("attendance:correct"),
    requireCapability("team.tracking"),
    asyncRoute(async (req, res) => {
      const t = tenant(req);
      const id = parseId(req.params.id);
      const pool2 = db18();
      const q = await pool2.query("DELETE FROM work_schedules WHERE id=$1::uuid AND organization_id=$2::uuid RETURNING id", [
        id,
        t.organizationId
      ]);
      if (!q.rowCount) throw new HttpError(404, "schedule_not_found", "Horaire introuvable.");
      await pool2.query(
        "INSERT INTO audit_logs(organization_id, actor_user_id, action, entity_type, entity_id) VALUES($1,$2,'schedule.deleted','work_schedule',$3)",
        [t.organizationId, t.userId, id]
      );
      res.json({ id, deleted: true });
    })
  );
  r.get(
    "/attendance",
    requirePermission("attendance:read"),
    requireCapability("team.tracking"),
    asyncRoute(async (req, res) => {
      const t = tenant(req);
      const date = typeof req.query.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(req.query.date) ? req.query.date : today();
      const pool2 = db18();
      const [workersQ, schedules] = await Promise.all([
        pool2.query(
          `SELECT w.id, w.first_name, w.last_name, w.site_id, w.role, w.custom_role, w.status AS worker_status,
                  a.id AS record_id, a.check_in_at, a.check_out_at, a.break_minutes, a.status AS record_status,
                  a.absence_reason, a.comment, a.corrected_at, a.correction_reason,
                  cu.first_name AS corrected_by_first_name, cu.last_name AS corrected_by_last_name
           FROM workers w
           LEFT JOIN attendance_records a
             ON a.worker_id = w.id AND a.work_date = $2::date AND a.organization_id = w.organization_id
           LEFT JOIN users cu ON cu.id = a.corrected_by
           WHERE w.organization_id=$1::uuid AND w.status <> 'inactive'
           ORDER BY w.first_name, w.last_name`,
          [t.organizationId, date]
        ),
        loadSchedules(pool2, t.organizationId)
      ]);
      const dow = (/* @__PURE__ */ new Date(`${date}T00:00:00Z`)).getUTCDay();
      const lignes = workersQ.rows.map((row) => {
        const siteId = row.site_id === null ? null : String(row.site_id);
        const schedule = resolveSchedule(schedules, String(row.id), siteId, date, dow);
        const checkInMinute = minuteFrom(row.check_in_at);
        const checkOutMinute = minuteFrom(row.check_out_at);
        const record = row.record_id ? { status: row.record_status, checkInMinute, checkOutMinute } : null;
        const retard = evaluateLateness(checkInMinute, schedule);
        return {
          worker_id: String(row.id),
          first_name: row.first_name,
          last_name: row.last_name,
          site_id: siteId,
          role: row.custom_role || row.role,
          worker_status: row.worker_status,
          record_id: row.record_id ? String(row.record_id) : null,
          check_in_at: isoFrom(row.check_in_at),
          check_out_at: isoFrom(row.check_out_at),
          break_minutes: row.break_minutes === null ? null : Number(row.break_minutes),
          absence_reason: row.absence_reason,
          comment: row.comment,
          corrected_at: isoFrom(row.corrected_at),
          correction_reason: row.correction_reason,
          corrected_by: row.corrected_by_first_name === null ? null : `${row.corrected_by_first_name} ${row.corrected_by_last_name ?? ""}`.trim(),
          // L'état affiché, calculé par le cœur de règles. `not_recorded` n'est
          // pas une absence : il dit que personne n'a rien saisi.
          state: dayState(record, schedule),
          /** `null` quand aucun horaire ne s'applique : il n'y a alors pas de retard possible. */
          late_minutes: retard.unknown ? null : retard.lateMinutes,
          scheduled_start_minute: schedule?.startMinute ?? null,
          scheduled_end_minute: schedule?.endMinute ?? null,
          worked_minutes: workedMinutes(checkInMinute, checkOutMinute, row.break_minutes === null ? null : Number(row.break_minutes))
        };
      });
      const compte = (etat) => lignes.filter((l) => l.state === etat).length;
      res.json({
        date,
        workers: lignes,
        summary: {
          expected: lignes.length,
          present: compte("present") + compte("late") + compte("left"),
          late: compte("late"),
          left: compte("left"),
          absent_declared: compte("absent_declared"),
          absent_justified: compte("absent_justified"),
          absent_unjustified: compte("absent_unjustified"),
          leave: compte("leave"),
          // Comptés à part, et jamais rangés parmi les absents : un trou dans
          // la saisie n'est pas une information sur la personne.
          not_recorded: compte("not_recorded"),
          incomplete: compte("incomplete"),
          /** Vrai quand aucun horaire n'est configuré : l'écran doit alors taire la notion de retard. */
          no_schedule: lignes.every((l) => l.scheduled_start_minute === null)
        }
      });
    })
  );
  r.post(
    "/attendance/check-in",
    requirePermission("attendance:manage"),
    requireCapability("team.tracking"),
    asyncRoute(async (req, res) => {
      const t = tenant(req);
      const input = body(attendanceValidators.checkIn, req.body);
      const pool2 = db18();
      const worker = await assertWorker(pool2, t.organizationId, input.worker_id);
      if (worker.status !== "active") {
        throw new HttpError(409, "worker_inactive", "Ce laveur n'est pas en service. R\xE9activez sa fiche pour le pointer.");
      }
      const workDate = input.work_date ?? today();
      const at = input.at ?? (/* @__PURE__ */ new Date()).toISOString();
      const existing = await pool2.query(
        "SELECT id, check_in_at, status FROM attendance_records WHERE worker_id=$1::uuid AND work_date=$2::date",
        [input.worker_id, workDate]
      );
      if (existing.rowCount) {
        const row = existing.rows[0];
        if (row.check_in_at) {
          throw new HttpError(409, "already_checked_in", "Ce laveur est d\xE9j\xE0 point\xE9 pour cette journ\xE9e.");
        }
        throw new HttpError(
          409,
          "absence_recorded",
          "Une absence est d\xE9j\xE0 enregistr\xE9e pour ce laveur aujourd'hui. Corrigez-la pour enregistrer son arriv\xE9e."
        );
      }
      const q = await pool2.query(
        `INSERT INTO attendance_records(organization_id, site_id, worker_id, work_date, check_in_at, status, recorded_by)
         VALUES($1,$2,$3,$4::date,$5::timestamptz,'present',$6)
         RETURNING id, worker_id, work_date, check_in_at, check_out_at, status`,
        [t.organizationId, worker.site_id, input.worker_id, workDate, at, t.userId]
      );
      res.status(201).json(q.rows[0]);
    })
  );
  r.post(
    "/attendance/check-out",
    requirePermission("attendance:manage"),
    requireCapability("team.tracking"),
    asyncRoute(async (req, res) => {
      const t = tenant(req);
      const input = body(attendanceValidators.checkOut, req.body);
      const pool2 = db18();
      await assertWorker(pool2, t.organizationId, input.worker_id);
      const workDate = input.work_date ?? today();
      const at = input.at ?? (/* @__PURE__ */ new Date()).toISOString();
      const existing = await pool2.query(
        `SELECT id, check_in_at, check_out_at FROM attendance_records
         WHERE worker_id=$1::uuid AND work_date=$2::date AND organization_id=$3::uuid`,
        [input.worker_id, workDate, t.organizationId]
      );
      if (!existing.rowCount) {
        throw new HttpError(409, "not_checked_in", "Ce laveur n'a pas point\xE9 son arriv\xE9e : il n'y a pas de d\xE9part \xE0 enregistrer.");
      }
      const row = existing.rows[0];
      if (row.check_out_at) throw new HttpError(409, "already_checked_out", "Le d\xE9part est d\xE9j\xE0 enregistr\xE9.");
      if (!row.check_in_at) {
        throw new HttpError(409, "not_checked_in", "Ce laveur n'a pas point\xE9 son arriv\xE9e : il n'y a pas de d\xE9part \xE0 enregistrer.");
      }
      if (!isCoherent(minuteFrom(row.check_in_at), minuteFrom(at))) {
        throw new HttpError(400, "incoherent_times", "L'heure de d\xE9part pr\xE9c\xE8de l'heure d'arriv\xE9e.");
      }
      const q = await pool2.query(
        `UPDATE attendance_records SET check_out_at=$2::timestamptz,
           break_minutes = COALESCE($3, break_minutes), updated_at=now()
         WHERE id=$1::uuid
         RETURNING id, worker_id, work_date, check_in_at, check_out_at, break_minutes, status`,
        [row.id, at, input.break_minutes ?? null]
      );
      res.json(q.rows[0]);
    })
  );
  r.post(
    "/attendance/absence",
    requirePermission("attendance:manage"),
    requireCapability("team.tracking"),
    asyncRoute(async (req, res) => {
      const t = tenant(req);
      const input = body(attendanceValidators.absence, req.body);
      const pool2 = db18();
      const worker = await assertWorker(pool2, t.organizationId, input.worker_id);
      const workDate = input.work_date ?? today();
      const existing = await pool2.query(
        "SELECT id FROM attendance_records WHERE worker_id=$1::uuid AND work_date=$2::date",
        [input.worker_id, workDate]
      );
      if (existing.rowCount) {
        throw new HttpError(409, "attendance_already_recorded", "Un relev\xE9 existe d\xE9j\xE0 pour ce laveur ce jour-l\xE0. Corrigez-le plut\xF4t.");
      }
      const q = await pool2.query(
        `INSERT INTO attendance_records(organization_id, site_id, worker_id, work_date, status, absence_reason, recorded_by)
         VALUES($1,$2,$3,$4::date,$5,$6,$7)
         RETURNING id, worker_id, work_date, status, absence_reason`,
        [t.organizationId, worker.site_id, input.worker_id, workDate, input.status, input.reason || null, t.userId]
      );
      await pool2.query(
        "INSERT INTO audit_logs(organization_id, actor_user_id, action, entity_type, entity_id, metadata) VALUES($1,$2,'attendance.absence','attendance_record',$3,$4)",
        [t.organizationId, t.userId, q.rows[0].id, JSON.stringify({ status: input.status, work_date: workDate })]
      );
      res.status(201).json(q.rows[0]);
    })
  );
  r.patch(
    "/attendance/:id",
    requirePermission("attendance:correct"),
    requireCapability("team.tracking"),
    asyncRoute(async (req, res) => {
      const t = tenant(req);
      const id = parseId(req.params.id);
      const input = body(attendanceValidators.correction, req.body);
      const pool2 = db18();
      const existing = await pool2.query(
        "SELECT * FROM attendance_records WHERE id=$1::uuid AND organization_id=$2::uuid",
        [id, t.organizationId]
      );
      if (!existing.rowCount) throw new HttpError(404, "attendance_not_found", "Relev\xE9 de pr\xE9sence introuvable.");
      const avant = existing.rows[0];
      const nouveauIn = input.check_in_at === void 0 ? avant.check_in_at : input.check_in_at;
      const nouveauOut = input.check_out_at === void 0 ? avant.check_out_at : input.check_out_at;
      if (!isCoherent(minuteFrom(nouveauIn), minuteFrom(nouveauOut))) {
        throw new HttpError(400, "incoherent_times", "L'heure de d\xE9part pr\xE9c\xE8de l'heure d'arriv\xE9e.");
      }
      const q = await pool2.query(
        `UPDATE attendance_records SET
           status = COALESCE($3, status),
           check_in_at = CASE WHEN $4::boolean THEN $5::timestamptz ELSE check_in_at END,
           check_out_at = CASE WHEN $6::boolean THEN $7::timestamptz ELSE check_out_at END,
           break_minutes = CASE WHEN $8::boolean THEN $9::smallint ELSE break_minutes END,
           absence_reason = CASE WHEN $10::boolean THEN $11 ELSE absence_reason END,
           corrected_by=$12, corrected_at=now(), correction_reason=$13, updated_at=now()
         WHERE id=$1::uuid AND organization_id=$2::uuid
         RETURNING id, worker_id, work_date, check_in_at, check_out_at, break_minutes, status,
                   absence_reason, corrected_at, correction_reason`,
        [
          id,
          t.organizationId,
          input.status ?? null,
          input.check_in_at !== void 0,
          input.check_in_at ?? null,
          input.check_out_at !== void 0,
          input.check_out_at ?? null,
          input.break_minutes !== void 0,
          input.break_minutes ?? null,
          input.absence_reason !== void 0,
          input.absence_reason ?? null,
          t.userId,
          input.reason
        ]
      );
      await pool2.query(
        `INSERT INTO audit_logs(organization_id, actor_user_id, action, entity_type, entity_id, metadata)
         VALUES($1,$2,'attendance.corrected','attendance_record',$3,$4)`,
        [
          t.organizationId,
          t.userId,
          id,
          JSON.stringify({
            reason: input.reason,
            avant: {
              status: avant.status,
              check_in_at: isoFrom(avant.check_in_at),
              check_out_at: isoFrom(avant.check_out_at),
              break_minutes: avant.break_minutes
            },
            apres: {
              status: q.rows[0].status,
              check_in_at: isoFrom(q.rows[0].check_in_at),
              check_out_at: isoFrom(q.rows[0].check_out_at),
              break_minutes: q.rows[0].break_minutes
            }
          })
        ]
      );
      res.json(q.rows[0]);
    })
  );
  r.get(
    "/attendance/history",
    requirePermission("attendance:read"),
    requireCapability("team.tracking"),
    asyncRoute(async (req, res) => {
      const t = tenant(req);
      const from = typeof req.query.from === "string" && /^\d{4}-\d{2}-\d{2}$/.test(req.query.from) ? req.query.from : today();
      const to = typeof req.query.to === "string" && /^\d{4}-\d{2}-\d{2}$/.test(req.query.to) ? req.query.to : today();
      const workerId = typeof req.query.worker_id === "string" ? parseId(req.query.worker_id) : null;
      const q = await db18().query(
        `SELECT a.id, a.worker_id, a.work_date, a.check_in_at, a.check_out_at, a.break_minutes,
                a.status, a.absence_reason, a.comment, a.corrected_at, a.correction_reason,
                w.first_name, w.last_name
         FROM attendance_records a
         JOIN workers w ON w.id = a.worker_id AND w.organization_id = a.organization_id
         WHERE a.organization_id=$1::uuid AND a.work_date BETWEEN $2::date AND $3::date
           AND ($4::uuid IS NULL OR a.worker_id = $4::uuid)
         ORDER BY a.work_date DESC, w.first_name LIMIT 500`,
        [t.organizationId, from, to, workerId]
      );
      res.json(q.rows.map((row) => ({ ...row, work_date: dateKey(row.work_date) })));
    })
  );
  r.get(
    "/team-performance",
    requirePermission("attendance:read"),
    requireCapability("team.tracking"),
    asyncRoute(async (req, res) => {
      const t = tenant(req);
      const to = typeof req.query.to === "string" && /^\d{4}-\d{2}-\d{2}$/.test(req.query.to) ? req.query.to : today();
      const from = typeof req.query.from === "string" && /^\d{4}-\d{2}-\d{2}$/.test(req.query.from) ? req.query.from : new Date((/* @__PURE__ */ new Date(`${to}T00:00:00Z`)).getTime() - 29 * 864e5).toISOString().slice(0, 10);
      const pool2 = db18();
      const [workersQ, assignQ, attendanceQ, stationQ, serieQ, schedules] = await Promise.all([
        pool2.query(
          `SELECT id, first_name, last_name, site_id, role, custom_role, status
           FROM workers WHERE organization_id=$1::uuid ORDER BY first_name, last_name`,
          [t.organizationId]
        ),
        // Les lavages annulés sont exclus : une prestation annulée n'a pas
        // été rendue, et la compter récompenserait un travail défait.
        pool2.query(
          `SELECT a.worker_id, a.wash_id, a.assignment_role,
                  (SELECT count(*) FROM wash_assignments x WHERE x.wash_id = a.wash_id)::int AS participant_count
           FROM wash_assignments a
           JOIN washes w ON w.id = a.wash_id
           WHERE w.organization_id=$1::uuid AND w.status='completed'
             AND w.created_at >= $2::date AND w.created_at < ($3::date + 1)`,
          [t.organizationId, from, to]
        ),
        pool2.query(
          `SELECT worker_id, work_date, status, check_in_at, check_out_at, break_minutes
           FROM attendance_records
           WHERE organization_id=$1::uuid AND work_date BETWEEN $2::date AND $3::date`,
          [t.organizationId, from, to]
        ),
        // Le total de la station se lit sur les lavages, JAMAIS en sommant
        // les quote-parts individuelles. C'est la seule façon de garantir
        // qu'aucun arrondi ni aucune double affectation ne le gonfle.
        pool2.query(
          `SELECT count(*)::int AS completed,
                  count(*) FILTER (WHERE NOT EXISTS (
                    SELECT 1 FROM wash_assignments a WHERE a.wash_id = w.id))::int AS unassigned
           FROM washes w
           WHERE w.organization_id=$1::uuid AND w.status='completed'
             AND w.created_at >= $2::date AND w.created_at < ($3::date + 1)`,
          [t.organizationId, from, to]
        ),
        pool2.query(
          `SELECT to_char(w.created_at,'YYYY-MM-DD') AS jour, count(*)::int AS washes
           FROM washes w
           WHERE w.organization_id=$1::uuid AND w.status='completed'
             AND w.created_at >= $2::date AND w.created_at < ($3::date + 1)
           GROUP BY 1 ORDER BY 1`,
          [t.organizationId, from, to]
        ),
        loadSchedules(pool2, t.organizationId)
      ]);
      const parWorker = /* @__PURE__ */ new Map();
      for (const row of assignQ.rows) {
        const key = String(row.worker_id);
        const courant = parWorker.get(key) ?? { participations: /* @__PURE__ */ new Set(), principal: 0, shareMilli: 0 };
        const washId = String(row.wash_id);
        if (!courant.participations.has(washId)) {
          courant.participations.add(washId);
          if (row.assignment_role === "principal") courant.principal += 1;
          courant.shareMilli += shareMilli(Number(row.participant_count));
        }
        parWorker.set(key, courant);
      }
      const presences = /* @__PURE__ */ new Map();
      for (const row of attendanceQ.rows) {
        const key = String(row.worker_id);
        const courant = presences.get(key) ?? { presentDays: 0, lateDays: 0, absences: 0, leaves: 0, workedMinutes: 0, incomplete: 0 };
        const statut = String(row.status);
        if (statut === "present") {
          courant.presentDays += 1;
          const jour = dateKey(row.work_date);
          const dow = (/* @__PURE__ */ new Date(`${jour}T00:00:00Z`)).getUTCDay();
          const worker = workersQ.rows.find((w) => String(w.id) === key);
          const schedule = resolveSchedule(
            schedules,
            key,
            worker?.site_id ? String(worker.site_id) : null,
            jour,
            dow
          );
          if (evaluateLateness(minuteFrom(row.check_in_at), schedule).late) courant.lateDays += 1;
          const minutes = workedMinutes(
            minuteFrom(row.check_in_at),
            minuteFrom(row.check_out_at),
            row.break_minutes === null ? null : Number(row.break_minutes)
          );
          if (minutes === null) courant.incomplete += 1;
          else courant.workedMinutes += minutes;
        } else if (statut === "leave") courant.leaves += 1;
        else courant.absences += 1;
        presences.set(key, courant);
      }
      const lignes = workersQ.rows.map((row) => {
        const key = String(row.id);
        const travail = parWorker.get(key);
        const presence = presences.get(key);
        const partMilli = travail?.shareMilli ?? 0;
        const minutesFiables = presence && presence.incomplete === 0 && presence.workedMinutes > 0 ? presence.workedMinutes : null;
        return {
          worker_id: key,
          first_name: row.first_name,
          last_name: row.last_name,
          role: row.custom_role || row.role,
          status: row.status,
          participations: travail?.participations.size ?? 0,
          as_principal: travail?.principal ?? 0,
          /** Quote-part du travail de la station, en millièmes de lavage. */
          share_milli: partMilli,
          present_days: presence?.presentDays ?? 0,
          late_days: presence?.lateDays ?? 0,
          absences: presence?.absences ?? 0,
          leaves: presence?.leaves ?? 0,
          worked_minutes: presence?.workedMinutes ?? 0,
          incomplete_records: presence?.incomplete ?? 0,
          per_present_day_milli: perPresentDay(partMilli, presence?.presentDays ?? 0),
          per_worked_hour_milli: perWorkedHour(partMilli, minutesFiables)
        };
      });
      res.json({
        from,
        to,
        station: {
          completed_washes: Number(stationQ.rows[0].completed),
          unassigned_washes: Number(stationQ.rows[0].unassigned),
          /** Vrai si personne n'a jamais pointé : les colonnes de temps sont alors sans objet. */
          no_attendance: attendanceQ.rowCount === 0,
          /** Vrai si aucun horaire n'est configuré : la notion de retard ne s'applique pas. */
          no_schedule: schedules.length === 0
        },
        workers: lignes,
        daily: serieQ.rows.map((row) => ({ day: String(row.jour), washes: Number(row.washes) }))
      });
    })
  );
  return r;
}

// server/admin.ts
init_http();
init_auth();
import { Router as Router23 } from "express";
import { z as z29 } from "zod";
init_entitlements();

// server/subscription-service.ts
init_http();
init_entitlements();
async function activateSubscription(pool2, input) {
  const now = input.now ?? /* @__PURE__ */ new Date();
  const planQ = await pool2.query(
    "SELECT id, code, name, price_cents FROM plans WHERE code = $1",
    [input.planCode]
  );
  if (!planQ.rowCount) throw new HttpError(404, "plan_not_found", "Forfait introuvable.");
  const plan = planQ.rows[0];
  const orgQ = await pool2.query("SELECT id FROM organizations WHERE id = $1::uuid", [
    input.organizationId
  ]);
  if (!orgQ.rowCount) throw new HttpError(404, "organization_not_found", "Station introuvable.");
  const currentQ = await pool2.query(
    "SELECT current_period_end, status FROM subscriptions WHERE organization_id = $1::uuid",
    [input.organizationId]
  );
  const current = currentQ.rows[0];
  const existingEnd = current?.current_period_end ? new Date(current.current_period_end) : null;
  const renewed = current?.status === "active" && existingEnd !== null && existingEnd.getTime() > now.getTime();
  const base = renewed && existingEnd ? existingEnd : now;
  const periodEnd = new Date(base);
  periodEnd.setMonth(periodEnd.getMonth() + input.months);
  await pool2.query(
    `INSERT INTO subscriptions(organization_id, plan_id, status, current_period_end, plan_changed_at)
     VALUES($1::uuid, $2::uuid, 'active', $3::timestamptz, now())
     ON CONFLICT (organization_id) DO UPDATE
       SET plan_id = EXCLUDED.plan_id,
           status = 'active',
           current_period_end = EXCLUDED.current_period_end,
           plan_changed_at = CASE
             WHEN subscriptions.plan_id IS DISTINCT FROM EXCLUDED.plan_id THEN now()
             ELSE subscriptions.plan_changed_at
           END,
           updated_at = now()`,
    [input.organizationId, plan.id, periodEnd.toISOString()]
  );
  await pool2.query(
    `INSERT INTO audit_logs(organization_id, actor_user_id, action, entity_type, entity_id, metadata)
     VALUES($1::uuid, $2::uuid, 'subscription.activated', 'subscription', $3::text, $4::jsonb)`,
    [
      input.organizationId,
      input.actorUserId ?? null,
      plan.id,
      JSON.stringify({
        ...input.extra ?? {},
        by: input.source === "platform_admin" ? "platform_admin" : input.source,
        source: input.source,
        plan_code: plan.code,
        plan_name: plan.name,
        price_cents: plan.price_cents,
        months: input.months,
        period_end: periodEnd.toISOString(),
        payment_reference: input.paymentReference ?? null,
        note: input.note ?? null,
        renewed
      })
    ]
  );
  const amountCents = input.amountCents ?? plan.price_cents * input.months;
  const nameQ = await pool2.query("SELECT name FROM organizations WHERE id = $1::uuid", [
    input.organizationId
  ]);
  await pool2.query(
    `INSERT INTO subscription_payments(
       organization_id, organization_name, plan_code, plan_name, amount_cents, months,
       period_start, period_end, channel, payment_reference, payment_intent_id,
       source, operator_email, actor_user_id, note, occurred_at)
     VALUES($1::uuid, $2, $3, $4, $5::bigint, $6::int,
            $7::timestamptz, $8::timestamptz, $9, $10, $11::uuid,
            $12, $13, $14::uuid, $15, $16::timestamptz)`,
    [
      input.organizationId,
      nameQ.rows[0]?.name ?? "Station supprim\xE9e",
      plan.code,
      plan.name,
      amountCents,
      input.months,
      base.toISOString(),
      periodEnd.toISOString(),
      input.channel ?? "other",
      input.paymentReference ?? null,
      input.paymentIntentId ?? null,
      input.source,
      input.operatorEmail ?? null,
      input.actorUserId ?? null,
      input.note ?? null,
      now.toISOString()
    ]
  );
  await pool2.query(
    "DELETE FROM subscription_reminders WHERE organization_id = $1::uuid AND kind LIKE 'renewal_%'",
    [input.organizationId]
  );
  invalidateSubscriptionCache(input.organizationId);
  return {
    organizationId: input.organizationId,
    planCode: plan.code,
    planName: plan.name,
    priceCents: plan.price_cents,
    periodEnd: periodEnd.toISOString(),
    months: input.months,
    renewed
  };
}

// server/revenue.ts
init_entitlements();
var REVENUE_CHANNELS = [
  "cash",
  "bank_transfer",
  "orange_money",
  "mtn_momo",
  "moov_money",
  "wave",
  "other"
];
var REVENUE_CHANNEL_LABELS = {
  cash: "Esp\xE8ces",
  bank_transfer: "Virement bancaire",
  orange_money: "Orange Money",
  mtn_momo: "MTN MoMo",
  moov_money: "Moov Money",
  wave: "Wave",
  other: "Autre"
};
var SYSCOHADA_ACCOUNTS = {
  /** 706 Services vendus · 7065 « sur internet » : un logiciel en ligne. */
  revenue: { code: "7065", label: "Services vendus sur internet" },
  /** Contrepartie de trésorerie, par canal. */
  treasury: {
    cash: { code: "571", label: "Caisse si\xE8ge social" },
    bank_transfer: { code: "521", label: "Banques locales" },
    orange_money: { code: "552", label: "Monnaie \xE9lectronique, t\xE9l\xE9phone portable" },
    mtn_momo: { code: "552", label: "Monnaie \xE9lectronique, t\xE9l\xE9phone portable" },
    moov_money: { code: "552", label: "Monnaie \xE9lectronique, t\xE9l\xE9phone portable" },
    wave: { code: "552", label: "Monnaie \xE9lectronique, t\xE9l\xE9phone portable" },
    other: { code: "571", label: "Caisse si\xE8ge social" }
  },
  /**
   * TVA collectée. Inutilisé tant que l'éditeur n'est pas assujetti : les
   * montants sont alors intégralement du produit. Déclaré ici pour que le
   * jour où la TVA s'applique, l'export ait déjà sa place prévue.
   */
  vat: { code: "4431", label: "TVA factur\xE9e sur ventes" }
};
var ROW_SELECT = `id, organization_id, organization_name, plan_code, plan_name,
  amount_cents::bigint AS amount_cents, months, period_start, period_end, channel,
  payment_reference, source, operator_email, note, reverses_id, occurred_at`;
async function listRevenue(pool2, opts = {}) {
  const conditions = [];
  const values = [];
  if (opts.from) {
    values.push(opts.from.toISOString());
    conditions.push(`occurred_at >= $${values.length}::timestamptz`);
  }
  if (opts.to) {
    values.push(opts.to.toISOString());
    conditions.push(`occurred_at < $${values.length}::timestamptz`);
  }
  if (opts.organizationId) {
    values.push(opts.organizationId);
    conditions.push(`organization_id = $${values.length}::uuid`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const limit = Math.min(Math.max(opts.limit ?? 5e3, 1), 2e4);
  const q = await pool2.query(
    `SELECT ${ROW_SELECT} FROM subscription_payments ${where}
     ORDER BY occurred_at DESC, created_at DESC LIMIT ${limit}`,
    values
  );
  return q.rows.map((r) => ({ ...r, amount_cents: Number(r.amount_cents) }));
}
function monthKey(d) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
function addMonths(d, n) {
  const out = new Date(d);
  out.setUTCMonth(out.getUTCMonth() + n);
  return out;
}
var DAY_MS2 = 864e5;
function spreadOverMonths(amountCents, periodStart2, periodEnd) {
  const out = /* @__PURE__ */ new Map();
  const totalMs = periodEnd.getTime() - periodStart2.getTime();
  if (totalMs <= 0) {
    out.set(monthKey(periodStart2), amountCents);
    return out;
  }
  const cursor = new Date(
    Date.UTC(periodStart2.getUTCFullYear(), periodStart2.getUTCMonth(), 1)
  );
  const slices = [];
  while (cursor.getTime() < periodEnd.getTime()) {
    const next = addMonths(cursor, 1);
    const sliceStart = Math.max(cursor.getTime(), periodStart2.getTime());
    const sliceEnd = Math.min(next.getTime(), periodEnd.getTime());
    if (sliceEnd > sliceStart) {
      slices.push({ key: monthKey(cursor), ms: sliceEnd - sliceStart });
    }
    cursor.setTime(next.getTime());
  }
  if (!slices.length) {
    out.set(monthKey(periodStart2), amountCents);
    return out;
  }
  let assigned = 0;
  slices.forEach((slice, i) => {
    const part = i === slices.length - 1 ? amountCents - assigned : Math.round(amountCents * slice.ms / totalMs);
    assigned += part;
    out.set(slice.key, (out.get(slice.key) ?? 0) + part);
  });
  return out;
}
async function monthlyRevenue(pool2, from, to) {
  const q = await pool2.query(
    `SELECT ${ROW_SELECT} FROM subscription_payments
     WHERE occurred_at < $2::timestamptz AND period_end > $1::timestamptz
        OR (occurred_at >= $1::timestamptz AND occurred_at < $2::timestamptz)`,
    [from.toISOString(), to.toISOString()]
  );
  const rows = q.rows.map((r) => ({ ...r, amount_cents: Number(r.amount_cents) }));
  const buckets = /* @__PURE__ */ new Map();
  const cursor = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1));
  while (cursor.getTime() < to.getTime()) {
    buckets.set(monthKey(cursor), {
      month: monthKey(cursor),
      collected_cents: 0,
      recognized_cents: 0,
      payments: 0
    });
    cursor.setTime(addMonths(cursor, 1).getTime());
  }
  for (const row of rows) {
    const occurred = new Date(row.occurred_at);
    const cashBucket = buckets.get(monthKey(occurred));
    if (cashBucket && occurred >= from && occurred < to) {
      cashBucket.collected_cents += row.amount_cents;
      cashBucket.payments += row.reverses_id ? -1 : 1;
    }
    const spread = spreadOverMonths(
      row.amount_cents,
      new Date(row.period_start),
      new Date(row.period_end)
    );
    for (const [key, part] of spread) {
      const bucket = buckets.get(key);
      if (bucket) bucket.recognized_cents += part;
    }
  }
  return [...buckets.values()].sort((a, b) => a.month.localeCompare(b.month));
}
async function deferredRevenue(pool2, now) {
  const q = await pool2.query(
    `SELECT amount_cents::bigint AS amount_cents, period_start, period_end
       FROM subscription_payments
      WHERE period_end > $1::timestamptz`,
    [now.toISOString()]
  );
  let total = 0;
  for (const raw of q.rows) {
    const row = raw;
    const amount = Number(row.amount_cents);
    const start = new Date(row.period_start).getTime();
    const end = new Date(row.period_end).getTime();
    const span = end - start;
    if (span <= 0) continue;
    const remaining = Math.min(end - now.getTime(), span);
    if (remaining <= 0) continue;
    total += Math.round(amount * remaining / span);
  }
  return total;
}
async function revenueAtRisk(pool2, now) {
  const riskQ = await pool2.query(
    `SELECT o.id AS organization_id, o.name AS organization_name,
            p.code AS plan_code, p.name AS plan_name, p.price_cents,
            s.current_period_end
     FROM organizations o
     JOIN subscriptions s ON s.organization_id = o.id
     JOIN plans p ON p.id = s.plan_id
     WHERE s.status = 'active'
       AND s.current_period_end IS NOT NULL
       AND s.current_period_end < $1::timestamptz
       AND o.deletion_requested_at IS NULL
     ORDER BY s.current_period_end ASC`,
    [now.toISOString()]
  );
  const pendingQ = await pool2.query(
    `SELECT i.reference, i.organization_id, o.name AS organization_name,
            i.plan_code, i.months, i.amount_cents, i.declared_at, i.created_at
     FROM payment_intents i JOIN organizations o ON o.id = i.organization_id
     WHERE i.status = 'pending' AND i.declared_at IS NOT NULL
     ORDER BY i.declared_at ASC`
  );
  return {
    at_risk: riskQ.rows.map((r) => {
      const end = new Date(r.current_period_end);
      return {
        ...r,
        price_cents: Number(r.price_cents),
        days_overdue: Math.max(0, Math.floor((now.getTime() - end.getTime()) / DAY_MS2)),
        days_until_read_only: Math.max(
          0,
          Math.ceil((end.getTime() + PAYMENT_GRACE_MS - now.getTime()) / DAY_MS2)
        )
      };
    }),
    pending: pendingQ.rows.map((r) => ({ ...r, amount_cents: Number(r.amount_cents) }))
  };
}
function csvCell(value) {
  if (value === null || value === void 0) return "";
  const text = String(value);
  return /[";\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
function toCsv(rows) {
  return `\uFEFF${rows.map((row) => row.map(csvCell).join(";")).join("\r\n")}\r
`;
}
var ISO_DAY = (value) => (value instanceof Date ? value : new Date(value)).toISOString().slice(0, 10);
function detailedCsv(rows) {
  const out = [
    [
      "Date d'encaissement",
      "Station",
      "Forfait",
      "Mois",
      "D\xE9but de p\xE9riode",
      "Fin de p\xE9riode",
      "Montant (FCFA)",
      "Canal",
      "R\xE9f\xE9rence",
      "Origine",
      "Op\xE9rateur",
      "Contrepassation",
      "Note"
    ]
  ];
  for (const r of rows) {
    out.push([
      ISO_DAY(r.occurred_at),
      r.organization_name,
      r.plan_name,
      r.months,
      ISO_DAY(r.period_start),
      ISO_DAY(r.period_end),
      // Les centimes sont une commodité interne ; le FCFA n'a pas de
      // subdivision en usage. On exporte des francs entiers.
      Math.round(r.amount_cents / 100),
      REVENUE_CHANNEL_LABELS[r.channel] ?? r.channel,
      r.payment_reference ?? "",
      r.source,
      r.operator_email ?? "",
      r.reverses_id ? "oui" : "",
      r.note ?? ""
    ]);
  }
  return toCsv(out);
}
function journalCsv(rows) {
  const out = [
    ["Date", "Journal", "Pi\xE8ce", "Compte", "Libell\xE9 du compte", "Libell\xE9", "D\xE9bit", "Cr\xE9dit"]
  ];
  for (const r of rows) {
    const francs = Math.round(Math.abs(r.amount_cents) / 100);
    const reversed = r.amount_cents < 0;
    const treasury = SYSCOHADA_ACCOUNTS.treasury[r.channel] ?? SYSCOHADA_ACCOUNTS.treasury.other;
    const piece = r.payment_reference || r.id.slice(0, 8).toUpperCase();
    const label = `${reversed ? "Annulation abonnement" : "Abonnement"} ${r.plan_name} - ${r.organization_name}`;
    const date = ISO_DAY(r.occurred_at);
    out.push([
      date,
      "VT",
      piece,
      treasury.code,
      treasury.label,
      label,
      reversed ? "" : francs,
      reversed ? francs : ""
    ]);
    out.push([
      date,
      "VT",
      piece,
      SYSCOHADA_ACCOUNTS.revenue.code,
      SYSCOHADA_ACCOUNTS.revenue.label,
      label,
      reversed ? francs : "",
      reversed ? "" : francs
    ]);
  }
  return toCsv(out);
}

// server/admin.ts
init_console_auth();

// server/console-operators.ts
init_auth();
init_http();
init_console_auth();
import { randomBytes as randomBytes4 } from "node:crypto";
import { Router as Router22 } from "express";
import { z as z24 } from "zod";
var OPERATOR_SELECT = `o.id, o.email, o.full_name, o.role, o.status, o.managed_by,
  o.last_login_at, o.created_at, o.updated_at,
  (SELECT count(*)::int FROM platform_operator_sessions s
    WHERE s.operator_id = o.id AND s.expires_at > now()) AS active_sessions`;
async function findOperator(pool2, id, forUpdate = false) {
  const q = await pool2.query(
    `SELECT ${OPERATOR_SELECT} FROM platform_operators o WHERE o.id = $1::uuid${forUpdate ? " FOR UPDATE OF o" : ""}`,
    [id]
  );
  return q.rows[0] ?? null;
}
function temporaryPassword() {
  return `WPC-${randomBytes4(18).toString("base64url")}`;
}
async function lockOperators(client) {
  await client.query("SELECT pg_advisory_xact_lock(hashtext('console-operators'))");
}
var reasonSchema = z24.string().trim().min(5, "Un motif d'au moins 5 caract\xE8res est obligatoire.").max(300);
function createConsoleOperatorRouter() {
  const r = Router22();
  r.get(
    "/",
    asyncRoute(async (_req, res) => {
      const q = await consoleDb().query(
        `SELECT ${OPERATOR_SELECT} FROM platform_operators o
         ORDER BY CASE o.status WHEN 'active' THEN 0 ELSE 1 END,
                  CASE o.role WHEN 'admin' THEN 0 ELSE 1 END,
                  lower(o.email)`
      );
      res.json({ operators: q.rows });
    })
  );
  r.post(
    "/",
    asyncRoute(async (req, res) => {
      const input = body(
        z24.object({
          email: z24.string().trim().toLowerCase().email().max(254),
          full_name: z24.string().trim().min(2).max(120),
          role: z24.enum(CONSOLE_OPERATOR_ROLES)
        }).strip(),
        req.body
      );
      const operator = req.operator;
      const pool2 = consoleDb();
      const client = await pool2.connect();
      const password = temporaryPassword();
      try {
        await client.query("BEGIN");
        await lockOperators(client);
        const existing = await client.query("SELECT 1 FROM platform_operators WHERE email = $1", [input.email]);
        if (existing.rowCount) {
          throw new HttpError(409, "operator_exists", "Un op\xE9rateur utilise d\xE9j\xE0 cette adresse e-mail.");
        }
        const inserted = await client.query(
          `INSERT INTO platform_operators(email, password_hash, full_name, status, role, managed_by)
           VALUES($1,$2,$3,'active',$4,'console') RETURNING id`,
          [input.email, await hashPassword(password), input.full_name, input.role]
        );
        await logConsoleAction(client, operator, "operator.created", null, null, {
          target_operator_id: inserted.rows[0].id,
          target_email: input.email,
          role: input.role
        });
        await client.query("COMMIT");
        const created = await findOperator(pool2, inserted.rows[0].id);
        res.status(201).json({ operator: created, temporary_password: password });
      } catch (error) {
        await client.query("ROLLBACK").catch(() => {
        });
        throw error;
      } finally {
        client.release();
      }
    })
  );
  r.patch(
    "/:id",
    asyncRoute(async (req, res) => {
      const id = parseId(req.params.id);
      const input = body(
        z24.object({
          full_name: z24.string().trim().min(2).max(120).optional(),
          role: z24.enum(CONSOLE_OPERATOR_ROLES).optional(),
          status: z24.enum(["active", "disabled"]).optional(),
          reason: reasonSchema.optional()
        }).strip().refine(
          (value) => value.full_name !== void 0 || value.role !== void 0 || value.status !== void 0,
          { message: "Indiquez une modification." }
        ),
        req.body
      );
      const actor = req.operator;
      const pool2 = consoleDb();
      const client = await pool2.connect();
      try {
        await client.query("BEGIN");
        await lockOperators(client);
        const target = await findOperator(client, id, true);
        if (!target) throw new HttpError(404, "operator_not_found", "Cet op\xE9rateur est introuvable.");
        const nextRole = input.role ?? target.role;
        const nextStatus = input.status ?? target.status;
        const accessChanges = nextRole !== target.role || nextStatus !== target.status;
        if (accessChanges && !input.reason) {
          throw new HttpError(400, "reason_required", "Un motif est obligatoire pour modifier un acc\xE8s.");
        }
        if (id === actor.operatorId && (nextRole !== "admin" || nextStatus !== "active")) {
          throw new HttpError(409, "self_modification", "Vous ne pouvez pas retirer votre propre acc\xE8s administrateur.");
        }
        const losesActiveAdmin = target.role === "admin" && target.status === "active" && (nextRole !== "admin" || nextStatus !== "active");
        if (losesActiveAdmin) {
          const others = await client.query(
            `SELECT count(*)::int AS count FROM platform_operators
             WHERE role = 'admin' AND status = 'active' AND id <> $1::uuid`,
            [id]
          );
          if (Number(others.rows[0]?.count ?? 0) === 0) {
            throw new HttpError(409, "last_console_admin", "La Console doit conserver au moins un administrateur actif.");
          }
        }
        await client.query(
          `UPDATE platform_operators
              SET full_name = $2, role = $3, status = $4, updated_at = now()
            WHERE id = $1::uuid`,
          [id, input.full_name ?? target.full_name, nextRole, nextStatus]
        );
        if (nextStatus === "disabled") {
          await client.query("DELETE FROM platform_operator_sessions WHERE operator_id = $1::uuid", [id]);
        }
        await logConsoleAction(client, actor, "operator.updated", null, null, {
          target_operator_id: id,
          target_email: target.email,
          before: { full_name: target.full_name, role: target.role, status: target.status },
          after: { full_name: input.full_name ?? target.full_name, role: nextRole, status: nextStatus },
          reason: input.reason ?? null
        });
        await client.query("COMMIT");
        res.json({ operator: await findOperator(pool2, id) });
      } catch (error) {
        await client.query("ROLLBACK").catch(() => {
        });
        throw error;
      } finally {
        client.release();
      }
    })
  );
  r.post(
    "/:id/reset-password",
    asyncRoute(async (req, res) => {
      const id = parseId(req.params.id);
      const input = body(z24.object({ reason: reasonSchema }).strip(), req.body);
      const actor = req.operator;
      const pool2 = consoleDb();
      const client = await pool2.connect();
      const password = temporaryPassword();
      try {
        await client.query("BEGIN");
        await lockOperators(client);
        const target = await findOperator(client, id, true);
        if (!target) throw new HttpError(404, "operator_not_found", "Cet op\xE9rateur est introuvable.");
        await client.query(
          "UPDATE platform_operators SET password_hash = $2, updated_at = now() WHERE id = $1::uuid",
          [id, await hashPassword(password)]
        );
        const revoked = await client.query("DELETE FROM platform_operator_sessions WHERE operator_id = $1::uuid", [id]);
        await logConsoleAction(client, actor, "operator.password_reset", null, null, {
          target_operator_id: id,
          target_email: target.email,
          sessions_revoked: revoked.rowCount ?? 0,
          reason: input.reason
        });
        await client.query("COMMIT");
        res.json({ operator_id: id, temporary_password: password, sessions_revoked: revoked.rowCount ?? 0 });
      } catch (error) {
        await client.query("ROLLBACK").catch(() => {
        });
        throw error;
      } finally {
        client.release();
      }
    })
  );
  r.post(
    "/:id/revoke-sessions",
    asyncRoute(async (req, res) => {
      const id = parseId(req.params.id);
      const input = body(z24.object({ reason: reasonSchema }).strip(), req.body);
      const actor = req.operator;
      const pool2 = consoleDb();
      const target = await findOperator(pool2, id);
      if (!target) throw new HttpError(404, "operator_not_found", "Cet op\xE9rateur est introuvable.");
      const revoked = await pool2.query("DELETE FROM platform_operator_sessions WHERE operator_id = $1::uuid", [id]);
      await logConsoleAction(pool2, actor, "operator.sessions_revoked", null, null, {
        target_operator_id: id,
        target_email: target.email,
        sessions_revoked: revoked.rowCount ?? 0,
        reason: input.reason
      });
      res.json({ operator_id: id, sessions_revoked: revoked.rowCount ?? 0 });
    })
  );
  return r;
}

// server/console-reconciliation.ts
init_auth();
init_http();
import { z as z25 } from "zod";
init_console_auth();

// server/reconciliation.ts
init_env();
init_auth();

// server/monitoring.ts
var BUCKET_MINUTES = 5;
var SLOW_REQUEST_MS = 2e3;
var MAX_BODY_CHARS = 4e3;
var ERROR_RETENTION_DAYS = 30;
var METRICS_RETENTION_DAYS = 90;
var SENSITIVE_KEYS = /* @__PURE__ */ new Set([
  "password",
  "passwd",
  "pwd",
  "current_password",
  "new_password",
  "password_confirmation",
  "confirm_password",
  "pin",
  "cvv",
  "card_number",
  "secret",
  "apikey",
  "authorization",
  "cookie"
]);
function isSensitiveKey(key) {
  const k = key.toLowerCase();
  if (SENSITIVE_KEYS.has(k)) return true;
  return k.includes("password") || k.includes("passwd") || k.includes("secret") || k.endsWith("token") || k.endsWith("_key");
}
var REDACTED = "[masqu\xE9]";
function redactBody(value, depth = 0) {
  if (depth > 6) return "[trop profond]";
  if (value === null || value === void 0) return value;
  if (Array.isArray(value)) {
    return value.slice(0, 50).map((item) => redactBody(item, depth + 1));
  }
  if (typeof value === "object") {
    const out = {};
    for (const [key, item] of Object.entries(value)) {
      out[key] = isSensitiveKey(key) ? REDACTED : redactBody(item, depth + 1);
    }
    return out;
  }
  if (typeof value === "string" && value.length > MAX_BODY_CHARS) {
    return `${value.slice(0, MAX_BODY_CHARS)}\u2026 [tronqu\xE9]`;
  }
  return value;
}
function prepareBody(body2) {
  if (body2 === void 0 || body2 === null) return null;
  if (typeof body2 === "object" && Object.keys(body2).length === 0) return null;
  const redacted = redactBody(body2);
  const serialized = JSON.stringify(redacted);
  if (serialized && serialized.length > MAX_BODY_CHARS) {
    return { _tronque: true, _taille: serialized.length, apercu: serialized.slice(0, MAX_BODY_CHARS) };
  }
  return redacted;
}
var UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
var REFERENCE_RE = /^[A-Z]{2}-[A-Z0-9]{6,}$/;
var LONG_OPAQUE_RE = /^[A-Za-z0-9_-]{20,}$/;
function normalizeRoute(path) {
  const clean = path.split("?")[0].replace(/\/+$/, "") || "/";
  const segments = clean.split("/").map((segment) => {
    if (!segment) return segment;
    if (UUID_RE.test(segment)) return ":id";
    if (/^\d+$/.test(segment)) return ":n";
    if (REFERENCE_RE.test(segment)) return ":ref";
    if (LONG_OPAQUE_RE.test(segment) && /\d/.test(segment)) return ":token";
    return segment;
  });
  const normalized = segments.join("/") || "/";
  return normalized.length > 120 ? `${normalized.slice(0, 120)}\u2026` : normalized;
}
function statusClass(status) {
  return `${Math.floor(status / 100)}xx`;
}
function bucketStart(date) {
  const d = new Date(date);
  d.setUTCSeconds(0, 0);
  d.setUTCMinutes(Math.floor(d.getUTCMinutes() / BUCKET_MINUTES) * BUCKET_MINUTES);
  return d;
}
async function recordRequest(pool2, observation) {
  const bucket = bucketStart(observation.at ?? /* @__PURE__ */ new Date());
  await pool2.query(
    `INSERT INTO request_metrics
       (bucket_start, method, route, status_class, requests, total_duration_ms, max_duration_ms, slow_requests)
     VALUES($1,$2,$3,$4,1,$5,$6,$7)
     ON CONFLICT (bucket_start, method, route, status_class) DO UPDATE
       SET requests = request_metrics.requests + 1,
           total_duration_ms = request_metrics.total_duration_ms + EXCLUDED.total_duration_ms,
           max_duration_ms = greatest(request_metrics.max_duration_ms, EXCLUDED.max_duration_ms),
           slow_requests = request_metrics.slow_requests + EXCLUDED.slow_requests`,
    [
      bucket,
      observation.method,
      observation.route,
      statusClass(observation.status),
      Math.round(observation.durationMs),
      Math.round(observation.durationMs),
      observation.durationMs >= SLOW_REQUEST_MS ? 1 : 0
    ]
  );
}
async function recordErrorEvent(pool2, observation) {
  await pool2.query(
    `INSERT INTO error_events
       (kind, method, route, path, status, code, message, stack, duration_ms,
        organization_id, user_id, operator_email, request_body)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::uuid,$11::uuid,$12,$13::jsonb)`,
    [
      observation.kind ?? "error",
      observation.method,
      observation.route,
      observation.path.slice(0, 300),
      observation.status,
      observation.code,
      observation.message.slice(0, 1e3),
      observation.stack ? observation.stack.slice(0, 4e3) : null,
      Math.round(observation.durationMs),
      observation.organizationId ?? null,
      observation.userId ?? null,
      observation.operatorEmail ?? null,
      JSON.stringify(prepareBody(observation.body))
    ]
  );
}
async function monitoringOverview(pool2, options = {}) {
  const hours = Math.min(Math.max(options.hours ?? 24, 1), 24 * 30);
  const totals = await pool2.query(
    `SELECT coalesce(sum(requests),0)::bigint AS requests,
            coalesce(sum(requests) FILTER (WHERE status_class = '5xx'),0)::bigint AS server_errors,
            coalesce(sum(requests) FILTER (WHERE status_class = '4xx'),0)::bigint AS client_errors,
            coalesce(sum(slow_requests),0)::bigint AS slow,
            coalesce(sum(total_duration_ms),0)::bigint AS total_duration_ms,
            coalesce(max(max_duration_ms),0)::int AS max_duration_ms
       FROM request_metrics
      WHERE bucket_start >= now() - make_interval(hours => $1)`,
    [hours]
  );
  const series = await pool2.query(
    `SELECT bucket_start,
            sum(requests)::int AS requests,
            coalesce(sum(requests) FILTER (WHERE status_class = '5xx'),0)::int AS errors,
            coalesce(sum(slow_requests),0)::int AS slow,
            CASE WHEN sum(requests) > 0
                 THEN round(sum(total_duration_ms)::numeric / sum(requests))::int
                 ELSE 0 END AS avg_duration_ms
       FROM request_metrics
      WHERE bucket_start >= now() - make_interval(hours => $1)
      GROUP BY bucket_start ORDER BY bucket_start ASC`,
    [hours]
  );
  const failing = await pool2.query(
    `SELECT method, route,
            sum(requests)::int AS requests,
            coalesce(sum(requests) FILTER (WHERE status_class = '5xx'),0)::int AS errors
       FROM request_metrics
      WHERE bucket_start >= now() - make_interval(hours => $1)
      GROUP BY method, route
     HAVING coalesce(sum(requests) FILTER (WHERE status_class = '5xx'),0) > 0
      ORDER BY errors DESC LIMIT 10`,
    [hours]
  );
  const slowest = await pool2.query(
    `SELECT method, route,
            sum(requests)::int AS requests,
            round(sum(total_duration_ms)::numeric / nullif(sum(requests),0))::int AS avg_duration_ms,
            max(max_duration_ms)::int AS max_duration_ms
       FROM request_metrics
      WHERE bucket_start >= now() - make_interval(hours => $1)
      GROUP BY method, route
     HAVING sum(requests) >= 5
      ORDER BY avg_duration_ms DESC NULLS LAST LIMIT 10`,
    [hours]
  );
  const row = totals.rows[0];
  const requests = Number(row.requests);
  const serverErrors = Number(row.server_errors);
  return {
    window_hours: hours,
    totals: {
      requests,
      server_errors: serverErrors,
      client_errors: Number(row.client_errors),
      slow: Number(row.slow),
      // Le chiffre qui dit si le service va bien. Arrondi à deux décimales :
      // en dessous, « 0 % » laisserait croire qu'il n'y a aucune erreur.
      error_rate: requests > 0 ? Math.round(serverErrors / requests * 1e4) / 100 : 0,
      avg_duration_ms: requests > 0 ? Math.round(Number(row.total_duration_ms) / requests) : 0,
      max_duration_ms: Number(row.max_duration_ms)
    },
    series: series.rows,
    failing_routes: failing.rows,
    slowest_routes: slowest.rows,
    server_time: (/* @__PURE__ */ new Date()).toISOString()
  };
}
async function listErrorEvents(pool2, options = {}) {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
  const values = [];
  const conditions = [];
  if (options.kind) {
    values.push(options.kind);
    conditions.push(`e.kind = $${values.length}`);
  }
  if (options.route) {
    values.push(options.route);
    conditions.push(`e.route = $${values.length}`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const q = await pool2.query(
    `SELECT e.id, e.kind, e.method, e.route, e.path, e.status, e.code, e.message,
            e.duration_ms, e.organization_id, e.user_id, e.operator_email, e.occurred_at,
            o.name AS organization_name,
            nullif(trim(coalesce(u.first_name,'') || ' ' || coalesce(u.last_name,'')), '') AS user_name,
            u.email AS user_email
       FROM error_events e
       LEFT JOIN organizations o ON o.id = e.organization_id
       LEFT JOIN users u ON u.id = e.user_id
       ${where}
      ORDER BY e.occurred_at DESC LIMIT ${limit}`,
    values
  );
  return q.rows;
}
async function getErrorEvent(pool2, id) {
  const q = await pool2.query(
    `SELECT e.*, o.name AS organization_name, u.email AS user_email
       FROM error_events e
       LEFT JOIN organizations o ON o.id = e.organization_id
       LEFT JOIN users u ON u.id = e.user_id
      WHERE e.id = $1::uuid`,
    [id]
  );
  return q.rows[0] ?? null;
}
async function errorGroups(pool2, options = {}) {
  const hours = Math.min(Math.max(options.hours ?? 24, 1), 24 * 30);
  const q = await pool2.query(
    `SELECT method, route, code, message,
            count(*)::int AS occurrences,
            count(DISTINCT organization_id)::int AS organizations,
            min(occurred_at) AS first_seen,
            max(occurred_at) AS last_seen,
            (array_agg(id ORDER BY occurred_at DESC))[1] AS latest_id
       FROM error_events
      WHERE occurred_at >= now() - make_interval(hours => $1) AND kind = 'error'
      GROUP BY method, route, code, message
      ORDER BY occurrences DESC, last_seen DESC LIMIT 50`,
    [hours]
  );
  return q.rows;
}

// server/reconciliation.ts
var SUCCESS_STATUSES = /* @__PURE__ */ new Set([
  "paid",
  "success",
  "successful",
  "succeeded",
  "complete",
  "completed",
  "accepted",
  "confirmed",
  "paye",
  "reussi",
  "valide"
]);
function normalizedKey(value) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}
function normalizedStatus(value) {
  return normalizedKey(value);
}
function normalizedReference(value) {
  if (value === null || value === void 0) return null;
  const text = String(value).trim().toUpperCase();
  return text || null;
}
function field(record, names) {
  const entries = Object.entries(record);
  for (const name of names) {
    const wanted = normalizedKey(name);
    const found = entries.find(([key]) => normalizedKey(key) === wanted);
    if (found && found[1] !== null && found[1] !== void 0 && String(found[1]).trim() !== "") return found[1];
  }
  return void 0;
}
function parseAmount(value, cents) {
  if (typeof value === "number") {
    const result2 = cents ? value : value * 100;
    if (!Number.isSafeInteger(Math.round(result2))) throw new Error("Montant invalide.");
    return Math.round(result2);
  }
  let text = String(value ?? "").trim().replace(/(?:fcfa|xof|f\.?)/gi, "").replace(/[\s\u00a0']/g, "");
  if (!text) throw new Error("Montant manquant.");
  const comma = text.lastIndexOf(",");
  const dot = text.lastIndexOf(".");
  if (comma >= 0 && dot >= 0) {
    const decimal = comma > dot ? "," : ".";
    const grouping = decimal === "," ? /\./g : /,/g;
    text = text.replace(grouping, "").replace(decimal, ".");
  } else if (comma >= 0) {
    text = /,\d{1,2}$/.test(text) ? text.replace(",", ".") : text.replace(/,/g, "");
  } else if (dot >= 0 && !/\.\d{1,2}$/.test(text)) {
    text = text.replace(/\./g, "");
  }
  const amount = Number(text);
  if (!Number.isFinite(amount)) throw new Error(`Montant illisible : ${String(value)}`);
  const result = cents ? amount : amount * 100;
  if (!Number.isSafeInteger(Math.round(result))) throw new Error("Montant trop pr\xE9cis ou trop grand.");
  return Math.round(result);
}
function parseDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}
function normalizeStatementEntry(record, lineNumber2) {
  const centsValue = field(record, ["amount_cents", "amount cents", "cents"]);
  const amountValue = centsValue ?? field(record, ["amount", "montant", "value"]);
  if (amountValue === void 0) throw new Error(`Ligne ${lineNumber2} : montant manquant.`);
  const amountCents = parseAmount(amountValue, centsValue !== void 0);
  if (amountCents <= 0) throw new Error(`Ligne ${lineNumber2} : le montant doit \xEAtre positif.`);
  const merchant = normalizedReference(field(record, [
    "merchant_reference",
    "payment_reference",
    "client_reference",
    "wp_reference",
    "reference",
    "merchant transaction id"
  ]));
  const provider = normalizedReference(field(record, [
    "provider_reference",
    "provider_transaction_id",
    "transaction_id",
    "operator_reference",
    "provider id"
  ]));
  if (!merchant && !provider) throw new Error(`Ligne ${lineNumber2} : r\xE9f\xE9rence manquante.`);
  return {
    lineNumber: lineNumber2,
    providerReference: provider,
    merchantReference: merchant,
    amountCents,
    currency: String(field(record, ["currency", "devise"]) ?? "XOF").trim().toUpperCase(),
    status: String(field(record, ["status", "state", "payment_status"]) ?? "paid").trim(),
    occurredAt: parseDate(field(record, ["paid_at", "occurred_at", "date", "created_at"])),
    raw: redactBody(record)
  };
}
function parseStatementCsv(text) {
  const clean = text.replace(/^\uFEFF/, "");
  const firstLine = clean.split(/\r?\n/, 1)[0] ?? "";
  const candidates = [";", ",", "	"];
  const delimiter = candidates.map((value) => ({ value, count: firstLine.split(value).length - 1 })).sort((a, b) => b.count - a.count)[0]?.value ?? ";";
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < clean.length; index += 1) {
    const char = clean[index];
    if (char === '"') {
      if (quoted && clean[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === delimiter && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && clean[index + 1] === "\n") index += 1;
      row.push(cell);
      if (row.some((value) => value.trim() !== "")) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  row.push(cell);
  if (row.some((value) => value.trim() !== "")) rows.push(row);
  if (quoted) throw new Error("CSV invalide : guillemet non ferm\xE9.");
  if (rows.length < 2) throw new Error("Le relev\xE9 CSV doit contenir un en-t\xEAte et au moins une ligne.");
  const headers = rows[0].map((header) => header.trim());
  if (headers.some((header) => !header)) throw new Error("Le relev\xE9 CSV contient une colonne sans nom.");
  return rows.slice(1).map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])));
}
function normalizeStatementEntries(records) {
  if (records.length === 0) throw new Error("Le relev\xE9 ne contient aucune ligne.");
  if (records.length > 2e3) throw new Error("Un lot est limit\xE9 \xE0 2 000 lignes.");
  return records.map((record, index) => normalizeStatementEntry(record, index + 2));
}
function providerChannels(provider) {
  switch (provider) {
    case "wave":
      return ["wave"];
    case "orange":
    case "orange_money":
      return ["orange_money"];
    case "mtn":
    case "mtn_momo":
      return ["mtn_momo"];
    case "moov":
    case "moov_money":
      return ["moov_money"];
    case "bank":
    case "bank_transfer":
      return ["bank_transfer"];
    case "cinetpay":
    case "paydunya":
      return ["orange_money", "mtn_momo", "moov_money", "wave"];
    default:
      return [];
  }
}
async function insertDiscrepancy(client, batchId, input) {
  await client.query(
    `INSERT INTO reconciliation_discrepancies
       (batch_id, statement_entry_id, payment_id, payment_intent_id, kind, reference,
        organization_name, expected_amount_cents, actual_amount_cents, details)
     VALUES($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5,$6,$7,$8,$9,$10)`,
    [
      batchId,
      input.entryId ?? null,
      input.paymentId ?? null,
      input.intentId ?? null,
      input.kind,
      input.reference ?? null,
      input.organizationName ?? null,
      input.expected ?? null,
      input.actual ?? null,
      input.details
    ]
  );
}
async function reconcileStatement(pool2, input) {
  if (input.periodStart >= input.periodEnd) {
    throw new HttpError(400, "invalid_period", "La p\xE9riode de rapprochement est invalide.");
  }
  const run = await pool2.query(
    "INSERT INTO reconciliation_runs(trigger_kind, status) VALUES($1,'running') RETURNING id",
    [input.triggerKind ?? "manual"]
  );
  const runId = run.rows[0].id;
  const client = await pool2.connect();
  let batchId;
  try {
    await client.query("BEGIN");
    const batch = await client.query(
      `INSERT INTO reconciliation_batches
         (provider, source_name, period_start, period_end, total_rows, created_by, created_by_email)
       VALUES($1,$2,$3::timestamptz,$4::timestamptz,$5,$6::uuid,$7) RETURNING id`,
      [
        input.provider,
        input.sourceName ?? null,
        input.periodStart.toISOString(),
        input.periodEnd.toISOString(),
        input.entries.length,
        input.actor.operatorId,
        input.actor.email
      ]
    );
    batchId = batch.rows[0].id;
    let matched = 0;
    let discrepancies = 0;
    let ignored = 0;
    const channels = providerChannels(input.provider);
    for (const entry of input.entries) {
      const inserted = await client.query(
        `INSERT INTO provider_statement_entries
           (batch_id, line_number, provider_reference, merchant_reference, amount_cents,
            currency, provider_status, occurred_at, raw)
         VALUES($1::uuid,$2,$3,$4,$5,$6,$7,$8::timestamptz,$9::jsonb) RETURNING id`,
        [
          batchId,
          entry.lineNumber,
          entry.providerReference,
          entry.merchantReference,
          entry.amountCents,
          entry.currency,
          entry.status,
          entry.occurredAt?.toISOString() ?? null,
          JSON.stringify(entry.raw)
        ]
      );
      const entryId = inserted.rows[0].id;
      if (!SUCCESS_STATUSES.has(normalizedStatus(entry.status))) {
        ignored += 1;
        continue;
      }
      const payments = await client.query(
        `SELECT p.id, p.payment_intent_id, p.organization_name, p.amount_cents,
                p.payment_reference, p.reconciled_at, p.reconciliation_batch_id
           FROM subscription_payments p
           LEFT JOIN payment_intents i ON i.id = p.payment_intent_id
          WHERE p.reverses_id IS NULL AND p.amount_cents > 0 AND (
            ($1::text IS NOT NULL AND (
              upper(p.payment_reference) = $1 OR upper(i.reference) = $1 OR upper(i.declared_reference) = $1
            )) OR
            ($2::text IS NOT NULL AND (
              upper(p.payment_reference) = $2 OR upper(i.provider_transaction_id) = $2
            ))
          )
            -- Les identifiants ne sont uniques qu'au sein d'un agr\xE9gateur :
            -- une r\xE9f\xE9rence Wave ne doit jamais marquer un paiement Orange.
            AND (cardinality($3::text[]) = 0 OR p.channel = ANY($3::text[]))
          LIMIT 3`,
        [entry.merchantReference, entry.providerReference, channels]
      );
      if (payments.rows.length > 1) {
        discrepancies += 1;
        await insertDiscrepancy(client, batchId, {
          entryId,
          kind: "duplicate_reference",
          reference: entry.merchantReference ?? entry.providerReference,
          actual: entry.amountCents,
          details: "Plusieurs encaissements du registre portent cette r\xE9f\xE9rence. Aucun n'a \xE9t\xE9 marqu\xE9 automatiquement."
        });
        continue;
      }
      const payment = payments.rows[0];
      if (payment) {
        const expected = Number(payment.amount_cents);
        if (expected !== entry.amountCents) {
          discrepancies += 1;
          await insertDiscrepancy(client, batchId, {
            entryId,
            paymentId: payment.id,
            intentId: payment.payment_intent_id,
            kind: "amount_mismatch",
            reference: entry.merchantReference ?? entry.providerReference,
            organizationName: payment.organization_name,
            expected,
            actual: entry.amountCents,
            details: "La r\xE9f\xE9rence correspond, mais le montant du relev\xE9 diff\xE8re du registre."
          });
          continue;
        }
        if (!payment.reconciled_at) {
          await client.query(
            `UPDATE subscription_payments SET reconciled_at = now(), reconciliation_batch_id = $2::uuid
             WHERE id = $1::uuid AND reconciled_at IS NULL`,
            [payment.id, batchId]
          );
        }
        matched += 1;
        continue;
      }
      const intents = await client.query(
        `SELECT i.id, i.reference, i.amount_cents, i.status, o.name AS organization_name
           FROM payment_intents i JOIN organizations o ON o.id = i.organization_id
          WHERE ($1::text IS NOT NULL AND (upper(i.reference) = $1 OR upper(i.declared_reference) = $1))
             OR ($2::text IS NOT NULL AND upper(i.provider_transaction_id) = $2)
          LIMIT 2`,
        [entry.merchantReference, entry.providerReference]
      );
      const intent = intents.rows[0];
      discrepancies += 1;
      await insertDiscrepancy(client, batchId, {
        entryId,
        intentId: intent?.id ?? null,
        kind: "missing_in_register",
        reference: entry.merchantReference ?? entry.providerReference,
        organizationName: intent?.organization_name ?? null,
        expected: intent ? Number(intent.amount_cents) : null,
        actual: entry.amountCents,
        details: intent ? `Le relev\xE9 correspond \xE0 l'intention ${intent.reference} (${intent.status}), mais aucun encaissement n'est inscrit. V\xE9rifiez puis activez manuellement si n\xE9cessaire.` : "Cette ligne pay\xE9e du relev\xE9 ne correspond \xE0 aucun encaissement ni intention du registre."
      });
    }
    if (channels.length > 0) {
      const missing = await client.query(
        `SELECT p.id, p.payment_intent_id, p.organization_name, p.amount_cents,
                p.payment_reference, p.reconciled_at, p.reconciliation_batch_id
           FROM subscription_payments p
          WHERE p.reverses_id IS NULL AND p.amount_cents > 0
            AND p.occurred_at >= $2::timestamptz AND p.occurred_at < $3::timestamptz
            AND p.channel = ANY($4::text[]) AND p.reconciled_at IS NULL
            AND NOT EXISTS (SELECT 1 FROM reconciliation_discrepancies d
              WHERE d.batch_id = $1::uuid AND d.payment_id = p.id)`,
        [batchId, input.periodStart.toISOString(), input.periodEnd.toISOString(), channels]
      );
      for (const payment of missing.rows) {
        discrepancies += 1;
        await insertDiscrepancy(client, batchId, {
          paymentId: payment.id,
          intentId: payment.payment_intent_id,
          kind: "missing_in_statement",
          reference: payment.payment_reference,
          organizationName: payment.organization_name,
          expected: Number(payment.amount_cents),
          details: "Cet encaissement du registre n'appara\xEEt pas dans le relev\xE9 pour la p\xE9riode et le canal concern\xE9s."
        });
      }
    }
    await client.query(
      `UPDATE reconciliation_batches SET status = $2, matched_rows = $3,
         discrepancy_rows = $4, ignored_rows = $5 WHERE id = $1::uuid`,
      [batchId, discrepancies > 0 ? "attention" : "matched", matched, discrepancies, ignored]
    );
    await client.query("COMMIT");
    await pool2.query(
      "UPDATE reconciliation_runs SET status = 'success', batch_id = $2::uuid, finished_at = now() WHERE id = $1::uuid",
      [runId, batchId]
    );
    return { batch_id: batchId, matched_rows: matched, discrepancy_rows: discrepancies, ignored_rows: ignored };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {
    });
    await pool2.query(
      "UPDATE reconciliation_runs SET status = 'failed', error = $2, finished_at = now() WHERE id = $1::uuid",
      [runId, error instanceof Error ? error.message.slice(0, 1e3) : "Erreur inconnue"]
    );
    throw error;
  } finally {
    client.release();
  }
}
async function listReconciliationBatches(pool2) {
  const [batches, runs] = await Promise.all([
    pool2.query(
      `SELECT b.*,
         (SELECT count(*)::int FROM reconciliation_discrepancies d
           WHERE d.batch_id = b.id AND d.status = 'open') AS open_discrepancies
       FROM reconciliation_batches b ORDER BY b.created_at DESC LIMIT 50`
    ),
    pool2.query("SELECT * FROM reconciliation_runs ORDER BY started_at DESC LIMIT 20")
  ]);
  return { batches: batches.rows, runs: runs.rows };
}
async function getReconciliationBatch(pool2, id) {
  const [batch, entries, discrepancies] = await Promise.all([
    pool2.query("SELECT * FROM reconciliation_batches WHERE id = $1::uuid", [id]),
    pool2.query(
      `SELECT id, line_number, provider_reference, merchant_reference, amount_cents,
              currency, provider_status, occurred_at FROM provider_statement_entries
       WHERE batch_id = $1::uuid ORDER BY line_number`,
      [id]
    ),
    pool2.query(
      `SELECT d.*, o.email AS resolved_by_email FROM reconciliation_discrepancies d
       LEFT JOIN platform_operators o ON o.id = d.resolved_by
       WHERE d.batch_id = $1::uuid ORDER BY d.status, d.created_at, d.id`,
      [id]
    )
  ]);
  if (!batch.rows[0]) return null;
  return { batch: batch.rows[0], entries: entries.rows, discrepancies: discrepancies.rows };
}
function reconciliationConfiguration() {
  return {
    enabled: env.RECONCILIATION_ENABLED,
    provider: env.RECONCILIATION_PROVIDER || null,
    configured: Boolean(env.RECONCILIATION_STATEMENT_URL && env.RECONCILIATION_PROVIDER),
    lookback_hours: env.RECONCILIATION_LOOKBACK_HOURS
  };
}
async function runScheduledReconciliation(pool2, options = {}) {
  if (!env.RECONCILIATION_ENABLED || !env.RECONCILIATION_STATEMENT_URL || !env.RECONCILIATION_PROVIDER) return null;
  const now = options.now ?? /* @__PURE__ */ new Date();
  const periodEnd = now;
  const periodStart2 = new Date(now.getTime() - env.RECONCILIATION_LOOKBACK_HOURS * 36e5);
  if (!options.force) {
    const recent = await pool2.query(
      `SELECT batch_id FROM reconciliation_runs
       WHERE trigger_kind = 'scheduled' AND status = 'success' AND started_at >= $1::timestamptz
       ORDER BY started_at DESC LIMIT 1`,
      [periodStart2.toISOString()]
    );
    if (recent.rows[0]) return { status: "skipped", batch_id: recent.rows[0].batch_id };
  }
  let reconciliationStarted = false;
  try {
    const url = new URL(env.RECONCILIATION_STATEMENT_URL);
    url.searchParams.set("from", periodStart2.toISOString());
    url.searchParams.set("to", periodEnd.toISOString());
    const response = await (options.fetchImpl ?? fetch)(url, {
      headers: {
        Accept: "application/json, text/csv;q=0.9",
        ...env.RECONCILIATION_STATEMENT_TOKEN ? { Authorization: `Bearer ${env.RECONCILIATION_STATEMENT_TOKEN}` } : {}
      },
      signal: AbortSignal.timeout(2e4)
    });
    if (!response.ok) throw new Error(`Le relev\xE9 distant a r\xE9pondu ${response.status}.`);
    const text = await response.text();
    let records;
    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("json") || /^\s*(?:\[|\{)/.test(text)) {
      const payload = JSON.parse(text);
      const entries = Array.isArray(payload) ? payload : payload.entries ?? payload.data;
      if (!Array.isArray(entries)) throw new Error("La r\xE9ponse JSON ne contient pas de tableau entries ou data.");
      records = entries;
    } else {
      records = parseStatementCsv(text);
    }
    reconciliationStarted = true;
    const result = await reconcileStatement(pool2, {
      provider: env.RECONCILIATION_PROVIDER,
      sourceName: url.hostname,
      periodStart: periodStart2,
      periodEnd,
      entries: normalizeStatementEntries(records),
      actor: { operatorId: null, email: "system@reconciliation" },
      triggerKind: "scheduled"
    });
    return { status: "success", ...result };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur inconnue";
    if (!reconciliationStarted) {
      await pool2.query(
        "INSERT INTO reconciliation_runs(trigger_kind, status, error, finished_at) VALUES('scheduled','failed',$1,now())",
        [message.slice(0, 1e3)]
      );
    }
    return { status: "failed", error: message };
  }
}

// server/console-reconciliation.ts
function periodBoundary(value, end) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const exact = new Date(value);
    if (Number.isNaN(exact.getTime())) throw new HttpError(400, "invalid_period", "Date de p\xE9riode invalide.");
    return exact;
  }
  const date = /* @__PURE__ */ new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) throw new HttpError(400, "invalid_period", "Date de p\xE9riode invalide.");
  if (end) date.setUTCDate(date.getUTCDate() + 1);
  return date;
}
function registerReconciliationRoutes(r) {
  r.get(
    "/reconciliation",
    asyncRoute(async (_req, res) => {
      const data = await listReconciliationBatches(adminDb());
      res.json({ ...data, configuration: reconciliationConfiguration() });
    })
  );
  r.post(
    "/reconciliation/batches",
    asyncRoute(async (req, res) => {
      const input = body(
        z25.object({
          provider: z25.string().trim().toLowerCase().min(2).max(40),
          source_name: z25.string().trim().max(200).optional(),
          from: z25.string().trim().min(10).max(40),
          to: z25.string().trim().min(10).max(40),
          entries: z25.array(z25.record(z25.string(), z25.unknown())).max(2e3).optional(),
          csv: z25.string().max(9e5).optional()
        }).strip().refine((value) => Boolean(value.entries?.length) !== Boolean(value.csv), {
          message: "Fournissez soit un tableau entries, soit un CSV."
        }),
        req.body
      );
      let entries;
      try {
        const records = input.entries ?? parseStatementCsv(input.csv);
        entries = normalizeStatementEntries(records);
      } catch (error) {
        throw new HttpError(400, "invalid_statement", error instanceof Error ? error.message : "Relev\xE9 illisible.");
      }
      const pool2 = adminDb();
      const result = await reconcileStatement(pool2, {
        provider: input.provider,
        sourceName: input.source_name ?? (input.csv ? "import.csv" : "import.json"),
        periodStart: periodBoundary(input.from, false),
        periodEnd: periodBoundary(input.to, true),
        entries,
        actor: { operatorId: req.operator.operatorId, email: req.operator.email }
      });
      await logConsoleAction(pool2, req.operator, "reconciliation.batch_imported", null, null, {
        batch_id: result.batch_id,
        provider: input.provider,
        matched_rows: result.matched_rows,
        discrepancy_rows: result.discrepancy_rows,
        ignored_rows: result.ignored_rows
      });
      res.status(201).json(result);
    })
  );
  r.post(
    "/reconciliation/run",
    asyncRoute(async (req, res) => {
      const configuration = reconciliationConfiguration();
      if (!configuration.enabled || !configuration.configured) {
        throw new HttpError(409, "reconciliation_not_configured", "Le connecteur planifi\xE9 de relev\xE9 n'est pas configur\xE9.");
      }
      const result = await runScheduledReconciliation(adminDb(), { force: true });
      await logConsoleAction(adminDb(), req.operator, "reconciliation.connector_run", null, null, {
        status: result?.status ?? "skipped",
        batch_id: result && "batch_id" in result ? result.batch_id : null
      });
      res.json(result);
    })
  );
  r.get(
    "/reconciliation/batches/:id",
    asyncRoute(async (req, res) => {
      const result = await getReconciliationBatch(adminDb(), parseId(req.params.id));
      if (!result) throw new HttpError(404, "reconciliation_not_found", "Ce lot de rapprochement est introuvable.");
      res.json(result);
    })
  );
  r.post(
    "/reconciliation/discrepancies/:id/resolve",
    asyncRoute(async (req, res) => {
      const id = parseId(req.params.id);
      const input = body(
        z25.object({ note: z25.string().trim().min(5).max(1e3) }).strip(),
        req.body
      );
      const pool2 = adminDb();
      const updated = await pool2.query(
        `UPDATE reconciliation_discrepancies SET status = 'resolved', resolution_note = $2,
           resolved_by = $3::uuid, resolved_at = now()
         WHERE id = $1::uuid AND status = 'open'
         RETURNING id, batch_id, kind, status, resolution_note, resolved_at`,
        [id, input.note, req.operator.operatorId]
      );
      if (!updated.rowCount) {
        const existing = await pool2.query("SELECT status FROM reconciliation_discrepancies WHERE id = $1::uuid", [id]);
        if (!existing.rowCount) throw new HttpError(404, "discrepancy_not_found", "Cet \xE9cart est introuvable.");
        throw new HttpError(409, "discrepancy_resolved", "Cet \xE9cart est d\xE9j\xE0 r\xE9solu.");
      }
      await logConsoleAction(pool2, req.operator, "reconciliation.discrepancy_resolved", null, null, {
        discrepancy_id: id,
        batch_id: updated.rows[0].batch_id,
        kind: updated.rows[0].kind,
        note: input.note
      });
      res.json({ discrepancy: updated.rows[0] });
    })
  );
}

// server/organization-deletion.ts
var DEFAULT_GRACE_DAYS = 30;
var PURGE_ORDER = [
  // Dépendances des lavages, qui ne portent pas d'organization_id.
  { table: "receipt_issues", where: "organization_id = $1::uuid" },
  { table: "wash_items", where: "wash_id IN (SELECT id FROM washes WHERE organization_id = $1::uuid)" },
  { table: "wash_assignments", where: "wash_id IN (SELECT id FROM washes WHERE organization_id = $1::uuid)" },
  // Puis tout ce qui porte directement l'organisation.
  // Stock : les mouvements référencent les produits, qui référencent les
  // catégories — l'ordre inverse de création est le seul qui tienne. La
  // recette des prestations vient en tête : elle pointe à la fois vers les
  // produits et vers les services.
  { table: "service_consumables", where: "organization_id = $1::uuid" },
  { table: "stock_movements", where: "organization_id = $1::uuid" },
  // Les lignes d'achat pointent vers les produits : elles partent avant eux.
  { table: "purchase_items", where: "organization_id = $1::uuid" },
  { table: "products", where: "organization_id = $1::uuid" },
  { table: "product_categories", where: "organization_id = $1::uuid" },
  { table: "cash_movements", where: "organization_id = $1::uuid" },
  { table: "payments", where: "organization_id = $1::uuid" },
  { table: "washes", where: "organization_id = $1::uuid" },
  { table: "notifications", where: "organization_id = $1::uuid" },
  { table: "expenses", where: "organization_id = $1::uuid" },
  { table: "utility_reading_photos", where: "organization_id = $1::uuid" },
  { table: "utility_readings", where: "organization_id = $1::uuid" },
  { table: "utility_meters", where: "organization_id = $1::uuid" },
  { table: "cash_sessions", where: "organization_id = $1::uuid" },
  // Les achats sont référencés par les mouvements de stock et par les
  // dépenses, tous deux déjà purgés ci-dessus. Les fournisseurs ferment la
  // marche, puisque les achats les désignent.
  { table: "purchases", where: "organization_id = $1::uuid" },
  { table: "suppliers", where: "organization_id = $1::uuid" },
  { table: "services", where: "organization_id = $1::uuid" },
  { table: "service_categories", where: "organization_id = $1::uuid" },
  { table: "vehicle_categories", where: "organization_id = $1::uuid" },
  // Présences et horaires pointent vers les laveurs : ils partent avant eux.
  { table: "attendance_records", where: "organization_id = $1::uuid" },
  { table: "work_schedules", where: "organization_id = $1::uuid" },
  { table: "workers", where: "organization_id = $1::uuid" },
  { table: "customers", where: "organization_id = $1::uuid" },
  { table: "sites", where: "organization_id = $1::uuid" },
  // Identité visuelle : une image par organisation, sans dépendance.
  { table: "organization_branding", where: "organization_id = $1::uuid" },
  { table: "onboarding_progress", where: "organization_id = $1::uuid" },
  { table: "idempotency_keys", where: "organization_id = $1::uuid" },
  { table: "member_permissions", where: "organization_id = $1::uuid" },
  { table: "subscription_reminders", where: "organization_id = $1::uuid" },
  { table: "payment_intents", where: "organization_id = $1::uuid" },
  // La demande de clôture part avec la station qu'elle visait : l'éditeur en
  // garde la trace dans son propre registre, qui survit à la purge.
  { table: "closure_requests", where: "organization_id = $1::uuid" },
  // Les corps de requete captures appartiennent au client : les conserver
  // apres sa suppression viderait la suppression de son sens.
  { table: "error_events", where: "organization_id = $1::uuid" },
  { table: "support_messages", where: "request_id IN (SELECT id FROM support_requests WHERE organization_id = $1::uuid)" },
  { table: "support_requests", where: "organization_id = $1::uuid" },
  { table: "audit_logs", where: "organization_id = $1::uuid" },
  { table: "subscriptions", where: "organization_id = $1::uuid" },
  { table: "organization_members", where: "organization_id = $1::uuid" }
];
async function scheduleDeletion(pool2, organizationId, reason, graceDays = DEFAULT_GRACE_DAYS) {
  const client = await pool2.connect();
  try {
    await client.query("BEGIN");
    const updated = await client.query(
      `UPDATE organizations
          SET deletion_requested_at = now(),
              deletion_scheduled_for = now() + make_interval(days => $2),
              deletion_reason = $3,
              updated_at = now()
        WHERE id = $1::uuid AND deletion_requested_at IS NULL
      RETURNING deletion_scheduled_for`,
      [organizationId, graceDays, reason]
    );
    if (!updated.rowCount) {
      await client.query("ROLLBACK");
      throw new Error("not_scheduled");
    }
    await client.query(
      "UPDATE subscriptions SET status = 'cancelled', updated_at = now() WHERE organization_id = $1::uuid",
      [organizationId]
    );
    await client.query(
      `DELETE FROM auth_sessions WHERE user_id IN (
         SELECT user_id FROM organization_members WHERE organization_id = $1::uuid)`,
      [organizationId]
    );
    await client.query("COMMIT");
    return { scheduled_for: updated.rows[0].deletion_scheduled_for };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {
    });
    throw error;
  } finally {
    client.release();
  }
}
async function cancelDeletion(pool2, organizationId) {
  const updated = await pool2.query(
    `UPDATE organizations
        SET deletion_requested_at = NULL, deletion_scheduled_for = NULL,
            deletion_reason = NULL, updated_at = now()
      WHERE id = $1::uuid AND deletion_requested_at IS NOT NULL
    RETURNING id`,
    [organizationId]
  );
  return updated.rowCount === 1;
}
async function purgeOrganization(pool2, organizationId) {
  const client = await pool2.connect();
  try {
    await client.query("BEGIN");
    const nameQ = await client.query("SELECT name FROM organizations WHERE id = $1::uuid FOR UPDATE", [
      organizationId
    ]);
    if (!nameQ.rowCount) {
      await client.query("ROLLBACK");
      throw new Error("not_found");
    }
    const name = nameQ.rows[0].name;
    const soleMembers = await client.query(
      `SELECT m.user_id FROM organization_members m
        WHERE m.organization_id = $1::uuid
          AND NOT EXISTS (
            SELECT 1 FROM organization_members other
             WHERE other.user_id = m.user_id AND other.organization_id <> $1::uuid)`,
      [organizationId]
    );
    const userIds = soleMembers.rows.map((row) => row.user_id);
    const deleted = {};
    for (const step of PURGE_ORDER) {
      const result = await client.query(`DELETE FROM ${step.table} WHERE ${step.where}`, [organizationId]);
      if (result.rowCount) deleted[step.table] = result.rowCount;
    }
    let usersDeleted = 0;
    if (userIds.length) {
      await client.query("DELETE FROM auth_sessions WHERE user_id = ANY($1::uuid[])", [userIds]);
      await client.query("DELETE FROM password_reset_tokens WHERE user_id = ANY($1::uuid[])", [userIds]);
      const removed = await client.query("DELETE FROM users WHERE id = ANY($1::uuid[])", [userIds]);
      usersDeleted = removed.rowCount ?? 0;
    }
    await client.query(
      "UPDATE subscription_payments SET organization_id = NULL WHERE organization_id = $1::uuid",
      [organizationId]
    );
    await client.query("DELETE FROM organizations WHERE id = $1::uuid", [organizationId]);
    await client.query("COMMIT");
    return { name, deleted, users_deleted: usersDeleted };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {
    });
    throw error;
  } finally {
    client.release();
  }
}

// server/admin.ts
init_auth();

// server/console-accounts.ts
init_http();
init_auth();
import { z as z26 } from "zod";
init_console_auth();
init_permissions();
var reasonField = z26.string().trim().min(5, "Indiquez en quelques mots la raison de cette intervention.").max(300);
async function soleOwnerOf(pool2, userId, only) {
  const q = await pool2.query(
    `SELECT o.id AS organization_id, o.name
       FROM organization_members m
       JOIN organizations o ON o.id = m.organization_id
      WHERE m.user_id = $1::uuid
        AND m.role = 'owner'
        AND m.status = 'active'
        AND ($2::uuid IS NULL OR m.organization_id = $2::uuid)
        AND o.deletion_requested_at IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM organization_members other
           WHERE other.organization_id = m.organization_id
             AND other.user_id <> m.user_id
             AND other.role = 'owner'
             AND other.status = 'active')`,
    [userId, only ?? null]
  );
  return q.rows;
}
function lastOwnerError(stations) {
  const names = stations.map((s) => s.name).join(", ");
  return new HttpError(
    409,
    "last_owner",
    `Cette personne est le dernier propri\xE9taire actif de : ${names}. Nommez d'abord un autre propri\xE9taire.`
  );
}
var ACCOUNT_SELECT = `u.id, u.email, u.first_name, u.last_name, u.phone, u.status,
  u.created_at,
  (SELECT max(s.last_used_at) FROM auth_sessions s WHERE s.user_id = u.id) AS last_seen_at,
  (SELECT count(*)::int FROM auth_sessions s
    WHERE s.user_id = u.id AND s.expires_at > now()) AS active_sessions,
  (SELECT count(*)::int FROM organization_members m WHERE m.user_id = u.id) AS memberships`;
function registerAccountRoutes(r) {
  r.get(
    "/accounts",
    asyncRoute(async (req, res) => {
      const search = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 80) : "";
      const limit = Math.min(Math.max(Number(req.query.limit) || 40, 1), 200);
      const values = [];
      let where = "";
      if (search) {
        values.push(`%${search.toLowerCase()}%`);
        where = `WHERE lower(u.email) LIKE $1
                    OR lower(coalesce(u.first_name,'') || ' ' || coalesce(u.last_name,'')) LIKE $1
                    OR coalesce(u.phone,'') LIKE $1`;
      }
      const q = await adminDb().query(
        `SELECT ${ACCOUNT_SELECT} FROM users u ${where}
          ORDER BY u.created_at DESC LIMIT ${limit}`,
        values
      );
      res.json({ accounts: q.rows, query: search });
    })
  );
  r.get(
    "/accounts/:userId",
    asyncRoute(async (req, res) => {
      const userId = parseId(req.params.userId);
      const pool2 = adminDb();
      const q = await pool2.query(`SELECT ${ACCOUNT_SELECT} FROM users u WHERE u.id = $1::uuid`, [
        userId
      ]);
      if (!q.rowCount) throw new HttpError(404, "not_found", "Ce compte n'existe pas.");
      const memberships = await pool2.query(
        `SELECT m.organization_id, o.name AS organization_name, o.slug,
                m.role, m.status, m.created_at, m.disabled_at,
                o.deletion_requested_at,
                (SELECT count(*)::int FROM member_permissions mp
                  WHERE mp.organization_id = m.organization_id AND mp.user_id = m.user_id)
                  AS permission_overrides
           FROM organization_members m
           JOIN organizations o ON o.id = m.organization_id
          WHERE m.user_id = $1::uuid
          ORDER BY (m.role = 'owner') DESC, o.name ASC`,
        [userId]
      );
      const sessions = await pool2.query(
        `SELECT created_at, last_used_at, expires_at
           FROM auth_sessions WHERE user_id = $1::uuid AND expires_at > now()
          ORDER BY last_used_at DESC NULLS LAST LIMIT 10`,
        [userId]
      );
      res.json({
        account: q.rows[0],
        memberships: memberships.rows,
        sessions: sessions.rows,
        // Signalé à part : c'est la contrainte qui bloquera la plupart des
        // gestes, autant que l'opérateur la voie avant d'essayer.
        sole_owner_of: await soleOwnerOf(pool2, userId)
      });
    })
  );
  r.post(
    "/accounts/:userId/status",
    asyncRoute(async (req, res) => {
      const userId = parseId(req.params.userId);
      const operator = req.operator;
      const input = body(
        z26.object({ status: z26.enum(["active", "inactive"]), reason: reasonField }).strip(),
        req.body
      );
      const pool2 = adminDb();
      const current = await pool2.query(
        "SELECT email, status FROM users WHERE id = $1::uuid",
        [userId]
      );
      if (!current.rowCount) throw new HttpError(404, "not_found", "Ce compte n'existe pas.");
      const { email } = current.rows[0];
      if (input.status === "inactive") {
        const blocking = await soleOwnerOf(pool2, userId);
        if (blocking.length) throw lastOwnerError(blocking);
      }
      await pool2.query("UPDATE users SET status = $2, updated_at = now() WHERE id = $1::uuid", [
        userId,
        input.status
      ]);
      if (input.status === "inactive") {
        await pool2.query("DELETE FROM auth_sessions WHERE user_id = $1::uuid", [userId]);
      }
      const orgs = await pool2.query(
        `SELECT m.organization_id, o.name FROM organization_members m
           JOIN organizations o ON o.id = m.organization_id WHERE m.user_id = $1::uuid`,
        [userId]
      );
      const action = input.status === "active" ? "account.enabled" : "account.disabled";
      for (const row of orgs.rows) {
        await auditPlatformAction(pool2, row.organization_id, operator.email, action, userId, {
          email,
          reason: input.reason
        });
      }
      await logConsoleAction(pool2, operator, action, null, null, {
        email,
        reason: input.reason,
        organizations: orgs.rows.length
      });
      res.json({ user_id: userId, email, status: input.status });
    })
  );
  r.post(
    "/accounts/:userId/revoke-sessions",
    asyncRoute(async (req, res) => {
      const userId = parseId(req.params.userId);
      const operator = req.operator;
      const input = body(z26.object({ reason: reasonField }).strip(), req.body);
      const pool2 = adminDb();
      const current = await pool2.query("SELECT email FROM users WHERE id = $1::uuid", [userId]);
      if (!current.rowCount) throw new HttpError(404, "not_found", "Ce compte n'existe pas.");
      const { email } = current.rows[0];
      const removed = await pool2.query("DELETE FROM auth_sessions WHERE user_id = $1::uuid", [
        userId
      ]);
      await logConsoleAction(pool2, operator, "account.sessions_revoked", null, null, {
        email,
        reason: input.reason,
        sessions: removed.rowCount ?? 0
      });
      res.json({ user_id: userId, email, revoked: removed.rowCount ?? 0 });
    })
  );
  r.post(
    "/organizations/:id/members/:userId/role",
    asyncRoute(async (req, res) => {
      const organizationId = parseId(req.params.id);
      const userId = parseId(req.params.userId);
      const operator = req.operator;
      const input = body(
        z26.object({ role: z26.enum(ROLES), reason: reasonField }).strip(),
        req.body
      );
      const pool2 = adminDb();
      const client = await pool2.connect();
      try {
        await client.query("BEGIN");
        const currentQ = await client.query(
          `SELECT m.role, m.status, u.email, o.name AS organization_name
             FROM organization_members m
             JOIN users u ON u.id = m.user_id
             JOIN organizations o ON o.id = m.organization_id
            WHERE m.organization_id = $1::uuid AND m.user_id = $2::uuid
            FOR UPDATE OF m`,
          [organizationId, userId]
        );
        if (!currentQ.rowCount) {
          throw new HttpError(404, "member_not_found", "Ce compte n'appartient pas \xE0 cette station.");
        }
        const current = currentQ.rows[0];
        if (current.role === input.role) {
          throw new HttpError(409, "role_unchanged", `Ce compte est d\xE9j\xE0 ${ROLE_LABELS[input.role]}.`);
        }
        if (current.role === "owner" && input.role !== "owner") {
          const blocking = await soleOwnerOf(client, userId, organizationId);
          if (blocking.length) throw lastOwnerError(blocking);
        }
        await client.query(
          `UPDATE organization_members
              SET role = $3, updated_at = now()
            WHERE organization_id = $1::uuid AND user_id = $2::uuid`,
          [organizationId, userId, input.role]
        );
        const dropped = await client.query(
          "DELETE FROM member_permissions WHERE organization_id = $1::uuid AND user_id = $2::uuid",
          [organizationId, userId]
        );
        await auditPlatformAction(
          client,
          organizationId,
          operator.email,
          "member.role_changed",
          userId,
          {
            email: current.email,
            before: current.role,
            after: input.role,
            reason: input.reason,
            permission_overrides_cleared: dropped.rowCount ?? 0
          }
        );
        await client.query("COMMIT");
        await logConsoleAction(
          client,
          operator,
          "member.role_changed",
          organizationId,
          current.organization_name,
          { email: current.email, before: current.role, after: input.role, reason: input.reason }
        );
        res.json({
          user_id: userId,
          email: current.email,
          role: input.role,
          role_label: ROLE_LABELS[input.role],
          previous_role: current.role,
          permission_overrides_cleared: dropped.rowCount ?? 0
        });
      } catch (error) {
        await client.query("ROLLBACK").catch(() => {
        });
        throw error;
      } finally {
        client.release();
      }
    })
  );
}

// server/console-support.ts
init_http();
init_auth();
import { z as z27 } from "zod";
init_console_auth();
init_mailer();
init_env();
init_permissions();
init_entitlements();
init_support_service();
function registerSupportRoutes(r) {
  r.get(
    "/support",
    asyncRoute(async (req, res) => {
      const status = typeof req.query.status === "string" ? req.query.status : null;
      if (status && !SUPPORT_STATUSES.includes(status)) {
        throw new HttpError(400, "invalid_data", "Statut inconnu.");
      }
      const rows = await listQueue(adminDb(), {
        status,
        limit: Number(req.query.limit) || void 0
      });
      const now = /* @__PURE__ */ new Date();
      const requests = rows.map((row) => withSla(row, now));
      res.json({
        requests,
        // Compteurs d'en-tête : ce que l'opérateur doit voir avant de lire la
        // liste. « En retard » est le seul chiffre qui engage l'éditeur.
        totals: {
          open: requests.filter((q) => q.status === "open").length,
          answered: requests.filter((q) => q.status === "answered").length,
          breached: requests.filter((q) => q.sla.breached && !q.sla.responded).length
        },
        server_time: now.toISOString()
      });
    })
  );
  r.get(
    "/support/:id",
    asyncRoute(async (req, res) => {
      const id = parseId(req.params.id);
      const pool2 = adminDb();
      const request = await getRequest(pool2, id);
      if (!request) throw new HttpError(404, "not_found", "Cette demande est introuvable.");
      res.json({
        request: withSla(request),
        // `true` : seul endroit du produit où les notes internes sortent.
        messages: await threadMessages(pool2, id, true)
      });
    })
  );
  r.post(
    "/support/:id/messages",
    asyncRoute(async (req, res) => {
      const id = parseId(req.params.id);
      const operator = req.operator;
      const input = body(
        z27.object({
          body: z27.string().trim().min(2, "Le message est vide.").max(4e3),
          internal: z27.boolean().default(false)
        }).strip(),
        req.body
      );
      const pool2 = adminDb();
      const request = await getRequest(pool2, id);
      if (!request) throw new HttpError(404, "not_found", "Cette demande est introuvable.");
      const client = await pool2.connect();
      let message;
      let notificationId = null;
      try {
        await client.query("BEGIN");
        message = await addMessage(client, {
          requestId: id,
          body: input.body,
          authorOperatorEmail: operator.email,
          internal: input.internal
        });
        if (!input.internal) {
          if (request.created_by) {
            const notification = await client.query(
              `INSERT INTO notifications
                 (organization_id, user_id, type, title, message, entity_type, entity_id)
               VALUES($1::uuid,$2::uuid,'SUPPORT_REPLY','R\xE9ponse \xE0 votre demande d\u2019assistance',$3,'support_request',$4::uuid)
               RETURNING id`,
              [
                request.organization_id,
                request.created_by,
                `${operator.fullName} a r\xE9pondu \xE0 votre demande \xAB ${request.subject} \xBB.`,
                id
              ]
            );
            notificationId = notification.rows[0].id;
          }
          await auditPlatformAction(
            client,
            request.organization_id,
            operator.email,
            "support.replied",
            id,
            { subject: request.subject }
          );
        }
        await logConsoleAction(
          client,
          operator,
          input.internal ? "support.note_added" : "support.replied",
          request.organization_id,
          request.organization_name,
          { subject: request.subject }
        );
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK").catch(() => {
        });
        throw error;
      } finally {
        client.release();
      }
      let emailDelivered = false;
      if (!input.internal && request.requester_email) {
        const base = env.APP_URL.replace(/\/+$/, "");
        emailDelivered = await sendMail(supportReplyMessage({
          to: request.requester_email,
          firstName: request.requester_name,
          organizationName: request.organization_name,
          requestSubject: request.subject,
          supportUrl: `${base ? `${base}/support` : "/support"}?request=${encodeURIComponent(id)}`
        }));
      }
      res.status(201).json({
        message,
        request: withSla(await getRequest(pool2, id)),
        notification: {
          in_app: notificationId !== null,
          notification_id: notificationId,
          email_configured: isMailerConfigured(),
          email_delivered: emailDelivered
        }
      });
    })
  );
  r.post(
    "/support/:id/status",
    asyncRoute(async (req, res) => {
      const id = parseId(req.params.id);
      const operator = req.operator;
      const input = body(
        z27.object({ status: z27.enum(["open", "resolved"]) }).strip(),
        req.body
      );
      const pool2 = adminDb();
      const request = await getRequest(pool2, id);
      if (!request) throw new HttpError(404, "not_found", "Cette demande est introuvable.");
      await pool2.query(
        `UPDATE support_requests
            SET status = $2,
                resolved_at = CASE WHEN $2 = 'resolved' THEN now() ELSE NULL END,
                updated_at = now()
          WHERE id = $1::uuid`,
        [id, input.status]
      );
      await logConsoleAction(
        pool2,
        operator,
        input.status === "resolved" ? "support.resolved" : "support.reopened",
        request.organization_id,
        request.organization_name,
        { subject: request.subject }
      );
      res.json({ request: withSla(await getRequest(pool2, id)) });
    })
  );
  r.get(
    "/organizations/:id/members/:userId/diagnostic",
    asyncRoute(async (req, res) => {
      const organizationId = parseId(req.params.id);
      const userId = parseId(req.params.userId);
      const pool2 = adminDb();
      const memberQ = await pool2.query(
        `SELECT m.role, m.status AS membership_status, m.disabled_at,
                u.email, u.status AS account_status, u.first_name, u.last_name,
                o.name AS organization_name, o.deletion_requested_at,
                (SELECT count(*)::int FROM auth_sessions s
                  WHERE s.user_id = u.id AND s.expires_at > now()) AS active_sessions,
                (SELECT max(s.last_used_at) FROM auth_sessions s WHERE s.user_id = u.id) AS last_seen_at
           FROM organization_members m
           JOIN users u ON u.id = m.user_id
           JOIN organizations o ON o.id = m.organization_id
          WHERE m.organization_id = $1::uuid AND m.user_id = $2::uuid`,
        [organizationId, userId]
      );
      if (!memberQ.rowCount) {
        throw new HttpError(404, "member_not_found", "Ce compte n'appartient pas \xE0 cette station.");
      }
      const member = memberQ.rows[0];
      const overridesQ = await pool2.query(
        "SELECT permission, granted FROM member_permissions WHERE organization_id = $1::uuid AND user_id = $2::uuid",
        [organizationId, userId]
      );
      const overrides = overridesQ.rows;
      const effective = effectivePermissions(member.role, overrides);
      const fromRole = new Set(rolePermissions(member.role));
      const subQ = await pool2.query(
        `SELECT s.status, s.current_period_end, p.code AS plan_code, p.name AS plan_name,
                p.price_cents, p.features, p.max_users, p.max_workers, p.max_sites
           FROM subscriptions s LEFT JOIN plans p ON p.id = s.plan_id
          WHERE s.organization_id = $1::uuid`,
        [organizationId]
      );
      const sub = subQ.rows[0];
      const subscription = computeSubscriptionState({
        status: sub?.status ?? null,
        current_period_end: sub?.current_period_end ?? null,
        plan_code: sub?.plan_code ?? null,
        plan_name: sub?.plan_name ?? null,
        plan_price_cents: sub?.price_cents ?? null,
        plan_features: sub?.features ?? null
      });
      const usageQ = await pool2.query(
        `SELECT
           (SELECT count(*)::int FROM organization_members WHERE organization_id = $1::uuid AND status = 'active') AS users,
           (SELECT count(*)::int FROM workers WHERE organization_id = $1::uuid AND status = 'active') AS workers,
           (SELECT count(*)::int FROM sites WHERE organization_id = $1::uuid) AS sites`,
        [organizationId]
      );
      const usage = usageQ.rows[0];
      const limits = [
        { key: "users", label: "Comptes utilisateurs", used: usage.users, max: sub?.max_users ?? null },
        { key: "workers", label: "Laveurs", used: usage.workers, max: sub?.max_workers ?? null },
        { key: "sites", label: "Sites", used: usage.sites, max: sub?.max_sites ?? null }
      ].map((l) => ({ ...l, reached: l.max !== null && l.used >= l.max }));
      const activityQ = await pool2.query(
        `SELECT action, entity_type, created_at FROM audit_logs
          WHERE organization_id = $1::uuid AND actor_user_id = $2::uuid
          ORDER BY created_at DESC LIMIT 15`,
        [organizationId, userId]
      );
      const blockers = [];
      if (member.account_status !== "active") {
        blockers.push({
          cause: "compte_bloque",
          explanation: "Le compte est bloqu\xE9 au niveau de la plateforme : cette personne ne peut se connecter nulle part."
        });
      }
      if (member.membership_status !== "active") {
        blockers.push({
          cause: "retire_de_la_station",
          explanation: "Cette personne a \xE9t\xE9 retir\xE9e de la station. Elle se connecte, mais re\xE7oit une erreur d\xE8s qu'elle ouvre cette station."
        });
      }
      if (member.deletion_requested_at) {
        blockers.push({
          cause: "station_en_suppression",
          explanation: "La station est programm\xE9e pour suppression : tous les acc\xE8s sont coup\xE9s."
        });
      }
      if (subscription.read_only) {
        blockers.push({
          cause: "abonnement_en_lecture_seule",
          explanation: "L'essai est termin\xE9 ou l'abonnement est \xE9chu : la station est en lecture seule, aucune \xE9criture n'est accept\xE9e."
        });
      }
      for (const limit of limits) {
        if (limit.reached) {
          blockers.push({
            cause: `plafond_${limit.key}`,
            explanation: `Le plafond du forfait est atteint (${limit.label} : ${limit.used}/${limit.max}). Toute cr\xE9ation suppl\xE9mentaire est refus\xE9e.`
          });
        }
      }
      res.json({
        member: {
          user_id: userId,
          email: member.email,
          name: [member.first_name, member.last_name].filter(Boolean).join(" ") || null,
          organization_id: organizationId,
          organization_name: member.organization_name,
          role: member.role,
          role_label: ROLE_LABELS[member.role] ?? member.role,
          account_status: member.account_status,
          membership_status: member.membership_status,
          disabled_at: member.disabled_at,
          active_sessions: member.active_sessions,
          last_seen_at: member.last_seen_at
        },
        subscription: {
          status: subscription.status,
          plan_code: subscription.plan_code,
          plan_name: subscription.plan_name,
          read_only: subscription.read_only,
          days_remaining: subscription.days_remaining,
          restricted: subscription.restricted
        },
        limits,
        permissions: {
          // Chaque permission avec son origine : le rôle, ou une exception
          // posée par le propriétaire. C'est la distinction qui explique
          // pourquoi deux caissiers de la même station n'ont pas les mêmes
          // droits.
          granted: [...effective].sort().map((p) => ({
            permission: p,
            label: PERMISSION_LABELS[p] ?? p,
            source: fromRole.has(p) ? "role" : "exception"
          })),
          overrides: overrides.map((o) => ({
            permission: o.permission,
            label: PERMISSION_LABELS[o.permission] ?? o.permission,
            granted: o.granted
          }))
        },
        blockers,
        recent_activity: activityQ.rows,
        server_time: (/* @__PURE__ */ new Date()).toISOString()
      });
    })
  );
}

// server/console-monitoring.ts
init_http();
init_auth();
import { z as z28 } from "zod";
init_console_auth();

// server/monitoring-alerts.ts
init_env();
init_mailer();
function mapSettings(row) {
  return {
    enabled: row.enabled,
    error_rate_percent: Number(row.error_rate_percent),
    min_requests: Number(row.min_requests),
    slow_request_count: Number(row.slow_request_count),
    window_minutes: Number(row.window_minutes),
    cooldown_minutes: Number(row.cooldown_minutes),
    email_recipients: row.email_recipients ?? [],
    whatsapp_recipients: row.whatsapp_recipients ?? [],
    updated_at: row.updated_at
  };
}
async function getMonitoringAlertSettings(pool2) {
  const q = await pool2.query("SELECT * FROM platform_alert_settings WHERE id = 1");
  if (!q.rows[0]) throw new Error("Les r\xE9glages d'alerte ne sont pas initialis\xE9s.");
  return mapSettings(q.rows[0]);
}
async function saveMonitoringAlertSettings(pool2, input, operatorId) {
  const q = await pool2.query(
    `UPDATE platform_alert_settings SET
       enabled = $1, error_rate_percent = $2, min_requests = $3,
       slow_request_count = $4, window_minutes = $5, cooldown_minutes = $6,
       email_recipients = $7::text[], whatsapp_recipients = $8::text[],
       updated_by = $9::uuid, updated_at = now()
     WHERE id = 1 RETURNING *`,
    [
      input.enabled,
      input.error_rate_percent,
      input.min_requests,
      input.slow_request_count,
      input.window_minutes,
      input.cooldown_minutes,
      input.email_recipients,
      input.whatsapp_recipients,
      operatorId
    ]
  );
  return mapSettings(q.rows[0]);
}
function evaluateMonitoringAlerts(metrics, settings) {
  if (metrics.requests < settings.min_requests) return [];
  const alerts = [];
  if (metrics.error_rate_percent >= settings.error_rate_percent) {
    alerts.push({
      fingerprint: "monitoring:error_rate",
      kind: "error_rate",
      severity: "critical",
      title: "Taux d'erreurs serveur \xE9lev\xE9",
      message: `${metrics.error_rate_percent.toFixed(2)} % d'erreurs 5xx sur ${metrics.requests} requ\xEAtes pendant les ${metrics.window_minutes} derni\xE8res minutes (${metrics.server_errors} erreurs). Seuil : ${settings.error_rate_percent} %.`,
      metrics: { ...metrics, threshold_percent: settings.error_rate_percent }
    });
  }
  if (metrics.slow_requests >= settings.slow_request_count) {
    alerts.push({
      fingerprint: "monitoring:slow_requests",
      kind: "slow_requests",
      severity: "warning",
      title: "Requ\xEAtes anormalement lentes",
      message: `${metrics.slow_requests} requ\xEAtes lentes pendant les ${metrics.window_minutes} derni\xE8res minutes. Seuil : ${settings.slow_request_count}.`,
      metrics: { ...metrics, threshold_slow_requests: settings.slow_request_count }
    });
  }
  return alerts;
}
async function recentMetrics(pool2, now, windowMinutes) {
  const q = await pool2.query(
    `SELECT coalesce(sum(requests),0)::bigint AS requests,
            coalesce(sum(requests) FILTER (WHERE status_class = '5xx'),0)::bigint AS errors,
            coalesce(sum(slow_requests),0)::bigint AS slow
       FROM request_metrics
      WHERE bucket_start >= $1::timestamptz - make_interval(mins => $2)
        AND bucket_start <= $1::timestamptz`,
    [now.toISOString(), windowMinutes]
  );
  const requests = Number(q.rows[0]?.requests ?? 0);
  const serverErrors = Number(q.rows[0]?.errors ?? 0);
  return {
    requests,
    server_errors: serverErrors,
    slow_requests: Number(q.rows[0]?.slow ?? 0),
    error_rate_percent: requests > 0 ? Math.round(serverErrors / requests * 1e4) / 100 : 0,
    window_minutes: windowMinutes
  };
}
function monitoringAlertMessage(candidate, recipient) {
  const base = env.APP_URL.replace(/\/+$/, "");
  return {
    to: recipient,
    subject: `[WashPilot ${candidate.severity === "critical" ? "CRITIQUE" : "ALERTE"}] ${candidate.title}`,
    text: [candidate.title, "", candidate.message, "", `Ouvrir la surveillance : ${base ? `${base}/console/surveillance` : "/console/surveillance"}`].join("\n")
  };
}
async function sendWhatsAppMonitoringAlert(recipient, candidate, fetchImpl = fetch) {
  if (!env.WHATSAPP_ACCESS_TOKEN || !env.WHATSAPP_PHONE_NUMBER_ID || !env.WHATSAPP_ALERT_TEMPLATE) {
    return { delivered: false, error: "WhatsApp Cloud API ou mod\xE8le d'alerte non configur\xE9." };
  }
  try {
    const response = await fetchImpl(
      `https://graph.facebook.com/${env.WHATSAPP_API_VERSION}/${encodeURIComponent(env.WHATSAPP_PHONE_NUMBER_ID)}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: recipient.replace(/\D/g, ""),
          type: "template",
          template: {
            name: env.WHATSAPP_ALERT_TEMPLATE,
            language: { code: env.WHATSAPP_ALERT_TEMPLATE_LANGUAGE },
            components: [{
              type: "body",
              parameters: [
                { type: "text", text: candidate.title.slice(0, 200) },
                { type: "text", text: candidate.message.slice(0, 900) }
              ]
            }]
          }
        }),
        signal: AbortSignal.timeout(15e3)
      }
    );
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      return { delivered: false, error: `WhatsApp a refus\xE9 l'envoi (${response.status}) : ${detail.slice(0, 250)}` };
    }
    return { delivered: true, error: null };
  } catch (error) {
    return { delivered: false, error: error instanceof Error ? error.message : "Erreur WhatsApp inconnue" };
  }
}
async function dispatchAlert(pool2, eventId, candidate, settings, fetchImpl) {
  const deliveries = [];
  for (const recipient of settings.email_recipients) {
    const delivered = await sendMail(monitoringAlertMessage(candidate, recipient));
    deliveries.push({
      channel: "email",
      recipient,
      delivered,
      error: delivered ? null : "E-mail non remis : fournisseur absent ou envoi refus\xE9."
    });
  }
  for (const recipient of settings.whatsapp_recipients) {
    const result = await sendWhatsAppMonitoringAlert(recipient, candidate, fetchImpl);
    deliveries.push({ channel: "whatsapp", recipient, delivered: result.delivered, error: result.error });
  }
  await pool2.query("UPDATE platform_alert_events SET deliveries = $2::jsonb WHERE id = $1::uuid", [
    eventId,
    JSON.stringify(deliveries)
  ]);
  return deliveries;
}
async function reserveAlert(pool2, candidate, cooldownMinutes, now, bypassCooldown) {
  const client = await pool2.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [candidate.fingerprint]);
    if (!bypassCooldown) {
      const recent = await client.query(
        `SELECT 1 FROM platform_alert_events
         WHERE fingerprint = $1 AND triggered_at > $2::timestamptz - make_interval(mins => $3)
         LIMIT 1`,
        [candidate.fingerprint, now.toISOString(), cooldownMinutes]
      );
      if (recent.rowCount) {
        await client.query("ROLLBACK");
        return null;
      }
    }
    const inserted = await client.query(
      `INSERT INTO platform_alert_events(fingerprint, kind, severity, title, message, metrics, triggered_at)
       VALUES($1,$2,$3,$4,$5,$6::jsonb,$7::timestamptz) RETURNING id`,
      [
        candidate.fingerprint,
        candidate.kind,
        candidate.severity,
        candidate.title,
        candidate.message,
        JSON.stringify(candidate.metrics),
        now.toISOString()
      ]
    );
    await client.query("COMMIT");
    return inserted.rows[0].id;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {
    });
    throw error;
  } finally {
    client.release();
  }
}
async function runMonitoringAlerts(pool2, options = {}) {
  const settings = await getMonitoringAlertSettings(pool2);
  if (!settings.enabled) return [];
  const now = options.now ?? /* @__PURE__ */ new Date();
  const metrics = await recentMetrics(pool2, now, settings.window_minutes);
  const candidates = evaluateMonitoringAlerts(metrics, settings);
  const outcomes = [];
  for (const candidate of candidates) {
    const eventId = await reserveAlert(pool2, candidate, settings.cooldown_minutes, now, false);
    if (!eventId) continue;
    const deliveries = await dispatchAlert(pool2, eventId, candidate, settings, options.fetchImpl ?? fetch);
    outcomes.push({ event_id: eventId, kind: candidate.kind, deliveries });
  }
  return outcomes;
}
async function sendTestMonitoringAlert(pool2, options = {}) {
  const settings = await getMonitoringAlertSettings(pool2);
  const now = /* @__PURE__ */ new Date();
  const candidate = {
    fingerprint: `monitoring:test:${now.toISOString()}`,
    kind: "test",
    severity: "info",
    title: "Test des alertes WashPilot CI",
    message: "Ce message confirme que les destinataires et le fournisseur d'alerte sont correctement configur\xE9s.",
    metrics: { test: true }
  };
  const eventId = await reserveAlert(pool2, candidate, 0, now, true);
  if (!eventId) throw new Error("Impossible de r\xE9server l'alerte de test.");
  const deliveries = await dispatchAlert(pool2, eventId, candidate, settings, options.fetchImpl ?? fetch);
  return { event_id: eventId, deliveries };
}
async function listMonitoringAlertEvents(pool2, limit = 30) {
  const q = await pool2.query(
    "SELECT * FROM platform_alert_events ORDER BY triggered_at DESC LIMIT $1",
    [Math.min(Math.max(limit, 1), 100)]
  );
  return q.rows;
}
function monitoringAlertChannels() {
  return {
    email_configured: isMailerConfigured(),
    whatsapp_configured: Boolean(
      env.WHATSAPP_ACCESS_TOKEN && env.WHATSAPP_PHONE_NUMBER_ID && env.WHATSAPP_ALERT_TEMPLATE
    )
  };
}

// server/console-monitoring.ts
function hoursParam(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 24;
  return Math.min(Math.round(n), 24 * 30);
}
function registerMonitoringRoutes(r) {
  r.get(
    "/monitoring",
    asyncRoute(async (req, res) => {
      const hours = hoursParam(req.query.hours);
      const pool2 = adminDb();
      const [overview, groups] = await Promise.all([
        monitoringOverview(pool2, { hours }),
        errorGroups(pool2, { hours })
      ]);
      res.json({
        ...overview,
        error_groups: groups,
        // Les seuils sont renvoyés avec les chiffres : un écran qui affiche
        // « 3 requêtes lentes » sans dire à partir de quand une requête est
        // lente n'informe de rien.
        thresholds: {
          slow_request_ms: SLOW_REQUEST_MS,
          error_retention_days: ERROR_RETENTION_DAYS,
          metrics_retention_days: METRICS_RETENTION_DAYS
        }
      });
    })
  );
  r.get(
    "/monitoring/alerts",
    asyncRoute(async (_req, res) => {
      const pool2 = adminDb();
      const [settings, events] = await Promise.all([
        getMonitoringAlertSettings(pool2),
        listMonitoringAlertEvents(pool2)
      ]);
      res.json({ settings, events, channels: monitoringAlertChannels() });
    })
  );
  const alertSettingsSchema = z28.object({
    enabled: z28.boolean(),
    error_rate_percent: z28.number().min(0.01).max(100),
    min_requests: z28.number().int().min(1).max(1e6),
    slow_request_count: z28.number().int().min(1).max(1e5),
    window_minutes: z28.number().int().min(5).max(1440),
    cooldown_minutes: z28.number().int().min(5).max(10080),
    email_recipients: z28.array(z28.string().trim().toLowerCase().email()).max(20),
    whatsapp_recipients: z28.array(
      z28.string().trim().regex(/^\+?[0-9 ()-]{8,24}$/, "Num\xE9ro WhatsApp international invalide.")
    ).max(20)
  }).strip().refine(
    (value) => !value.enabled || value.email_recipients.length + value.whatsapp_recipients.length > 0,
    { message: "Ajoutez au moins un destinataire avant d'activer les alertes." }
  );
  r.put(
    "/monitoring/alerts/settings",
    requireConsoleAdmin,
    asyncRoute(async (req, res) => {
      const input = body(alertSettingsSchema, req.body);
      const pool2 = adminDb();
      const settings = await saveMonitoringAlertSettings(pool2, {
        ...input,
        email_recipients: [...new Set(input.email_recipients)],
        whatsapp_recipients: [...new Set(input.whatsapp_recipients)]
      }, req.operator.operatorId);
      await logConsoleAction(pool2, req.operator, "monitoring.alerts.configured", null, null, {
        enabled: settings.enabled,
        error_rate_percent: settings.error_rate_percent,
        min_requests: settings.min_requests,
        slow_request_count: settings.slow_request_count,
        window_minutes: settings.window_minutes,
        cooldown_minutes: settings.cooldown_minutes,
        email_recipients: settings.email_recipients.length,
        whatsapp_recipients: settings.whatsapp_recipients.length
      });
      res.json({ settings });
    })
  );
  r.post(
    "/monitoring/alerts/test",
    requireConsoleAdmin,
    asyncRoute(async (req, res) => {
      const pool2 = adminDb();
      const settings = await getMonitoringAlertSettings(pool2);
      if (settings.email_recipients.length + settings.whatsapp_recipients.length === 0) {
        throw new HttpError(400, "alert_recipient_required", "Ajoutez un destinataire avant l'envoi de test.");
      }
      const result = await sendTestMonitoringAlert(pool2);
      await logConsoleAction(pool2, req.operator, "monitoring.alerts.tested", null, null, {
        event_id: result.event_id,
        deliveries: result.deliveries.map(({ channel, recipient, delivered }) => ({ channel, recipient, delivered }))
      });
      res.json(result);
    })
  );
  r.get(
    "/monitoring/errors",
    asyncRoute(async (req, res) => {
      const kind = typeof req.query.kind === "string" ? req.query.kind : null;
      if (kind && kind !== "error" && kind !== "slow") {
        throw new HttpError(400, "invalid_data", "Type d'incident inconnu.");
      }
      const events = await listErrorEvents(adminDb(), {
        kind,
        route: typeof req.query.route === "string" ? req.query.route : null,
        limit: Number(req.query.limit) || void 0
      });
      res.json({ events, server_time: (/* @__PURE__ */ new Date()).toISOString() });
    })
  );
  r.get(
    "/monitoring/errors/:id",
    asyncRoute(async (req, res) => {
      const id = parseId(req.params.id);
      const pool2 = adminDb();
      const event = await getErrorEvent(pool2, id);
      if (!event) throw new HttpError(404, "not_found", "Cet incident n'existe pas.");
      await logConsoleAction(
        pool2,
        req.operator,
        "monitoring.error.read",
        event.organization_id ?? null,
        event.organization_name ?? null,
        { error_id: id, route: event.route, status: event.status, code: event.code }
      );
      res.json({ event });
    })
  );
}

// server/admin.ts
var PENDING_CLAUSE = `NOT EXISTS (
  SELECT 1 FROM audit_logs b
  WHERE b.organization_id = a.organization_id
    AND b.action IN ('subscription.activated', 'subscription.request_declined')
    AND b.created_at > a.created_at
)`;
var MAX_MONTHS = 36;
var ORGANIZATION_SELECT = `
  o.id,
  o.name,
  o.created_at,
  s.status        AS stored_status,
  s.current_period_end,
  s.plan_changed_at,
  p.code          AS plan_code,
  p.name          AS plan_name,
  p.price_cents   AS plan_price_cents,
  (SELECT count(*)::int FROM organization_members m
     WHERE m.organization_id = o.id AND m.status = 'active')        AS member_count,
  (SELECT count(*)::int FROM sites si
     WHERE si.organization_id = o.id AND si.is_active)              AS site_count,
  (SELECT u.email FROM organization_members m2
     JOIN users u ON u.id = m2.user_id
    WHERE m2.organization_id = o.id AND m2.role = 'owner' AND m2.status = 'active'
    ORDER BY m2.created_at ASC LIMIT 1)                             AS owner_email,
  (SELECT u.phone FROM organization_members m3
     JOIN users u ON u.id = m3.user_id
    WHERE m3.organization_id = o.id AND m3.role = 'owner' AND m3.status = 'active'
    ORDER BY m3.created_at ASC LIMIT 1)                             AS owner_phone,
  o.deletion_requested_at,
  o.deletion_scheduled_for,
  o.deletion_reason,
  (SELECT max(w.created_at) FROM washes w
     WHERE w.organization_id = o.id)                                AS last_wash_at`;
function describe(row, now) {
  const state = computeSubscriptionState({
    status: row.stored_status,
    current_period_end: row.current_period_end,
    plan_code: row.plan_code,
    plan_name: row.plan_name,
    plan_price_cents: row.plan_price_cents,
    now
  });
  const { past_due: pastDue } = state;
  const lastWash = row.last_wash_at ? new Date(row.last_wash_at) : null;
  const idleDays = lastWash ? Math.floor((now.getTime() - lastWash.getTime()) / 864e5) : null;
  return {
    id: row.id,
    name: row.name,
    created_at: row.created_at,
    deletion_requested_at: row.deletion_requested_at,
    deletion_scheduled_for: row.deletion_scheduled_for,
    deletion_reason: row.deletion_reason,
    pending_deletion: row.deletion_requested_at !== null,
    last_wash_at: row.last_wash_at,
    idle_days: idleDays,
    dormant: idleDays === null || idleDays >= 14,
    owner_email: row.owner_email,
    owner_phone: row.owner_phone,
    member_count: row.member_count,
    site_count: row.site_count,
    plan_code: row.plan_code,
    plan_name: row.plan_name,
    plan_price_cents: row.plan_price_cents ?? 0,
    status: state.status,
    stored_status: row.stored_status,
    read_only: state.read_only,
    current_period_end: row.current_period_end,
    plan_changed_at: row.plan_changed_at,
    days_remaining: state.days_remaining,
    past_due: pastDue,
    days_past_due: state.days_past_due,
    // Combien de jours il reste avant la fermeture réelle : c'est le chiffre
    // qui décide si l'opérateur appelle le client ou attend son virement.
    payment_grace_days: state.payment_grace_days,
    payment_grace_days_remaining: state.payment_grace_days_remaining,
    payment_grace_ends_at: state.payment_grace_ends_at,
    expired_reason: state.expired_reason
  };
}
function createAdminRouter() {
  const r = Router23();
  r.use("/operators", requireConsoleAdmin, createConsoleOperatorRouter());
  r.use(requireConsoleWrite);
  registerReconciliationRoutes(r);
  r.get(
    "/metrics",
    asyncRoute(async (_req, res) => {
      const now = /* @__PURE__ */ new Date();
      const q = await adminDb().query(
        `SELECT ${ORGANIZATION_SELECT}
         FROM organizations o
         LEFT JOIN subscriptions s ON s.organization_id = o.id
         LEFT JOIN plans p ON p.id = s.plan_id`
      );
      const rows = q.rows.map((row) => describe(row, now));
      const pendingQ = await adminDb().query(
        `SELECT count(*)::int AS n
         FROM audit_logs a
         WHERE a.action = 'subscription.upgrade_requested'
           AND ${PENDING_CLAUSE}`
      );
      res.json({
        total: rows.length,
        trialing: rows.filter((o) => o.status === "trialing").length,
        active: rows.filter((o) => o.status === "active").length,
        expired: rows.filter((o) => o.status === "expired").length,
        cancelled: rows.filter((o) => o.status === "cancelled").length,
        past_due: rows.filter((o) => o.past_due).length,
        pending_requests: pendingQ.rows[0]?.n ?? 0,
        // Revenu mensuel récurrent des seuls forfaits actifs, en centimes.
        mrr_cents: rows.filter((o) => o.status === "active").reduce((sum, o) => sum + o.plan_price_cents, 0),
        server_time: now.toISOString()
      });
    })
  );
  r.get(
    "/organizations",
    asyncRoute(async (req, res) => {
      const now = /* @__PURE__ */ new Date();
      const search = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 80) : "";
      const status = typeof req.query.status === "string" ? req.query.status : "";
      const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
      const offset = Math.max(Number(req.query.offset) || 0, 0);
      const conditions = [];
      const values = [];
      if (search) {
        values.push(`%${search.toLowerCase()}%`);
        conditions.push(
          `(lower(o.name) LIKE $${values.length} OR EXISTS (
              SELECT 1 FROM organization_members m
              JOIN users u ON u.id = m.user_id
              WHERE m.organization_id = o.id AND lower(u.email) LIKE $${values.length}))`
        );
      }
      const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
      const q = await adminDb().query(
        `SELECT ${ORGANIZATION_SELECT}
         FROM organizations o
         LEFT JOIN subscriptions s ON s.organization_id = o.id
         LEFT JOIN plans p ON p.id = s.plan_id
         ${where}
         ORDER BY o.created_at DESC`,
        values
      );
      let rows = q.rows.map((row) => describe(row, now));
      if (status === "past_due") rows = rows.filter((o) => o.past_due);
      else if (status) rows = rows.filter((o) => o.status === status);
      res.json({
        organizations: rows.slice(offset, offset + limit),
        total: rows.length,
        limit,
        offset
      });
    })
  );
  r.get(
    "/organizations/:id",
    asyncRoute(async (req, res) => {
      const id = parseId(req.params.id);
      const now = /* @__PURE__ */ new Date();
      const q = await adminDb().query(
        `SELECT ${ORGANIZATION_SELECT}
         FROM organizations o
         LEFT JOIN subscriptions s ON s.organization_id = o.id
         LEFT JOIN plans p ON p.id = s.plan_id
         WHERE o.id = $1::uuid`,
        [id]
      );
      if (!q.rowCount) throw new HttpError(404, "organization_not_found", "Station introuvable.");
      const membersQ = await adminDb().query(
        `SELECT u.email, u.first_name, u.last_name, u.phone, m.role, m.status, m.created_at
         FROM organization_members m JOIN users u ON u.id = m.user_id
         WHERE m.organization_id = $1::uuid ORDER BY m.created_at ASC`,
        [id]
      );
      const historyQ = await adminDb().query(
        `SELECT a.action, a.metadata, a.created_at, u.email AS actor_email
         FROM audit_logs a LEFT JOIN users u ON u.id = a.actor_user_id
         WHERE a.organization_id = $1::uuid AND a.entity_type IN ('subscription','plan')
         ORDER BY a.created_at DESC LIMIT 30`,
        [id]
      );
      res.json({
        organization: describe(q.rows[0], now),
        members: membersQ.rows,
        subscription_history: historyQ.rows
      });
    })
  );
  r.get(
    "/upgrade-requests",
    asyncRoute(async (req, res) => {
      const onlyPending = req.query.pending !== "false";
      const q = await adminDb().query(
        `SELECT a.id, a.organization_id, a.created_at, a.metadata,
                o.name AS organization_name,
                u.email AS requester_email, u.phone AS requester_phone,
                ${PENDING_CLAUSE} AS pending
         FROM audit_logs a
         JOIN organizations o ON o.id = a.organization_id
         LEFT JOIN users u ON u.id = a.actor_user_id
         WHERE a.action = 'subscription.upgrade_requested'
         ORDER BY a.created_at DESC
         LIMIT 100`
      );
      const rows = onlyPending ? q.rows.filter((row) => row.pending) : q.rows;
      res.json({ requests: rows, total: rows.length });
    })
  );
  r.get(
    "/payment-intents",
    asyncRoute(async (req, res) => {
      const status = typeof req.query.status === "string" ? req.query.status : "pending";
      const declaredOnly = req.query.declared === "true";
      const q = await adminDb().query(
        `SELECT i.id, i.reference, i.organization_id, o.name AS organization_name,
                i.plan_code, i.months, i.amount_cents, i.provider, i.status,
                i.declared_reference, i.declared_at, i.created_at, i.settled_at,
                u.email AS requester_email, u.phone AS requester_phone
           FROM payment_intents i
           JOIN organizations o ON o.id = i.organization_id
           LEFT JOIN users u ON u.id = i.created_by
          WHERE ($1 = 'all' OR i.status = $1)
            AND ($2::boolean IS NOT TRUE OR i.declared_at IS NOT NULL)
          ORDER BY i.declared_at DESC NULLS LAST, i.created_at DESC
          LIMIT 100`,
        [status, declaredOnly]
      );
      res.json({ intents: q.rows, total: q.rowCount ?? 0 });
    })
  );
  r.post(
    "/payment-intents/:reference/confirm",
    asyncRoute(async (req, res) => {
      const operator = req.operator;
      const reference = String(req.params.reference ?? "");
      if (!/^WP-[A-Z2-9]{8}$/.test(reference)) {
        throw new HttpError(400, "invalid_reference", "R\xE9f\xE9rence de paiement invalide.");
      }
      const input = body(
        z29.object({
          note: z29.string().trim().max(500).optional(),
          channel: z29.enum(REVENUE_CHANNELS).default("other")
        }).strip(),
        req.body
      );
      const pool2 = adminDb();
      const claimed = await pool2.query(
        `UPDATE payment_intents
            SET status = 'paid', settled_at = now()
          WHERE reference = $1 AND status = 'pending'
          RETURNING organization_id, plan_code, months, amount_cents, declared_reference`,
        [reference]
      );
      if (!claimed.rowCount) {
        throw new HttpError(
          404,
          "payment_intent_not_found",
          "Aucune demande de paiement en attente ne porte cette r\xE9f\xE9rence."
        );
      }
      const intent = claimed.rows[0];
      const result = await activateSubscription(pool2, {
        organizationId: intent.organization_id,
        planCode: intent.plan_code,
        months: intent.months,
        source: "platform_admin",
        paymentReference: intent.declared_reference ?? reference,
        actorUserId: null,
        note: input.note ?? null,
        channel: input.channel,
        operatorEmail: operator.email,
        // Le montant vient de l'intention, pas du tarif courant : le devis a
        // figé un prix, et c'est celui-là que le client a réglé. Recalculer
        // ferait diverger le registre du relevé bancaire le jour d'un
        // changement de tarif.
        amountCents: intent.amount_cents,
        extra: {
          operator_email: operator.email,
          intent_reference: reference,
          amount_cents: intent.amount_cents
        }
      });
      res.json({
        reference,
        organization_id: intent.organization_id,
        plan_code: result.planCode,
        status: "active",
        current_period_end: result.periodEnd
      });
    })
  );
  r.post(
    "/upgrade-requests/:id/decline",
    asyncRoute(async (req, res) => {
      const requestId = parseId(req.params.id);
      const operator = req.operator;
      const input = body(
        z29.object({ reason: z29.string().trim().min(3).max(300) }).strip(),
        req.body
      );
      const pool2 = adminDb();
      const q = await pool2.query(
        `SELECT organization_id FROM audit_logs
          WHERE id = $1::uuid AND action = 'subscription.upgrade_requested'`,
        [requestId]
      );
      if (!q.rowCount) {
        throw new HttpError(404, "not_found", "Cette demande d'activation n'existe pas.");
      }
      const organizationId = q.rows[0].organization_id;
      await auditPlatformAction(
        pool2,
        organizationId,
        operator.email,
        "subscription.request_declined",
        requestId,
        { reason: input.reason, operator_email: operator.email }
      );
      res.json({ request_id: requestId, organization_id: organizationId, pending: false });
    })
  );
  r.post(
    "/organizations/:id/activate",
    asyncRoute(async (req, res) => {
      const id = parseId(req.params.id);
      const operator = req.operator;
      const input = body(
        z29.object({
          plan_code: z29.string().trim().min(1).max(40),
          months: z29.number().int().min(1).max(MAX_MONTHS).default(1),
          /** Référence du paiement encaissé hors application (mobile money, virement). */
          payment_reference: z29.string().trim().max(120).optional(),
          /** Par où l'argent est arrivé : détermine le compte débité à l'export. */
          channel: z29.enum(REVENUE_CHANNELS).default("other"),
          /**
           * Montant réellement reçu, en francs. Omis, on retient le tarif du
           * forfait. Renseigné quand le client a payé autre chose : remise,
           * arrondi, tarif négocié. Le registre doit refléter la banque.
           */
          amount: z29.number().int().min(0).max(1e8).optional(),
          note: z29.string().trim().max(500).optional()
        }).strip(),
        req.body
      );
      const pool2 = adminDb();
      const result = await activateSubscription(pool2, {
        organizationId: id,
        planCode: input.plan_code,
        months: input.months,
        source: "platform_admin",
        paymentReference: input.payment_reference ?? null,
        actorUserId: null,
        note: input.note ?? null,
        channel: input.channel,
        operatorEmail: operator.email,
        amountCents: input.amount === void 0 ? void 0 : input.amount * 100,
        extra: { operator_email: operator.email }
      });
      res.json({
        organization_id: id,
        plan_code: result.planCode,
        status: "active",
        current_period_end: result.periodEnd,
        months: result.months,
        renewed: result.renewed
      });
    })
  );
  r.post(
    "/organizations/:id/suspend",
    asyncRoute(async (req, res) => {
      const id = parseId(req.params.id);
      const operator = req.operator;
      const input = body(
        z29.object({ reason: z29.string().trim().min(3).max(300) }).strip(),
        req.body
      );
      const pool2 = adminDb();
      const updated = await pool2.query(
        `UPDATE subscriptions SET status = 'cancelled', updated_at = now()
         WHERE organization_id = $1::uuid RETURNING id`,
        [id]
      );
      if (!updated.rowCount) {
        throw new HttpError(404, "subscription_not_found", "Cette station n'a aucun abonnement.");
      }
      await auditPlatformAction(pool2, id, operator.email, "subscription.suspended", id, {
        reason: input.reason,
        operator_email: operator.email
      });
      invalidateSubscriptionCache(id);
      res.json({ organization_id: id, status: "cancelled", read_only: true });
    })
  );
  r.post(
    "/organizations/:id/extend-trial",
    asyncRoute(async (req, res) => {
      const id = parseId(req.params.id);
      const operator = req.operator;
      const input = body(
        z29.object({
          days: z29.number().int().min(1).max(90),
          reason: z29.string().trim().min(3).max(300)
        }).strip(),
        req.body
      );
      const pool2 = adminDb();
      const currentQ = await pool2.query(
        "SELECT current_period_end, status FROM subscriptions WHERE organization_id = $1::uuid",
        [id]
      );
      if (!currentQ.rowCount) {
        throw new HttpError(404, "subscription_not_found", "Cette station n'a aucun abonnement.");
      }
      const row = currentQ.rows[0];
      if (row.status === "active") {
        throw new HttpError(
          409,
          "subscription_active",
          "Cette station a un forfait payant en cours. Prolonger l'essai effacerait son abonnement : utilisez l'activation pour le renouveler, ou la suspension."
        );
      }
      const existing = row.current_period_end ? new Date(row.current_period_end) : null;
      const now = /* @__PURE__ */ new Date();
      const base = row.status === "trialing" && existing && existing.getTime() > now.getTime() ? existing : now;
      const periodEnd = new Date(base.getTime() + input.days * 864e5);
      await pool2.query(
        `UPDATE subscriptions
            SET status = 'trialing', current_period_end = $2::timestamptz, updated_at = now()
          WHERE organization_id = $1::uuid`,
        [id, periodEnd.toISOString()]
      );
      await auditPlatformAction(pool2, id, operator.email, "subscription.trial_extended", id, {
        days: input.days,
        reason: input.reason,
        period_end: periodEnd.toISOString(),
        operator_email: operator.email
      });
      invalidateSubscriptionCache(id);
      res.json({
        organization_id: id,
        status: "trialing",
        current_period_end: periodEnd.toISOString(),
        days: input.days
      });
    })
  );
  r.post(
    "/organizations/:id/extend-grace",
    asyncRoute(async (req, res) => {
      const id = parseId(req.params.id);
      const operator = req.operator;
      const input = body(
        z29.object({
          days: z29.number().int().min(1).max(60),
          reason: z29.string().trim().min(3).max(300)
        }).strip(),
        req.body
      );
      const pool2 = adminDb();
      const currentQ = await pool2.query(
        "SELECT status, current_period_end FROM subscriptions WHERE organization_id = $1::uuid",
        [id]
      );
      if (!currentQ.rowCount) {
        throw new HttpError(404, "subscription_not_found", "Cette station n'a aucun abonnement.");
      }
      const row = currentQ.rows[0];
      if (row.status !== "active") {
        throw new HttpError(
          409,
          "subscription_not_active",
          row.status === "trialing" ? "Cette station est en essai : utilisez \xAB Prolonger l'essai \xBB." : "Cette station n'a pas de forfait payant en cours. Activez un forfait plut\xF4t que d'accorder un d\xE9lai."
        );
      }
      const now = /* @__PURE__ */ new Date();
      const existing = row.current_period_end ? new Date(row.current_period_end) : null;
      const base = existing && existing.getTime() > now.getTime() ? existing : now;
      const periodEnd = new Date(base.getTime() + input.days * 864e5);
      await pool2.query(
        `UPDATE subscriptions
            SET current_period_end = $2::timestamptz, updated_at = now()
          WHERE organization_id = $1::uuid`,
        [id, periodEnd.toISOString()]
      );
      await pool2.query(
        "DELETE FROM subscription_reminders WHERE organization_id = $1::uuid AND kind LIKE 'renewal_%'",
        [id]
      );
      await auditPlatformAction(pool2, id, operator.email, "subscription.grace_extended", id, {
        days: input.days,
        reason: input.reason,
        period_end: periodEnd.toISOString(),
        previous_period_end: row.current_period_end,
        operator_email: operator.email
      });
      invalidateSubscriptionCache(id);
      res.json({
        organization_id: id,
        status: "active",
        current_period_end: periodEnd.toISOString(),
        days: input.days,
        read_only: false
      });
    })
  );
  r.post(
    "/organizations/:id/schedule-deletion",
    asyncRoute(async (req, res) => {
      const id = parseId(req.params.id);
      const operator = req.operator;
      const input = body(
        z29.object({
          reason: z29.string().trim().min(10).max(300),
          grace_days: z29.number().int().min(1).max(90).optional()
        }).strip(),
        req.body
      );
      const pool2 = adminDb();
      const org = await pool2.query("SELECT name, deletion_requested_at FROM organizations WHERE id = $1::uuid", [id]);
      if (!org.rowCount) {
        throw new HttpError(404, "organization_not_found", "Cette station n'existe pas.");
      }
      if (org.rows[0].deletion_requested_at) {
        throw new HttpError(409, "deletion_already_scheduled", "Une suppression est d\xE9j\xE0 programm\xE9e pour cette station.");
      }
      const name = org.rows[0].name;
      const graceDays = input.grace_days ?? DEFAULT_GRACE_DAYS;
      const { scheduled_for } = await scheduleDeletion(pool2, id, input.reason, graceDays);
      const closedRequest = await acceptPendingClosure(pool2, id, operator.email, input.reason);
      await auditPlatformAction(pool2, id, operator.email, "organization.deletion_scheduled", id, {
        reason: input.reason,
        scheduled_for
      });
      await logConsoleAction(pool2, operator, "organization.deletion_scheduled", id, name, {
        reason: input.reason,
        grace_days: graceDays,
        scheduled_for
      });
      invalidateSubscriptionCache(id);
      res.json({
        organization_id: id,
        name,
        scheduled_for,
        grace_days: graceDays,
        closure_request_accepted: closedRequest
      });
    })
  );
  r.post(
    "/organizations/:id/cancel-deletion",
    asyncRoute(async (req, res) => {
      const id = parseId(req.params.id);
      const operator = req.operator;
      const pool2 = adminDb();
      const org = await pool2.query("SELECT name FROM organizations WHERE id = $1::uuid", [id]);
      if (!org.rowCount) {
        throw new HttpError(404, "organization_not_found", "Cette station n'existe pas.");
      }
      if (!await cancelDeletion(pool2, id)) {
        throw new HttpError(409, "no_deletion_scheduled", "Aucune suppression n'est programm\xE9e pour cette station.");
      }
      const name = org.rows[0].name;
      await auditPlatformAction(pool2, id, operator.email, "organization.deletion_cancelled", id, {});
      await logConsoleAction(pool2, operator, "organization.deletion_cancelled", id, name, {});
      invalidateSubscriptionCache(id);
      res.json({ organization_id: id, name, restored: true, subscription_status: "cancelled" });
    })
  );
  r.post(
    "/organizations/:id/purge",
    asyncRoute(async (req, res) => {
      const id = parseId(req.params.id);
      const operator = req.operator;
      const input = body(z29.object({ confirm_name: z29.string().trim().min(1).max(200) }).strip(), req.body);
      const pool2 = adminDb();
      const org = await pool2.query("SELECT name, deletion_requested_at FROM organizations WHERE id = $1::uuid", [id]);
      if (!org.rowCount) {
        throw new HttpError(404, "organization_not_found", "Cette station n'existe pas.");
      }
      const row = org.rows[0];
      if (!row.deletion_requested_at) {
        throw new HttpError(
          409,
          "deletion_not_scheduled",
          "Programmez d'abord la suppression : la purge imm\xE9diate n'est possible que sur une station d\xE9j\xE0 sortie du service."
        );
      }
      if (input.confirm_name.trim().toLowerCase() !== row.name.trim().toLowerCase()) {
        throw new HttpError(400, "confirmation_mismatch", "Le nom saisi ne correspond pas \xE0 celui de la station.");
      }
      const result = await purgeOrganization(pool2, id);
      await logConsoleAction(pool2, operator, "organization.purged", null, result.name, {
        trigger: "manual",
        rows_deleted: result.deleted,
        users_deleted: result.users_deleted
      });
      invalidateSubscriptionCache(id);
      res.json({ purged: true, name: result.name, rows_deleted: result.deleted, users_deleted: result.users_deleted });
    })
  );
  r.get(
    "/organizations/:id/members",
    asyncRoute(async (req, res) => {
      const id = parseId(req.params.id);
      const q = await adminDb().query(
        `SELECT u.id, u.email, u.first_name, u.last_name, u.phone, u.status AS user_status,
                m.role, m.status AS membership_status, m.created_at,
                (SELECT max(s.last_used_at) FROM auth_sessions s WHERE s.user_id = u.id) AS last_seen_at
           FROM organization_members m
           JOIN users u ON u.id = m.user_id
          WHERE m.organization_id = $1::uuid
          ORDER BY (m.role = 'owner') DESC, m.created_at ASC`,
        [id]
      );
      res.json({ members: q.rows });
    })
  );
  r.post(
    "/organizations/:id/members/:userId/reset-password",
    asyncRoute(async (req, res) => {
      const id = parseId(req.params.id);
      const userId = parseId(req.params.userId);
      const operator = req.operator;
      const pool2 = adminDb();
      const member = await pool2.query(
        `SELECT u.email, o.name AS org_name FROM organization_members m
           JOIN users u ON u.id = m.user_id
           JOIN organizations o ON o.id = m.organization_id
          WHERE m.organization_id = $1::uuid AND m.user_id = $2::uuid`,
        [id, userId]
      );
      if (!member.rowCount) {
        throw new HttpError(404, "member_not_found", "Ce compte n'appartient pas \xE0 cette station.");
      }
      const { email, org_name } = member.rows[0];
      const token = await createPasswordResetToken(pool2, userId, 60, null);
      await auditPlatformAction(pool2, id, operator.email, "user.password_reset_requested", userId, { email });
      await logConsoleAction(pool2, operator, "user.password_reset_requested", id, org_name, { email });
      res.json({ email, reset_token: token, expires_in_minutes: 60 });
    })
  );
  r.post(
    "/organizations/:id/members/:userId/status",
    asyncRoute(async (req, res) => {
      const id = parseId(req.params.id);
      const userId = parseId(req.params.userId);
      const operator = req.operator;
      const input = body(
        z29.object({ status: z29.enum(["active", "disabled"]), reason: z29.string().trim().min(3).max(300) }).strip(),
        req.body
      );
      const pool2 = adminDb();
      const member = await pool2.query(
        `SELECT u.email, m.role, o.name AS org_name FROM organization_members m
           JOIN users u ON u.id = m.user_id
           JOIN organizations o ON o.id = m.organization_id
          WHERE m.organization_id = $1::uuid AND m.user_id = $2::uuid`,
        [id, userId]
      );
      if (!member.rowCount) {
        throw new HttpError(404, "member_not_found", "Ce compte n'appartient pas \xE0 cette station.");
      }
      const { email, role, org_name } = member.rows[0];
      if (input.status === "disabled" && role === "owner") {
        const owners = await pool2.query(
          `SELECT count(*)::int AS n FROM organization_members
            WHERE organization_id = $1::uuid AND role = 'owner' AND status = 'active' AND user_id <> $2::uuid`,
          [id, userId]
        );
        if ((owners.rows[0].n ?? 0) === 0) {
          throw new HttpError(409, "last_owner", "C'est le dernier propri\xE9taire actif : la station deviendrait ing\xE9rable.");
        }
      }
      await pool2.query(
        `UPDATE organization_members
            SET status = $2, updated_at = now(),
                disabled_at = CASE WHEN $2 = 'disabled' THEN now() ELSE NULL END
          WHERE organization_id = $1::uuid AND user_id = $3::uuid`,
        [id, input.status, userId]
      );
      const action = input.status === "active" ? "membership.enabled" : "membership.disabled";
      await auditPlatformAction(pool2, id, operator.email, action, userId, { email, reason: input.reason });
      await logConsoleAction(pool2, operator, action, id, org_name, { email, reason: input.reason });
      res.json({ user_id: userId, email, membership_status: input.status });
    })
  );
  r.get(
    "/audit",
    asyncRoute(async (req, res) => {
      const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 300);
      const organizationId = typeof req.query.organization_id === "string" ? req.query.organization_id : null;
      const values = [limit];
      let where = "";
      if (organizationId && /^[0-9a-f-]{36}$/i.test(organizationId)) {
        values.push(organizationId);
        where = `WHERE organization_id = $${values.length}::uuid`;
      }
      const q = await adminDb().query(
        `SELECT id, operator_email, action, organization_id, organization_name, metadata, created_at
           FROM platform_audit_logs ${where}
          ORDER BY created_at DESC LIMIT $1`,
        values
      );
      res.json({ entries: q.rows });
    })
  );
  r.get(
    "/plans",
    asyncRoute(async (_req, res) => {
      const q = await adminDb().query(
        `SELECT code, name, price_cents, billing_cycle, max_users, max_workers, max_sites,
                price_overridden_at
         FROM plans ORDER BY sort_order ASC, price_cents ASC`
      );
      res.json({ plans: q.rows });
    })
  );
  r.patch(
    "/plans/:code",
    asyncRoute(async (req, res) => {
      const operator = req.operator;
      const code = String(req.params.code ?? "");
      if (!["starter", "pro", "business"].includes(code)) {
        throw new HttpError(404, "plan_not_found", "Ce forfait n'existe pas.");
      }
      const input = body(
        z29.object({
          price_xof: z29.number().int().min(1).max(1e6),
          reason: z29.string().trim().min(3).max(300)
        }).strip(),
        req.body
      );
      if (input.price_xof % 5 !== 0) {
        throw new HttpError(
          400,
          "price_not_multiple_of_5",
          "Le montant doit \xEAtre un multiple de 5 francs : les op\xE9rateurs mobile money refusent les autres."
        );
      }
      const pool2 = adminDb();
      const before = await pool2.query("SELECT price_cents FROM plans WHERE code = $1", [code]);
      if (!before.rowCount) {
        throw new HttpError(404, "plan_not_found", "Ce forfait n'existe pas.");
      }
      const previousCents = Number(before.rows[0].price_cents);
      const nextCents = input.price_xof * 100;
      await pool2.query(
        `UPDATE plans SET price_cents = $2::integer, price_overridden_at = now() WHERE code = $1`,
        [code, nextCents]
      );
      await logConsoleAction(pool2, operator, "plan.price_changed", null, null, {
        plan_code: code,
        previous_price_xof: Math.round(previousCents / 100),
        new_price_xof: input.price_xof,
        reason: input.reason
      });
      res.json({
        code,
        price_xof: input.price_xof,
        previous_price_xof: Math.round(previousCents / 100)
      });
    })
  );
  r.get(
    "/revenue",
    asyncRoute(async (req, res) => {
      const now = /* @__PURE__ */ new Date();
      const months = Math.min(Math.max(Number(req.query.months) || 12, 1), 36);
      const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
      const from = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth() - months, 1));
      const pool2 = adminDb();
      const [series, risk, recent] = await Promise.all([
        monthlyRevenue(pool2, from, to),
        revenueAtRisk(pool2, now),
        listRevenue(pool2, { limit: 50 })
      ]);
      const collected = series.reduce((sum, m) => sum + m.collected_cents, 0);
      const currentMonth = series[series.length - 1];
      res.json({
        from: from.toISOString(),
        to: to.toISOString(),
        series,
        recent,
        at_risk: risk.at_risk,
        pending: risk.pending,
        totals: {
          collected_cents: collected,
          // Argent encaissé pour des périodes qui courent encore : déjà
          // reçu, pas encore gagné. C'est une dette envers le client, pas
          // un bénéfice — s'il part demain, elle est à rendre.
          deferred_cents: await deferredRevenue(pool2, now),
          at_risk_cents: risk.at_risk.reduce((sum, o) => sum + o.price_cents, 0),
          pending_cents: risk.pending.reduce((sum, p) => sum + p.amount_cents, 0),
          month_collected_cents: currentMonth?.collected_cents ?? 0,
          month_recognized_cents: currentMonth?.recognized_cents ?? 0
        },
        channels: REVENUE_CHANNELS.map((code) => ({
          code,
          label: REVENUE_CHANNEL_LABELS[code]
        })),
        server_time: now.toISOString()
      });
    })
  );
  r.get(
    "/revenue/export",
    asyncRoute(async (req, res) => {
      const format = req.query.format === "journal" ? "journal" : "detail";
      const parseDay = (value) => {
        if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return void 0;
        const d = /* @__PURE__ */ new Date(`${value}T00:00:00.000Z`);
        return Number.isNaN(d.getTime()) ? void 0 : d;
      };
      const from = parseDay(req.query.from);
      const to = parseDay(req.query.to);
      const toExclusive = to ? new Date(to.getTime() + 864e5) : void 0;
      const rows = await listRevenue(adminDb(), { from, to: toExclusive, limit: 2e4 });
      const body2 = format === "journal" ? journalCsv(rows) : detailedCsv(rows);
      const span = `${from ? from.toISOString().slice(0, 10) : "debut"}_${to ? to.toISOString().slice(0, 10) : "ce-jour"}`;
      await logConsoleAction(adminDb(), req.operator, `revenue.export.${format}`, null, null, {
        rows: rows.length,
        from: from?.toISOString() ?? null,
        to: to?.toISOString() ?? null
      });
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="washpilot-${format === "journal" ? "journal" : "encaissements"}-${span}.csv"`
      );
      res.send(body2);
    })
  );
  r.post(
    "/revenue/:id/reverse",
    asyncRoute(async (req, res) => {
      const id = parseId(req.params.id);
      const operator = req.operator;
      const input = body(
        z29.object({
          reason: z29.string().trim().min(10, "Expliquez en quelques mots pourquoi cette ligne est annul\xE9e.").max(300)
        }).strip(),
        req.body
      );
      const pool2 = adminDb();
      const q = await pool2.query(
        `SELECT id, organization_id, organization_name, plan_code, plan_name,
                amount_cents::bigint AS amount_cents, months, period_start, period_end,
                channel, payment_reference, reverses_id
           FROM subscription_payments WHERE id = $1::uuid`,
        [id]
      );
      if (!q.rowCount) throw new HttpError(404, "not_found", "Encaissement introuvable.");
      const row = q.rows[0];
      if (row.reverses_id) {
        throw new HttpError(
          409,
          "already_a_reversal",
          "Cette ligne est d\xE9j\xE0 une contrepassation."
        );
      }
      const already = await pool2.query(
        "SELECT 1 FROM subscription_payments WHERE reverses_id = $1::uuid",
        [id]
      );
      if (already.rowCount) {
        throw new HttpError(409, "already_reversed", "Cet encaissement a d\xE9j\xE0 \xE9t\xE9 contrepass\xE9.");
      }
      const inserted = await pool2.query(
        `INSERT INTO subscription_payments(
           organization_id, organization_name, plan_code, plan_name, amount_cents, months,
           period_start, period_end, channel, payment_reference, source, operator_email,
           note, reverses_id)
         VALUES($1::uuid, $2, $3, $4, $5::bigint, $6::int, $7::timestamptz, $8::timestamptz,
                $9, $10, 'reversal', $11, $12, $13::uuid)
         RETURNING id`,
        [
          row.organization_id,
          row.organization_name,
          row.plan_code,
          row.plan_name,
          -Number(row.amount_cents),
          row.months,
          row.period_start,
          row.period_end,
          row.channel,
          row.payment_reference,
          operator.email,
          input.reason,
          id
        ]
      );
      await logConsoleAction(
        pool2,
        operator,
        "revenue.reversed",
        row.organization_id ?? null,
        row.organization_name,
        { reversed_id: id, amount_cents: Number(row.amount_cents), reason: input.reason }
      );
      res.json({
        reversed_id: id,
        reversal_id: inserted.rows[0].id,
        amount_cents: -Number(row.amount_cents)
      });
    })
  );
  registerAccountRoutes(r);
  registerSupportRoutes(r);
  registerMonitoringRoutes(r);
  registerClosureConsoleRoutes(r);
  return r;
}

// server/app.ts
init_console_auth();

// server/public-pricing.ts
init_db();
init_http();
init_auth();
init_entitlements();
import { Router as Router24 } from "express";
function createPublicPricingRouter() {
  const r = Router24();
  r.get(
    "/pricing",
    asyncRoute(async (_req, res) => {
      const pool2 = getPool();
      if (!pool2) throw new HttpError(503, "database_not_configured", "Base de donn\xE9es indisponible.");
      const q = await pool2.query(
        `SELECT code, price_cents
           FROM plans
          WHERE code IN ('starter','pro','business')
          ORDER BY sort_order ASC, price_cents ASC`
      );
      res.json({
        trial_days: TRIAL_DAYS,
        plans: q.rows.map((row) => ({
          code: String(row.code),
          price_xof: Math.round(Number(row.price_cents) / 100)
        }))
      });
    })
  );
  return r;
}

// server/app.ts
init_entitlements();

// server/monitoring-middleware.ts
init_db();
init_tenant_context();
var START = /* @__PURE__ */ Symbol("monitoring.start");
var LOGGED = /* @__PURE__ */ Symbol("monitoring.logged");
function routeTemplate(req) {
  const declared = req.route?.path;
  if (declared) {
    const base = req.baseUrl || "";
    const joined = `${base}${declared === "/" ? "" : declared}` || "/";
    return normalizeRoute(joined);
  }
  return normalizeRoute(req.originalUrl || req.url || "/");
}
function durationMs(req) {
  const start = req[START];
  if (start === void 0) return 0;
  return Number(process.hrtime.bigint() - start) / 1e6;
}
function detach(run) {
  void runWithoutTenant(run).catch((error) => {
    console.error("[surveillance] enregistrement impossible:", error instanceof Error ? error.message : error);
  });
}
function captureIncident(req, observation) {
  const tracked = req;
  if (tracked[LOGGED]) return;
  tracked[LOGGED] = true;
  if (!isDatabaseReady()) return;
  const pool2 = getPool();
  if (!pool2) return;
  detach(
    () => recordErrorEvent(pool2, {
      ...observation,
      method: req.method,
      route: routeTemplate(req),
      path: req.originalUrl || req.url || "/",
      durationMs: durationMs(tracked),
      organizationId: observation.organizationId ?? req.tenant?.organizationId ?? null,
      userId: observation.userId ?? req.tenant?.userId ?? req.auth?.userId ?? null,
      operatorEmail: observation.operatorEmail ?? req.operator?.email ?? null,
      body: observation.body ?? req.body
    })
  );
}
function monitorRequests() {
  return function monitoring(req, res, next) {
    const tracked = req;
    tracked[START] = process.hrtime.bigint();
    res.on("finish", () => {
      const elapsed = durationMs(tracked);
      if (!isDatabaseReady()) return;
      const pool2 = getPool();
      if (!pool2) return;
      const route = routeTemplate(req);
      detach(
        () => recordRequest(pool2, {
          method: req.method,
          route,
          status: res.statusCode,
          durationMs: elapsed
        })
      );
      if (res.statusCode >= 500 && !tracked[LOGGED]) {
        captureIncident(req, {
          status: res.statusCode,
          code: "unhandled",
          message: "R\xE9ponse 5xx \xE9mise sans passer par le gestionnaire d'erreurs.",
          stack: null
        });
        return;
      }
      if (elapsed >= SLOW_REQUEST_MS && !tracked[LOGGED]) {
        captureIncident(req, {
          kind: "slow",
          status: res.statusCode,
          code: "slow_request",
          message: `Requ\xEAte anormalement lente (${Math.round(elapsed)} ms).`,
          stack: null
        });
      }
    });
    next();
  };
}

// server/app.ts
function mountApi(app) {
  app.use(monitorRequests());
  app.use("/api/v1/auth", createAuthRouter());
  app.use("/api/v1/console/auth", createConsoleAuthRouter());
  app.use("/api/v1/console", requireOperator, createAdminRouter());
  app.use("/api/v1/public", createPublicPricingRouter());
  app.use("/api/v1", requireSession);
  app.use("/api/v1", requireTenantContext);
  app.use("/api/v1", attachSubscription);
  app.use("/api/v1", blockWritesWhenReadOnly);
  app.use("/api/v1", createSubscriptionRouter());
  app.use("/api/v1", createOnboardingRouter());
  app.use("/api/v1", createApiRouter());
  app.use("/api/v1", createPaymentsRouter());
  app.use("/api/v1", createStockRouter());
  app.use("/api/v1", createPurchaseRouter());
  app.use("/api/v1", createAttendanceRouter());
  app.use("/api/v1", createBackupRouter());
  app.use("/api/v1", createSupportRouter());
  app.use("/api/v1", createCheckoutRouter());
  app.use("/api/v1", createAccessRouter());
  app.use("/api/v1", createNotificationsRouter());
  app.use("/api/v1", createBrandingRouter());
  app.use("/api/v1", createAuditLogRouter());
  app.use("/api/v1", createTeamRouter());
  app.use("/api/v1", createReportsRouter());
  app.use("/api/v1", createOperationsRouter());
  app.use("/api/v1", createUtilitiesRouter());
  app.use("/api/v1", createUtilityInsightsRouter());
  app.use("/api/v1", (_req, res) => {
    res.status(404).json({ error: { code: "not_found", message: "Cette route API n'existe pas." } });
  });
  return app;
}
function apiErrorHandler(error, req, res, next) {
  void next;
  let status = error instanceof HttpError ? error.status : 500;
  let code = error instanceof HttpError ? error.code : "internal_error";
  let message = error instanceof HttpError ? error.message : "Une erreur interne est survenue. R\xE9essayez dans quelques instants.";
  if (!(error instanceof HttpError) && typeof error === "object" && error !== null && "type" in error) {
    const type = error.type;
    if (type === "entity.parse.failed") {
      status = 400;
      code = "invalid_json";
      message = "Le corps de la requ\xEAte n'est pas un JSON valide.";
    }
  }
  if (status >= 500) {
    console.error("[api] Request failed:", error instanceof Error ? error.message : error);
    captureIncident(req, {
      status,
      code,
      message: error instanceof Error ? error.message : String(message),
      stack: error instanceof Error ? error.stack ?? null : null
    });
  }
  res.status(status).json({ error: { code, message } });
}

// server/vercel-app.ts
init_db();

// server/reminders.ts
init_env();
init_mailer();
init_entitlements();
function planRenewalReminder(daysToExpiry, alreadySent = []) {
  const sent = new Set(alreadySent);
  if (daysToExpiry < 0) return sent.has("renewal_overdue") ? null : "renewal_overdue";
  if (daysToExpiry <= 1) return sent.has("renewal_j1") ? null : "renewal_j1";
  if (daysToExpiry <= 3) return sent.has("renewal_j3") ? null : "renewal_j3";
  if (daysToExpiry <= 7) return sent.has("renewal_j7") ? null : "renewal_j7";
  return null;
}
function planReminder(state, alreadySent = []) {
  const sent = new Set(alreadySent);
  if (state.expired_reason === "payment" || state.expired_reason === "cancelled") return null;
  if (state.is_expired) {
    return sent.has("trial_expired") ? null : "trial_expired";
  }
  if (!state.is_trial) return null;
  if (state.days_remaining <= 1) {
    return sent.has("trial_j1") ? null : "trial_j1";
  }
  if (state.days_remaining <= TRIAL_WARNING_DAYS) {
    return sent.has("trial_j3") ? null : "trial_j3";
  }
  return null;
}
async function runSubscriptionReminders(pool2, now = /* @__PURE__ */ new Date()) {
  const q = await pool2.query(
    `SELECT s.organization_id,
            o.name AS organization_name,
            s.status, s.current_period_end,
            p.code AS plan_code, p.name AS plan_name, p.price_cents AS plan_price_cents,
            p.features AS plan_features,
            owner.email AS owner_email, owner.first_name AS owner_first_name,
            (SELECT array_agg(r.kind) FROM subscription_reminders r
              WHERE r.organization_id = s.organization_id) AS sent_kinds
     FROM subscriptions s
     JOIN organizations o ON o.id = s.organization_id
     JOIN plans p ON p.id = s.plan_id
     LEFT JOIN LATERAL (
       SELECT u.email, u.first_name
       FROM organization_members m JOIN users u ON u.id = m.user_id
       WHERE m.organization_id = s.organization_id
       ORDER BY CASE m.role WHEN 'owner' THEN 0 WHEN 'manager' THEN 1 ELSE 2 END, m.created_at
       LIMIT 1
     ) owner ON true
     WHERE s.status IN ('trialing','expired','active')`
  );
  const outcomes = [];
  for (const row of q.rows) {
    const state = computeSubscriptionState({
      status: row.status,
      current_period_end: row.current_period_end,
      plan_code: row.plan_code,
      plan_name: row.plan_name,
      plan_price_cents: row.plan_price_cents,
      plan_features: row.plan_features,
      now
    });
    if (!row.owner_email) continue;
    const sentKinds = row.sent_kinds ?? [];
    if (state.status === "active") {
      const periodEnd = row.current_period_end ? new Date(row.current_period_end) : null;
      if (!periodEnd) continue;
      const daysToExpiry = Math.ceil(
        (periodEnd.getTime() - now.getTime()) / 864e5
      );
      const renewalKind = planRenewalReminder(daysToExpiry, sentKinds);
      if (!renewalKind) continue;
      const reservedRenewal = await pool2.query(
        `INSERT INTO subscription_reminders(organization_id, kind)
         VALUES($1::uuid,$2) ON CONFLICT (organization_id, kind) DO NOTHING RETURNING kind`,
        [row.organization_id, renewalKind]
      );
      if (!reservedRenewal.rowCount) continue;
      const renewalDelivered = await sendMail(
        renewalReminderMessage(renewalKind, {
          to: row.owner_email,
          firstName: row.owner_first_name,
          organizationName: row.organization_name,
          planName: row.plan_name ?? "votre forfait",
          periodEnd: periodEnd.toISOString(),
          billingUrl: billingUrl()
        })
      );
      await pool2.query(
        `INSERT INTO audit_logs(organization_id, action, entity_type, entity_id, metadata)
           VALUES($1::uuid,'subscription.reminder_sent','subscription',$1::text,$2::jsonb)`,
        [
          row.organization_id,
          JSON.stringify({
            kind: renewalKind,
            delivered: renewalDelivered,
            to: row.owner_email,
            days_to_expiry: daysToExpiry
          })
        ]
      ).catch(() => {
      });
      outcomes.push({
        organization_id: row.organization_id,
        kind: renewalKind,
        email: row.owner_email,
        delivered: renewalDelivered
      });
      continue;
    }
    if (state.expired_reason === "payment") {
      if (sentKinds.includes("renewal_read_only")) continue;
      const reservedCutoff = await pool2.query(
        `INSERT INTO subscription_reminders(organization_id, kind)
         VALUES($1::uuid,$2) ON CONFLICT (organization_id, kind) DO NOTHING RETURNING kind`,
        [row.organization_id, "renewal_read_only"]
      );
      if (!reservedCutoff.rowCount) continue;
      const cutoffDelivered = await sendMail(
        renewalReminderMessage("renewal_read_only", {
          to: row.owner_email,
          firstName: row.owner_first_name,
          organizationName: row.organization_name,
          planName: row.plan_name ?? "votre forfait",
          periodEnd: row.current_period_end ? new Date(row.current_period_end).toISOString() : null,
          billingUrl: billingUrl()
        })
      );
      outcomes.push({
        organization_id: row.organization_id,
        kind: "renewal_read_only",
        email: row.owner_email,
        delivered: cutoffDelivered
      });
      continue;
    }
    const kind = planReminder(state, sentKinds);
    if (!kind) continue;
    const reserved = await pool2.query(
      `INSERT INTO subscription_reminders(organization_id, kind)
       VALUES($1::uuid,$2) ON CONFLICT (organization_id, kind) DO NOTHING RETURNING kind`,
      [row.organization_id, kind]
    );
    if (!reserved.rowCount) continue;
    const delivered = await sendMail(
      trialReminderMessage(kind, {
        to: row.owner_email,
        firstName: row.owner_first_name,
        organizationName: row.organization_name,
        daysRemaining: state.days_remaining,
        trialEndsAt: state.trial_ends_at,
        billingUrl: billingUrl()
      })
    );
    await pool2.query(
      `INSERT INTO audit_logs(organization_id, action, entity_type, entity_id, metadata)
         VALUES($1::uuid,'subscription.reminder_sent','subscription',$1::text,$2::jsonb)`,
      [row.organization_id, JSON.stringify({ kind, delivered, to: row.owner_email })]
    ).catch(() => {
    });
    outcomes.push({ organization_id: row.organization_id, kind, email: row.owner_email, delivered });
  }
  return outcomes;
}
function billingUrl() {
  const base = env.APP_URL.replace(/\/+$/, "");
  return base ? `${base}/settings/billing` : "/settings/billing";
}

// server/vercel-app.ts
init_env();

// server/vercel-url.ts
var API_PATH_PARAM = "__washpilot_api_path";
function decodeSegment(segment) {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}
function normalizeSegments(slug) {
  const raw = Array.isArray(slug) ? slug : typeof slug === "string" ? slug.split("/") : [];
  return raw.map((segment) => decodeSegment(String(segment)).replace(/^\/+|\/+$/g, "")).filter((segment) => segment.length > 0);
}
function withSearch(path, search) {
  if (!search) return path;
  const query = search.startsWith("?") ? search : `?${search}`;
  return query === "?" ? path : `${path}${query}`;
}
function splitUrl(raw) {
  const index = raw.indexOf("?");
  if (index === -1) return { urlPath: raw, search: "" };
  return { urlPath: raw.slice(0, index), search: raw.slice(index) };
}
function parseSearch(search) {
  return new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
}
function formatSearch(params) {
  const query = params.toString();
  return query ? `?${query}` : "";
}
function restoreApiPath(input) {
  const rawUrl = (input.url ?? "").trim();
  const { urlPath, search: urlSearch } = splitUrl(rawUrl);
  const params = parseSearch(input.search ?? urlSearch);
  const fromRewrite = normalizeSegments(input.pathOverride ?? params.get(API_PATH_PARAM));
  params.delete(API_PATH_PARAM);
  if (fromRewrite.length > 0) {
    return { url: withSearch(`/api/${fromRewrite.join("/")}`, formatSearch(params)), source: "rewrite" };
  }
  const segments = normalizeSegments(input.slug);
  if (segments.length > 0) {
    return { url: withSearch(`/api/${segments.join("/")}`, formatSearch(params)), source: "slug" };
  }
  if (urlPath.startsWith("/api/") && urlPath.length > "/api/".length) {
    return { url: withSearch(urlPath, formatSearch(params)), source: "url" };
  }
  const autoPath = normalizeSegments(params.get("path"));
  if ((urlPath === "/api" || urlPath === "/api/") && autoPath.length > 0) {
    params.delete("path");
    return { url: withSearch(`/api/${autoPath.join("/")}`, formatSearch(params)), source: "rewrite" };
  }
  if (urlPath === "/api" || urlPath === "/api/") {
    return { url: withSearch("/api", formatSearch(params)), source: "url" };
  }
  return { url: null, source: "none" };
}

// server/vercel-app.ts
var database = null;
function ensureDatabase() {
  database ??= initDatabaseSchema().then(() => ({ status: "ready" })).catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[vercel] Initialisation de la base impossible :", message);
    return { status: "failed", message };
  });
  return database;
}
function keepPreParsedBody(req, _res, next) {
  if (req.body !== void 0 && req.body !== null) req._body = true;
  next();
}
function cronAuthorized(req) {
  const secret = env.CRON_SECRET.trim();
  if (!secret) return false;
  const header = req.get("authorization") ?? "";
  const bearer = header.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : "";
  const supplied = bearer || (req.get("x-cron-secret") ?? "").trim();
  if (supplied.length !== secret.length) return false;
  let diff = 0;
  for (let i = 0; i < secret.length; i += 1) {
    diff |= secret.charCodeAt(i) ^ supplied.charCodeAt(i);
  }
  return diff === 0;
}
function buildApp() {
  const app = express2();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    next();
  });
  app.use((req, res, next) => {
    if (req.path.startsWith("/api/")) res.setHeader("Cache-Control", "private, no-store");
    next();
  });
  app.use(keepPreParsedBody);
  app.use(express2.json({ limit: "1mb" }));
  app.get(["/healthz", "/api/healthz"], (_req, res) => {
    res.json({ status: "ok", database: isDatabaseReady() ? "ready" : "unavailable" });
  });
  app.all("/api/v1/cron/reminders", async (req, res) => {
    if (!env.CRON_SECRET.trim()) {
      res.status(503).json({
        error: { code: "cron_not_configured", message: "CRON_SECRET n'est pas d\xE9fini : les relances ne peuvent pas \xEAtre d\xE9clench\xE9es." }
      });
      return;
    }
    if (!cronAuthorized(req)) {
      res.status(401).json({ error: { code: "unauthorized", message: "Jeton de cron invalide." } });
      return;
    }
    const pool2 = getPool();
    if (!pool2) {
      res.status(503).json({ error: { code: "database_unavailable", message: "Base de donn\xE9es indisponible." } });
      return;
    }
    try {
      const [outcomes, alerts, reconciliation] = await Promise.all([
        runSubscriptionReminders(pool2),
        runMonitoringAlerts(pool2),
        runScheduledReconciliation(pool2)
      ]);
      res.json({
        ran_at: (/* @__PURE__ */ new Date()).toISOString(),
        processed: outcomes.length,
        outcomes,
        alerts,
        reconciliation
      });
    } catch (error) {
      console.error("[vercel] Relances \xE9chou\xE9es :", error instanceof Error ? error.message : error);
      res.status(500).json({ error: { code: "reminders_failed", message: "Les relances n'ont pas pu \xEAtre ex\xE9cut\xE9es." } });
    }
  });
  app.use("/api", (req, res, next) => {
    if (req.path.startsWith("/v1")) return next();
    res.status(404).json({ error: { code: "not_found", message: "Cette route API n'existe pas." } });
  });
  mountApi(app);
  app.use(apiErrorHandler);
  return app;
}
var application = null;
function getServerlessApp() {
  application ??= buildApp();
  return application;
}
async function awaitDatabase() {
  return ensureDatabase();
}
async function handleServerlessRequest(req, res, slug) {
  const restored = restoreApiPath({
    slug: slug ?? req.query?.slug,
    pathOverride: req.query?.[API_PATH_PARAM],
    url: req.url
  });
  if (!restored.url) {
    res.status(404).json({
      error: {
        code: "not_found",
        message: "Cette route API n'existe pas."
      }
    });
    return;
  }
  const state = await awaitDatabase();
  if (state.status !== "ready") {
    res.status(503).json({
      error: {
        code: "database_unavailable",
        message: "La base de donn\xE9es n'est pas joignable. V\xE9rifiez DATABASE_URL dans les variables d'environnement du d\xE9ploiement.",
        detail: state.status === "failed" ? state.message.slice(0, 300) : "initialisation en cours"
      }
    });
    return;
  }
  req.url = restored.url;
  getServerlessApp()(req, res);
}

// server/vercel-handler.ts
async function handler(req, res) {
  await handleServerlessRequest(req, res);
}
export {
  handler as default
};
