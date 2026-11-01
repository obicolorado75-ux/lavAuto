// Régénère la migration initiale depuis server/db.ts::schemaSql.
// Usage: npx tsx scripts/regen-initial-migration.mts
// La migration initiale n'a jamais été appliquée sur une base réelle : elle
// reste rejouable, donc régénérable. Toute migration APPLIQUÉE ne se touche
// plus jamais — on ajoute un nouveau fichier à la place.
import { writeFileSync } from "node:fs"
import { schemaSql } from "../server/db.ts"

const HEADER = `-- LAVAUTO: schema initial de lapplication.
-- Projet Supabase dédié ; base neuve (aucune reprise de données).
-- Générée depuis server/db.ts::schemaSql le 2026-11-01.
-- Ne jamais modifier après application : créer une nouvelle migration.`

const target = new URL("../supabase/migrations/20261031000000_initial_schema.sql", import.meta.url)
writeFileSync(target, `${HEADER}\n\n${schemaSql.trim()}\n`, "utf8")
console.log("Migration initiale régénérée :", target.pathname)
