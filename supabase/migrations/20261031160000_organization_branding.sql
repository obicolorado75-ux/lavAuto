-- LAVAUTO: identité visuelle de la station (logo téléversé).
--
-- Migration additive, idempotente : le projet Supabase déjà provisionné reçoit
-- la table, sa politique d'isolation et ses droits sans rejouer la baseline.
-- Les installations neuves la trouvent aussi dans la migration initiale — les
-- deux définitions sont identiques, et les deux se rejouent sans effet.
--
-- Le logo est stocké dans la base (bytea), pas dans un compartiment objet :
-- c'est le choix de l'application depuis l'origine, il évite un second
-- fournisseur et garde la sauvegarde complète dans un seul export.

CREATE TABLE IF NOT EXISTS organization_branding (
 organization_id uuid PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
 logo_mime_type text CHECK (logo_mime_type IN ('image/png','image/jpeg','image/webp')),
 logo_byte_size integer,
 logo_data bytea,
 logo_updated_at timestamptz,
 -- Le logo, son type et sa taille sont indissociables : un octet sans type ne
 -- peut pas être servi avec un Content-Type honnête, un type sans octet ne
 -- s'affiche pas, et une taille absente rendrait la limite invérifiable.
 CHECK (
  (logo_data IS NULL AND logo_mime_type IS NULL AND logo_byte_size IS NULL)
  OR (logo_data IS NOT NULL AND logo_mime_type IS NOT NULL
      AND logo_byte_size BETWEEN 1 AND 300000)
 ),
 updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
 updated_at timestamptz NOT NULL DEFAULT now()
);

-- Isolation multi-station : même politique `org_isolation` que les autres
-- tables portant leur organisation.
ALTER TABLE organization_branding ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS org_isolation ON organization_branding;
CREATE POLICY org_isolation ON organization_branding
  USING (organization_id = NULLIF(current_setting('app.current_org', true), '')::uuid)
  WITH CHECK (organization_id = NULLIF(current_setting('app.current_org', true), '')::uuid);

-- Droits du rôle applicatif : sans eux, la lecture du logo échouerait dès le
-- premier démarrage sur une base où la baseline a été appliquée avant cette
-- table (la clause DEFAULT PRIVILEGES ne couvre que les créations suivantes).
DO $brand$
BEGIN
  EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON organization_branding TO washpilot_app';
EXCEPTION WHEN undefined_object OR insufficient_privilege THEN
  RAISE NOTICE '[branding] droits du rôle washpilot_app non accordés sur organization_branding.';
END $brand$;
