import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { getTableConfig } from "drizzle-orm/pg-core";
import type { PgTable } from "drizzle-orm/pg-core";
import * as schema from "./schema/index.js";

/**
 * Migration ↔ schema validation.
 *
 * Migration SQL is plain text: a table or column that does not exist fails only
 * at execution time, against a real database, which for an accounting migration
 * means discovering it in front of live financial data. These tests resolve
 * every table and column named in the migrations against the Drizzle schema so
 * the mismatch is caught in CI instead.
 *
 * This is a structural check, not a string search — it derives the valid names
 * from the schema definitions themselves, so renaming a table in the schema
 * without updating the migration fails here.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(here, "../migrations");

function isPgTable(value: unknown): value is PgTable {
  return (
    typeof value === "object" &&
    value !== null &&
    Symbol.for("drizzle:Name") in value
  );
}

/** Real table → column names, read from the Drizzle schema definitions. */
function schemaTables(): Map<string, Set<string>> {
  const tables = new Map<string, Set<string>>();
  for (const exported of Object.values(schema)) {
    if (!isPgTable(exported)) continue;
    const config = getTableConfig(exported);
    tables.set(
      config.name,
      new Set(config.columns.map((column) => column.name)),
    );
  }
  return tables;
}

function readMigration(file: string): string {
  return fs.readFileSync(path.join(migrationsDir, file), "utf8");
}

/** Strip SQL line comments so commented-out names are not treated as references. */
function stripComments(sql: string): string {
  return sql
    .split("\n")
    .map((line) => line.replace(/--.*$/, ""))
    .join("\n");
}

interface TableColumnReference {
  table: string;
  column: string | null;
  statement: string;
}

/**
 * Extract the table/column references a migration actually depends on:
 * UPDATE ... SET, ALTER TABLE ... ALTER COLUMN, and COMMENT ON COLUMN.
 */
function extractReferences(rawSql: string): TableColumnReference[] {
  const sql = stripComments(rawSql);
  const references: TableColumnReference[] = [];

  const updatePattern = /UPDATE\s+([a-z_][a-z0-9_]*)\s+SET\s+([\s\S]*?)(?=;|\bWHERE\b)/gi;
  for (const match of sql.matchAll(updatePattern)) {
    const table = match[1]!;
    const assignments = match[2]!;
    references.push({ table, column: null, statement: match[0] });
    for (const assignment of assignments.split(",")) {
      const column = assignment.trim().match(/^([a-z_][a-z0-9_]*)\s*=/i);
      if (column) {
        references.push({ table, column: column[1]!, statement: match[0] });
      }
    }
  }

  const alterPattern =
    /ALTER\s+TABLE\s+([a-z_][a-z0-9_]*)\s+ALTER\s+COLUMN\s+([a-z_][a-z0-9_]*)/gi;
  for (const match of sql.matchAll(alterPattern)) {
    references.push({
      table: match[1]!,
      column: match[2]!,
      statement: match[0],
    });
  }

  const commentPattern =
    /COMMENT\s+ON\s+COLUMN\s+([a-z_][a-z0-9_]*)\.([a-z_][a-z0-9_]*)/gi;
  for (const match of sql.matchAll(commentPattern)) {
    references.push({
      table: match[1]!,
      column: match[2]!,
      statement: match[0],
    });
  }

  return references;
}

/** Tables the migration creates itself are legitimate references. */
function tablesCreatedInFile(rawSql: string): Set<string> {
  const created = new Set<string>();
  const pattern =
    /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-z_][a-z0-9_]*)/gi;
  for (const match of stripComments(rawSql).matchAll(pattern)) {
    created.add(match[1]!);
  }
  return created;
}

const MINOR_UNITS_MIGRATION = "019_studio_credit_minor_units.sql";

describe("migration ↔ schema validation", () => {
  it("resolves the schema so the check has something to validate against", () => {
    const tables = schemaTables();
    assert.ok(tables.size > 5, "expected the Drizzle schema to expose tables");
    assert.ok(tables.has("studio_promotions"));
    assert.ok(tables.get("studio_promotions")?.has("bonus_credits"));
  });

  it("every table referenced by every migration exists in the schema", () => {
    const tables = schemaTables();
    const files = fs
      .readdirSync(migrationsDir)
      .filter((name) => name.endsWith(".sql"));

    for (const file of files) {
      const sql = readMigration(file);
      const created = tablesCreatedInFile(sql);
      for (const reference of extractReferences(sql)) {
        if (created.has(reference.table)) continue;
        assert.ok(
          tables.has(reference.table),
          `${file} references unknown table "${reference.table}" in: ${reference.statement.trim()}`,
        );
      }
    }
  });

  it("every column referenced by every migration exists on its table", () => {
    const tables = schemaTables();
    const files = fs
      .readdirSync(migrationsDir)
      .filter((name) => name.endsWith(".sql"));

    for (const file of files) {
      const sql = readMigration(file);
      const created = tablesCreatedInFile(sql);
      for (const reference of extractReferences(sql)) {
        if (reference.column == null) continue;
        if (created.has(reference.table)) continue;
        const columns = tables.get(reference.table);
        if (!columns) continue;
        assert.ok(
          columns.has(reference.column),
          `${file} references unknown column "${reference.table}.${reference.column}" in: ${reference.statement.trim()}`,
        );
      }
    }
  });

  it("catches a table name that does not exist in the schema", () => {
    // Proves the validator would have caught the original `promotions` bug.
    const broken = "UPDATE promotions SET bonus_credits = bonus_credits * 100;";
    const tables = schemaTables();
    const references = extractReferences(broken);
    assert.equal(references[0]?.table, "promotions");
    assert.equal(tables.has("promotions"), false);
  });

  it("catches a column name that does not exist on a real table", () => {
    const broken = "UPDATE renders SET credits_usedd = credits_usedd * 100;";
    const tables = schemaTables();
    const reference = extractReferences(broken).find((r) => r.column != null);
    assert.equal(reference?.column, "credits_usedd");
    assert.equal(tables.get("renders")?.has("credits_usedd"), false);
  });
});

