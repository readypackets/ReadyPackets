-- Durable delayed completion-percentage policies for workflow stage actions: 2026-08-14
CREATE TABLE workflow_completion_jobs (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  order_id INT NOT NULL,
  workflow_id INT NOT NULL,
  stage_key VARCHAR(64) NOT NULL,
  mode VARCHAR(16) NOT NULL,
  min_percent INT NOT NULL,
  max_percent INT NOT NULL,
  target_percent INT NOT NULL,
  delay_minutes INT NOT NULL DEFAULT 0,
  run_after TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  status VARCHAR(16) NOT NULL DEFAULT 'pending',
  claimed_at TIMESTAMP NULL,
  attempts INT NOT NULL DEFAULT 0,
  last_error TEXT NULL,
  scheduled_by_user_id INT NULL,
  completed_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY workflow_completion_jobs_status_run_idx (status, run_after),
  KEY workflow_completion_jobs_order_idx (order_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
