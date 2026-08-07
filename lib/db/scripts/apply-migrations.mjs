import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Client } = pg;
const here = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(here, "../migrations");

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is required. Example: set -a && source ../../.env && set +a");
  process.exit(1);
}

const files = fs
  .readdirSync(migrationsDir)
  .filter((name) => name.endsWith(".sql"))
  .sort();

const client = new Client({ connectionString });
await client.connect();

try {
  for (const file of files) {
    const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
    console.log(`Applying ${file}...`);
    await client.query(sql);
  }
  console.log("Migrations complete.");
} finally {
  await client.end();
}