describe("minor-unit migration safety", () => {
  const sql = readMigration(MINOR_UNITS_MIGRATION);

  it("converts every Studio Credit column, and only by a factor of 100", () => {
    const expected: Array<[string, string]> = [
      ["studio_credit_transactions", "amount"],
      ["studio_credit_allocations", "original_amount"],
      ["studio_credit_allocations", "remaining_amount"],
      ["studio_credit_allocation_consumptions", "amount"],
      ["renders", "studio_credits_used"],
      ["render_deletion_events", "original_credits_consumed"],
      ["studio_promotions", "bonus_credits"],
    ];

    const references = extractReferences(sql);
    for (const [table, column] of expected) {
      assert.ok(
        references.some((r) => r.table === table && r.column === column),
        `migration does not convert ${table}.${column}`,
      );
    }

    // Every conversion multiplies its own column by exactly 100.
    for (const match of stripComments(sql).matchAll(
      /([a-z_][a-z0-9_]*)\s*=\s*([a-z_][a-z0-9_]*)\s*\*\s*(\d+)/gi,
    )) {
      assert.equal(match[1], match[2], "column multiplied by a different column");
      assert.equal(match[3], "100", "conversion factor must be exactly 100");
    }
  });

  it("performs every conversion inside the guarded block", () => {
    const doBlock = sql.match(/DO \$\$([\s\S]*?)END \$\$;/);
    assert.ok(doBlock, "expected a DO block");
    const body = doBlock![1]!;

    // No value-multiplying UPDATE may sit outside the guard.
    const outside = sql.replace(doBlock![0], "");
    assert.equal(
      /\*\s*100/.test(stripComments(outside)),
      false,
      "a conversion exists outside the idempotency guard",
    );

    // The guard must precede every UPDATE inside the block.
    const guardIndex = body.indexOf("RETURN;");
    const firstUpdate = body.search(/UPDATE\s/i);
    assert.ok(guardIndex > -1, "guard must exit early");
    assert.ok(
      guardIndex < firstUpdate,
      "conversions must not run before the marker check",
    );
  });

  it("cannot multiply values again once the marker is recorded", () => {
    const doBlock = sql.match(/DO \$\$([\s\S]*?)END \$\$;/)![1]!;

    const guardKey = doBlock.match(
      /studio_credit_ledger_meta\s+WHERE\s+key\s*=\s*'([a-z0-9_]+)'/i,
    );
    const markerKey = doBlock.match(
      /INSERT\s+INTO\s+studio_credit_ledger_meta\s*\(key\)\s*VALUES\s*\('([a-z0-9_]+)'\)/i,
    );

    assert.ok(guardKey, "guard must read a marker key");
    assert.ok(markerKey, "migration must record a marker key");
    assert.equal(
      guardKey![1],
      markerKey![1],
      "guard and marker keys must match or the migration would re-run",
    );

    // The marker table's key must be unique, so a concurrent second run
    // aborts on the primary key instead of converting twice.
    assert.match(
      sql,
      /CREATE TABLE IF NOT EXISTS studio_credit_ledger_meta\s*\(\s*key TEXT PRIMARY KEY/,
    );
  });

  it("records the marker in the same block as the conversions", () => {
    const doBlock = sql.match(/DO \$\$([\s\S]*?)END \$\$;/)![1]!;
    const lastUpdate = doBlock.toUpperCase().lastIndexOf("UPDATE ");
    const insertMarker = doBlock.toUpperCase().indexOf("INSERT INTO STUDIO_CREDIT_LEDGER_META");
    assert.ok(
      insertMarker > lastUpdate,
      "marker must be written after the conversions, inside the same atomic block",
    );
  });

  it("sets the new render default to one 2K image in minor units", () => {
    assert.match(
      sql,
      /ALTER TABLE renders ALTER COLUMN studio_credits_used SET DEFAULT 150/,
    );
  });
});
