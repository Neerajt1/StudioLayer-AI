import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

function resolveMigrationsDir(): string | null {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(here, "../migrations"),
    path.resolve(here, "../../../lib/db/migrations"),
    path.resolve(process.cwd(), "lib/db/migrations"),
  ];

  for (const dir of candidates) {
    if (fs.existsSync(dir)) {
      return dir;
    }
  }

  return null;
}

/** Apply idempotent SQL migrations — safe to run on every API startup. */
export async function ensureDatabaseMigrations(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required to apply migrations");
  }

  const migrationsDir = resolveMigrationsDir();
  if (!migrationsDir) {
    throw new Error("Could not locate lib/db/migrations");
  }

  const files = fs
    .readdirSync(migrationsDir)
    .filter((name) => name.endsWith(".sql"))
    .sort();

  const client = new pg.Client({ connectionString });
  await client.connect();

  try {
    for (const file of files) {
      const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
      await client.query(sql);
    }
  } finally {
    await client.end();
  }
}
