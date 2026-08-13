import { and, eq, isNull, sql } from "drizzle-orm";
import { closeDatabase, db } from "../server/db/client.js";
import { files } from "../server/db/schema.js";
import { getObjectBuffer } from "../server/services/storage.js";
import { probeAudioDurationSeconds } from "../server/services/audioDuration.js";

let scanned = 0;
let updated = 0;
let unresolved = 0;

try {
  const rows = await db
    .select({ id: files.id, storageKey: files.storageKey, extension: files.extension, detectedMime: files.detectedMime })
    .from(files)
    .where(and(isNull(files.deletedAt), isNull(files.durationSeconds), sql`(${files.detectedMime} LIKE 'audio/%' OR ${files.detectedMime} IN ('video/webm', 'video/ogg'))`));

  scanned = rows.length;
  for (const file of rows) {
    try {
      const durationSeconds = await probeAudioDurationSeconds(await getObjectBuffer(file.storageKey), file.extension ?? "");
      if (!durationSeconds) {
        unresolved += 1;
        continue;
      }
      await db.update(files).set({ durationSeconds }).where(eq(files.id, file.id));
      updated += 1;
    } catch {
      unresolved += 1;
    }
  }
} finally {
  await closeDatabase();
}

console.log(JSON.stringify({ scanned, updated, unresolved }));
process.exitCode = unresolved > 0 ? 1 : 0;
