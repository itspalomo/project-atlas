import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createPool } from "./pool.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main(): Promise<void> {
  const pool = createPool();
  const migrationsDir = path.resolve(__dirname, "../../../../infrastructure/postgres/migrations");
  const files = (await readdir(migrationsDir)).filter((file) => file.endsWith(".sql")).sort();

  await pool.query(`
    create table if not exists schema_migrations (
      version text primary key,
      applied_at timestamptz not null default now()
    )
  `);

  for (const file of files) {
    const applied = await pool.query("select 1 from schema_migrations where version = $1", [file]);
    if (applied.rowCount) {
      continue;
    }

    const sql = await readFile(path.join(migrationsDir, file), "utf8");
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query(sql);
      await client.query("insert into schema_migrations (version) values ($1)", [file]);
      await client.query("commit");
      console.log(`Applied migration ${file}`);
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  await pool.end();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
