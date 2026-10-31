# Supabase — base de production et base locale

WashPilot CI utilise **Supabase PostgreSQL** comme base distante de production. Le schéma est versionné dans `supabase/migrations/` et s’applique avec les migrations Supabase ; le serveur ne doit pas créer ou modifier silencieusement le schéma au démarrage.

## Projet Lavauto — activer la base

| | |
| --- | --- |
| Référence du projet | `venjuyjcyqjntudolgqu` |
| URL du projet | https://venjuyjcyqjntudolgqu.supabase.co |
| Région | `eu-west-3` (Paris) |
| Mot de passe de la base | **uniquement** dans Supabase → Project Settings → Database, et dans le `.env` ou le secret d’hébergement |

### État au 31 octobre 2026

Le projet `venjuyjcyqjntudolgqu` (région `eu-west-3`, PostgreSQL 17.11) est **activé** : les trois migrations sont appliquées et inscrites dans `supabase_migrations.schema_migrations`. Contrôle effectué après application :

| | |
| --- | --- |
| Tables dans `public` | 58 (toutes avec RLS active) |
| Politiques `org_isolation` | 44 |
| Index / contraintes | 149 / 246 (clés, unicité et CHECK) |
| Rôle `washpilot_app` | créé, `postgres` en est membre |
| Forfaits amorcés | `starter`, `pro`, `business` |
| Empreinte des colonnes | `f53e047559a5c0d18f2be095df6d40f1` — identique à la base de référence |
| Empreinte des contraintes | `36190cb92cf5a69e0ce6762d98720e13` en local ; `6b40286800fe27fc8028b543443ae766` à distance — même contenu, noms générés différents (voir ci-dessous) |

Les empreintes sont comparées à celles d’une base neuve créée en local à partir des mêmes fichiers : elles prouvent que le schéma distant est **exactement** celui du dépôt, colonne par colonne. Elles se recalculent avec :

```sql
SELECT md5(string_agg(c.table_name||'.'||c.column_name||':'||c.data_type||':'||c.is_nullable, '|'
                      ORDER BY c.table_name, c.column_name))
  FROM information_schema.columns c WHERE c.table_schema='public';
```

La seule différence connue porte sur les **noms** des contraintes `NOT NULL` de `organization_branding` : lorsqu’une table est créée par une requête isolée dans PostgreSQL 17, ces contraintes reçoivent un nom généré (`2200_19026_1_not_null`) au lieu du nom conventionnel `organization_branding_organization_id_not_null`. Le nombre (7) et la nature des contraintes sont identiques ; aucun contrôle n’est perdu.

La troisième migration (`20261031160000_organization_branding.sql`) crée la table du logo de la station et l’ajoute aux tables isolées par `org_isolation`. Le logo est stocké en base (`bytea`, 300 Ko au plus) plutôt que dans un compartiment objet : un seul fournisseur, une seule sauvegarde, et l’export complet reste un unique fichier JSON.

La seconde migration (`20261031120000_supabase_hardening.sql`) retire aux rôles `anon` et `authenticated` — ceux de la Data API, joignables avec la clé publique — tout droit sur le schéma `public`. L’application n’utilise pas PostgREST : elle passe par `pg` et par les politiques RLS, qui reposent sur `app.current_org`, une variable qu’une connexion HTTP ne peut pas poser. `service_role` et le propriétaire des tables conservent leurs droits.

Il reste **une** chose à faire côté exploitation : renseigner `DATABASE_URL` (mot de passe compris) là où tourne l’API. Voir §2.

Un projet Supabase neuf ne contient que les schémas de Supabase Auth/Storage : **les tables de l’application n’existent pas encore**. « Activer Supabase » revient donc à trois gestes — déjà faits pour ce projet, et reproductibles pour un autre.

### 1. Appliquer le schéma (une seule fois)

Trois chemins, selon ce qui est accessible depuis votre poste.

**a. Éditeur SQL du tableau de bord** — le plus simple, aucun outil à installer :

1. Supabase → **SQL Editor** → **New query** ;
2. coller l’intégralité de `supabase/migrations/20261031000000_initial_schema.sql` ;
3. **Run**. La migration est idempotente : la rejouer ne casse rien.

**b. GitHub Actions** — pour un poste qui n’atteint pas `supabase.co` :

1. Settings → Secrets and variables → Actions → **New repository secret**, nom `SUPABASE_DB_URL`, valeur = chaîne de connexion complète (mot de passe compris). Secret facultatif `SUPABASE_DB_CA` si le certificat est refusé ;
2. Actions → **Supabase — activation** → *Run workflow*, mode `check` puis `apply`.

**c. Ligne de commande**, sur une machine qui atteint la base :

