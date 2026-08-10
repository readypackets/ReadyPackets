/**
 * Idempotent database seed.
 *
 * Running this repeatedly is safe: every insert either uses a natural key with
 * `ON DUPLICATE KEY UPDATE`, or checks for an existing row first. That property
 * matters because the installer runs the seed on every upgrade so a new setting
 * or template appears without a manual step, while operator edits to existing
 * content are preserved wherever the record is content rather than configuration.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { eq, sql } from "drizzle-orm";
import { db, closeDatabase } from "../server/db/client.js";
import {
  bundleRules,
  changelogEntries,
  emailTemplates,
  featureFlags,
  fileTypeRules,
  forumCategories,
  homeContentBlocks,
  packetGroups,
  policyDocuments,
  policyVersions,
  productFeatures,
  products,
  rateLimitConfigs,
  registrationFields,
  siteSettings,
  storageTargets,
} from "../server/db/schema.js";
import { DEFAULT_RATE_LIMITS } from "../server/services/settings.js";
import { wrapHtmlBody, button } from "../server/services/email.js";
import { BRAND } from "../shared/brand.js";
import { RATE_LIMIT_CATEGORIES } from "../shared/domain.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(here, "data");

interface CatalogFeatureSource {
  label: string;
}

interface CatalogProductSource {
  sku: string;
  tierLabel: string;
  tier: string;
  priceCents: number | null;
  customPricing: boolean;
  deliveryEstimate: string;
  description: string;
  listed?: boolean;
  features: string[];
}

interface CatalogGroupSource {
  groupNumber: number;
  name: string;
  category: string;
  summary: string;
  listed?: boolean;
  products: CatalogProductSource[];
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const GROUP_ICONS: Record<number, string> = {
  1: "ShieldCheck",
  2: "Building2",
  3: "FileText",
  4: "Settings2",
  5: "Handshake",
  6: "Rocket",
  7: "Vault",
  8: "LineChart",
};

/**
 * Tiered packets inherit the lower tier's contents. The source document expresses
 * this as "Everything in Basic, plus", which is preserved as a marker on the
 * feature so the UI can render inheritance explicitly.
 */
function inheritanceMarker(label: string): string | null {
  const match = /^Everything in (Basic|Standard)\b/i.exec(label);
  return match ? match[1]!.toLowerCase() : null;
}

async function seedCatalog(): Promise<void> {
  const raw = await readFile(path.join(dataDir, "catalog.json"), "utf8");
  const groups = JSON.parse(raw) as CatalogGroupSource[];

  for (const group of groups) {
    const slug = slugify(group.name);
    await db
      .insert(packetGroups)
      .values({
        slug,
        groupNumber: group.groupNumber,
        name: group.name,
        category: group.category,
        summary: group.summary,
        icon: GROUP_ICONS[group.groupNumber] ?? "Layers",
        listed: group.listed ?? true,
        sortOrder: group.groupNumber,
      })
      .onDuplicateKeyUpdate({
        set: {
          groupNumber: group.groupNumber,
          name: group.name,
          category: group.category,
          summary: group.summary,
          icon: GROUP_ICONS[group.groupNumber] ?? "Layers",
          listed: group.listed ?? true,
          sortOrder: group.groupNumber,
        },
      });

    const groupRow = await db
      .select({ id: packetGroups.id })
      .from(packetGroups)
      .where(eq(packetGroups.slug, slug))
      .limit(1);
    const packetGroupId = groupRow[0]!.id;

    let sortOrder = 0;
    for (const product of group.products) {
      sortOrder += 1;
      const name = `${group.name} — ${product.tierLabel}`;
      const payload = {
        packetGroupId,
        sku: product.sku,
        name,
        tier: product.tier,
        priceCents: product.priceCents,
        customPricing: product.customPricing,
        deliveryEstimate: product.deliveryEstimate,
        outcome: product.description,
        description: product.description,
        listed: product.listed ?? true,
        active: true,
        sortOrder,
      };

      await db.insert(products).values(payload).onDuplicateKeyUpdate({ set: payload });

      const productRow = await db
        .select({ id: products.id })
        .from(products)
        .where(eq(products.sku, product.sku))
        .limit(1);
      const productId = productRow[0]!.id;

      // Features are authoritative in the source document, so they are replaced.
      await db.delete(productFeatures).where(eq(productFeatures.productId, productId));
      if (product.features.length > 0) {
        await db.insert(productFeatures).values(
          product.features.map((label, index) => ({
            productId,
            label,
            detail: null,
            inheritedFromTier: inheritanceMarker(label),
            sortOrder: index,
          })),
        );
      }
    }
  }

  // Bundle rule: a full six-group commitment earns 15%, expressed in basis points.
  const existingRule = await db.select({ id: bundleRules.id }).from(bundleRules).limit(1);
  if (existingRule.length === 0) {
    await db.insert(bundleRules).values({
      name: "All-In commitment discount",
      minimumGroups: 6,
      discountBasisPoints: 1_500,
      active: true,
    });
  }

  console.log(`Seeded ${groups.length} packet groups`);
}

