-- Rotation & révocation de sessions (P1 sécurité)
--
-- Trois colonnes sur auth_sessions :
--   • rotated_at    : horodatage du dernier pivot du jeton. getSessionUser
--                     relit COALESCE(rotated_at, created_at) et émet un
--                     nouveau token_hash au-delà d'une fenêtre d'une heure,
--                     ce qui borne la durée de vie d'un jeton volé.
--   • created_ip    : IP à la connexion (écran « Appareils actifs »).
--   • device_label  : description lisible de l'appareil (navigateur · OS).
--
-- Les lignes existantes ne sont pas modifiées : rotated_at NULL retombe sur
-- created_at via COALESCE, donc une session héritée pivote dès sa première
-- activité après le déploiement — comportement volontaire, sans interruption.
ALTER TABLE auth_sessions ADD COLUMN IF NOT EXISTS rotated_at timestamptz;
ALTER TABLE auth_sessions ADD COLUMN IF NOT EXISTS created_ip text;
ALTER TABLE auth_sessions ADD COLUMN IF NOT EXISTS device_label text;

-- Index de rotation : liste les sessions dont la fenêtre de rotation est
-- échue (requête périodique de la console / futurs jobs de nettoyage).
CREATE INDEX IF NOT EXISTS idx_auth_sessions_rotated
  ON auth_sessions (COALESCE(rotated_at, created_at));

-- Droits du rôle applicatif : la baseline DEFAULT PRIVILEGES couvre les
-- créations futures, mais ces ALTER ne créent aucune table ; on re-grant
-- explicitement pour les bases où le rôle aurait été limité en lecture.
DO $sess$
BEGIN
  EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON auth_sessions TO washpilot_app';
EXCEPTION WHEN undefined_object OR insufficient_privilege THEN
  RAISE NOTICE '[sessions] droits du rôle washpilot_app non re-accordés sur auth_sessions.';
END $sess$;
