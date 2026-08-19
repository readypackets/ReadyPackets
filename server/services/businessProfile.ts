import { BRAND } from "../../shared/brand.js";
import { getSettingJson, setSetting } from "./settings.js";

export const BUSINESS_PROFILE_SETTING = "business.profile";

export type BusinessProfile = {
  legalName: string;
  publicName: string;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  state: string;
  postalCode: string;
  country: string;
};

export const DEFAULT_BUSINESS_PROFILE: BusinessProfile = {
  legalName: BRAND.companyLegalName,
  publicName: BRAND.companyShortName,
  addressLine1: "7404 Executive Pl",
  addressLine2: null,
  city: "Lanham",
  state: "MD",
  postalCode: "20706",
  country: "US",
};

function clean(value: string | null | undefined, fallback = ""): string {
  return typeof value === "string" ? value.trim() : fallback;
}

export function normalizeBusinessProfile(value: Partial<BusinessProfile> | null | undefined): BusinessProfile {
  return {
    legalName: clean(value?.legalName, DEFAULT_BUSINESS_PROFILE.legalName).slice(0, 160),
    publicName: clean(value?.publicName, DEFAULT_BUSINESS_PROFILE.publicName).slice(0, 120),
    addressLine1: clean(value?.addressLine1, DEFAULT_BUSINESS_PROFILE.addressLine1).slice(0, 160),
    addressLine2: clean(value?.addressLine2).slice(0, 160) || null,
    city: clean(value?.city, DEFAULT_BUSINESS_PROFILE.city).slice(0, 100),
    state: clean(value?.state, DEFAULT_BUSINESS_PROFILE.state).slice(0, 64),
    postalCode: clean(value?.postalCode, DEFAULT_BUSINESS_PROFILE.postalCode).slice(0, 32),
    country: clean(value?.country, DEFAULT_BUSINESS_PROFILE.country).slice(0, 64),
  };
}

export function formatBusinessAddress(profile: BusinessProfile): string {
  const street = [profile.addressLine1, profile.addressLine2].filter(Boolean).join(", ");
  return `${street}, ${profile.city}, ${profile.state} ${profile.postalCode}`.replace(/\s+,/g, ",").trim();
}

export async function getBusinessProfile(): Promise<BusinessProfile> {
  const stored = await getSettingJson<Partial<BusinessProfile> | null>(BUSINESS_PROFILE_SETTING, null);
  return normalizeBusinessProfile(stored);
}

export async function saveBusinessProfile(profile: BusinessProfile, userId: number): Promise<BusinessProfile> {
  const normalized = normalizeBusinessProfile(profile);
  if (!normalized.addressLine1 || !normalized.city || !normalized.state || !normalized.postalCode) {
    throw new Error("Business address line 1, city, state, and postal code are required.");
  }
  await setSetting(BUSINESS_PROFILE_SETTING, JSON.stringify(normalized), {
    category: "business_profile",
    valueType: "json",
    userId,
  });
  return normalized;
}
