import { getSetting } from "../services/settings.js";

export const MFA_POLICY_VALUES = ["required", "optional", "disabled"] as const;
export type MfaPolicy = (typeof MFA_POLICY_VALUES)[number];

function parsePolicy(value: string | null, fallback: MfaPolicy): MfaPolicy {
  return MFA_POLICY_VALUES.includes(value as MfaPolicy) ? (value as MfaPolicy) : fallback;
}

/**
 * MFA policy is role-scoped so customer convenience choices cannot silently
 * weaken administrative protection. Defaults preserve the existing posture:
 * administrators are required; customers may enrol voluntarily.
 */
export async function getMfaPolicyForRole(role: string): Promise<MfaPolicy> {
  const key = role === "admin" ? "security.mfa_admin_policy" : "security.mfa_customer_policy";
  const fallback: MfaPolicy = role === "admin" ? "required" : "optional";
  return parsePolicy(await getSetting(key), fallback);
}

export function mfaRequirement(policy: MfaPolicy, hasConfirmedMfa: boolean): {
  mfaPending: boolean;
  restricted: boolean;
  mfaRequired: boolean;
  mfaSetupRequired: boolean;
} {
  if (policy === "disabled") {
    return { mfaPending: false, restricted: false, mfaRequired: false, mfaSetupRequired: false };
  }
  if (hasConfirmedMfa) {
    // Enrolled users continue to prove possession of their second factor unless
    // the administrator explicitly turns MFA off for their role.
    return { mfaPending: true, restricted: false, mfaRequired: true, mfaSetupRequired: false };
  }
  if (policy === "required") {
    return { mfaPending: false, restricted: true, mfaRequired: false, mfaSetupRequired: true };
  }
  return { mfaPending: false, restricted: false, mfaRequired: false, mfaSetupRequired: false };
}

export function policyLabel(policy: MfaPolicy): string {
  if (policy === "required") return "Required";
  if (policy === "optional") return "Optional";
  return "Disabled";
}