```bash
npm run db:activate:check -- "postgresql://postgres:MOT_DE_PASSE@db.venjuyjcyqjntudolgqu.supabase.co:5432/postgres"
npm run db:activate       -- "postgresql://postgres:MOT_DE_PASSE@db.venjuyjcyqjntudolgqu.supabase.co:5432/postgres"
```

La commande applique les migrations manquantes, les inscrit dans
`supabase_migrations.schema_migrations` (la table lue par la CLI Supabase, qui
ne les rejouera donc pas), puis vérifie les tables, le rôle `washpilot_app` et
l’appartenance du compte. `--check` n’écrit rien et sort en code 1 si la base
n’est pas prête — utilisable tel quel dans une CI.

### 2. Renseigner la connexion

Dans `.env` en local, ou dans les variables du projet sur l’hébergeur :

```dotenv
DATABASE_URL=postgresql://postgres:MOT_DE_PASSE@db.venjuyjcyqjntudolgqu.supabase.co:5432/postgres
SEED_DEMO_DATA=false
APP_URL=https://votre-domaine
CORS_ORIGINS=https://votre-domaine
PLATFORM_ADMIN_EMAILS=votre@adresse.ci
```

Par le pooler (IPv4 obligatoire, réseau filtré), l’utilisateur porte la
référence du projet et l’hôte dépend de la région :

```dotenv
DATABASE_URL=postgresql://postgres.venjuyjcyqjntudolgqu:MOT_DE_PASSE@aws-0-<région>.pooler.supabase.com:5432/postgres
```

Le port **5432** est le mode session ; le **6543** (transaction) casse l’état de
session dont dépend l’isolation RLS entre stations.

### 3. Démarrer et vérifier

```bash
npm run dev        # avec DATABASE_URL renseignée dans .env
curl -s localhost:3000/readyz   # {"status":"ready"}
```

Les journaux doivent afficher `[db] Connecté à PostgreSQL via DATABASE_URL` et
`[rls] Isolation multi-station active`. Si le message parle de repli sur la base
embarquée, la connexion a échoué : le motif est affiché juste avant.

> **Dépôt public.** Le mot de passe de la base ne doit jamais être commité :
> `DATABASE_URL` vit dans `.env` (ignoré par Git) ou dans un secret d’hôte.
> Un `.env` poussé par erreur reste dans l’historique — réinitialisez alors le
> mot de passe dans Supabase plutôt que de réécrire l’historique.

## Production

1. Utiliser le projet Supabase **Lavauto** dédié à cette application.
2. Configurer `DATABASE_URL` avec la connexion directe PostgreSQL, ou le pooler Supavisor en **mode session**. Le port 6543 (mode transaction) ne conserve pas le contexte de session requis par l’isolation RLS et ne doit pas être utilisé.
3. Conserver la vérification TLS active. Si l’environnement requiert un certificat Supabase spécifique, fournir `DATABASE_SSL_CA` au format PEM ou comme chemin de certificat.
4. Appliquer les migrations avant le déploiement de l’API. L’application vérifie les tables essentielles au démarrage et échoue si le schéma initial n’a pas été appliqué.
5. Définir les variables d’exploitation (`APP_URL`, e-mail, secrets de console/cron, `SEED_DEMO_DATA=false`) dans l’environnement d’hébergement, jamais dans Git.

Le backend utilise le client PostgreSQL `pg` et l’authentification applicative existante (comptes et sessions stockés dans le schéma de l’application). La clé `service_role` et les clés Supabase ne sont pas nécessaires dans le navigateur ni dans l’API pour les accès SQL directs. Ne jamais exposer une clé secrète dans `VITE_*`.

## Développement et tests

- `npm run dev` sans `DATABASE_URL` utilise le PGlite local du serveur.
- `npm test` force une base PGlite isolée par fichier et ignore toute URL externe.
- L’application web conserve un PGlite dans IndexedDB pour la file locale d’opérations hors connexion ; les mutations en attente sont envoyées à l’API authentifiée au retour du réseau. Supabase reste la source de vérité distante.
- Il n’y a pas de réplication bidirectionnelle automatique du catalogue et de toutes les tables : la synchronisation actuelle est une file d’écritures hors ligne, ordonnée et idempotente. Les conflits définitifs sont conservés dans la file pour résolution opérateur.

## Migrations

Les migrations sont la source de vérité du schéma Supabase. Pour appliquer une migration avec la CLI :

```bash
supabase link --project-ref <project-ref>
supabase db push
```

Créer ensuite une nouvelle migration versionnée pour toute évolution du schéma. Ne pas modifier une migration déjà appliquée à un environnement partagé.