async function seedPolicies(): Promise<void> {
  const documents = [
    {
      slug: "privacy-policy",
      title: "Privacy Policy",
      file: "privacy.md",
      version: "2026.03",
      effectiveDate: "March 2026",
      requiresAcceptance: false,
      publicRoute: "/privacy",
    },
    {
      slug: "refund-policy",
      title: "Refund Policy",
      file: "refund.md",
      version: "2026.03",
      effectiveDate: "March 2026",
      requiresAcceptance: false,
      publicRoute: "/refunds",
    },
    {
      slug: "liability-disclaimer",
      title: "Liability Disclaimer",
      file: "liability.md",
      version: "2026.03",
      effectiveDate: "March 2026",
      requiresAcceptance: true,
      publicRoute: "/disclaimer",
    },
    {
      slug: "mnda",
      title: "Mutual Non-Disclosure & Confidentiality Agreement",
      file: "mnda.md",
      version: "2026.03",
      effectiveDate: "March 2026",
      requiresAcceptance: true,
      publicRoute: null,
    },
    {
      slug: "terms-of-service",
      title: "Terms of Service",
      file: null,
      version: "2026.03",
      effectiveDate: "March 2026",
      requiresAcceptance: true,
      publicRoute: "/terms",
    },
  ];

  for (const document of documents) {
    await db
      .insert(policyDocuments)
      .values({
        slug: document.slug,
        title: document.title,
        requiresAcceptance: document.requiresAcceptance,
        publicRoute: document.publicRoute,
      })
      .onDuplicateKeyUpdate({
        set: {
          title: document.title,
          requiresAcceptance: document.requiresAcceptance,
          publicRoute: document.publicRoute,
        },
      });

    const documentRow = await db
      .select({ id: policyDocuments.id })
      .from(policyDocuments)
      .where(eq(policyDocuments.slug, document.slug))
      .limit(1);
    const policyId = documentRow[0]!.id;

    const existing = await db
      .select({ id: policyVersions.id })
      .from(policyVersions)
      .where(eq(policyVersions.policyId, policyId))
      .limit(1);
    // Never overwrite a published version: acceptances point at a specific text.
    if (existing.length > 0) continue;

    const body = document.file
      ? await readFile(path.join(dataDir, "policies", document.file), "utf8")
      : [
          "# Terms Of Service",
          "",
          `These Terms of Service govern your use of the ${BRAND.companyLegalName} website and customer portal.`,
          "",
          "## 1. Placeholder",
          "",
          "This document has not yet been published. Publish the current text in Admin → Content → Policies before accepting new engagements.",
          "",
        ].join("\n");

    await db.insert(policyVersions).values({
      policyId,
      version: document.version,
      effectiveDate: document.effectiveDate,
      bodyMarkdown: body,
      published: true,
    });
  }

  console.log(`Seeded ${documents.length} policy documents`);
}

