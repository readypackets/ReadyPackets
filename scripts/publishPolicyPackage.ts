import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { and, desc, eq } from "drizzle-orm";
import { db, closeDatabase } from "../server/db/client.js";
import { policyDocuments, policyVersions } from "../server/db/schema.js";
import { recordActivity } from "../server/observability/audit.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const actorArg = process.argv.find((value) => value.startsWith("--actor-user-id="));
const actorUserId = actorArg ? Number(actorArg.slice("--actor-user-id=".length)) : NaN;
const dryRun = process.argv.includes("--dry-run");
if (!Number.isInteger(actorUserId) || actorUserId <= 0) throw new Error("Usage: publishPolicyPackage.ts --actor-user-id=<active-admin-id> [--dry-run]");

const sourceDir = process.env.RP_POLICY_SOURCE_DIR ?? path.join(here, "..", "docs", "legal", "policy-center-update-2026-08-20");
const definitions = [
  { slug: "privacy-policy", version: "2026.08.20-consulting", file: "privacy-policy.md" },
  { slug: "refund-policy", version: "2026.08.20-consulting", file: "refund-policy.md" },
  { slug: "liability-disclaimer", version: "2026.08.20-consulting", file: "liability-disclaimer.md" },
  { slug: "mnda", version: "1.1", file: "mnda.md" },
] as const;

async function main() {
  for (const definition of definitions) {
    const bodyMarkdown = (await readFile(path.join(sourceDir, definition.file), "utf8")).trim();
    if (bodyMarkdown.length < 100) throw new Error(`${definition.file} is unexpectedly short.`);
    const [document] = await db.select().from(policyDocuments).where(eq(policyDocuments.slug, definition.slug)).limit(1);
    if (!document) throw new Error(`Policy document ${definition.slug} does not exist.`);
    const [existing] = await db.select({ id: policyVersions.id }).from(policyVersions).where(and(eq(policyVersions.policyId, document.id), eq(policyVersions.version, definition.version))).limit(1);
    if (existing) {
      console.log(`${definition.slug}\tskipped\t${definition.version}`);
      continue;
    }
    if (dryRun) {
      console.log(`${definition.slug}\twould-publish\t${definition.version}`);
      continue;
    }
    await db.insert(policyVersions).values({ policyId: document.id, version: definition.version, effectiveDate: "2026-08-20", bodyMarkdown, published: true, createdByUserId: actorUserId });
    const [current] = await db.select({ id: policyVersions.id }).from(policyVersions).where(eq(policyVersions.policyId, document.id)).orderBy(desc(policyVersions.createdAt)).limit(1);
    await recordActivity({ actorUserId, actorRole: "admin", action: "policy.version_published", entityType: "policy_document", entityId: String(document.id), severity: "warning", summary: `Published ${document.title} version ${definition.version} from the reviewed 2026-08-20 policy package`, changes: { slug: definition.slug, version: definition.version, effectiveDate: "2026-08-20", source: definition.file, policyVersionId: current?.id ?? null }, ipAddress: null });
    console.log(`${definition.slug}\tpublished\t${definition.version}`);
  }
}

main().finally(async () => { await closeDatabase(); });
