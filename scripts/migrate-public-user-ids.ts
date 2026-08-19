import { eq } from "drizzle-orm";
import { closeDatabase, db } from "../server/db/client.js";
import { siteSettings, users } from "../server/db/schema.js";
import { generateCustomerNumber } from "../server/security/crypto.js";

/**
 * One-time public account reference migration.
 *
 * Internal numeric user IDs remain untouched. The externally displayed
 * `users.customer_number` and compatibility `users.public_id` are both aligned
 * to one opaque RP-CUS reference. The database unique indexes are the collision
 * authority; each update retries a randomly generated candidate if necessary.
 */
async function main(): Promise<void> {
  const migrated = await db.transaction(async (tx) => {
    const rows = await tx
      .select({ id: users.id, publicId: users.publicId, customerNumber: users.customerNumber })
      .from(users)
      .orderBy(users.id);

    const legacyToNew = new Map<string, string>();
    let updated = 0;
    for (const row of rows) {
      let assigned = false;
      let lastError: unknown;
      for (let attempt = 0; attempt < 10 && !assigned; attempt += 1) {
        const publicId = generateCustomerNumber();
        try {
          await tx.update(users).set({ customerNumber: publicId, publicId }).where(eq(users.id, row.id));
          if (row.publicId) legacyToNew.set(row.publicId.toUpperCase(), publicId);
          if (row.customerNumber) legacyToNew.set(row.customerNumber.toUpperCase(), publicId);
          assigned = true;
          updated += 1;
        } catch (error) {
          lastError = error;
        }
      }
      if (!assigned) {
        throw lastError instanceof Error
          ? new Error(`Unable to assign a unique customer ID for user ${row.id}: ${lastError.message}`)
          : new Error(`Unable to assign a unique customer ID for user ${row.id}.`);
      }
    }

    const whitelist = (await tx
      .select({ settingValue: siteSettings.settingValue })
      .from(siteSettings)
      .where(eq(siteSettings.settingKey, "access.login_whitelist_public_ids"))
      .limit(1))[0];
    if (whitelist?.settingValue) {
      let existing: unknown;
      try {
        existing = JSON.parse(whitelist.settingValue);
      } catch {
        throw new Error("Configured account login whitelist is not valid JSON; customer ID migration rolled back.");
      }
      if (Array.isArray(existing)) {
        const remapped = existing.map((value) => legacyToNew.get(String(value).toUpperCase()) ?? value);
        await tx
          .update(siteSettings)
          .set({ settingValue: JSON.stringify(remapped) })
          .where(eq(siteSettings.settingKey, "access.login_whitelist_public_ids"));
      }
    }

    return updated;
  });

  const verification = await db
    .select({ id: users.id, publicId: users.publicId, customerNumber: users.customerNumber })
    .from(users);
  const unique = new Set(verification.map((row) => row.publicId));
  if (verification.some((row) => !row.publicId || !row.customerNumber || row.publicId !== row.customerNumber || !/^RP-CUS-[A-Z0-9]{6,8}$/.test(row.publicId)) || unique.size !== verification.length) {
    throw new Error("Customer-ID migration verification failed; duplicate, missing, or invalid RP-CUS IDs detected.");
  }

  console.log(JSON.stringify({ migrated, verified: verification.length, format: "RP-CUS-XXXXXXXX" }));
}

void main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDatabase();
  });
