import { PGlite } from "@electric-sql/pglite";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const dir = join(process.cwd(), ".data", "pglite");
console.log("dir exists:", existsSync(dir));
if (existsSync(dir)) {
  for (const f of ["PG_VERSION", "postmaster.pid", "postgresql.conf", "postgresql.auto.conf", "pg_hba.conf"]) {
    const p = join(dir, f);
    console.log(`  ${f}: ${existsSync(p) ? readFileSync(p, "utf8").slice(0, 200) : "MISSING"}`);
  }
}

try {
  const db = new PGlite(dir, { verbose: true });
  const r = await db.query(`SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name`);
  console.log("LOCAL_PGLITE_TABLES=" + JSON.stringify(r.rows.map((x) => x.table_name)));
  for (const t of r.rows.map((x) => x.table_name)) {
    const c = await db.query(`SELECT COUNT(*)::bigint AS n FROM "${t}"`);
    console.log(`  ${t} : ${c.rows[0].n}`);
  }
  await db.close();
} catch (e) {
  console.error("DIAGNOSE_ERR", e?.message || e);
  process.exit(1);
}

