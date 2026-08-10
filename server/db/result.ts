/**
 * Helpers for reading MySQL result metadata.
 *
 * The mysql2 driver returns `[ResultSetHeader, FieldPacket[]]`, and Drizzle
 * passes that tuple through unchanged. Accessing `insertId` on the tuple itself
 * silently yields `undefined`, which then becomes `NaN` and produces a query
 * against a column named "NaN". Centralising the extraction removes that trap.
 */

interface ResultSetHeaderLike {
  insertId?: number;
  affectedRows?: number;
}

function header(result: unknown): ResultSetHeaderLike {
  if (Array.isArray(result)) {
    return (result[0] ?? {}) as ResultSetHeaderLike;
  }
  return (result ?? {}) as ResultSetHeaderLike;
}

/** The auto-increment id produced by an insert. Throws if the driver omitted it. */
export function insertedId(result: unknown): number {
  const id = Number(header(result).insertId);
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error("The insert did not return a usable identifier");
  }
  return id;
}

/** Number of rows changed by an update or delete; zero when unavailable. */
export function affectedRows(result: unknown): number {
  const rows = Number(header(result).affectedRows);
  return Number.isFinite(rows) ? rows : 0;
}
