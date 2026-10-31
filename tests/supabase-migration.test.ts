import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { schemaSql } from "../server/db.ts"

const migrationUrl = new URL("../supabase/migrations/20261031000000_initial_schema.sql", import.meta.url)
const migration = readFileSync(migrationUrl, "utf8")
const separator = migration.indexOf("\n\n")
const migrationSql = migration.slice(separator + 2).trim()

test("la migration Supabase initiale reste alignée sur le schéma local de test", () => {
  assert.notEqual(separator, -1, "l'en-tête de migration doit être séparé du SQL")
  assert.equal(migrationSql, schemaSql.trim())
})

test("la nouvelle base ne contient aucune liaison d'authentification fournisseur retirée", () => {
  assert.doesNotMatch(migrationSql, /provider_(?:sub|id)/i)
  assert.match(migrationSql, /CREATE TABLE IF NOT EXISTS auth_sessions/)
  assert.match(migrationSql, /CREATE TABLE IF NOT EXISTS organizations/)
})

test("la baseline active les politiques d'isolation des organisations", () => {
  assert.match(migrationSql, /CREATE ROLE washpilot_app NOLOGIN/)
  assert.match(migrationSql, /ALTER TABLE organizations ENABLE ROW LEVEL SECURITY/)
  assert.match(migrationSql, /CREATE POLICY org_isolation ON washes/)
})

test("la migration de durcissement retire les droits publics de Supabase", () => {
  const hardening = readFileSync(
    new URL("../supabase/migrations/20261031120000_supabase_hardening.sql", import.meta.url),
    "utf8",
  )
  // `anon` détient par défaut des droits sur tout le schéma public ; sans cette
  // révocation, la Data API expose des tables que l'application ne sert qu'en
  // SQL direct.
  assert.match(hardening, /REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated/)
  assert.match(hardening, /REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated/)
  // Rejouable sur un PostgreSQL sans rôles Supabase.
  assert.match(hardening, /IF EXISTS \(SELECT 1 FROM pg_roles WHERE rolname = 'anon'\)/)
})
