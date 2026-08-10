/**
 * Site settings and feature flags, cached in-process with a short TTL.
 *
 * The cache keeps hot paths such as the maintenance check and the rate-limit
 * configuration off the database on every request, while a 15-second TTL and an
 * explicit invalidation hook keep administrative changes responsive.
 */
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { featureFlags, rateLimitConfigs, siteSettings } from "../db/schema.js";
import { logger } from "../observability/logger.js";
import {
  RATE_LIMIT_CATEGORY_LABELS,
  type FeatureFlagKey,
  type RateLimitCategory,
} from "../../shared/domain.js";

const TTL_MS = 15_000;

interface CacheEntry<T> {
  value: T;
  loadedAt: number;
}

let settingsCache: CacheEntry<Map<string, string | null>> | null = null;
let flagCache: CacheEntry<Map<string, boolean>> | null = null;
let rateLimitCache: CacheEntry<Map<RateLimitCategory, RateLimitSetting>> | null = null;

export interface RateLimitSetting {
  category: RateLimitCategory;
  label: string;
  windowSeconds: number;
  maxRequests: number;
  enabled: boolean;
  penaltyEnabled: boolean;
}

export const DEFAULT_RATE_LIMITS: Record<RateLimitCategory, RateLimitSetting> = {
  auth_high_risk: {
    category: "auth_high_risk",
    label: RATE_LIMIT_CATEGORY_LABELS.auth_high_risk,
    windowSeconds: 1800,
    maxRequests: 5,
    enabled: true,
    penaltyEnabled: true,
  },
  user_login: {
    category: "user_login",
    label: RATE_LIMIT_CATEGORY_LABELS.user_login,
    windowSeconds: 900,
    maxRequests: 10,
    enabled: true,
    penaltyEnabled: true,
  },
  form_submission: {
    category: "form_submission",
    label: RATE_LIMIT_CATEGORY_LABELS.form_submission,
    windowSeconds: 600,
    maxRequests: 20,
    enabled: true,
    penaltyEnabled: true,
  },
  api: {
    category: "api",
    label: RATE_LIMIT_CATEGORY_LABELS.api,
    windowSeconds: 60,
    maxRequests: 120,
    enabled: true,
    penaltyEnabled: false,
  },
  expensive: {
    category: "expensive",
    label: RATE_LIMIT_CATEGORY_LABELS.expensive,
    windowSeconds: 300,
    maxRequests: 10,
    enabled: true,
    penaltyEnabled: true,
  },
  standard_browsing: {
    category: "standard_browsing",
    label: RATE_LIMIT_CATEGORY_LABELS.standard_browsing,
    windowSeconds: 60,
    maxRequests: 300,
    enabled: true,
    penaltyEnabled: false,
  },
};

function fresh<T>(entry: CacheEntry<T> | null): entry is CacheEntry<T> {
  return entry !== null && Date.now() - entry.loadedAt < TTL_MS;
}

export function invalidateSettingsCache(): void {
  settingsCache = null;
  flagCache = null;
  rateLimitCache = null;
}

async function loadSettings(): Promise<Map<string, string | null>> {
  if (fresh(settingsCache)) return settingsCache.value;
  const map = new Map<string, string | null>();
  try {
    const rows = await db
      .select({ key: siteSettings.settingKey, value: siteSettings.settingValue })
      .from(siteSettings);
    for (const row of rows) map.set(row.key, row.value);
  } catch (error) {
    logger.error("Failed to load site settings", { error });
  }
  settingsCache = { value: map, loadedAt: Date.now() };
  return map;
}

export async function getSetting(key: string): Promise<string | null> {
  const map = await loadSettings();
  return map.get(key) ?? null;
}

