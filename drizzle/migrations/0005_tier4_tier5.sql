-- Migration 005: Tier 4 & Tier 5 additions
-- Adds: avatar_storage_key and referral_code to users,
--       teaser_click_count to forum_topics,
--       forum_teaser_clicks table, login_page_config table
-- MySQL 8 compatible: no IF NOT EXISTS on ALTER TABLE ADD COLUMN

-- ── Avatar support and referral codes on users ────────────────────────────────
ALTER TABLE `users`
  ADD COLUMN `avatar_storage_key` VARCHAR(128) NULL AFTER `notes_enc`,
  ADD COLUMN `referral_code` VARCHAR(48) NULL AFTER `avatar_storage_key`,
  ADD UNIQUE INDEX `users_referral_code_unique` (`referral_code`);

-- ── Forum teaser click tracking ───────────────────────────────────────────────
ALTER TABLE `forum_topics`
  ADD COLUMN `teaser_click_count` INT UNSIGNED NOT NULL DEFAULT 0 AFTER `view_count`;

CREATE TABLE IF NOT EXISTS `forum_teaser_clicks` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `topic_id` INT NOT NULL,
  `session_id` VARCHAR(128) NULL,
  `ip_hash` VARCHAR(64) NULL,
  `referrer` VARCHAR(512) NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX `forum_teaser_clicks_topic_idx` (`topic_id`),
  INDEX `forum_teaser_clicks_created_idx` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Login page configurator ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `login_page_config` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `hero_headline` VARCHAR(255) NULL,
  `hero_subheadline` VARCHAR(512) NULL,
  `show_testimonial` TINYINT(1) NOT NULL DEFAULT 0,
  `testimonial_text` TEXT NULL,
  `testimonial_author` VARCHAR(128) NULL,
  `show_feature_list` TINYINT(1) NOT NULL DEFAULT 1,
  `feature_list` JSON NULL,
  `background_style` VARCHAR(32) NOT NULL DEFAULT 'default',
  `accent_color` VARCHAR(32) NULL,
  `updated_by_user_id` INT NULL,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Insert default config
INSERT IGNORE INTO `login_page_config` (`id`, `hero_headline`, `hero_subheadline`, `show_feature_list`, `feature_list`, `background_style`)
VALUES (1, NULL, NULL, 1, JSON_ARRAY('Structured intake and synthesis', 'Versioned deliverables in your portal', 'Confidential by default — NDA first'), 'default');

-- Record this migration
INSERT IGNORE INTO schema_migrations (filename, checksum) VALUES ('0005_tier4_tier5.sql', 'tier4_tier5_v1');
