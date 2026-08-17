import { getSettingBool } from "../services/settings.js";

/**
 * Emergency access mode intended for controlled launches and incident response.
 * It is deliberately role-aware rather than IP-based: only active administrators
 * can establish or retain portal sessions while it is enabled.
 */
export const ADMIN_ONLY_ACCESS_SETTING = "access.administrator_only_enabled";

export async function isAdministratorOnlyAccessEnabled(): Promise<boolean> {
  return getSettingBool(ADMIN_ONLY_ACCESS_SETTING, false);
}

export function isAdministratorRole(role: string | null | undefined): boolean {
  return role === "admin";
}

export async function isRoleBlockedByAdministratorOnlyAccess(role: string | null | undefined): Promise<boolean> {
  return (await isAdministratorOnlyAccessEnabled()) && !isAdministratorRole(role);
}
