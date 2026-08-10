-- ReadyPackets Portal — initial schema
-- Generated from server/db/schema.ts by scripts/generate-initial-migration.ts.
-- Forward-only: never edit an applied migration; add a new numbered file instead.
CREATE TABLE IF NOT EXISTS `activity_logs` (
  `id` int NOT NULL AUTO_INCREMENT,
  `actor_user_id` int NULL,
  `actor_role` varchar(16) NULL,
  `action` varchar(96) NOT NULL,
  `entity_type` varchar(48) NULL,
  `entity_id` varchar(64) NULL,
  `severity` varchar(16) NOT NULL DEFAULT 'info',
  `summary` varchar(500) NOT NULL,
  `changes` json NULL,
  `ip_address` varchar(64) NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `activity_logs_actor_idx` (`actor_user_id`),
  KEY `activity_logs_action_idx` (`action`),
  KEY `activity_logs_entity_idx` (`entity_type`, `entity_id`),
  KEY `activity_logs_created_idx` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `api_keys` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(120) NOT NULL,
  `key_prefix` varchar(16) NOT NULL,
  `key_hash` varchar(64) NOT NULL,
  `scopes` json NULL,
  `created_by_user_id` int NOT NULL,
  `last_used_at` timestamp NULL,
  `expires_at` timestamp NULL,
  `revoked_at` timestamp NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `api_keys_hash_unique` (`key_hash`),
  KEY `api_keys_prefix_idx` (`key_prefix`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `backup_log` (
  `id` int NOT NULL AUTO_INCREMENT,
  `backup_type` varchar(24) NOT NULL DEFAULT 'scheduled',
  `status` varchar(16) NOT NULL DEFAULT 'running',
  `size_bytes` int NULL,
  `location` varchar(500) NULL,
  `detail` varchar(500) NULL,
  `started_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `finished_at` timestamp NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `bundle_rules` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(120) NOT NULL,
  `minimum_groups` int NOT NULL DEFAULT 6,
  `discount_basis_points` int NOT NULL DEFAULT 1500,
  `active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `changelog_entries` (
  `id` int NOT NULL AUTO_INCREMENT,
  `version` varchar(32) NOT NULL,
  `title` varchar(190) NOT NULL,
  `body_markdown` text NOT NULL,
  `entry_type` varchar(24) NOT NULL DEFAULT 'improvement',
  `is_public` tinyint(1) NOT NULL DEFAULT 1,
  `released_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `created_by_user_id` int NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `changelog_public_idx` (`is_public`, `released_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `contact_messages` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name_enc` text NOT NULL,
  `email_enc` text NOT NULL,
  `email_index` varchar(64) NOT NULL,
  `company_enc` text NULL,
  `topic` varchar(64) NOT NULL DEFAULT 'general',
  `message_enc` text NOT NULL,
  `status` varchar(16) NOT NULL DEFAULT 'new',
  `ip_address` varchar(64) NULL,
  `handled_by_user_id` int NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `contact_messages_status_idx` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `coupons` (
  `id` int NOT NULL AUTO_INCREMENT,
  `code` varchar(48) NOT NULL,
  `description` varchar(255) NULL,
  `discount_type` varchar(16) NOT NULL DEFAULT 'percent',
  `discount_value` int NOT NULL,
  `max_redemptions` int NULL,
  `redemption_count` int NOT NULL DEFAULT 0,
  `starts_at` timestamp NULL,
  `expires_at` timestamp NULL,
  `active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `coupons_code_unique` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `delegates` (
  `id` int NOT NULL AUTO_INCREMENT,
  `owner_user_id` int NOT NULL,
  `delegate_user_id` int NOT NULL,
  `scope` varchar(32) NOT NULL DEFAULT 'read',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `revoked_at` timestamp NULL,
  PRIMARY KEY (`id`),
  KEY `delegates_pair_idx` (`owner_user_id`, `delegate_user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `email_log` (
  `id` int NOT NULL AUTO_INCREMENT,
  `to_address_hash` varchar(64) NOT NULL,
  `template_key` varchar(64) NULL,
  `subject` varchar(255) NOT NULL,
  `status` varchar(16) NOT NULL,
  `detail` varchar(500) NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `email_log_created_idx` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `email_queue` (
  `id` int NOT NULL AUTO_INCREMENT,
  `to_address_enc` text NOT NULL,
  `template_key` varchar(64) NULL,
  `subject` varchar(255) NOT NULL,
  `body_html` text NOT NULL,
  `body_text` text NULL,
  `status` varchar(16) NOT NULL DEFAULT 'pending',
  `attempts` int NOT NULL DEFAULT 0,
  `last_error` varchar(500) NULL,
  `run_after` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `sent_at` timestamp NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `email_queue_status_idx` (`status`, `run_after`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `email_templates` (
  `id` int NOT NULL AUTO_INCREMENT,
  `template_key` varchar(64) NOT NULL,
  `name` varchar(190) NOT NULL,
  `subject` varchar(255) NOT NULL,
  `body_html` text NOT NULL,
  `body_text` text NULL,
  `variables` json NULL,
  `enabled` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `email_templates_key_unique` (`template_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `email_verification_tokens` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `token_hash` varchar(64) NOT NULL,
  `expires_at` timestamp NOT NULL,
  `used_at` timestamp NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `email_verification_token_unique` (`token_hash`),
  KEY `email_verification_user_idx` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `feature_flags` (
  `flag_key` varchar(64) NOT NULL,
  `name` varchar(190) NOT NULL,
  `description` varchar(255) NULL,
  `enabled` tinyint(1) NOT NULL DEFAULT 1,
  `scheduled_enable_at` timestamp NULL,
  `scheduled_disable_at` timestamp NULL,
  `updated_by_user_id` int NULL,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`flag_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `file_access_log` (
  `id` int NOT NULL AUTO_INCREMENT,
  `file_id` int NOT NULL,
  `user_id` int NULL,
  `action` varchar(24) NOT NULL,
  `ip_address` varchar(64) NULL,
  `outcome` varchar(16) NOT NULL DEFAULT 'allowed',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `file_access_log_file_idx` (`file_id`),
  KEY `file_access_log_user_idx` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `file_type_rules` (
  `id` int NOT NULL AUTO_INCREMENT,
  `extension` varchar(16) NOT NULL,
  `mime_type` varchar(128) NOT NULL,
  `max_size_bytes` int NOT NULL DEFAULT 26214400,
  `allowed` tinyint(1) NOT NULL DEFAULT 1,
  `applies_to` varchar(24) NOT NULL DEFAULT 'all',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `file_type_rules_ext_unique` (`extension`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `file_versions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `file_id` int NOT NULL,
  `storage_key` varchar(128) NOT NULL,
  `size_bytes` int NOT NULL,
  `sha256` varchar(64) NOT NULL,
  `version` int NOT NULL,
  `replaced_by_user_id` int NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `file_versions_file_idx` (`file_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `files` (
  `id` int NOT NULL AUTO_INCREMENT,
  `storage_key` varchar(128) NOT NULL,
  `storage_target_id` int NULL,
  `order_id` int NULL,
  `owner_user_id` int NULL,
  `uploaded_by_user_id` int NOT NULL,
  `original_name` varchar(255) NOT NULL,
  `detected_mime` varchar(128) NOT NULL,
  `extension` varchar(16) NULL,
  `size_bytes` int NOT NULL,
  `sha256` varchar(64) NOT NULL,
  `category` varchar(32) NOT NULL DEFAULT 'deliverable',
  `visible_to_customer` tinyint(1) NOT NULL DEFAULT 0,
  `is_placeholder` tinyint(1) NOT NULL DEFAULT 0,
  `version` int NOT NULL DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` timestamp NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `files_storage_key_unique` (`storage_key`),
  KEY `files_order_idx` (`order_id`),
  KEY `files_owner_idx` (`owner_user_id`),
  KEY `files_deleted_idx` (`deleted_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `forum_categories` (
  `id` int NOT NULL AUTO_INCREMENT,
  `slug` varchar(96) NOT NULL,
  `name` varchar(190) NOT NULL,
  `description` varchar(500) NULL,
  `teaser_enabled` tinyint(1) NOT NULL DEFAULT 1,
  `sort_order` int NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `forum_categories_slug_unique` (`slug`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `forum_posts` (
  `id` int NOT NULL AUTO_INCREMENT,
  `topic_id` int NOT NULL,
  `user_id` int NOT NULL,
  `body` text NOT NULL,
  `status` varchar(16) NOT NULL DEFAULT 'published',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` timestamp NULL,
  PRIMARY KEY (`id`),
  KEY `forum_posts_topic_idx` (`topic_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `forum_reactions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `post_id` int NULL,
  `topic_id` int NULL,
  `user_id` int NOT NULL,
  `reaction` varchar(24) NOT NULL DEFAULT 'like',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `forum_reactions_post_idx` (`post_id`),
  KEY `forum_reactions_user_idx` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `forum_topics` (
  `id` int NOT NULL AUTO_INCREMENT,
  `category_id` int NOT NULL,
  `user_id` int NOT NULL,
  `slug` varchar(190) NOT NULL,
  `title` varchar(255) NOT NULL,
  `body` text NOT NULL,
  `status` varchar(16) NOT NULL DEFAULT 'published',
  `pinned` tinyint(1) NOT NULL DEFAULT 0,
  `locked` tinyint(1) NOT NULL DEFAULT 0,
  `reply_count` int NOT NULL DEFAULT 0,
  `view_count` int NOT NULL DEFAULT 0,
  `last_post_at` timestamp NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` timestamp NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `forum_topics_slug_unique` (`slug`),
  KEY `forum_topics_category_idx` (`category_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `home_content_blocks` (
  `id` int NOT NULL AUTO_INCREMENT,
  `block_key` varchar(64) NOT NULL,
  `block_type` varchar(32) NOT NULL DEFAULT 'packet_card',
  `heading` varchar(190) NULL,
  `subheading` varchar(255) NULL,
  `body` text NULL,
  `link_label` varchar(96) NULL,
  `link_href` varchar(255) NULL,
  `image_path` varchar(255) NULL,
  `enabled` tinyint(1) NOT NULL DEFAULT 1,
  `sort_order` int NOT NULL DEFAULT 0,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `home_content_key_unique` (`block_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `intake_answers` (
  `id` int NOT NULL AUTO_INCREMENT,
  `submission_id` int NOT NULL,
  `question_key` varchar(48) NOT NULL,
  `answer_enc` text NULL,
  `attachment_file_id` int NULL,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `intake_answers_submission_idx` (`submission_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `intake_submissions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `order_id` int NOT NULL,
  `user_id` int NOT NULL,
  `status` varchar(16) NOT NULL DEFAULT 'draft',
  `project_name_enc` text NULL,
  `desired_outcomes` json NULL,
  `integrity_choice` varchar(24) NULL,
  `submission_method` varchar(16) NOT NULL DEFAULT 'typed',
  `submitted_at` timestamp NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `intake_submissions_order_unique` (`order_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `invoices` (
  `id` int NOT NULL AUTO_INCREMENT,
  `invoice_number` varchar(32) NOT NULL,
  `order_id` int NOT NULL,
  `user_id` int NOT NULL,
  `amount_cents` int NOT NULL,
  `status` varchar(16) NOT NULL DEFAULT 'draft',
  `due_at` timestamp NULL,
  `issued_at` timestamp NULL,
  `paid_at` timestamp NULL,
  `external_reference` varchar(190) NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `invoices_number_unique` (`invoice_number`),
  KEY `invoices_order_idx` (`order_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `ip_allowlist` (
  `id` int NOT NULL AUTO_INCREMENT,
  `pattern` varchar(64) NOT NULL,
  `pattern_type` varchar(16) NOT NULL DEFAULT 'single',
  `scope` varchar(24) NOT NULL DEFAULT 'admin',
  `note` varchar(255) NULL,
  `created_by_user_id` int NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `ip_allowlist_pattern_unique` (`pattern`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `ip_blacklist` (
  `id` int NOT NULL AUTO_INCREMENT,
  `pattern` varchar(64) NOT NULL,
  `pattern_type` varchar(16) NOT NULL DEFAULT 'single',
  `reason` varchar(255) NULL,
  `source` varchar(24) NOT NULL DEFAULT 'manual',
  `hit_count` int NOT NULL DEFAULT 0,
  `last_hit_at` timestamp NULL,
  `expires_at` timestamp NULL,
  `created_by_user_id` int NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `ip_blacklist_pattern_unique` (`pattern`),
  KEY `ip_blacklist_expires_idx` (`expires_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `maintenance_subscribers` (
  `id` int NOT NULL AUTO_INCREMENT,
  `email_index` varchar(64) NOT NULL,
  `email_enc` text NOT NULL,
  `notified_at` timestamp NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `maintenance_email_unique` (`email_index`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `mnda_acceptances` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `order_id` int NULL,
  `policy_version_id` int NOT NULL,
  `signature_name_enc` text NOT NULL,
  `signature_method` varchar(24) NOT NULL DEFAULT 'typed',
  `uploaded_file_id` int NULL,
  `ip_address` varchar(64) NULL,
  `user_agent` varchar(255) NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `mnda_acceptances_user_idx` (`user_id`),
  KEY `mnda_acceptances_order_idx` (`order_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `newsletter_subscribers` (
  `id` int NOT NULL AUTO_INCREMENT,
  `email_index` varchar(64) NOT NULL,
  `email_enc` text NOT NULL,
  `confirmed` tinyint(1) NOT NULL DEFAULT 0,
  `confirm_token_hash` varchar(64) NULL,
  `unsubscribed_at` timestamp NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `newsletter_email_unique` (`email_index`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `notification_preferences` (
  `user_id` int NOT NULL,
  `channel` varchar(32) NOT NULL,
  `enabled` tinyint(1) NOT NULL DEFAULT 1,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`, `channel`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `order_answer_history` (
  `id` int NOT NULL AUTO_INCREMENT,
  `answer_id` int NOT NULL,
  `previous_answer_enc` text NOT NULL,
  `version` int NOT NULL,
  `changed_by_user_id` int NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `order_answer_history_answer_idx` (`answer_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `order_answers` (
  `id` int NOT NULL AUTO_INCREMENT,
  `question_id` int NOT NULL,
  `order_id` int NOT NULL,
  `answered_by_user_id` int NOT NULL,
  `answer_enc` text NOT NULL,
  `version` int NOT NULL DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `order_answers_question_idx` (`question_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `order_items` (
  `id` int NOT NULL AUTO_INCREMENT,
  `order_id` int NOT NULL,
  `product_id` int NOT NULL,
  `packet_group_id` int NOT NULL,
  `sku` varchar(64) NOT NULL,
  `name` varchar(190) NOT NULL,
  `tier` varchar(24) NOT NULL,
  `unit_price_cents` int NOT NULL DEFAULT 0,
  `quantity` int NOT NULL DEFAULT 1,
  `line_total_cents` int NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `order_items_order_idx` (`order_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `order_notes` (
  `id` int NOT NULL AUTO_INCREMENT,
  `order_id` int NOT NULL,
  `author_user_id` int NOT NULL,
  `body_enc` text NOT NULL,
  `visibility` varchar(16) NOT NULL DEFAULT 'internal',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `order_notes_order_idx` (`order_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `order_questions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `order_id` int NOT NULL,
  `asked_by_user_id` int NOT NULL,
  `question_enc` text NOT NULL,
  `required` tinyint(1) NOT NULL DEFAULT 1,
  `status` varchar(16) NOT NULL DEFAULT 'open',
  `sort_order` int NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `order_questions_order_idx` (`order_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `order_shares` (
  `id` int NOT NULL AUTO_INCREMENT,
  `order_id` int NOT NULL,
  `shared_with_user_id` int NOT NULL,
  `scope` varchar(16) NOT NULL DEFAULT 'read',
  `created_by_user_id` int NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `revoked_at` timestamp NULL,
  PRIMARY KEY (`id`),
  KEY `order_shares_order_idx` (`order_id`),
  KEY `order_shares_user_idx` (`shared_with_user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `order_status_history` (
  `id` int NOT NULL AUTO_INCREMENT,
  `order_id` int NOT NULL,
  `from_status` varchar(32) NULL,
  `to_status` varchar(32) NOT NULL,
  `actor_user_id` int NULL,
  `reason` varchar(255) NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `order_status_history_order_idx` (`order_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `orders` (
  `id` int NOT NULL AUTO_INCREMENT,
  `order_number` varchar(32) NOT NULL,
  `user_id` int NOT NULL,
  `project_name_enc` text NULL,
  `status` varchar(32) NOT NULL DEFAULT 'new',
  `payment_status` varchar(32) NOT NULL DEFAULT 'unpaid',
  `subtotal_cents` int NOT NULL DEFAULT 0,
  `discount_cents` int NOT NULL DEFAULT 0,
  `total_cents` int NOT NULL DEFAULT 0,
  `currency` varchar(3) NOT NULL DEFAULT 'USD',
  `coupon_id` int NULL,
  `bundle_applied` tinyint(1) NOT NULL DEFAULT 0,
  `integrity_choice` varchar(24) NULL,
  `mnda_accepted_at` timestamp NULL,
  `intake_completed_at` timestamp NULL,
  `phase_2_scheduled_at` timestamp NULL,
  `delivered_at` timestamp NULL,
  `closed_at` timestamp NULL,
  `due_at` timestamp NULL,
  `completion_percent` int NOT NULL DEFAULT 0,
  `internal_notes_enc` text NULL,
  `assigned_to_user_id` int NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` timestamp NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `orders_number_unique` (`order_number`),
  KEY `orders_user_idx` (`user_id`),
  KEY `orders_status_idx` (`status`),
  KEY `orders_created_idx` (`created_at`),
  KEY `orders_deleted_idx` (`deleted_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `packet_groups` (
  `id` int NOT NULL AUTO_INCREMENT,
  `slug` varchar(96) NOT NULL,
  `group_number` int NOT NULL,
  `name` varchar(190) NOT NULL,
  `category` varchar(120) NOT NULL,
  `summary` text NULL,
  `icon` varchar(48) NOT NULL DEFAULT 'Layers',
  `listed` tinyint(1) NOT NULL DEFAULT 1,
  `sort_order` int NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `packet_groups_slug_unique` (`slug`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `password_reset_tokens` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `token_hash` varchar(64) NOT NULL,
  `expires_at` timestamp NOT NULL,
  `used_at` timestamp NULL,
  `request_ip` varchar(64) NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `password_reset_token_unique` (`token_hash`),
  KEY `password_reset_user_idx` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `payments` (
  `id` int NOT NULL AUTO_INCREMENT,
  `order_id` int NOT NULL,
  `invoice_id` int NULL,
  `provider` varchar(32) NOT NULL DEFAULT 'manual',
  `provider_reference` varchar(190) NULL,
  `amount_cents` int NOT NULL,
  `status` varchar(16) NOT NULL DEFAULT 'pending',
  `method_summary` varchar(64) NULL,
  `received_at` timestamp NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `payments_order_idx` (`order_id`),
  KEY `payments_reference_idx` (`provider_reference`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `payouts` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `amount_cents` int NOT NULL,
  `status` varchar(16) NOT NULL DEFAULT 'requested',
  `method` varchar(32) NOT NULL DEFAULT 'manual',
  `reference_enc` text NULL,
  `processed_at` timestamp NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `payouts_user_idx` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `phase_jobs` (
  `id` int NOT NULL AUTO_INCREMENT,
  `order_id` int NOT NULL,
  `phase` varchar(32) NOT NULL,
  `job_type` varchar(48) NOT NULL,
  `status` varchar(16) NOT NULL DEFAULT 'pending',
  `attempts` int NOT NULL DEFAULT 0,
  `last_error` text NULL,
  `run_after` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `completed_at` timestamp NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `phase_jobs_status_idx` (`status`, `run_after`),
  KEY `phase_jobs_order_idx` (`order_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `phase_kickoff_configs` (
  `id` int NOT NULL AUTO_INCREMENT,
  `phase` varchar(32) NOT NULL,
  `create_folders` tinyint(1) NOT NULL DEFAULT 1,
  `folder_template` json NULL,
  `attach_placeholders` tinyint(1) NOT NULL DEFAULT 1,
  `notify_customer` tinyint(1) NOT NULL DEFAULT 1,
  `notify_webhooks` tinyint(1) NOT NULL DEFAULT 0,
  `email_template_key` varchar(64) NULL,
  `enabled` tinyint(1) NOT NULL DEFAULT 1,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `phase_kickoff_phase_unique` (`phase`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `policy_acceptances` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `policy_version_id` int NOT NULL,
  `ip_address` varchar(64) NULL,
  `user_agent` varchar(255) NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `policy_acceptances_user_idx` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `policy_documents` (
  `id` int NOT NULL AUTO_INCREMENT,
  `slug` varchar(64) NOT NULL,
  `title` varchar(190) NOT NULL,
  `requires_acceptance` tinyint(1) NOT NULL DEFAULT 0,
  `public_route` varchar(96) NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `policy_documents_slug_unique` (`slug`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `policy_versions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `policy_id` int NOT NULL,
  `version` varchar(24) NOT NULL,
  `effective_date` varchar(32) NOT NULL,
  `body_markdown` text NOT NULL,
  `published` tinyint(1) NOT NULL DEFAULT 1,
  `created_by_user_id` int NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `policy_versions_policy_idx` (`policy_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `product_features` (
  `id` int NOT NULL AUTO_INCREMENT,
  `product_id` int NOT NULL,
  `label` varchar(255) NOT NULL,
  `detail` text NULL,
  `inherited_from_tier` varchar(24) NULL,
  `sort_order` int NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `product_features_product_idx` (`product_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `products` (
  `id` int NOT NULL AUTO_INCREMENT,
  `packet_group_id` int NOT NULL,
  `sku` varchar(64) NOT NULL,
  `name` varchar(190) NOT NULL,
  `tier` varchar(24) NOT NULL,
  `price_cents` int NULL,
  `custom_pricing` tinyint(1) NOT NULL DEFAULT 0,
  `delivery_estimate` varchar(96) NOT NULL,
  `outcome` text NULL,
  `description` text NULL,
  `listed` tinyint(1) NOT NULL DEFAULT 1,
  `active` tinyint(1) NOT NULL DEFAULT 1,
  `sort_order` int NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `products_sku_unique` (`sku`),
  KEY `products_group_idx` (`packet_group_id`),
  KEY `products_listed_idx` (`listed`, `active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `rate_limit_configs` (
  `category` varchar(32) NOT NULL,
  `label` varchar(96) NOT NULL,
  `window_seconds` int NOT NULL,
  `max_requests` int NOT NULL,
  `enabled` tinyint(1) NOT NULL DEFAULT 1,
  `penalty_enabled` tinyint(1) NOT NULL DEFAULT 1,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`category`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `referrals` (
  `id` int NOT NULL AUTO_INCREMENT,
  `referrer_user_id` int NOT NULL,
  `referred_user_id` int NULL,
  `code` varchar(48) NOT NULL,
  `order_id` int NULL,
  `reward_cents` int NOT NULL DEFAULT 0,
  `status` varchar(16) NOT NULL DEFAULT 'pending',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `referrals_code_unique` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `refunds` (
  `id` int NOT NULL AUTO_INCREMENT,
  `order_id` int NOT NULL,
  `payment_id` int NULL,
  `amount_cents` int NOT NULL,
  `reason` varchar(255) NULL,
  `completion_stage` int NULL,
  `status` varchar(16) NOT NULL DEFAULT 'requested',
  `requested_by_user_id` int NOT NULL,
  `approved_by_user_id` int NULL,
  `processed_at` timestamp NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `refunds_order_idx` (`order_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `registration_fields` (
  `id` int NOT NULL AUTO_INCREMENT,
  `field_key` varchar(64) NOT NULL,
  `label` varchar(190) NOT NULL,
  `help_text` varchar(255) NULL,
  `field_type` varchar(24) NOT NULL DEFAULT 'text',
  `options` json NULL,
  `required` tinyint(1) NOT NULL DEFAULT 0,
  `enabled` tinyint(1) NOT NULL DEFAULT 1,
  `encrypted` tinyint(1) NOT NULL DEFAULT 1,
  `sort_order` int NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `registration_fields_key_unique` (`field_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `reviews` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `order_id` int NOT NULL,
  `product_id` int NULL,
  `rating` tinyint NOT NULL,
  `title` varchar(190) NULL,
  `body` text NOT NULL,
  `display_name` varchar(120) NULL,
  `status` varchar(16) NOT NULL DEFAULT 'pending',
  `moderated_by_user_id` int NULL,
  `moderation_note` varchar(500) NULL,
  `published_at` timestamp NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `reviews_status_idx` (`status`),
  UNIQUE KEY `reviews_order_unique` (`order_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `saml_configs` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(120) NOT NULL,
  `enabled` tinyint(1) NOT NULL DEFAULT 0,
  `entry_point` varchar(500) NOT NULL,
  `issuer` varchar(255) NOT NULL,
  `idp_certificate` text NOT NULL,
  `signature_algorithm` varchar(32) NOT NULL DEFAULT 'sha256',
  `attribute_mapping` json NULL,
  `default_role` varchar(16) NOT NULL DEFAULT 'customer',
  `auto_provision` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `scheduled_jobs` (
  `id` int NOT NULL AUTO_INCREMENT,
  `job_key` varchar(64) NOT NULL,
  `description` varchar(255) NULL,
  `interval_seconds` int NOT NULL,
  `enabled` tinyint(1) NOT NULL DEFAULT 1,
  `last_run_at` timestamp NULL,
  `last_status` varchar(16) NULL,
  `last_detail` varchar(500) NULL,
  `next_run_at` timestamp NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `scheduled_jobs_key_unique` (`job_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `schema_migrations` (
  `filename` varchar(190) NOT NULL,
  `checksum` varchar(64) NOT NULL,
  `applied_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`filename`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `security_logs` (
  `id` int NOT NULL AUTO_INCREMENT,
  `event_type` varchar(64) NOT NULL,
  `severity` varchar(16) NOT NULL DEFAULT 'info',
  `user_id` int NULL,
  `subject_hash` varchar(64) NULL,
  `ip_address` varchar(64) NULL,
  `user_agent` varchar(255) NULL,
  `outcome` varchar(16) NOT NULL DEFAULT 'success',
  `message` varchar(500) NOT NULL,
  `metadata` json NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `security_logs_type_idx` (`event_type`),
  KEY `security_logs_severity_idx` (`severity`),
  KEY `security_logs_created_idx` (`created_at`),
  KEY `security_logs_user_idx` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `site_settings` (
  `setting_key` varchar(96) NOT NULL,
  `setting_value` text NULL,
  `value_type` varchar(16) NOT NULL DEFAULT 'string',
  `category` varchar(48) NOT NULL DEFAULT 'general',
  `description` varchar(255) NULL,
  `is_secret` tinyint(1) NOT NULL DEFAULT 0,
  `updated_by_user_id` int NULL,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`setting_key`),
  KEY `site_settings_category_idx` (`category`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `storage_targets` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(120) NOT NULL,
  `driver` varchar(16) NOT NULL DEFAULT 'local',
  `config` json NULL,
  `is_default` tinyint(1) NOT NULL DEFAULT 0,
  `active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `system_alerts` (
  `id` int NOT NULL AUTO_INCREMENT,
  `alert_key` varchar(96) NOT NULL,
  `severity` varchar(16) NOT NULL DEFAULT 'error',
  `source` varchar(48) NOT NULL DEFAULT 'server',
  `message` varchar(500) NOT NULL,
  `detail` text NULL,
  `occurrences` int NOT NULL DEFAULT 1,
  `first_seen_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `last_seen_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `acknowledged_by_user_id` int NULL,
  `acknowledged_at` timestamp NULL,
  `resolved_at` timestamp NULL,
  PRIMARY KEY (`id`),
  KEY `system_alerts_key_idx` (`alert_key`),
  KEY `system_alerts_severity_idx` (`severity`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `ticket_attachments` (
  `id` int NOT NULL AUTO_INCREMENT,
  `ticket_id` int NOT NULL,
  `reply_id` int NULL,
  `file_id` int NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `ticket_attachments_ticket_idx` (`ticket_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `ticket_replies` (
  `id` int NOT NULL AUTO_INCREMENT,
  `ticket_id` int NOT NULL,
  `author_user_id` int NOT NULL,
  `body_enc` text NOT NULL,
  `internal_only` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `ticket_replies_ticket_idx` (`ticket_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `tickets` (
  `id` int NOT NULL AUTO_INCREMENT,
  `ticket_number` varchar(32) NOT NULL,
  `user_id` int NOT NULL,
  `order_id` int NULL,
  `subject_enc` text NOT NULL,
  `category` varchar(32) NOT NULL DEFAULT 'general',
  `status` varchar(16) NOT NULL DEFAULT 'open',
  `priority` varchar(16) NOT NULL DEFAULT 'normal',
  `assigned_to_user_id` int NULL,
  `last_reply_at` timestamp NULL,
  `resolved_at` timestamp NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `tickets_number_unique` (`ticket_number`),
  KEY `tickets_user_idx` (`user_id`),
  KEY `tickets_status_idx` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `user_backup_codes` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `code_hash` varchar(64) NOT NULL,
  `used_at` timestamp NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `user_backup_codes_user_idx` (`user_id`),
  KEY `user_backup_codes_hash_idx` (`code_hash`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `user_mfa` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `secret_enc` text NOT NULL,
  `confirmed_at` timestamp NULL,
  `last_used_step` int NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `user_mfa_user_unique` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `user_profile_values` (
  `user_id` int NOT NULL,
  `field_key` varchar(64) NOT NULL,
  `value_enc` text NULL,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`, `field_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `user_sessions` (
  `id` varchar(64) NOT NULL,
  `user_id` int NOT NULL,
  `csrf_secret` varchar(64) NOT NULL,
  `ip_address` varchar(64) NULL,
  `user_agent` varchar(255) NULL,
  `mfa_pending` tinyint(1) NOT NULL DEFAULT 0,
  `restricted` tinyint(1) NOT NULL DEFAULT 0,
  `status` varchar(16) NOT NULL DEFAULT 'active',
  `last_seen_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `expires_at` timestamp NOT NULL,
  `revoked_at` timestamp NULL,
  `revoked_reason` varchar(190) NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `user_sessions_user_idx` (`user_id`),
  KEY `user_sessions_status_idx` (`status`),
  KEY `user_sessions_expires_idx` (`expires_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `users` (
  `id` int NOT NULL AUTO_INCREMENT,
  `email_index` varchar(64) NOT NULL,
  `email_enc` text NOT NULL,
  `email_domain` varchar(190) NULL,
  `first_name_enc` text NULL,
  `middle_name_enc` text NULL,
  `last_name_enc` text NULL,
  `preferred_name_enc` text NULL,
  `suffix_enc` text NULL,
  `company_enc` text NULL,
  `phone_enc` text NULL,
  `address_enc` text NULL,
  `password_hash` varchar(255) NULL,
  `role` varchar(16) NOT NULL DEFAULT 'customer',
  `login_method` varchar(16) NOT NULL DEFAULT 'local',
  `status` varchar(16) NOT NULL DEFAULT 'active',
  `email_verified` tinyint(1) NOT NULL DEFAULT 0,
  `must_change_password` tinyint(1) NOT NULL DEFAULT 0,
  `mfa_enabled` tinyint(1) NOT NULL DEFAULT 0,
  `onboarding_completed_at` timestamp NULL,
  `last_login_at` timestamp NULL,
  `last_login_ip` varchar(64) NULL,
  `failed_login_count` int NOT NULL DEFAULT 0,
  `locked_until` timestamp NULL,
  `password_changed_at` timestamp NULL,
  `notes_enc` text NULL,
  `marketing_opt_in` tinyint(1) NOT NULL DEFAULT 0,
  `timezone` varchar(64) NOT NULL DEFAULT 'America/New_York',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` timestamp NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `users_email_index_unique` (`email_index`),
  KEY `users_role_idx` (`role`),
  KEY `users_status_idx` (`status`),
  KEY `users_deleted_idx` (`deleted_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `webhook_deliveries` (
  `id` int NOT NULL AUTO_INCREMENT,
  `endpoint_id` int NOT NULL,
  `event_type` varchar(64) NOT NULL,
  `payload` json NULL,
  `status` varchar(16) NOT NULL DEFAULT 'pending',
  `response_code` int NULL,
  `attempts` int NOT NULL DEFAULT 0,
  `last_error` varchar(500) NULL,
  `run_after` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `delivered_at` timestamp NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `webhook_deliveries_endpoint_idx` (`endpoint_id`),
  KEY `webhook_deliveries_status_idx` (`status`, `run_after`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `webhook_endpoints` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(120) NOT NULL,
  `url` varchar(500) NOT NULL,
  `events` json NULL,
  `secret_enc` text NULL,
  `enabled` tinyint(1) NOT NULL DEFAULT 1,
  `created_by_user_id` int NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
