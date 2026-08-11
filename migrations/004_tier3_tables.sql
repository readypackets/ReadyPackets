-- Migration 004: Tier 3 tables
-- Finance/billing, CRM, AI hub, inbound webhooks, API access,
-- outbound connections, scheduling, portal wizard slides, A/B testing,
-- admin preferences, support permissions, feature toggle scheduling, system backups

-- ── Finance / billing ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS subscription_plans (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(128) NOT NULL,
  slug VARCHAR(64) NOT NULL,
  description TEXT,
  price_cents INT UNSIGNED NOT NULL DEFAULT 0,
  interval_days INT UNSIGNED NOT NULL DEFAULT 30,
  features JSON,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY subscription_plans_slug_unique (slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS subscription_items (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  plan_id INT UNSIGNED NOT NULL,
  status ENUM('active','paused','cancelled','expired') NOT NULL DEFAULT 'active',
  current_period_start TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  current_period_end TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  cancelled_at TIMESTAMP NULL,
  metadata JSON,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX subscription_items_user_idx (user_id),
  INDEX subscription_items_plan_idx (plan_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS billing_events (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED,
  order_id INT UNSIGNED,
  event_type VARCHAR(64) NOT NULL,
  amount_cents INT NOT NULL DEFAULT 0,
  currency CHAR(3) NOT NULL DEFAULT 'USD',
  provider VARCHAR(32) NOT NULL DEFAULT 'stripe',
  provider_event_id VARCHAR(255),
  metadata JSON,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX billing_events_user_idx (user_id),
  INDEX billing_events_order_idx (order_id),
  INDEX billing_events_type_idx (event_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── CRM ────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS crm_contacts (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED,
  first_name VARCHAR(100),
  last_name VARCHAR(100),
  company VARCHAR(200),
  email_enc TEXT,
  email_index VARCHAR(64),
  phone_enc TEXT,
  source VARCHAR(64),
  status ENUM('lead','prospect','customer','churned','blocked') NOT NULL DEFAULT 'lead',
  owner_user_id INT UNSIGNED,
  tags JSON,
  metadata JSON,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP NULL,
  INDEX crm_contacts_user_idx (user_id),
  INDEX crm_contacts_email_idx (email_index),
  INDEX crm_contacts_status_idx (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS crm_notes (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  contact_id INT UNSIGNED NOT NULL,
  author_user_id INT UNSIGNED NOT NULL,
  body TEXT NOT NULL,
  note_type ENUM('call','email','meeting','note','task') NOT NULL DEFAULT 'note',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX crm_notes_contact_idx (contact_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS crm_tags (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(64) NOT NULL,
  color VARCHAR(16) NOT NULL DEFAULT '#6b7280',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY crm_tags_name_unique (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── AI hub ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ai_sessions (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED,
  session_type VARCHAR(64) NOT NULL DEFAULT 'chat',
  model VARCHAR(128) NOT NULL,
  title VARCHAR(255),
  status ENUM('active','completed','archived') NOT NULL DEFAULT 'active',
  token_count INT UNSIGNED NOT NULL DEFAULT 0,
  cost_micro_usd INT UNSIGNED NOT NULL DEFAULT 0,
  metadata JSON,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX ai_sessions_user_idx (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ai_messages (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  session_id INT UNSIGNED NOT NULL,
  role ENUM('system','user','assistant','tool') NOT NULL,
  content MEDIUMTEXT NOT NULL,
  token_count INT UNSIGNED NOT NULL DEFAULT 0,
  finish_reason VARCHAR(32),
  metadata JSON,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX ai_messages_session_idx (session_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ai_response_logs (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  session_id INT UNSIGNED,
  message_id INT UNSIGNED,
  model VARCHAR(128) NOT NULL,
  prompt_tokens INT UNSIGNED NOT NULL DEFAULT 0,
  completion_tokens INT UNSIGNED NOT NULL DEFAULT 0,
  latency_ms INT UNSIGNED NOT NULL DEFAULT 0,
  finish_reason VARCHAR(32),
  error TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX ai_response_logs_session_idx (session_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Inbound webhooks ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS inbound_webhook_listeners (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(128) NOT NULL,
  slug VARCHAR(64) NOT NULL,
  secret_hash VARCHAR(128),
  event_type VARCHAR(128),
  handler VARCHAR(128) NOT NULL DEFAULT 'log',
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_by_user_id INT UNSIGNED,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY inbound_webhook_listeners_slug_unique (slug)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS inbound_webhook_events (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  listener_id INT UNSIGNED NOT NULL,
  source_ip VARCHAR(64),
  headers JSON,
  payload MEDIUMTEXT,
  signature_valid BOOLEAN,
  processed BOOLEAN NOT NULL DEFAULT FALSE,
  error TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX inbound_webhook_events_listener_idx (listener_id),
  INDEX inbound_webhook_events_processed_idx (processed)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── API access ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS api_key_rate_limits (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  api_key_id INT UNSIGNED NOT NULL,
  window_seconds INT UNSIGNED NOT NULL DEFAULT 60,
  max_requests INT UNSIGNED NOT NULL DEFAULT 100,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY api_key_rate_limits_key_unique (api_key_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS api_request_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  api_key_id INT UNSIGNED,
  method VARCHAR(8) NOT NULL,
  path VARCHAR(512) NOT NULL,
  status_code SMALLINT UNSIGNED NOT NULL,
  latency_ms INT UNSIGNED NOT NULL DEFAULT 0,
  ip_address VARCHAR(64),
  user_agent VARCHAR(512),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX api_request_logs_key_idx (api_key_id),
  INDEX api_request_logs_created_idx (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS api_action_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  api_key_id INT UNSIGNED,
  action VARCHAR(128) NOT NULL,
  entity_type VARCHAR(64),
  entity_id INT UNSIGNED,
  result VARCHAR(32) NOT NULL DEFAULT 'success',
  detail TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX api_action_logs_key_idx (api_key_id),
  INDEX api_action_logs_action_idx (action)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Outbound connections ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS outbound_connections (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(128) NOT NULL,
  connection_type VARCHAR(64) NOT NULL DEFAULT 'http',
  base_url VARCHAR(512),
  auth_type ENUM('none','api_key','bearer','basic','oauth2') NOT NULL DEFAULT 'none',
  credentials_enc TEXT,
  headers JSON,
  timeout_ms INT UNSIGNED NOT NULL DEFAULT 10000,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  last_tested_at TIMESTAMP NULL,
  last_test_ok BOOLEAN,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS outbound_call_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  connection_id INT UNSIGNED NOT NULL,
  method VARCHAR(8) NOT NULL,
  url VARCHAR(1024) NOT NULL,
  status_code SMALLINT UNSIGNED,
  latency_ms INT UNSIGNED NOT NULL DEFAULT 0,
  error TEXT,
  triggered_by VARCHAR(128),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX outbound_call_logs_conn_idx (connection_id),
  INDEX outbound_call_logs_created_idx (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Scheduling / availability ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS availability_slots (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  owner_user_id INT UNSIGNED NOT NULL,
  slot_type VARCHAR(64) NOT NULL DEFAULT 'consultation',
  starts_at TIMESTAMP NOT NULL,
  ends_at TIMESTAMP NOT NULL,
  duration_minutes INT UNSIGNED NOT NULL DEFAULT 30,
  max_bookings INT UNSIGNED NOT NULL DEFAULT 1,
  current_bookings INT UNSIGNED NOT NULL DEFAULT 0,
  is_available BOOLEAN NOT NULL DEFAULT TRUE,
  notes TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX availability_slots_owner_idx (owner_user_id),
  INDEX availability_slots_starts_idx (starts_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS meeting_bookings (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  slot_id INT UNSIGNED NOT NULL,
  customer_user_id INT UNSIGNED NOT NULL,
  order_id INT UNSIGNED,
  status ENUM('pending','confirmed','cancelled','completed','no_show') NOT NULL DEFAULT 'pending',
  notes TEXT,
  confirmation_token VARCHAR(128),
  confirmed_at TIMESTAMP NULL,
  cancelled_at TIMESTAMP NULL,
  cancel_reason TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX meeting_bookings_slot_idx (slot_id),
  INDEX meeting_bookings_customer_idx (customer_user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Portal wizard slides ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS portal_wizard_slides (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  subtitle TEXT,
  body_markdown TEXT,
  image_url VARCHAR(512),
  cta_label VARCHAR(128),
  cta_href VARCHAR(512),
  sort_order INT UNSIGNED NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  target_audience ENUM('all','new','returning') NOT NULL DEFAULT 'all',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── A/B testing ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS pwa_ab_variants (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  experiment_key VARCHAR(128) NOT NULL,
  variant_key VARCHAR(64) NOT NULL,
  description TEXT,
  weight INT UNSIGNED NOT NULL DEFAULT 50,
  is_control BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY pwa_ab_variants_unique (experiment_key, variant_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pwa_ab_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  experiment_key VARCHAR(128) NOT NULL,
  variant_key VARCHAR(64) NOT NULL,
  user_id INT UNSIGNED,
  session_id VARCHAR(128),
  event_type VARCHAR(64) NOT NULL DEFAULT 'impression',
  metadata JSON,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX pwa_ab_events_experiment_idx (experiment_key, variant_key),
  INDEX pwa_ab_events_user_idx (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Admin preferences ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS admin_nav_preferences (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  pinned_items JSON,
  collapsed_sections JSON,
  default_view VARCHAR(64),
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY admin_nav_prefs_user_unique (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pinned_quick_add (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  action_key VARCHAR(64) NOT NULL,
  label VARCHAR(128) NOT NULL,
  href VARCHAR(512) NOT NULL,
  sort_order INT UNSIGNED NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY pinned_quick_add_user_action_unique (user_id, action_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Support permissions ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS support_permissions (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  can_view_all_tickets BOOLEAN NOT NULL DEFAULT FALSE,
  can_close_tickets BOOLEAN NOT NULL DEFAULT FALSE,
  can_assign_tickets BOOLEAN NOT NULL DEFAULT FALSE,
  can_view_customer_pii BOOLEAN NOT NULL DEFAULT FALSE,
  can_issue_refunds BOOLEAN NOT NULL DEFAULT FALSE,
  ticket_categories JSON,
  granted_by_user_id INT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY support_permissions_user_unique (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Feature toggle scheduling ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS feature_toggle_schedules (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  flag_key VARCHAR(128) NOT NULL,
  scheduled_value BOOLEAN NOT NULL,
  scheduled_at TIMESTAMP NOT NULL,
  executed_at TIMESTAMP NULL,
  created_by_user_id INT UNSIGNED,
  note TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX feature_toggle_schedules_flag_idx (flag_key),
  INDEX feature_toggle_schedules_scheduled_idx (scheduled_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── System backups ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS system_backups (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  filename VARCHAR(512) NOT NULL,
  size_bytes BIGINT UNSIGNED NOT NULL DEFAULT 0,
  backup_type ENUM('full','database','files','incremental') NOT NULL DEFAULT 'full',
  status ENUM('running','completed','failed','deleted') NOT NULL DEFAULT 'completed',
  schema_version VARCHAR(32),
  checksum VARCHAR(128),
  storage_path VARCHAR(1024),
  triggered_by ENUM('scheduler','manual','pre_upgrade') NOT NULL DEFAULT 'scheduler',
  triggered_by_user_id INT UNSIGNED,
  error TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX system_backups_status_idx (status),
  INDEX system_backups_created_idx (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Email automation rate limits ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS email_automation_rate_limits (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  automation_id INT UNSIGNED NOT NULL,
  user_id INT UNSIGNED NOT NULL,
  sent_count INT UNSIGNED NOT NULL DEFAULT 0,
  window_start TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY email_auto_rate_user_unique (automation_id, user_id),
  INDEX email_auto_rate_window_idx (window_start)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Record this migration
INSERT IGNORE INTO schema_migrations (filename) VALUES ('004_tier3_tables.sql');
