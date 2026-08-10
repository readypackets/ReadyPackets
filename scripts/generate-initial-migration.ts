/**
 * Generates `drizzle/migrations/0001_initial_schema.sql` from the Drizzle
 * schema definition. Keeping the SQL in the repository means the installer can
 * migrate a production database without carrying the TypeScript toolchain.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { getTableName, getTableColumns, is } from "drizzle-orm";
import { getTableConfig, MySqlTable } from "drizzle-orm/mysql-core";
import * as schema from "../server/db/schema.js";

type AnyTable = MySqlTable & Record<string, unknown>;

function quote(identifier: string): string {
  return `\`${identifier}\``;
}

function columnType(column: {
  columnType: string;
  getSQLType(): string;
  notNull: boolean;
  hasDefault: boolean;
  default: unknown;
  autoIncrement?: boolean;
  hasOnUpdateNow?: boolean;
}): string {
  const parts: string[] = [];
  let sqlType = column.getSQLType();
  if (column.columnType === "MySqlBoolean") sqlType = "tinyint(1)";
  if (column.columnType === "MySqlTinyInt") sqlType = "tinyint";
  parts.push(sqlType);
  parts.push(column.notNull ? "NOT NULL" : "NULL");
  if (column.autoIncrement) {
    // AUTO_INCREMENT columns must not carry a DEFAULT clause.
    parts.push("AUTO_INCREMENT");
    return parts.join(" ");
  }
  if (column.hasDefault) {
    const value = column.default;
    if (typeof value === "boolean") parts.push(`DEFAULT ${value ? 1 : 0}`);
    else if (typeof value === "number") parts.push(`DEFAULT ${value}`);
    else if (typeof value === "string") parts.push(`DEFAULT '${value.replace(/'/g, "''")}'`);
    else parts.push("DEFAULT CURRENT_TIMESTAMP");
  }
  if (column.hasOnUpdateNow) parts.push("ON UPDATE CURRENT_TIMESTAMP");
  return parts.join(" ");
}

function renderTable(table: AnyTable): string {
  const name = getTableName(table);
  const config = getTableConfig(table);
  const columns = getTableColumns(table);

  const lines: string[] = [];
  for (const column of Object.values(columns)) {
    const definition = columnType(
      column as unknown as Parameters<typeof columnType>[0],
    );
    lines.push(`  ${quote(column.name)} ${definition}`);
  }

  const primaryColumns = Object.values(columns).filter((column) => column.primary);
  if (primaryColumns.length > 0) {
    lines.push(
      `  PRIMARY KEY (${primaryColumns.map((column) => quote(column.name)).join(", ")})`,
    );
  }
  for (const pk of config.primaryKeys) {
    lines.push(
      `  PRIMARY KEY (${pk.columns.map((column) => quote(column.name)).join(", ")})`,
    );
  }
  for (const uniqueConstraint of config.uniqueConstraints) {
    lines.push(
      `  UNIQUE KEY ${quote(uniqueConstraint.name ?? "uniq")} (${uniqueConstraint.columns
        .map((column) => quote(column.name))
        .join(", ")})`,
    );
  }
  for (const idx of config.indexes) {
    const idxConfig = idx.config as {
      name: string;
      unique?: boolean;
      columns: { name: string }[];
    };
    const keyword = idxConfig.unique ? "UNIQUE KEY" : "KEY";
    lines.push(
      `  ${keyword} ${quote(idxConfig.name)} (${idxConfig.columns
        .map((column) => quote(column.name))
        .join(", ")})`,
    );
  }

  return [
    `CREATE TABLE IF NOT EXISTS ${quote(name)} (`,
    lines.join(",\n"),
    ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;",
  ].join("\n");
}

async function main(): Promise<void> {
  const tables = Object.values(schema).filter((value) => is(value, MySqlTable));

  const statements = tables.map((table) => renderTable(table as unknown as AnyTable));

  const header = [
    "-- ReadyPackets Portal — initial schema",
    "-- Generated from server/db/schema.ts by scripts/generate-initial-migration.ts.",
    "-- Forward-only: never edit an applied migration; add a new numbered file instead.",
    "",
  ].join("\n");

  const outputDir = path.resolve(process.cwd(), "drizzle", "migrations");
  await mkdir(outputDir, { recursive: true });
  const outputFile = path.join(outputDir, "0001_initial_schema.sql");
  await writeFile(outputFile, `${header}${statements.join("\n\n")}\n`, "utf8");
  console.log(`Wrote ${statements.length} tables to ${outputFile}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