export async function getSettingBool(key: string, fallback = false): Promise<boolean> {
  const value = await getSetting(key);
  if (value === null) return fallback;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

export async function getSettingNumber(key: string, fallback: number): Promise<number> {
  const value = await getSetting(key);
  if (value === null) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export async function getSettingJson<T>(key: string, fallback: T): Promise<T> {
  const value = await getSetting(key);
  if (value === null) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export async function setSetting(
  key: string,
  value: string | null,
  options: { valueType?: string; category?: string; isSecret?: boolean; userId?: number } = {},
): Promise<void> {
  await db
    .insert(siteSettings)
    .values({
      settingKey: key,
      settingValue: value,
      valueType: options.valueType ?? "string",
      category: options.category ?? "general",
      isSecret: options.isSecret ?? false,
      updatedByUserId: options.userId ?? null,
    })
    .onDuplicateKeyUpdate({
      set: {
        settingValue: value,
        updatedByUserId: options.userId ?? null,
      },
    });
  invalidateSettingsCache();
}

async function loadFlags(): Promise<Map<string, boolean>> {
  if (fresh(flagCache)) return flagCache.value;
  const map = new Map<string, boolean>();
  try {
    const rows = await db
      .select({
        key: featureFlags.flagKey,
        enabled: featureFlags.enabled,
        enableAt: featureFlags.scheduledEnableAt,
        disableAt: featureFlags.scheduledDisableAt,
      })
      .from(featureFlags);
    const now = Date.now();
    for (const row of rows) {
      let enabled = row.enabled;
      if (row.enableAt && row.enableAt.getTime() <= now) enabled = true;
      if (row.disableAt && row.disableAt.getTime() <= now) enabled = false;
      map.set(row.key, enabled);
    }
  } catch (error) {
    logger.error("Failed to load feature flags", { error });
  }
  flagCache = { value: map, loadedAt: Date.now() };
  return map;
}

export async function isFeatureEnabled(
  key: FeatureFlagKey,
  fallback = true,
): Promise<boolean> {
  const map = await loadFlags();
  return map.get(key) ?? fallback;
}

export async function getAllFeatureFlags(): Promise<Record<string, boolean>> {
  const map = await loadFlags();
  return Object.fromEntries(map);
}

export async function setFeatureFlag(
  key: string,
  enabled: boolean,
  userId?: number,
): Promise<void> {
  await db
    .update(featureFlags)
    .set({ enabled, updatedByUserId: userId ?? null })
    .where(eq(featureFlags.flagKey, key));
  invalidateSettingsCache();
}

export async function getRateLimitSettings(): Promise<
  Map<RateLimitCategory, RateLimitSetting>
> {
  if (fresh(rateLimitCache)) return rateLimitCache.value;
  const map = new Map<RateLimitCategory, RateLimitSetting>(
    Object.entries(DEFAULT_RATE_LIMITS) as [RateLimitCategory, RateLimitSetting][],
  );
  try {
    const rows = await db.select().from(rateLimitConfigs);
    for (const row of rows) {
      const category = row.category as RateLimitCategory;
      if (!(category in DEFAULT_RATE_LIMITS)) continue;
      map.set(category, {
        category,
        label: row.label,
        windowSeconds: row.windowSeconds,
        maxRequests: row.maxRequests,
        enabled: row.enabled,
        penaltyEnabled: row.penaltyEnabled,
      });
    }
  } catch (error) {
    logger.error("Failed to load rate limit configuration", { error });
  }
  rateLimitCache = { value: map, loadedAt: Date.now() };
  return map;
}

export interface MaintenanceState {
  enabled: boolean;
  showOnHomepage: boolean;
  blocksLogin: boolean;
  message: string;
  estimatedCompletion: string | null;
}

export async function getMaintenanceState(): Promise<MaintenanceState> {
  const [enabled, showOnHomepage, blocksLogin, message, estimate] = await Promise.all([
    getSettingBool("maintenance.enabled", false),
    getSettingBool("maintenance.show_on_homepage", true),
    getSettingBool("maintenance.blocks_login", false),
    getSetting("maintenance.message"),
    getSetting("maintenance.estimated_completion"),
  ]);
  return {
    enabled,
    showOnHomepage,
    blocksLogin,
    message:
      message ??
      "We are performing scheduled maintenance. Some features may be briefly unavailable.",
    estimatedCompletion: estimate,
  };
}

export interface PasswordPolicy {
  minLength: number;
  maxLength: number;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireNumber: boolean;
  requireSymbols: number;
  blockSequential: boolean;
}

export async function getPasswordPolicy(): Promise<PasswordPolicy> {
  const [minLength, maxLength, upper, lower, number, symbols, sequential] = await Promise.all([
    getSettingNumber("password.min_length", 12),
    getSettingNumber("password.max_length", 128),
    getSettingBool("password.require_uppercase", true),
    getSettingBool("password.require_lowercase", true),
    getSettingBool("password.require_number", true),
    getSettingNumber("password.require_symbols", 1),
    getSettingBool("password.block_sequential", true),
  ]);
  return {
    minLength,
    maxLength,
    requireUppercase: upper,
    requireLowercase: lower,
    requireNumber: number,
    requireSymbols: symbols,
    blockSequential: sequential,
  };
}
