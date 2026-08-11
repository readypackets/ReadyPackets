-- ReadyPackets policy enforcement, order automation, portal onboarding, and announcements.
-- MySQL 8 migration; applied once by the production deployment workflow.

ALTER TABLE users
  ADD COLUMN onboarding_forced_at TIMESTAMP NULL AFTER onboarding_completed_at;

CREATE TABLE IF NOT EXISTS order_automation_rules (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(190) NOT NULL,
  trigger_type VARCHAR(48) NOT NULL,
  trigger_value VARCHAR(64) NULL,
  action_type VARCHAR(48) NOT NULL DEFAULT 'set_completion_percent',
  completion_percent INT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  sort_order INT NOT NULL DEFAULT 0,
  created_by_user_id INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX order_automation_trigger_idx (trigger_type, trigger_value),
  INDEX order_automation_active_idx (is_active)
);

CREATE TABLE IF NOT EXISTS order_question_templates (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(190) NOT NULL,
  question TEXT NOT NULL,
  phase VARCHAR(16) NOT NULL DEFAULT 'phase_1',
  required TINYINT(1) NOT NULL DEFAULT 1,
  sort_order INT NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_by_user_id INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX order_question_template_phase_idx (phase, is_active)
);

CREATE TABLE IF NOT EXISTS portal_announcements (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  body_markdown TEXT NOT NULL,
  audience VARCHAR(24) NOT NULL DEFAULT 'all',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  starts_at TIMESTAMP NULL,
  ends_at TIMESTAMP NULL,
  created_by_user_id INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX portal_announcement_visible_idx (is_active, starts_at, ends_at)
);

INSERT IGNORE INTO site_settings (setting_key, setting_value, category, description, updated_at)
VALUES
  ('trash.retention_days', '30', 'system', 'Days soft-deleted customer accounts and orders remain recoverable before purge.', CURRENT_TIMESTAMP),
  ('onboarding.force_all_after', '', 'portal', 'UTC timestamp after which all customers must replay the onboarding wizard.', CURRENT_TIMESTAMP);
