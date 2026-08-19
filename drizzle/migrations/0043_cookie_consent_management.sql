CREATE TABLE IF NOT EXISTS cookie_consent_records (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  consent_token_hash CHAR(64) NOT NULL,
  user_id INT NULL,
  consent_version VARCHAR(32) NOT NULL,
  preferences_allowed TINYINT(1) NOT NULL DEFAULT 0,
  analytics_allowed TINYINT(1) NOT NULL DEFAULT 0,
  marketing_allowed TINYINT(1) NOT NULL DEFAULT 0,
  action ENUM('accepted_all','rejected_optional','saved_preferences') NOT NULL,
  ip_hash CHAR(64) NULL,
  user_agent_hash CHAR(64) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX cookie_consent_token_idx (consent_token_hash, created_at),
  INDEX cookie_consent_user_idx (user_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO site_settings (setting_key, setting_value, value_type, category, description, is_secret, updated_at)
VALUES
  ('privacy.cookie_consent_version', '2026.08.19', 'string', 'privacy', 'Version of the public cookie consent notice and preference record.', 0, NOW()),
  ('privacy.analytics_tracking_enabled', 'false', 'boolean', 'privacy', 'Makes analytics consent available; an integration must still independently honor visitor opt-in.', 0, NOW()),
  ('privacy.marketing_tracking_enabled', 'false', 'boolean', 'privacy', 'Makes marketing consent available; an integration must still independently honor visitor opt-in.', 0, NOW())
ON DUPLICATE KEY UPDATE setting_value = setting_value;
