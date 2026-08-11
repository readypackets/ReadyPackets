import { and, desc, eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { policyAcceptances, policyDocuments, policyVersions } from "../db/schema.js";

export type RequiredPolicy = {
  policyId: number;
  slug: string;
  title: string;
  versionId: number;
  version: string;
  effectiveDate: string;
  bodyMarkdown: string;
};

/**
 * Returns the current required published policy version for every document.
 * Superseded versions remain in history but never create an acceptance gate.
 */
export async function listCurrentRequiredPolicies(): Promise<RequiredPolicy[]> {
  const rows = await db
    .select({
      policyId: policyDocuments.id,
      slug: policyDocuments.slug,
      title: policyDocuments.title,
      versionId: policyVersions.id,
      version: policyVersions.version,
      effectiveDate: policyVersions.effectiveDate,
      bodyMarkdown: policyVersions.bodyMarkdown,
    })
    .from(policyDocuments)
    .innerJoin(policyVersions, eq(policyVersions.policyId, policyDocuments.id))
    .where(and(eq(policyDocuments.requiresAcceptance, true), eq(policyVersions.published, true)))
    .orderBy(desc(policyVersions.id));

  const latestByPolicy = new Map<number, RequiredPolicy>();
  for (const row of rows) {
    if (!latestByPolicy.has(row.policyId)) latestByPolicy.set(row.policyId, row);
  }
  return Array.from(latestByPolicy.values());
}

export async function listPendingRequiredPolicies(userId: number): Promise<RequiredPolicy[]> {
  const [requiredPolicies, accepted] = await Promise.all([
    listCurrentRequiredPolicies(),
    db
      .select({ policyVersionId: policyAcceptances.policyVersionId })
      .from(policyAcceptances)
      .where(eq(policyAcceptances.userId, userId)),
  ]);
  const acceptedVersionIds = new Set(accepted.map((row) => row.policyVersionId));
  return requiredPolicies.filter((policy) => !acceptedVersionIds.has(policy.versionId));
}

export async function hasPendingRequiredPolicies(userId: number): Promise<boolean> {
  return (await listPendingRequiredPolicies(userId)).length > 0;
}