async function seedEmailTemplates(): Promise<void> {
  const templates = [
    {
      templateKey: "welcome",
      name: "Welcome / verify email",
      subject: `Confirm your ${BRAND.companyShortName} account`,
      variables: ["name", "verifyUrl"],
      html: wrapHtmlBody(
        "Confirm your account",
        `<h1 style="margin:0 0 16px 0;font-size:22px;">Welcome, {{name}}</h1>
         <p style="margin:0 0 16px 0;">Confirm your email address to activate your ${BRAND.companyShortName} account.</p>
         ${button("Confirm email address", "{{verifyUrl}}")}
         <p style="margin:16px 0 0 0;font-size:13px;color:#4A5568;">This link expires in 24 hours. If you did not create an account, you can ignore this message.</p>`,
      ),
    },
    {
      templateKey: "password_reset",
      name: "Password reset",
      subject: "Reset your password",
      variables: ["name", "resetUrl"],
      html: wrapHtmlBody(
        "Reset your password",
        `<h1 style="margin:0 0 16px 0;font-size:22px;">Password reset</h1>
         <p style="margin:0 0 16px 0;">Hello {{name}}, use the button below to choose a new password.</p>
         ${button("Choose a new password", "{{resetUrl}}")}
         <p style="margin:16px 0 0 0;font-size:13px;color:#4A5568;">This link can be used once and expires in 60 minutes. If you did not request it, no action is needed and your password is unchanged.</p>`,
      ),
    },
    {
      templateKey: "password_changed",
      name: "Password changed confirmation",
      subject: "Your password was changed",
      variables: ["name", "changedAt"],
      html: wrapHtmlBody(
        "Password changed",
        `<p style="margin:0 0 12px 0;">Hello {{name}}, your ${BRAND.companyShortName} password was changed on {{changedAt}}.</p>
         <p style="margin:0;">If this was not you, contact us immediately at ${BRAND.emails.compliance}.</p>`,
      ),
    },
    {
      templateKey: "order_confirmation",
      name: "Order confirmation",
      subject: "Order {{orderNumber}} received",
      variables: ["name", "orderNumber", "total", "portalUrl"],
      html: wrapHtmlBody(
        "Order received",
        `<h1 style="margin:0 0 16px 0;font-size:22px;">Order {{orderNumber}}</h1>
         <p style="margin:0 0 16px 0;">Thank you, {{name}}. We have received your order totalling {{total}}.</p>
         <p style="margin:0 0 16px 0;">Two steps remain before production begins: sign the mutual NDA and complete the Phase I intake form. Both are waiting in your portal.</p>
         ${button("Open your portal", "{{portalUrl}}")}`,
      ),
    },
    {
      templateKey: "order_status_changed",
      name: "Order status changed",
      subject: "Order {{orderNumber}} is now {{statusLabel}}",
      variables: ["name", "orderNumber", "statusLabel", "portalUrl"],
      html: wrapHtmlBody(
        "Order update",
        `<p style="margin:0 0 16px 0;">Hello {{name}}, order {{orderNumber}} has moved to <strong>{{statusLabel}}</strong>.</p>
         ${button("View order", "{{portalUrl}}")}`,
      ),
    },
    {
      templateKey: "deliverable_ready",
      name: "Deliverable published",
      subject: "A new deliverable is ready — order {{orderNumber}}",
      variables: ["name", "orderNumber", "fileName"],
      html: wrapHtmlBody(
        "Your deliverable is ready",
        `<p style="margin:0 0 12px 0;">Hello {{name}}, "{{fileName}}" is now available in your portal for order {{orderNumber}}.</p>
         <p style="margin:0;">Sign in to review and download it.</p>`,
      ),
    },
    {
      templateKey: "order_question_raised",
      name: "Clarification question raised",
      subject: `A question about your ${BRAND.companyShortName} order {{orderNumber}}`,
      variables: ["name", "orderNumber"],
      html: wrapHtmlBody(
        "We have a question",
        `<p style="margin:0 0 12px 0;">Hello {{name}}, our analysts have raised a clarification question on order {{orderNumber}}.</p>
         <p style="margin:0;">Sign in to your portal to answer it; the work continues as soon as we hear from you.</p>`,
      ),
    },
    {
      templateKey: "ticket_created",
      name: "Support ticket received",
      subject: "Support ticket {{ticketNumber}} received",
      variables: ["name", "ticketNumber", "subject"],
      html: wrapHtmlBody(
        "Support ticket received",
        `<h1 style="margin:0 0 12px 0;font-size:20px;">Ticket {{ticketNumber}}</h1>
         <p style="margin:0 0 12px 0;">Hello {{name}}, we have logged your request regarding "{{subject}}".</p>
         <p style="margin:0;">A member of the team will respond within one business day. You can follow the conversation in your portal.</p>`,
      ),
    },
    {
      templateKey: "ticket_reply",
      name: "Support ticket reply",
      subject: "Reply on ticket {{ticketNumber}}",
      variables: ["name", "ticketNumber", "portalUrl"],
      html: wrapHtmlBody(
        "New reply",
        `<p style="margin:0 0 16px 0;">Hello {{name}}, there is a new reply on ticket {{ticketNumber}}.</p>
         ${button("Read the reply", "{{portalUrl}}")}`,
      ),
    },
    {
      templateKey: "mfa_enabled",
      name: "Two-factor authentication enabled",
      subject: "Two-factor authentication is now active",
      variables: ["name"],
      html: wrapHtmlBody(
        "Two-factor authentication enabled",
        `<p style="margin:0 0 12px 0;">Hello {{name}}, two-factor authentication is now active on your account.</p>
         <p style="margin:0;">Keep your backup codes somewhere safe. Each one works once.</p>`,
      ),
    },
    {
      templateKey: "account_deletion_requested",
      name: "Account deletion requested",
      subject: "We have received your deletion request",
      variables: ["name", "openOrders"],
      html: wrapHtmlBody(
        "Deletion request received",
        `<p style="margin:0 0 12px 0;">Hello {{name}}, your ${BRAND.companyShortName} account has been deactivated and your deletion request is now with our team.</p>
         <p style="margin:0 0 12px 0;">Records tied to completed engagements are retained for the period set out in our Privacy Policy before secure erasure.</p>
         <p style="margin:0;">If this was not you, reply to this message immediately.</p>`,
      ),
    },
    {
      templateKey: "contact_received",
      name: "Contact form acknowledgement",
      subject: "We received your message",
      variables: ["name"],
      html: wrapHtmlBody(
        "Message received",
        `<p style="margin:0 0 12px 0;">Thank you for getting in touch, {{name}}.</p>
         <p style="margin:0;">A member of the team will reply within one business day.</p>`,
      ),
    },
    {
      templateKey: "maintenance_notice",
      name: "Maintenance notification",
      subject: `${BRAND.companyShortName} maintenance notice`,
      variables: ["message", "estimatedCompletion"],
      html: wrapHtmlBody(
        "Maintenance notice",
        `<p style="margin:0 0 12px 0;">{{message}}</p>
         <p style="margin:0;">Estimated completion: {{estimatedCompletion}}</p>`,
      ),
    },
  ];

  for (const template of templates) {
    // Subject and body are operator-editable, so only insert when absent.
    const existing = await db
      .select({ id: emailTemplates.id })
      .from(emailTemplates)
      .where(eq(emailTemplates.templateKey, template.templateKey))
      .limit(1);
    if (existing.length > 0) continue;

    await db.insert(emailTemplates).values({
      templateKey: template.templateKey,
      name: template.name,
      subject: template.subject,
      bodyHtml: template.html,
      bodyText: null,
      variables: template.variables,
      enabled: true,
    });
  }

  console.log(`Seeded ${templates.length} email templates`);
}

