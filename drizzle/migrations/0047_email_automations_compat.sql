-- Restore compatibility: older installations may have missed the legacy email_automations migration.
-- The current application and portable configuration bundles both expect this table.
CREATE TABLE IF NOT EXISTS `email_automations` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(190) NOT NULL,
  `description` varchar(500) DEFAULT NULL,
  `trigger_event` varchar(64) NOT NULL,
  `trigger_condition` json DEFAULT NULL,
  `template_key` varchar(64) NOT NULL,
  `delay_minutes` int NOT NULL DEFAULT 0,
  `enabled` tinyint(1) NOT NULL DEFAULT 1,
  `run_count` int NOT NULL DEFAULT 0,
  `last_run_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `email_automations_trigger_idx` (`trigger_event`),
  KEY `email_automations_enabled_idx` (`enabled`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
