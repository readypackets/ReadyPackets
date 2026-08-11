/**
 * Drizzle schema — 62 tables across ten domains.
 *
 * Conventions:
 *  - MySQL table names are snake_case; TypeScript exports are camelCase.
 *  - Money is always an integer number of cents. No floating point.
 *  - Columns holding personal data are suffixed `Enc` and store an AES-256-GCM
 *    envelope; every searchable encrypted column has a companion blind index.
 *  - Soft deletion uses `deletedAt`; a retention sweeper purges expired rows.
 */
import {
  boolean,
  index,
  int,
  json,
  mysqlTable,
  primaryKey,
  text,
  timestamp,
  tinyint,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

const id = () => int("id").autoincrement().primaryKey();
const createdAt = () => timestamp("created_at").notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at").notNull().defaultNow().onUpdateNow();

/* ------------------------------------------------------------------ */
/* Identity and access                                                 */
/* ------------------------------------------------------------------ */

export const users = mysqlTable(
  "users",
  {
    id: id(),
    /** HMAC blind index of the lowercased email. Mandatory on every write. */
    emailIndex: varchar("email_index", { length: 64 }).notNull(),
    emailEnc: text("email_enc").notNull(),
    /** Lowercased domain only, kept in clear for abuse analytics. */
    emailDomain: varchar("email_domain", { length: 190 }),
    firstNameEnc: text("first_name_enc"),
    middleNameEnc: text("middle_name_enc"),
    lastNameEnc: text("last_name_enc"),
    preferredNameEnc: text("preferred_name_enc"),
    suffixEnc: text("suffix_enc"),
    companyEnc: text("company_enc"),
    phoneEnc: text("phone_enc"),
    addressEnc: text("address_enc"),
    passwordHash: varchar("password_hash", { length: 255 }),
    role: varchar("role", { length: 16 }).notNull().default("customer"),
    loginMethod: varchar("login_method", { length: 16 }).notNull().default("local"),
    status: varchar("status", { length: 16 }).notNull().default("active"),
    emailVerified: boolean("email_verified").notNull().default(false),
    mustChangePassword: boolean("must_change_password").notNull().default(false),
    mfaEnabled: boolean("mfa_enabled").notNull().default(false),
    onboardingCompletedAt: timestamp("onboarding_completed_at"),
    lastLoginAt: timestamp("last_login_at"),
    lastLoginIp: varchar("last_login_ip", { length: 64 }),
    failedLoginCount: int("failed_login_count").notNull().default(0),
    lockedUntil: timestamp("locked_until"),
    passwordChangedAt: timestamp("password_changed_at"),
    notesEnc: text("notes_enc"),
    marketingOptIn: boolean("marketing_opt_in").notNull().default(false),
    timezone: varchar("timezone", { length: 64 }).notNull().default("America/New_York"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: timestamp("deleted_at"),
  },
  (table) => ({
    emailIndexUnique: uniqueIndex("users_email_index_unique").on(table.emailIndex),
    roleIdx: index("users_role_idx").on(table.role),
    statusIdx: index("users_status_idx").on(table.status),
    deletedIdx: index("users_deleted_idx").on(table.deletedAt),
  }),
);

export const userMfa = mysqlTable(
  "user_mfa",
  {
    id: id(),
    userId: int("user_id").notNull(),
    /** TOTP shared secret, stored encrypted. */
    secretEnc: text("secret_enc").notNull(),
    confirmedAt: timestamp("confirmed_at"),
    lastUsedStep: int("last_used_step"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => ({
    userUnique: uniqueIndex("user_mfa_user_unique").on(table.userId),
  }),
);

export const userBackupCodes = mysqlTable(
  "user_backup_codes",
  {
    id: id(),
    userId: int("user_id").notNull(),
    /** SHA-256 of the code; the plaintext is shown once at enrolment. */
    codeHash: varchar("code_hash", { length: 64 }).notNull(),
    usedAt: timestamp("used_at"),
    createdAt: createdAt(),
  },
  (table) => ({
    userIdx: index("user_backup_codes_user_idx").on(table.userId),
    codeIdx: index("user_backup_codes_hash_idx").on(table.codeHash),
  }),
);

export const userSessions = mysqlTable(
  "user_sessions",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    userId: int("user_id").notNull(),
    csrfSecret: varchar("csrf_secret", { length: 64 }).notNull(),
    ipAddress: varchar("ip_address", { length: 64 }),
    userAgent: varchar("user_agent", { length: 255 }),
    /** True until the second factor has been presented for this session. */
    mfaPending: boolean("mfa_pending").notNull().default(false),
    /** Restricted sessions may only complete MFA enrolment or sign out. */
    restricted: boolean("restricted").notNull().default(false),
    status: varchar("status", { length: 16 }).notNull().default("active"),
    lastSeenAt: timestamp("last_seen_at").notNull().defaultNow(),
    expiresAt: timestamp("expires_at").notNull(),
    revokedAt: timestamp("revoked_at"),
    revokedReason: varchar("revoked_reason", { length: 190 }),
    createdAt: createdAt(),
  },
  (table) => ({
    userIdx: index("user_sessions_user_idx").on(table.userId),
    statusIdx: index("user_sessions_status_idx").on(table.status),
    expiresIdx: index("user_sessions_expires_idx").on(table.expiresAt),
  }),
);

export const passwordResetTokens = mysqlTable(
  "password_reset_tokens",
  {
    id: id(),
    userId: int("user_id").notNull(),
    tokenHash: varchar("token_hash", { length: 64 }).notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    usedAt: timestamp("used_at"),
    requestIp: varchar("request_ip", { length: 64 }),
    createdAt: createdAt(),
  },
  (table) => ({
    tokenUnique: uniqueIndex("password_reset_token_unique").on(table.tokenHash),
    userIdx: index("password_reset_user_idx").on(table.userId),
  }),
);

export const emailVerificationTokens = mysqlTable(
  "email_verification_tokens",
  {
    id: id(),
    userId: int("user_id").notNull(),
    tokenHash: varchar("token_hash", { length: 64 }).notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    usedAt: timestamp("used_at"),
    createdAt: createdAt(),
  },
  (table) => ({
    tokenUnique: uniqueIndex("email_verification_token_unique").on(table.tokenHash),
    userIdx: index("email_verification_user_idx").on(table.userId),
  }),
);

export const samlConfigs = mysqlTable("saml_configs", {
  id: id(),
  name: varchar("name", { length: 120 }).notNull(),
  enabled: boolean("enabled").notNull().default(false),
  entryPoint: varchar("entry_point", { length: 500 }).notNull(),
  issuer: varchar("issuer", { length: 255 }).notNull(),
  idpCertificate: text("idp_certificate").notNull(),
  signatureAlgorithm: varchar("signature_algorithm", { length: 32 })
    .notNull()
    .default("sha256"),
  attributeMapping: json("attribute_mapping"),
  defaultRole: varchar("default_role", { length: 16 }).notNull().default("customer"),
  autoProvision: boolean("auto_provision").notNull().default(false),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const registrationFields = mysqlTable(
  "registration_fields",
  {
    id: id(),
    fieldKey: varchar("field_key", { length: 64 }).notNull(),
    label: varchar("label", { length: 190 }).notNull(),
    helpText: varchar("help_text", { length: 255 }),
    fieldType: varchar("field_type", { length: 24 }).notNull().default("text"),
    options: json("options"),
    required: boolean("required").notNull().default(false),
    enabled: boolean("enabled").notNull().default(true),
    encrypted: boolean("encrypted").notNull().default(true),
    sortOrder: int("sort_order").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => ({
    keyUnique: uniqueIndex("registration_fields_key_unique").on(table.fieldKey),
  }),
);

export const userProfileValues = mysqlTable(
  "user_profile_values",
  {
    userId: int("user_id").notNull(),
    fieldKey: varchar("field_key", { length: 64 }).notNull(),
    valueEnc: text("value_enc"),
    updatedAt: updatedAt(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.userId, table.fieldKey] }),
  }),
);

export const delegates = mysqlTable(
  "delegates",
  {
    id: id(),
    ownerUserId: int("owner_user_id").notNull(),
    delegateUserId: int("delegate_user_id").notNull(),
    scope: varchar("scope", { length: 32 }).notNull().default("read"),
    createdAt: createdAt(),
    revokedAt: timestamp("revoked_at"),
  },
  (table) => ({
    pairIdx: index("delegates_pair_idx").on(table.ownerUserId, table.delegateUserId),
  }),
);

/* ------------------------------------------------------------------ */
/* Catalog                                                             */
/* ------------------------------------------------------------------ */

export const packetGroups = mysqlTable(
  "packet_groups",
  {
    id: id(),
    slug: varchar("slug", { length: 96 }).notNull(),
    groupNumber: int("group_number").notNull(),
    name: varchar("name", { length: 190 }).notNull(),
    category: varchar("category", { length: 120 }).notNull(),
    summary: text("summary"),
    icon: varchar("icon", { length: 48 }).notNull().default("Layers"),
    listed: boolean("listed").notNull().default(true),
    sortOrder: int("sort_order").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => ({
    slugUnique: uniqueIndex("packet_groups_slug_unique").on(table.slug),
  }),
);

export const products = mysqlTable(
  "products",
  {
    id: id(),
    packetGroupId: int("packet_group_id").notNull(),
    sku: varchar("sku", { length: 64 }).notNull(),
    name: varchar("name", { length: 190 }).notNull(),
    tier: varchar("tier", { length: 24 }).notNull(),
    /** Integer cents. Null means "quote required". */
    priceCents: int("price_cents"),
    customPricing: boolean("custom_pricing").notNull().default(false),
    deliveryEstimate: varchar("delivery_estimate", { length: 96 }).notNull(),
    outcome: text("outcome"),
    description: text("description"),
    listed: boolean("listed").notNull().default(true),
    active: boolean("active").notNull().default(true),
    sortOrder: int("sort_order").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => ({
    skuUnique: uniqueIndex("products_sku_unique").on(table.sku),
    groupIdx: index("products_group_idx").on(table.packetGroupId),
    listedIdx: index("products_listed_idx").on(table.listed, table.active),
  }),
);

export const productFeatures = mysqlTable(
  "product_features",
  {
    id: id(),
    productId: int("product_id").notNull(),
    label: varchar("label", { length: 255 }).notNull(),
    detail: text("detail"),
    inheritedFromTier: varchar("inherited_from_tier", { length: 24 }),
    sortOrder: int("sort_order").notNull().default(0),
  },
  (table) => ({
    productIdx: index("product_features_product_idx").on(table.productId),
  }),
);

export const bundleRules = mysqlTable("bundle_rules", {
  id: id(),
  name: varchar("name", { length: 120 }).notNull(),
  minimumGroups: int("minimum_groups").notNull().default(6),
  discountBasisPoints: int("discount_basis_points").notNull().default(1500),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const coupons = mysqlTable(
  "coupons",
  {
    id: id(),
    code: varchar("code", { length: 48 }).notNull(),
    description: varchar("description", { length: 255 }),
    discountType: varchar("discount_type", { length: 16 }).notNull().default("percent"),
    discountValue: int("discount_value").notNull(),
    maxRedemptions: int("max_redemptions"),
    redemptionCount: int("redemption_count").notNull().default(0),
    startsAt: timestamp("starts_at"),
    expiresAt: timestamp("expires_at"),
    active: boolean("active").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => ({
    codeUnique: uniqueIndex("coupons_code_unique").on(table.code),
  }),
);

/* ------------------------------------------------------------------ */
/* Orders and delivery                                                 */
/* ------------------------------------------------------------------ */

export const orders = mysqlTable(
  "orders",
  {
    id: id(),
    orderNumber: varchar("order_number", { length: 32 }).notNull(),
    userId: int("user_id").notNull(),
    projectNameEnc: text("project_name_enc"),
    status: varchar("status", { length: 32 }).notNull().default("new"),
    paymentStatus: varchar("payment_status", { length: 32 }).notNull().default("unpaid"),
    subtotalCents: int("subtotal_cents").notNull().default(0),
    discountCents: int("discount_cents").notNull().default(0),
    totalCents: int("total_cents").notNull().default(0),
    currency: varchar("currency", { length: 3 }).notNull().default("USD"),
    couponId: int("coupon_id"),
    bundleApplied: boolean("bundle_applied").notNull().default(false),
    integrityChoice: varchar("integrity_choice", { length: 24 }),
    mndaAcceptedAt: timestamp("mnda_accepted_at"),
    intakeCompletedAt: timestamp("intake_completed_at"),
    phase2ScheduledAt: timestamp("phase_2_scheduled_at"),
    deliveredAt: timestamp("delivered_at"),
    closedAt: timestamp("closed_at"),
    dueAt: timestamp("due_at"),
    completionPercent: int("completion_percent").notNull().default(0),
    internalNotesEnc: text("internal_notes_enc"),
    assignedToUserId: int("assigned_to_user_id"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: timestamp("deleted_at"),
  },
  (table) => ({
    numberUnique: uniqueIndex("orders_number_unique").on(table.orderNumber),
    userIdx: index("orders_user_idx").on(table.userId),
    statusIdx: index("orders_status_idx").on(table.status),
    createdIdx: index("orders_created_idx").on(table.createdAt),
    deletedIdx: index("orders_deleted_idx").on(table.deletedAt),
  }),
);

export const orderItems = mysqlTable(
  "order_items",
  {
    id: id(),
    orderId: int("order_id").notNull(),
    productId: int("product_id").notNull(),
    packetGroupId: int("packet_group_id").notNull(),
    /** Denormalised so historic invoices survive catalogue edits. */
    sku: varchar("sku", { length: 64 }).notNull(),
    name: varchar("name", { length: 190 }).notNull(),
    tier: varchar("tier", { length: 24 }).notNull(),
    unitPriceCents: int("unit_price_cents").notNull().default(0),
    quantity: int("quantity").notNull().default(1),
    lineTotalCents: int("line_total_cents").notNull().default(0),
    createdAt: createdAt(),
  },
  (table) => ({
    orderIdx: index("order_items_order_idx").on(table.orderId),
  }),
);

export const orderStatusHistory = mysqlTable(
  "order_status_history",
  {
    id: id(),
    orderId: int("order_id").notNull(),
    fromStatus: varchar("from_status", { length: 32 }),
    toStatus: varchar("to_status", { length: 32 }).notNull(),
    actorUserId: int("actor_user_id"),
    reason: varchar("reason", { length: 255 }),
    createdAt: createdAt(),
  },
  (table) => ({
    orderIdx: index("order_status_history_order_idx").on(table.orderId),
  }),
);

export const orderQuestions = mysqlTable(
  "order_questions",
  {
    id: id(),
    orderId: int("order_id").notNull(),
    askedByUserId: int("asked_by_user_id").notNull(),
    questionEnc: text("question_enc").notNull(),
    required: boolean("required").notNull().default(true),
    status: varchar("status", { length: 16 }).notNull().default("open"),
    sortOrder: int("sort_order").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => ({
    orderIdx: index("order_questions_order_idx").on(table.orderId),
  }),
);

export const orderAnswers = mysqlTable(
  "order_answers",
  {
    id: id(),
    questionId: int("question_id").notNull(),
    orderId: int("order_id").notNull(),
    answeredByUserId: int("answered_by_user_id").notNull(),
    answerEnc: text("answer_enc").notNull(),
    version: int("version").notNull().default(1),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => ({
    questionIdx: index("order_answers_question_idx").on(table.questionId),
  }),
);

export const orderAnswerHistory = mysqlTable(
  "order_answer_history",
  {
    id: id(),
    answerId: int("answer_id").notNull(),
    previousAnswerEnc: text("previous_answer_enc").notNull(),
    version: int("version").notNull(),
    changedByUserId: int("changed_by_user_id").notNull(),
    createdAt: createdAt(),
  },
  (table) => ({
    answerIdx: index("order_answer_history_answer_idx").on(table.answerId),
  }),
);

export const orderNotes = mysqlTable(
  "order_notes",
  {
    id: id(),
    orderId: int("order_id").notNull(),
    authorUserId: int("author_user_id").notNull(),
    bodyEnc: text("body_enc").notNull(),
    visibility: varchar("visibility", { length: 16 }).notNull().default("internal"),
    createdAt: createdAt(),
  },
  (table) => ({
    orderIdx: index("order_notes_order_idx").on(table.orderId),
  }),
);

export const orderShares = mysqlTable(
  "order_shares",
  {
    id: id(),
    orderId: int("order_id").notNull(),
    sharedWithUserId: int("shared_with_user_id").notNull(),
    scope: varchar("scope", { length: 16 }).notNull().default("read"),
    createdByUserId: int("created_by_user_id").notNull(),
    createdAt: createdAt(),
    revokedAt: timestamp("revoked_at"),
  },
  (table) => ({
    orderIdx: index("order_shares_order_idx").on(table.orderId),
    userIdx: index("order_shares_user_idx").on(table.sharedWithUserId),
  }),
);

export const intakeSubmissions = mysqlTable(
  "intake_submissions",
  {
    id: id(),
    orderId: int("order_id").notNull(),
    userId: int("user_id").notNull(),
    status: varchar("status", { length: 16 }).notNull().default("draft"),
    projectNameEnc: text("project_name_enc"),
    desiredOutcomes: json("desired_outcomes"),
    integrityChoice: varchar("integrity_choice", { length: 24 }),
    submissionMethod: varchar("submission_method", { length: 16 })
      .notNull()
      .default("typed"),
    submittedAt: timestamp("submitted_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => ({
    orderUnique: uniqueIndex("intake_submissions_order_unique").on(table.orderId),
  }),
);

export const intakeAnswers = mysqlTable(
  "intake_answers",
  {
    id: id(),
    submissionId: int("submission_id").notNull(),
    questionKey: varchar("question_key", { length: 48 }).notNull(),
    answerEnc: text("answer_enc"),
    attachmentFileId: int("attachment_file_id"),
    updatedAt: updatedAt(),
  },
  (table) => ({
    submissionIdx: index("intake_answers_submission_idx").on(table.submissionId),
  }),
);

export const phaseKickoffConfigs = mysqlTable(
  "phase_kickoff_configs",
  {
    id: id(),
    phase: varchar("phase", { length: 32 }).notNull(),
    createFolders: boolean("create_folders").notNull().default(true),
    folderTemplate: json("folder_template"),
    attachPlaceholders: boolean("attach_placeholders").notNull().default(true),
    notifyCustomer: boolean("notify_customer").notNull().default(true),
    notifyWebhooks: boolean("notify_webhooks").notNull().default(false),
    emailTemplateKey: varchar("email_template_key", { length: 64 }),
    enabled: boolean("enabled").notNull().default(true),
    updatedAt: updatedAt(),
  },
  (table) => ({
    phaseUnique: uniqueIndex("phase_kickoff_phase_unique").on(table.phase),
  }),
);

export const phaseJobs = mysqlTable(
  "phase_jobs",
  {
    id: id(),
    orderId: int("order_id").notNull(),
    phase: varchar("phase", { length: 32 }).notNull(),
    jobType: varchar("job_type", { length: 48 }).notNull(),
    status: varchar("status", { length: 16 }).notNull().default("pending"),
    attempts: int("attempts").notNull().default(0),
    lastError: text("last_error"),
    runAfter: timestamp("run_after").notNull().defaultNow(),
    completedAt: timestamp("completed_at"),
    createdAt: createdAt(),
  },
  (table) => ({
    statusIdx: index("phase_jobs_status_idx").on(table.status, table.runAfter),
    orderIdx: index("phase_jobs_order_idx").on(table.orderId),
  }),
);

/* ------------------------------------------------------------------ */
/* Files                                                               */
/* ------------------------------------------------------------------ */

export const files = mysqlTable(
  "files",
  {
    id: id(),
    /** Opaque, random storage key. Never derived from user input. */
    storageKey: varchar("storage_key", { length: 128 }).notNull(),
    storageTargetId: int("storage_target_id"),
    orderId: int("order_id"),
    ownerUserId: int("owner_user_id"),
    uploadedByUserId: int("uploaded_by_user_id").notNull(),
    originalName: varchar("original_name", { length: 255 }).notNull(),
    /** MIME type as determined by magic-byte inspection, not the client. */
    detectedMime: varchar("detected_mime", { length: 128 }).notNull(),
    extension: varchar("extension", { length: 16 }),
    sizeBytes: int("size_bytes").notNull(),
    sha256: varchar("sha256", { length: 64 }).notNull(),
    category: varchar("category", { length: 32 }).notNull().default("deliverable"),
    /** Customer visibility. Hidden files exist only in the admin workspace. */
    visibleToCustomer: boolean("visible_to_customer").notNull().default(false),
    isPlaceholder: boolean("is_placeholder").notNull().default(false),
    version: int("version").notNull().default(1),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: timestamp("deleted_at"),
  },
  (table) => ({
    storageKeyUnique: uniqueIndex("files_storage_key_unique").on(table.storageKey),
    orderIdx: index("files_order_idx").on(table.orderId),
    ownerIdx: index("files_owner_idx").on(table.ownerUserId),
    deletedIdx: index("files_deleted_idx").on(table.deletedAt),
  }),
);

export const fileVersions = mysqlTable(
  "file_versions",
  {
    id: id(),
    fileId: int("file_id").notNull(),
    storageKey: varchar("storage_key", { length: 128 }).notNull(),
    sizeBytes: int("size_bytes").notNull(),
    sha256: varchar("sha256", { length: 64 }).notNull(),
    version: int("version").notNull(),
    replacedByUserId: int("replaced_by_user_id").notNull(),
    createdAt: createdAt(),
  },
  (table) => ({
    fileIdx: index("file_versions_file_idx").on(table.fileId),
  }),
);

export const fileAccessLog = mysqlTable(
  "file_access_log",
  {
    id: id(),
    fileId: int("file_id").notNull(),
    userId: int("user_id"),
    action: varchar("action", { length: 24 }).notNull(),
    ipAddress: varchar("ip_address", { length: 64 }),
    outcome: varchar("outcome", { length: 16 }).notNull().default("allowed"),
    createdAt: createdAt(),
  },
  (table) => ({
    fileIdx: index("file_access_log_file_idx").on(table.fileId),
    userIdx: index("file_access_log_user_idx").on(table.userId),
  }),
);

export const storageTargets = mysqlTable("storage_targets", {
  id: id(),
  name: varchar("name", { length: 120 }).notNull(),
  driver: varchar("driver", { length: 16 }).notNull().default("local"),
  config: json("config"),
  isDefault: boolean("is_default").notNull().default(false),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const fileTypeRules = mysqlTable(
  "file_type_rules",
  {
    id: id(),
    extension: varchar("extension", { length: 16 }).notNull(),
    mimeType: varchar("mime_type", { length: 128 }).notNull(),
    maxSizeBytes: int("max_size_bytes").notNull().default(26_214_400),
    allowed: boolean("allowed").notNull().default(true),
    appliesTo: varchar("applies_to", { length: 24 }).notNull().default("all"),
    createdAt: createdAt(),
  },
  (table) => ({
    extUnique: uniqueIndex("file_type_rules_ext_unique").on(table.extension),
  }),
);

/* ------------------------------------------------------------------ */
/* Agreements and policy                                               */
/* ------------------------------------------------------------------ */

export const policyDocuments = mysqlTable(
  "policy_documents",
  {
    id: id(),
    slug: varchar("slug", { length: 64 }).notNull(),
    title: varchar("title", { length: 190 }).notNull(),
    requiresAcceptance: boolean("requires_acceptance").notNull().default(false),
    publicRoute: varchar("public_route", { length: 96 }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => ({
    slugUnique: uniqueIndex("policy_documents_slug_unique").on(table.slug),
  }),
);

export const policyVersions = mysqlTable(
  "policy_versions",
  {
    id: id(),
    policyId: int("policy_id").notNull(),
    version: varchar("version", { length: 24 }).notNull(),
    effectiveDate: varchar("effective_date", { length: 32 }).notNull(),
    bodyMarkdown: text("body_markdown").notNull(),
    published: boolean("published").notNull().default(true),
    createdByUserId: int("created_by_user_id"),
    createdAt: createdAt(),
  },
  (table) => ({
    policyIdx: index("policy_versions_policy_idx").on(table.policyId),
  }),
);

export const policyAcceptances = mysqlTable(
  "policy_acceptances",
  {
    id: id(),
    userId: int("user_id").notNull(),
    policyVersionId: int("policy_version_id").notNull(),
    ipAddress: varchar("ip_address", { length: 64 }),
    userAgent: varchar("user_agent", { length: 255 }),
    acceptedAt: createdAt(),
  },
  (table) => ({
    userIdx: index("policy_acceptances_user_idx").on(table.userId),
  }),
);

export const mndaAcceptances = mysqlTable(
  "mnda_acceptances",
  {
    id: id(),
    userId: int("user_id").notNull(),
    orderId: int("order_id"),
    policyVersionId: int("policy_version_id").notNull(),
    signatureNameEnc: text("signature_name_enc").notNull(),
    signatureMethod: varchar("signature_method", { length: 24 })
      .notNull()
      .default("typed"),
    uploadedFileId: int("uploaded_file_id"),
    ipAddress: varchar("ip_address", { length: 64 }),
    userAgent: varchar("user_agent", { length: 255 }),
    acceptedAt: createdAt(),
  },
  (table) => ({
    userIdx: index("mnda_acceptances_user_idx").on(table.userId),
    orderIdx: index("mnda_acceptances_order_idx").on(table.orderId),
  }),
);

/* ------------------------------------------------------------------ */
/* Communication                                                       */
/* ------------------------------------------------------------------ */

export const tickets = mysqlTable(
  "tickets",
  {
    id: id(),
    ticketNumber: varchar("ticket_number", { length: 32 }).notNull(),
    userId: int("user_id").notNull(),
    orderId: int("order_id"),
    subjectEnc: text("subject_enc").notNull(),
    category: varchar("category", { length: 32 }).notNull().default("general"),
    status: varchar("status", { length: 16 }).notNull().default("open"),
    priority: varchar("priority", { length: 16 }).notNull().default("normal"),
    assignedToUserId: int("assigned_to_user_id"),
    lastReplyAt: timestamp("last_reply_at"),
    resolvedAt: timestamp("resolved_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => ({
    numberUnique: uniqueIndex("tickets_number_unique").on(table.ticketNumber),
    userIdx: index("tickets_user_idx").on(table.userId),
    statusIdx: index("tickets_status_idx").on(table.status),
  }),
);

export const ticketReplies = mysqlTable(
  "ticket_replies",
  {
    id: id(),
    ticketId: int("ticket_id").notNull(),
    authorUserId: int("author_user_id").notNull(),
    bodyEnc: text("body_enc").notNull(),
    internalOnly: boolean("internal_only").notNull().default(false),
    createdAt: createdAt(),
  },
  (table) => ({
    ticketIdx: index("ticket_replies_ticket_idx").on(table.ticketId),
  }),
);

export const ticketAttachments = mysqlTable(
  "ticket_attachments",
  {
    id: id(),
    ticketId: int("ticket_id").notNull(),
    replyId: int("reply_id"),
    fileId: int("file_id").notNull(),
    createdAt: createdAt(),
  },
  (table) => ({
    ticketIdx: index("ticket_attachments_ticket_idx").on(table.ticketId),
  }),
);

export const emailTemplates = mysqlTable(
  "email_templates",
  {
    id: id(),
    templateKey: varchar("template_key", { length: 64 }).notNull(),
    name: varchar("name", { length: 190 }).notNull(),
    subject: varchar("subject", { length: 255 }).notNull(),
    bodyHtml: text("body_html").notNull(),
    bodyText: text("body_text"),
    variables: json("variables"),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => ({
    keyUnique: uniqueIndex("email_templates_key_unique").on(table.templateKey),
  }),
);

export const emailQueue = mysqlTable(
  "email_queue",
  {
    id: id(),
    toAddressEnc: text("to_address_enc").notNull(),
    templateKey: varchar("template_key", { length: 64 }),
    subject: varchar("subject", { length: 255 }).notNull(),
    bodyHtml: text("body_html").notNull(),
    bodyText: text("body_text"),
    status: varchar("status", { length: 16 }).notNull().default("pending"),
    attempts: int("attempts").notNull().default(0),
    lastError: varchar("last_error", { length: 500 }),
    runAfter: timestamp("run_after").notNull().defaultNow(),
    sentAt: timestamp("sent_at"),
    createdAt: createdAt(),
  },
  (table) => ({
    statusIdx: index("email_queue_status_idx").on(table.status, table.runAfter),
  }),
);

export const emailLog = mysqlTable(
  "email_log",
  {
    id: id(),
    toAddressHash: varchar("to_address_hash", { length: 64 }).notNull(),
    templateKey: varchar("template_key", { length: 64 }),
    subject: varchar("subject", { length: 255 }).notNull(),
    status: varchar("status", { length: 16 }).notNull(),
    detail: varchar("detail", { length: 500 }),
    createdAt: createdAt(),
  },
  (table) => ({
    createdIdx: index("email_log_created_idx").on(table.createdAt),
  }),
);

export const newsletterSubscribers = mysqlTable(
  "newsletter_subscribers",
  {
    id: id(),
    emailIndex: varchar("email_index", { length: 64 }).notNull(),
    emailEnc: text("email_enc").notNull(),
    confirmed: boolean("confirmed").notNull().default(false),
    confirmTokenHash: varchar("confirm_token_hash", { length: 64 }),
    unsubscribedAt: timestamp("unsubscribed_at"),
    createdAt: createdAt(),
  },
  (table) => ({
    emailUnique: uniqueIndex("newsletter_email_unique").on(table.emailIndex),
  }),
);

export const maintenanceSubscribers = mysqlTable(
  "maintenance_subscribers",
  {
    id: id(),
    emailIndex: varchar("email_index", { length: 64 }).notNull(),
    emailEnc: text("email_enc").notNull(),
    notifiedAt: timestamp("notified_at"),
    createdAt: createdAt(),
  },
  (table) => ({
    emailUnique: uniqueIndex("maintenance_email_unique").on(table.emailIndex),
  }),
);

export const notificationPreferences = mysqlTable(
  "notification_preferences",
  {
    userId: int("user_id").notNull(),
    channel: varchar("channel", { length: 32 }).notNull(),
    enabled: boolean("enabled").notNull().default(true),
    updatedAt: updatedAt(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.userId, table.channel] }),
  }),
);

export const contactMessages = mysqlTable(
  "contact_messages",
  {
    id: id(),
    nameEnc: text("name_enc").notNull(),
    emailEnc: text("email_enc").notNull(),
    emailIndex: varchar("email_index", { length: 64 }).notNull(),
    companyEnc: text("company_enc"),
    topic: varchar("topic", { length: 64 }).notNull().default("general"),
    messageEnc: text("message_enc").notNull(),
    status: varchar("status", { length: 16 }).notNull().default("new"),
    ipAddress: varchar("ip_address", { length: 64 }),
    handledByUserId: int("handled_by_user_id"),
    createdAt: createdAt(),
  },
  (table) => ({
    statusIdx: index("contact_messages_status_idx").on(table.status),
  }),
);

/* ------------------------------------------------------------------ */
/* Community and content                                               */
/* ------------------------------------------------------------------ */

export const forumCategories = mysqlTable(
  "forum_categories",
  {
    id: id(),
    slug: varchar("slug", { length: 96 }).notNull(),
    name: varchar("name", { length: 190 }).notNull(),
    description: varchar("description", { length: 500 }),
    /** When true, non-members see a truncated teaser of topics. */
    teaserEnabled: boolean("teaser_enabled").notNull().default(true),
    sortOrder: int("sort_order").notNull().default(0),
    createdAt: createdAt(),
  },
  (table) => ({
    slugUnique: uniqueIndex("forum_categories_slug_unique").on(table.slug),
  }),
);

export const forumTopics = mysqlTable(
  "forum_topics",
  {
    id: id(),
    categoryId: int("category_id").notNull(),
    userId: int("user_id").notNull(),
    slug: varchar("slug", { length: 190 }).notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    body: text("body").notNull(),
    status: varchar("status", { length: 16 }).notNull().default("published"),
    pinned: boolean("pinned").notNull().default(false),
    locked: boolean("locked").notNull().default(false),
    replyCount: int("reply_count").notNull().default(0),
    viewCount: int("view_count").notNull().default(0),
    lastPostAt: timestamp("last_post_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: timestamp("deleted_at"),
  },
  (table) => ({
    slugUnique: uniqueIndex("forum_topics_slug_unique").on(table.slug),
    categoryIdx: index("forum_topics_category_idx").on(table.categoryId),
  }),
);

export const forumPosts = mysqlTable(
  "forum_posts",
  {
    id: id(),
    topicId: int("topic_id").notNull(),
    userId: int("user_id").notNull(),
    body: text("body").notNull(),
    status: varchar("status", { length: 16 }).notNull().default("published"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: timestamp("deleted_at"),
  },
  (table) => ({
    topicIdx: index("forum_posts_topic_idx").on(table.topicId),
  }),
);

export const forumReactions = mysqlTable(
  "forum_reactions",
  {
    id: id(),
    postId: int("post_id"),
    topicId: int("topic_id"),
    userId: int("user_id").notNull(),
    reaction: varchar("reaction", { length: 24 }).notNull().default("like"),
    createdAt: createdAt(),
  },
  (table) => ({
    postIdx: index("forum_reactions_post_idx").on(table.postId),
    userIdx: index("forum_reactions_user_idx").on(table.userId),
  }),
);

export const reviews = mysqlTable(
  "reviews",
  {
    id: id(),
    userId: int("user_id").notNull(),
    orderId: int("order_id").notNull(),
    productId: int("product_id"),
    rating: tinyint("rating").notNull(),
    title: varchar("title", { length: 190 }),
    body: text("body").notNull(),
    displayName: varchar("display_name", { length: 120 }),
    status: varchar("status", { length: 16 }).notNull().default("pending"),
    moderatedByUserId: int("moderated_by_user_id"),
    moderationNote: varchar("moderation_note", { length: 500 }),
    publishedAt: timestamp("published_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => ({
    statusIdx: index("reviews_status_idx").on(table.status),
    orderUnique: uniqueIndex("reviews_order_unique").on(table.orderId),
  }),
);

export const changelogEntries = mysqlTable(
  "changelog_entries",
  {
    id: id(),
    version: varchar("version", { length: 32 }).notNull(),
    title: varchar("title", { length: 190 }).notNull(),
    bodyMarkdown: text("body_markdown").notNull(),
    entryType: varchar("entry_type", { length: 24 }).notNull().default("improvement"),
    isPublic: boolean("is_public").notNull().default(true),
    releasedAt: timestamp("released_at").notNull().defaultNow(),
    createdByUserId: int("created_by_user_id"),
    createdAt: createdAt(),
  },
  (table) => ({
    publicIdx: index("changelog_public_idx").on(table.isPublic, table.releasedAt),
  }),
);

export const homeContentBlocks = mysqlTable(
  "home_content_blocks",
  {
    id: id(),
    blockKey: varchar("block_key", { length: 64 }).notNull(),
    blockType: varchar("block_type", { length: 32 }).notNull().default("packet_card"),
    heading: varchar("heading", { length: 190 }),
    subheading: varchar("subheading", { length: 255 }),
    body: text("body"),
    linkLabel: varchar("link_label", { length: 96 }),
    linkHref: varchar("link_href", { length: 255 }),
    imagePath: varchar("image_path", { length: 255 }),
    enabled: boolean("enabled").notNull().default(true),
    sortOrder: int("sort_order").notNull().default(0),
    updatedAt: updatedAt(),
  },
  (table) => ({
    keyUnique: uniqueIndex("home_content_key_unique").on(table.blockKey),
  }),
);

/* ------------------------------------------------------------------ */
/* Finance                                                             */
/* ------------------------------------------------------------------ */

export const invoices = mysqlTable(
  "invoices",
  {
    id: id(),
    invoiceNumber: varchar("invoice_number", { length: 32 }).notNull(),
    orderId: int("order_id").notNull(),
    userId: int("user_id").notNull(),
    amountCents: int("amount_cents").notNull(),
    status: varchar("status", { length: 16 }).notNull().default("draft"),
    dueAt: timestamp("due_at"),
    issuedAt: timestamp("issued_at"),
    paidAt: timestamp("paid_at"),
    externalReference: varchar("external_reference", { length: 190 }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => ({
    numberUnique: uniqueIndex("invoices_number_unique").on(table.invoiceNumber),
    orderIdx: index("invoices_order_idx").on(table.orderId),
  }),
);

export const payments = mysqlTable(
  "payments",
  {
    id: id(),
    orderId: int("order_id").notNull(),
    invoiceId: int("invoice_id"),
    provider: varchar("provider", { length: 32 }).notNull().default("manual"),
    providerReference: varchar("provider_reference", { length: 190 }),
    amountCents: int("amount_cents").notNull(),
    status: varchar("status", { length: 16 }).notNull().default("pending"),
    /** Last four digits only; no card data is ever stored. */
    methodSummary: varchar("method_summary", { length: 64 }),
    receivedAt: timestamp("received_at"),
    createdAt: createdAt(),
  },
  (table) => ({
    orderIdx: index("payments_order_idx").on(table.orderId),
    referenceIdx: index("payments_reference_idx").on(table.providerReference),
  }),
);

export const refunds = mysqlTable(
  "refunds",
  {
    id: id(),
    orderId: int("order_id").notNull(),
    paymentId: int("payment_id"),
    amountCents: int("amount_cents").notNull(),
    reason: varchar("reason", { length: 255 }),
    completionStage: int("completion_stage"),
    status: varchar("status", { length: 16 }).notNull().default("requested"),
    requestedByUserId: int("requested_by_user_id").notNull(),
    approvedByUserId: int("approved_by_user_id"),
    processedAt: timestamp("processed_at"),
    createdAt: createdAt(),
  },
  (table) => ({
    orderIdx: index("refunds_order_idx").on(table.orderId),
  }),
);

export const referrals = mysqlTable(
  "referrals",
  {
    id: id(),
    referrerUserId: int("referrer_user_id").notNull(),
    referredUserId: int("referred_user_id"),
    code: varchar("code", { length: 48 }).notNull(),
    orderId: int("order_id"),
    rewardCents: int("reward_cents").notNull().default(0),
    status: varchar("status", { length: 16 }).notNull().default("pending"),
    createdAt: createdAt(),
  },
  (table) => ({
    codeUnique: uniqueIndex("referrals_code_unique").on(table.code),
  }),
);

export const payouts = mysqlTable(
  "payouts",
  {
    id: id(),
    userId: int("user_id").notNull(),
    amountCents: int("amount_cents").notNull(),
    status: varchar("status", { length: 16 }).notNull().default("requested"),
    method: varchar("method", { length: 32 }).notNull().default("manual"),
    referenceEnc: text("reference_enc"),
    processedAt: timestamp("processed_at"),
    createdAt: createdAt(),
  },
  (table) => ({
    userIdx: index("payouts_user_idx").on(table.userId),
  }),
);

/* ------------------------------------------------------------------ */
/* Platform                                                            */
/* ------------------------------------------------------------------ */

export const siteSettings = mysqlTable(
  "site_settings",
  {
    settingKey: varchar("setting_key", { length: 96 }).primaryKey(),
    settingValue: text("setting_value"),
    valueType: varchar("value_type", { length: 16 }).notNull().default("string"),
    category: varchar("category", { length: 48 }).notNull().default("general"),
    description: varchar("description", { length: 255 }),
    /** Secret settings are never returned to a non-admin caller. */
    isSecret: boolean("is_secret").notNull().default(false),
    updatedByUserId: int("updated_by_user_id"),
    updatedAt: updatedAt(),
  },
  (table) => ({
    categoryIdx: index("site_settings_category_idx").on(table.category),
  }),
);

export const featureFlags = mysqlTable(
  "feature_flags",
  {
    flagKey: varchar("flag_key", { length: 64 }).primaryKey(),
    name: varchar("name", { length: 190 }).notNull(),
    description: varchar("description", { length: 255 }),
    enabled: boolean("enabled").notNull().default(true),
    scheduledEnableAt: timestamp("scheduled_enable_at"),
    scheduledDisableAt: timestamp("scheduled_disable_at"),
    updatedByUserId: int("updated_by_user_id"),
    updatedAt: updatedAt(),
  },
);

export const rateLimitConfigs = mysqlTable(
  "rate_limit_configs",
  {
    category: varchar("category", { length: 32 }).primaryKey(),
    label: varchar("label", { length: 96 }).notNull(),
    windowSeconds: int("window_seconds").notNull(),
    maxRequests: int("max_requests").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    penaltyEnabled: boolean("penalty_enabled").notNull().default(true),
    updatedAt: updatedAt(),
  },
);

export const ipBlacklist = mysqlTable(
  "ip_blacklist",
  {
    id: id(),
    /** Accepts a single address, a CIDR block, or a dashed range. */
    pattern: varchar("pattern", { length: 64 }).notNull(),
    patternType: varchar("pattern_type", { length: 16 }).notNull().default("single"),
    reason: varchar("reason", { length: 255 }),
    source: varchar("source", { length: 24 }).notNull().default("manual"),
    hitCount: int("hit_count").notNull().default(0),
    lastHitAt: timestamp("last_hit_at"),
    expiresAt: timestamp("expires_at"),
    createdByUserId: int("created_by_user_id"),
    createdAt: createdAt(),
  },
  (table) => ({
    patternUnique: uniqueIndex("ip_blacklist_pattern_unique").on(table.pattern),
    expiresIdx: index("ip_blacklist_expires_idx").on(table.expiresAt),
  }),
);

export const ipAllowlist = mysqlTable(
  "ip_allowlist",
  {
    id: id(),
    pattern: varchar("pattern", { length: 64 }).notNull(),
    patternType: varchar("pattern_type", { length: 16 }).notNull().default("single"),
    scope: varchar("scope", { length: 24 }).notNull().default("admin"),
    note: varchar("note", { length: 255 }),
    createdByUserId: int("created_by_user_id"),
    createdAt: createdAt(),
  },
  (table) => ({
    patternUnique: uniqueIndex("ip_allowlist_pattern_unique").on(table.pattern),
  }),
);

export const securityLogs = mysqlTable(
  "security_logs",
  {
    id: id(),
    eventType: varchar("event_type", { length: 64 }).notNull(),
    severity: varchar("severity", { length: 16 }).notNull().default("info"),
    userId: int("user_id"),
    /** Hashed identifier so failed logins can be correlated without storing PII. */
    subjectHash: varchar("subject_hash", { length: 64 }),
    ipAddress: varchar("ip_address", { length: 64 }),
    userAgent: varchar("user_agent", { length: 255 }),
    outcome: varchar("outcome", { length: 16 }).notNull().default("success"),
    message: varchar("message", { length: 500 }).notNull(),
    metadata: json("metadata"),
    createdAt: createdAt(),
  },
  (table) => ({
    typeIdx: index("security_logs_type_idx").on(table.eventType),
    severityIdx: index("security_logs_severity_idx").on(table.severity),
    createdIdx: index("security_logs_created_idx").on(table.createdAt),
    userIdx: index("security_logs_user_idx").on(table.userId),
  }),
);

export const activityLogs = mysqlTable(
  "activity_logs",
  {
    id: id(),
    actorUserId: int("actor_user_id"),
    actorRole: varchar("actor_role", { length: 16 }),
    action: varchar("action", { length: 96 }).notNull(),
    entityType: varchar("entity_type", { length: 48 }),
    entityId: varchar("entity_id", { length: 64 }),
    severity: varchar("severity", { length: 16 }).notNull().default("info"),
    summary: varchar("summary", { length: 500 }).notNull(),
    changes: json("changes"),
    ipAddress: varchar("ip_address", { length: 64 }),
    createdAt: createdAt(),
  },
  (table) => ({
    actorIdx: index("activity_logs_actor_idx").on(table.actorUserId),
    actionIdx: index("activity_logs_action_idx").on(table.action),
    entityIdx: index("activity_logs_entity_idx").on(table.entityType, table.entityId),
    createdIdx: index("activity_logs_created_idx").on(table.createdAt),
  }),
);

export const systemAlerts = mysqlTable(
  "system_alerts",
  {
    id: id(),
    alertKey: varchar("alert_key", { length: 96 }).notNull(),
    severity: varchar("severity", { length: 16 }).notNull().default("error"),
    source: varchar("source", { length: 48 }).notNull().default("server"),
    message: varchar("message", { length: 500 }).notNull(),
    detail: text("detail"),
    occurrences: int("occurrences").notNull().default(1),
    firstSeenAt: timestamp("first_seen_at").notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at").notNull().defaultNow(),
    acknowledgedByUserId: int("acknowledged_by_user_id"),
    acknowledgedAt: timestamp("acknowledged_at"),
    resolvedAt: timestamp("resolved_at"),
  },
  (table) => ({
    keyIdx: index("system_alerts_key_idx").on(table.alertKey),
    severityIdx: index("system_alerts_severity_idx").on(table.severity),
  }),
);

export const backupLog = mysqlTable("backup_log", {
  id: id(),
  backupType: varchar("backup_type", { length: 24 }).notNull().default("scheduled"),
  status: varchar("status", { length: 16 }).notNull().default("running"),
  sizeBytes: int("size_bytes"),
  location: varchar("location", { length: 500 }),
  detail: varchar("detail", { length: 500 }),
  startedAt: timestamp("started_at").notNull().defaultNow(),
  finishedAt: timestamp("finished_at"),
});

export const apiKeys = mysqlTable(
  "api_keys",
  {
    id: id(),
    name: varchar("name", { length: 120 }).notNull(),
    keyPrefix: varchar("key_prefix", { length: 16 }).notNull(),
    keyHash: varchar("key_hash", { length: 64 }).notNull(),
    scopes: json("scopes"),
    createdByUserId: int("created_by_user_id").notNull(),
    lastUsedAt: timestamp("last_used_at"),
    expiresAt: timestamp("expires_at"),
    revokedAt: timestamp("revoked_at"),
    createdAt: createdAt(),
  },
  (table) => ({
    hashUnique: uniqueIndex("api_keys_hash_unique").on(table.keyHash),
    prefixIdx: index("api_keys_prefix_idx").on(table.keyPrefix),
  }),
);

export const webhookEndpoints = mysqlTable(
  "webhook_endpoints",
  {
    id: id(),
    name: varchar("name", { length: 120 }).notNull(),
    url: varchar("url", { length: 500 }).notNull(),
    events: json("events"),
    secretEnc: text("secret_enc"),
    enabled: boolean("enabled").notNull().default(true),
    createdByUserId: int("created_by_user_id"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
);

export const webhookDeliveries = mysqlTable(
  "webhook_deliveries",
  {
    id: id(),
    endpointId: int("endpoint_id").notNull(),
    eventType: varchar("event_type", { length: 64 }).notNull(),
    payload: json("payload"),
    status: varchar("status", { length: 16 }).notNull().default("pending"),
    responseCode: int("response_code"),
    attempts: int("attempts").notNull().default(0),
    lastError: varchar("last_error", { length: 500 }),
    runAfter: timestamp("run_after").notNull().defaultNow(),
    deliveredAt: timestamp("delivered_at"),
    createdAt: createdAt(),
  },
  (table) => ({
    endpointIdx: index("webhook_deliveries_endpoint_idx").on(table.endpointId),
    statusIdx: index("webhook_deliveries_status_idx").on(table.status, table.runAfter),
  }),
);

export const scheduledJobs = mysqlTable(
  "scheduled_jobs",
  {
    id: id(),
    jobKey: varchar("job_key", { length: 64 }).notNull(),
    description: varchar("description", { length: 255 }),
    intervalSeconds: int("interval_seconds").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    lastRunAt: timestamp("last_run_at"),
    lastStatus: varchar("last_status", { length: 16 }),
    lastDetail: varchar("last_detail", { length: 500 }),
    nextRunAt: timestamp("next_run_at"),
  },
  (table) => ({
    keyUnique: uniqueIndex("scheduled_jobs_key_unique").on(table.jobKey),
  }),
);

export const schemaMigrations = mysqlTable("schema_migrations", {
  filename: varchar("filename", { length: 190 }).primaryKey(),
  checksum: varchar("checksum", { length: 64 }).notNull(),
  appliedAt: timestamp("applied_at").notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Rate limit penalties (persisted so they survive service restarts)
// ---------------------------------------------------------------------------
export const rateLimitPenalties = mysqlTable(
  "rate_limit_penalties",
  {
    id: id(),
    penaltyKey: varchar("penalty_key", { length: 128 }).notNull(), // "category:ip"
    ipAddress: varchar("ip_address", { length: 45 }).notNull(),
    category: varchar("category", { length: 32 }).notNull(),
    level: int("level").notNull().default(1),
    until: timestamp("until").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (table) => ({
    keyUnique: uniqueIndex("rlp_key_unique").on(table.penaltyKey),
    untilIdx: index("rlp_until_idx").on(table.until),
    ipIdx: index("rlp_ip_idx").on(table.ipAddress),
  }),
);