async function seedSettings(): Promise<void> {
  const settings: {
    key: string;
    value: string | null;
    valueType: string;
    category: string;
    description: string;
    isSecret?: boolean;
  }[] = [
    { key: "site.name", value: BRAND.companyShortName, valueType: "string", category: "general", description: "Displayed site name." },
    { key: "site.tagline", value: BRAND.tagline, valueType: "string", category: "general", description: "Tagline shown in the hero and footer." },
    { key: "site.contact_email", value: BRAND.emails.general, valueType: "string", category: "general", description: "Public contact address." },
    { key: "site.support_hours", value: "Monday to Friday, 9:00–18:00 Eastern", valueType: "string", category: "general", description: "Published support hours." },
    { key: "maintenance.enabled", value: "false", valueType: "boolean", category: "maintenance", description: "When true, the site is closed to non-administrators." },
    { key: "maintenance.show_on_homepage", value: "true", valueType: "boolean", category: "maintenance", description: "Show the maintenance banner on the public homepage." },
    { key: "maintenance.blocks_login", value: "false", valueType: "boolean", category: "maintenance", description: "Prevent customer sign-in during maintenance." },
    { key: "maintenance.message", value: "We are performing scheduled maintenance. Some features may be briefly unavailable.", valueType: "string", category: "maintenance", description: "Message shown during maintenance." },
    { key: "maintenance.estimated_completion", value: null, valueType: "string", category: "maintenance", description: "Estimated completion, shown to visitors." },
    { key: "password.min_length", value: "12", valueType: "number", category: "security", description: "Minimum password length." },
    { key: "password.max_length", value: "128", valueType: "number", category: "security", description: "Maximum password length." },
    { key: "password.require_uppercase", value: "true", valueType: "boolean", category: "security", description: "Require an uppercase letter." },
    { key: "password.require_lowercase", value: "true", valueType: "boolean", category: "security", description: "Require a lowercase letter." },
    { key: "password.require_number", value: "true", valueType: "boolean", category: "security", description: "Require a digit." },
    { key: "password.require_symbol", value: "true", valueType: "boolean", category: "security", description: "Require a symbol." },
    { key: "security.mfa_required_for_admin", value: "true", valueType: "boolean", category: "security", description: "Administrators must complete MFA enrolment before using the admin panel." },
    { key: "security.session_hours", value: "12", valueType: "number", category: "security", description: "Session lifetime in hours." },
    { key: "security.max_failed_logins", value: "5", valueType: "number", category: "security", description: "Failed attempts before an account is temporarily locked." },
    { key: "security.lockout_minutes", value: "15", valueType: "number", category: "security", description: "Lockout duration in minutes." },
    { key: "security.require_email_verification", value: "true", valueType: "boolean", category: "security", description: "Require a verified address before ordering." },
    { key: "orders.auto_advance_phases", value: "true", valueType: "boolean", category: "orders", description: "Advance an order automatically when its phase gates are satisfied." },
    { key: "orders.default_due_days", value: "10", valueType: "number", category: "orders", description: "Default business days used to set an order due date." },
    { key: "reviews.require_moderation", value: "true", valueType: "boolean", category: "content", description: "Hold reviews for moderation before publishing." },
    { key: "retention.log_days", value: "365", valueType: "number", category: "retention", description: "Retention window for security and activity logs." },
    { key: "retention.soft_deleted_file_days", value: "90", valueType: "number", category: "retention", description: "Days before a soft-deleted file is purged." },
    { key: "smtp.from_name", value: BRAND.companyShortName, valueType: "string", category: "email", description: "Display name on outbound mail." },
  ];

  for (const setting of settings) {
    const existing = await db
      .select({ settingKey: siteSettings.settingKey })
      .from(siteSettings)
      .where(eq(siteSettings.settingKey, setting.key))
      .limit(1);
    if (existing.length > 0) {
      // Keep the operator's value; only refresh the human-readable metadata.
      await db
        .update(siteSettings)
        .set({
          valueType: setting.valueType,
          category: setting.category,
          description: setting.description,
        })
        .where(eq(siteSettings.settingKey, setting.key));
      continue;
    }
    await db.insert(siteSettings).values({
      settingKey: setting.key,
      settingValue: setting.value,
      valueType: setting.valueType,
      category: setting.category,
      description: setting.description,
      isSecret: setting.isSecret ?? false,
    });
  }

  const flags = [
    { flagKey: "forum", name: "Community forum", description: "Member discussion area." },
    { flagKey: "reviews", name: "Client reviews", description: "Collection and display of client reviews." },
    { flagKey: "referrals", name: "Referral programme", description: "Referral codes and rewards." },
    { flagKey: "registration", name: "Self-service registration", description: "Allow visitors to create an account." },
    { flagKey: "changelog", name: "Public changelog", description: "Publish release notes publicly." },
    { flagKey: "saml_sso", name: "SAML single sign-on", description: "Enterprise SSO login option.", enabled: false },
    { flagKey: "stripe_payments", name: "Card payments", description: "Accept card payments via Stripe.", enabled: false },
    { flagKey: "webhooks", name: "Outbound webhooks", description: "Deliver events to external endpoints.", enabled: false },
  ];

  for (const flag of flags) {
    const existing = await db
      .select({ flagKey: featureFlags.flagKey })
      .from(featureFlags)
      .where(eq(featureFlags.flagKey, flag.flagKey))
      .limit(1);
    if (existing.length > 0) continue;
    await db.insert(featureFlags).values({
      flagKey: flag.flagKey,
      name: flag.name,
      description: flag.description,
      enabled: flag.enabled ?? true,
    });
  }

  for (const category of RATE_LIMIT_CATEGORIES) {
    const fallback = DEFAULT_RATE_LIMITS[category];
    const existing = await db
      .select({ category: rateLimitConfigs.category })
      .from(rateLimitConfigs)
      .where(eq(rateLimitConfigs.category, category))
      .limit(1);
    if (existing.length > 0) continue;
    await db.insert(rateLimitConfigs).values({
      category,
      label: fallback.label,
      windowSeconds: fallback.windowSeconds,
      maxRequests: fallback.maxRequests,
      enabled: fallback.enabled,
      penaltyEnabled: fallback.penaltyEnabled,
    });
  }

  console.log(
    `Seeded ${settings.length} settings, ${flags.length} feature flags, ${RATE_LIMIT_CATEGORIES.length} rate limit categories`,
  );
}

