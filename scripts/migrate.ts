/**
 * Forward-only migration runner.
 *
 * Applies every `drizzle/migrations/*.sql` file that has not yet been recorded
 * in `schema_migrations`, in filename order, inside a transaction per file.
 * Re-running is safe. A checksum mismatch on an already-applied file aborts the
 * run, because silently diverging schemas are worse than a hard failure.
 */
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import mysql from "mysql2/promise";
import { env } from "../server/config/env.js";

const MIGRATIONS_DIR = path.resolve(process.cwd(), "drizzle", "migrations");

/**
 * Legacy migration files may contain their own schema_migrations INSERT. The
 * runner owns the ledger transactionally, so executing that statement would
 * make the runner's authoritative INSERT fail with a duplicate key. Keep the
 * original file bytes for checksum compatibility and skip only that statement.
 */
const legacyMigrationLedgerInsert = /^INSERT\s+(?:IGNORE\s+)?INTO\s+`?schema_migrations`?\b/i;

/** Remove only leading SQL comments before classifying a legacy statement. */
function stripLeadingSqlComments(statement: string): string {
  let remaining = statement.trimStart();
  while (remaining.startsWith("--") || remaining.startsWith("/*")) {
    if (remaining.startsWith("--")) {
      const newline = remaining.indexOf("\n");
      remaining = newline < 0 ? "" : remaining.slice(newline + 1).trimStart();
      continue;
    }
    const end = remaining.indexOf("*/", 2);
    remaining = end < 0 ? "" : remaining.slice(end + 2).trimStart();
  }
  return remaining;
}

/**
 * One historic migration supplied its own fixed ledger checksum. Accept that
 * known, immutable value without relaxing checksum checks for any other file.
 */
const acceptedLegacyMigrationChecksums = new Map<string, string>([
  ["0005_tier4_tier5.sql", "tier4_tier5_v1"],
]);

/** Split a SQL file on semicolons that are not inside quotes or comments. */
function splitStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = "";
  let inSingle = false;
  let inDouble = false;
  let inBacktick = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (let i = 0; i < sql.length; i += 1) {
    const char = sql[i] as string;
    const next = sql[i + 1];

    if (inLineComment) {
      if (char === "\n") inLineComment = false;
      current += char;
      continue;
    }
    if (inBlockComment) {
      if (char === "*" && next === "/") {
        inBlockComment = false;
        current += "*/";
        i += 1;
        continue;
      }
      current += char;
      continue;
    }
    if (!inSingle && !inDouble && !inBacktick) {
      if (char === "-" && next === "-") {
        inLineComment = true;
        current += char;
        continue;
      }
      if (char === "/" && next === "*") {
        inBlockComment = true;
        current += "/*";
        i += 1;
        continue;
      }
    }

    if (char === "'" && !inDouble && !inBacktick) inSingle = !inSingle;
    else if (char === '"' && !inSingle && !inBacktick) inDouble = !inDouble;
    else if (char === "`" && !inSingle && !inDouble) inBacktick = !inBacktick;

    if (char === ";" && !inSingle && !inDouble && !inBacktick) {
      const trimmed = current.trim();
      if (trimmed) statements.push(trimmed);
      current = "";
      continue;
    }
    current += char;
  }

  const tail = current.trim();
  if (tail) statements.push(tail);
  return statements.filter((statement) => {
    const withoutComments = statement
      .split("\n")
      .filter((line) => !line.trim().startsWith("--"))
      .join("\n")
      .trim();
    return withoutComments.length > 0;
  });
}

async function main(): Promise<void> {
  const connection = await mysql.createConnection({
    uri: env.databaseUrl,
    multipleStatements: false,
  });

  await connection.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename VARCHAR(190) NOT NULL PRIMARY KEY,
      checksum VARCHAR(64) NOT NULL,
      applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  const [rows] = await connection.query<mysql.RowDataPacket[]>(
    "SELECT filename, checksum FROM schema_migrations",
  );
  const applied = new Map(rows.map((row) => [row.filename as string, row.checksum as string]));

  const entries = (await readdir(MIGRATIONS_DIR))
    .filter((name) => name.endsWith(".sql"))
    .sort((a, b) => a.localeCompare(b, "en"));

  let appliedCount = 0;

  for (const filename of entries) {
    const sql = await readFile(path.join(MIGRATIONS_DIR, filename), "utf8");
    const checksum = createHash("sha256").update(sql).digest("hex");
    const previous = applied.get(filename);

    if (previous) {
      if (previous !== checksum) {
        const acceptedLegacyChecksum = acceptedLegacyMigrationChecksums.get(filename);
        if (acceptedLegacyChecksum !== previous) {
          throw new Error(
            `Migration ${filename} has changed after being applied. ` +
              "Create a new migration instead of editing an applied one.",
          );
        }
        process.stdout.write(`Using accepted legacy checksum for ${filename}.\n`);
      }
      continue;
    }

    const statements = splitStatements(sql).filter(
      (statement) => !legacyMigrationLedgerInsert.test(stripLeadingSqlComments(statement)),
    );
    process.stdout.write(`Applying ${filename} (${statements.length} statements)... `);
    await connection.beginTransaction();
    try {
      for (const statement of statements) {
        await connection.query(statement);
      }
      await connection.query(
        "INSERT INTO schema_migrations (filename, checksum) VALUES (?, ?)",
        [filename, checksum],
      );
      await connection.commit();
      appliedCount += 1;
      process.stdout.write("done\n");
    } catch (error) {
      await connection.rollback();
      process.stdout.write("failed\n");
      throw error;
    }
  }

  await connection.end();
  console.log(
    appliedCount === 0
      ? "Database is already up to date."
      : `Applied ${appliedCount} migration(s).`,
  );
}

main().catch((error: unknown) => {
  console.error("Migration failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
