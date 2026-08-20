-- Self-hosted compatibility: early phase_kickoff_configs tables may predate
-- folder templates, email-template selection, or automatic completion settings.
-- Add every required column only when absent, preserving existing configuration.

SET @rp_phase_kickoff_sql := (
  SELECT IF(
    EXISTS(
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND table_name = 'phase_kickoff_configs'
        AND column_name = 'folder_template'
    ),
    'SELECT 1',
    'ALTER TABLE `phase_kickoff_configs` ADD COLUMN `folder_template` JSON NULL AFTER `create_folders`'
  )
);
PREPARE rp_phase_kickoff_statement FROM @rp_phase_kickoff_sql;
EXECUTE rp_phase_kickoff_statement;
DEALLOCATE PREPARE rp_phase_kickoff_statement;

SET @rp_phase_kickoff_sql := (
  SELECT IF(
    EXISTS(
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND table_name = 'phase_kickoff_configs'
        AND column_name = 'email_template_key'
    ),
    'SELECT 1',
    'ALTER TABLE `phase_kickoff_configs` ADD COLUMN `email_template_key` VARCHAR(64) NULL AFTER `notify_webhooks`'
  )
);
PREPARE rp_phase_kickoff_statement FROM @rp_phase_kickoff_sql;
EXECUTE rp_phase_kickoff_statement;
DEALLOCATE PREPARE rp_phase_kickoff_statement;

SET @rp_phase_kickoff_sql := (
  SELECT IF(
    EXISTS(
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND table_name = 'phase_kickoff_configs'
        AND column_name = 'completion_percent'
    ),
    'SELECT 1',
    'ALTER TABLE `phase_kickoff_configs` ADD COLUMN `completion_percent` INT NOT NULL DEFAULT 0 AFTER `email_template_key`'
  )
);
PREPARE rp_phase_kickoff_statement FROM @rp_phase_kickoff_sql;
EXECUTE rp_phase_kickoff_statement;
DEALLOCATE PREPARE rp_phase_kickoff_statement;