async function seedStorageAndFileRules(): Promise<void> {
  const existingTarget = await db.select({ id: storageTargets.id }).from(storageTargets).limit(1);
  if (existingTarget.length === 0) {
    await db.insert(storageTargets).values({
      name: "Local disk",
      driver: "local",
      config: { root: "./storage" },
      isDefault: true,
      active: true,
    });
  }

  const rules = [
    { extension: "pdf", mimeType: "application/pdf", maxSizeBytes: 52_428_800 },
    { extension: "docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", maxSizeBytes: 26_214_400 },
    { extension: "xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", maxSizeBytes: 26_214_400 },
    { extension: "pptx", mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation", maxSizeBytes: 52_428_800 },
    { extension: "doc", mimeType: "application/msword", maxSizeBytes: 26_214_400 },
    { extension: "txt", mimeType: "text/plain", maxSizeBytes: 5_242_880 },
    { extension: "csv", mimeType: "text/csv", maxSizeBytes: 10_485_760 },
    { extension: "png", mimeType: "image/png", maxSizeBytes: 15_728_640 },
    { extension: "jpg", mimeType: "image/jpeg", maxSizeBytes: 15_728_640 },
    { extension: "webp", mimeType: "image/webp", maxSizeBytes: 15_728_640 },
    { extension: "zip", mimeType: "application/zip", maxSizeBytes: 104_857_600 },
    { extension: "mp3", mimeType: "audio/mpeg", maxSizeBytes: 104_857_600 },
    { extension: "m4a", mimeType: "audio/mp4", maxSizeBytes: 104_857_600 },
    { extension: "wav", mimeType: "audio/wav", maxSizeBytes: 104_857_600 },
    // Explicitly denied: these are the extensions that turn an upload into an exploit.
    { extension: "svg", mimeType: "image/svg+xml", maxSizeBytes: 1_048_576, allowed: false },
    { extension: "html", mimeType: "text/html", maxSizeBytes: 1_048_576, allowed: false },
    { extension: "js", mimeType: "text/javascript", maxSizeBytes: 1_048_576, allowed: false },
    { extension: "exe", mimeType: "application/x-msdownload", maxSizeBytes: 1_048_576, allowed: false },
    { extension: "sh", mimeType: "application/x-sh", maxSizeBytes: 1_048_576, allowed: false },
  ];

  for (const rule of rules) {
    await db
      .insert(fileTypeRules)
      .values({
        extension: rule.extension,
        mimeType: rule.mimeType,
        maxSizeBytes: rule.maxSizeBytes,
        allowed: rule.allowed ?? true,
        appliesTo: "all",
      })
      .onDuplicateKeyUpdate({
        set: {
          mimeType: rule.mimeType,
          maxSizeBytes: rule.maxSizeBytes,
          allowed: rule.allowed ?? true,
        },
      });
  }

  console.log(`Seeded storage target and ${rules.length} file type rules`);
}

async function seedContent(): Promise<void> {
  const blocks = [
    {
      blockKey: "hero",
      blockType: "hero",
      heading: "Your business, professionally packeted.",
      subheading:
        "Structured architecture, documentation, and strategy for founders who need their idea to hold up under scrutiny.",
      body: "We turn an idea into a defensible, documented package: invention architecture, business foundation, operating design, and a launch system. Every engagement begins with a mutual NDA and a Phase I intake, and every deliverable is prepared for professional review.",
      linkLabel: "Explore the packets",
      linkHref: "/packets",
      sortOrder: 1,
    },
    {
      blockKey: "value_1",
      blockType: "value_prop",
      heading: "Logic Synthesis, not templates",
      body: "Each packet is built from your intake responses through our synthesis process. You receive documents that argue a position, not fill-in-the-blank forms.",
      sortOrder: 2,
    },
    {
      blockKey: "value_2",
      blockType: "value_prop",
      heading: "Confidentiality first",
      body: "A mutual NDA is signed before we see your concept. Your material is never used to train external AI models, and every file access is logged.",
      sortOrder: 3,
    },
    {
      blockKey: "value_3",
      blockType: "value_prop",
      heading: "Honest outcomes",
      body: "Under our Integrity Clause you choose in advance how we proceed if the analysis turns against the concept: a pivot strategy, or a hard-truth Kill Memo with a partial refund.",
      sortOrder: 4,
    },
    {
      blockKey: "process",
      blockType: "process",
      heading: "How an engagement runs",
      subheading: "Four stages, with clear gates between them.",
      body: [
        "**Order and NDA.** Choose your packets and sign the mutual NDA in the portal.",
        "**Phase I — Intake.** Complete the structured intake form. This is the raw material for the analysis.",
        "**Phase II — Logic Synthesis.** A focused 15 to 25 minute call to resolve ambiguities and confirm direction.",
        "**Delivery.** Deliverables are published to your portal, versioned, and available as a single archive.",
      ].join("\n\n"),
      sortOrder: 5,
    },
    {
      blockKey: "integrity",
      blockType: "callout",
      heading: "The Integrity Clause",
      body: "We will not write a favourable report we do not believe. If the analysis shows the concept cannot work as described, you receive either a pivot strategy or a Kill Memo setting out precisely why, with 50% of your fee refunded. You choose which, before we start.",
      linkLabel: "Read the refund policy",
      linkHref: "/refunds",
      sortOrder: 6,
    },
    {
      blockKey: "cta_footer",
      blockType: "cta",
      heading: "Ready to package your business?",
      subheading: "Create an account, choose your packets, and complete Phase I intake today.",
      linkLabel: "Get started",
      linkHref: "/register",
      sortOrder: 7,
    },
  ];

  for (const block of blocks) {
    const existing = await db
      .select({ blockKey: homeContentBlocks.blockKey })
      .from(homeContentBlocks)
      .where(eq(homeContentBlocks.blockKey, block.blockKey))
      .limit(1);
    if (existing.length > 0) continue;
    await db.insert(homeContentBlocks).values({
      blockKey: block.blockKey,
      blockType: block.blockType,
      heading: block.heading,
      subheading: block.subheading ?? null,
      body: block.body ?? null,
      linkLabel: block.linkLabel ?? null,
      linkHref: block.linkHref ?? null,
      enabled: true,
      sortOrder: block.sortOrder,
    });
  }

  const categories = [
    {
      slug: "announcements",
      name: "Announcements",
      description: "Platform news, releases, and scheduled maintenance.",
      sortOrder: 1,
    },
    {
      slug: "founder-questions",
      name: "Founder questions",
      description: "Ask the community about structure, filings, partners, and process.",
      sortOrder: 2,
    },
    {
      slug: "ip-and-patents",
      name: "IP and patents",
      description: "Provisional filings, prior art, and working with counsel.",
      sortOrder: 3,
    },
    {
      slug: "go-to-market",
      name: "Go to market",
      description: "Launch sequencing, pricing, and early revenue.",
      sortOrder: 4,
    },
    {
      slug: "wins",
      name: "Wins and milestones",
      description: "Share a filing, a first customer, or a funding round.",
      sortOrder: 5,
    },
  ];

  for (const category of categories) {
    await db
      .insert(forumCategories)
      .values({
        slug: category.slug,
        name: category.name,
        description: category.description,
        teaserEnabled: true,
        sortOrder: category.sortOrder,
      })
      .onDuplicateKeyUpdate({
        set: {
          name: category.name,
          description: category.description,
          sortOrder: category.sortOrder,
        },
      });
  }

  const existingChangelog = await db
    .select({ id: changelogEntries.id })
    .from(changelogEntries)
    .limit(1);
  if (existingChangelog.length === 0) {
    await db.insert(changelogEntries).values([
      {
        version: "2.0.0",
        title: "Rebuilt portal: security hardening and self-hosted deployment",
        bodyMarkdown: [
          "The portal has been rebuilt from the ground up for self-hosted deployment.",
          "",
          "- Nonce-based Content Security Policy with no inline script or style execution",
          "- Double-submit CSRF tokens with Origin and Host validation on every state-changing request",
          "- AES-256-GCM encryption for personal data at rest, with keyed blind indexes for lookup",
          "- TOTP two-factor authentication, mandatory for administrators",
          "- Six-category rate limiting with progressive penalties and IP blocklists",
          "- Magic-byte validation on uploads and single-use tickets for downloads",
          "- Customer data export and deletion self-service",
          "- Complete audit trail of administrative actions",
        ].join("\n"),
        entryType: "security",
        isPublic: true,
      },
      {
        version: "2.0.0",
        title: "Catalogue refreshed to the August 2026 pricing",
        bodyMarkdown:
          "All seven packet groups and nineteen products now reflect the August 2026 catalogue, including the All-In master bundle and its 15% full-commitment discount.",
        entryType: "improvement",
        isPublic: true,
      },
    ]);
  }

  const fields = [
    {
      fieldKey: "company_name",
      label: "Company or trading name",
      helpText: "Leave blank if you have not formed an entity yet.",
      fieldType: "text",
      required: false,
      sortOrder: 1,
    },
    {
      fieldKey: "phone",
      label: "Contact telephone",
      helpText: "Used only for scheduling your Logic Synthesis call.",
      fieldType: "tel",
      required: false,
      sortOrder: 2,
    },
    {
      fieldKey: "referral_source",
      label: "How did you hear about us?",
      fieldType: "select",
      options: ["Search", "Referral from a client", "Social media", "Industry event", "Other"],
      required: false,
      sortOrder: 3,
    },
    {
      fieldKey: "industry",
      label: "Industry or sector",
      fieldType: "text",
      required: false,
      sortOrder: 4,
    },
  ];

  for (const field of fields) {
    await db
      .insert(registrationFields)
      .values({
        fieldKey: field.fieldKey,
        label: field.label,
        helpText: field.helpText ?? null,
        fieldType: field.fieldType,
        options: field.options ?? null,
        required: field.required,
        enabled: true,
        encrypted: true,
        sortOrder: field.sortOrder,
      })
      .onDuplicateKeyUpdate({
        set: {
          label: field.label,
          helpText: field.helpText ?? null,
          fieldType: field.fieldType,
          options: field.options ?? null,
          required: field.required,
          sortOrder: field.sortOrder,
        },
      });
  }

  console.log(
    `Seeded ${blocks.length} content blocks, ${categories.length} forum categories, ${fields.length} registration fields`,
  );
}

async function main(): Promise<void> {
  console.log("Seeding ReadyPackets database…");
  await seedCatalog();
  await seedPolicies();
  await seedEmailTemplates();
  await seedSettings();
  await seedStorageAndFileRules();
  await seedContent();
  console.log("Seed complete.");
  await closeDatabase();
}

void main().catch(async (error) => {
  console.error("Seed failed:", error);
  await closeDatabase();
  process.exit(1);
});
