-- Auditable execution history for administrator-run automation actions configured on workflow stages.
CREATE TABLE workflow_stage_runs (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  order_id INT NOT NULL,
  workflow_id INT NOT NULL,
  stage_key VARCHAR(64) NOT NULL,
  actions JSON NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'completed',
  error_detail VARCHAR(1000) NULL,
  started_by_user_id INT NULL,
  started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP NULL,
  INDEX workflow_stage_runs_order_idx (order_id, started_at),
  INDEX workflow_stage_runs_workflow_stage_idx (workflow_id, stage_key),
  INDEX workflow_stage_runs_status_idx (status)
);
