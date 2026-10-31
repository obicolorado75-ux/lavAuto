-- LAVAUTO: durcissement propre à Supabase.
--
-- Sur Supabase, la base est joignable par HTTP (PostgREST / « Data API ») avec
-- la clé publique `anon`. Les rôles `anon` et `authenticated` y reçoivent par
-- défaut des droits sur **toutes** les tables du schéma `public` — y compris
-- celles que l'application ne lit qu'en SQL direct depuis le serveur.
--
-- Or l'application n'utilise pas la Data API : tout passe par `pg` et par les
-- politiques `org_isolation`, qui reposent sur `app.current_org`, une variable
-- que seule une connexion SQL peut poser. Exposer malgré tout les tables à
-- `anon` ne sert à rien et élargit la surface d'attaque : une table sans
-- politique (comme `users`) n'est protégée que par l'activation de RLS.
--
-- Cette migration retire donc aux rôles publics tout droit sur le schéma
-- `public`. `service_role` (qui contourne RLS et ne quitte jamais le serveur)
-- et le propriétaire des tables conservent les leurs : la Console Supabase et
-- les sauvegardes continuent de fonctionner.
--
-- Sur un PostgreSQL ordinaire, les rôles `anon` et `authenticated` n'existent
-- pas : les blocs ci-dessous ne font rien, la migration reste rejouable et
-- sans effet de bord.

DO $supabase$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
     OR EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    -- Tables déjà présentes.
    EXECUTE 'REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated';
    EXECUTE 'REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated';
    -- Tables et séquences créées plus tard par le propriétaire.
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated';
  END IF;
EXCEPTION
  WHEN undefined_object OR insufficient_privilege THEN
    RAISE NOTICE '[supabase] droits publics non révoqués (rôle absent ou droits insuffisants).';
END $supabase$;

DO $supabase$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
     OR EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE CREATE ON SCHEMA public FROM anon, authenticated';
  END IF;
EXCEPTION
  WHEN undefined_object OR insufficient_privilege THEN
    RAISE NOTICE '[supabase] droit CREATE sur public non révoqué.';
END $supabase$;
