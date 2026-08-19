-- Customer workflow stages configured for a non-locking Next transition need
-- durable, order-scoped progression state. These records intentionally remain
-- distinct from order_phase_locks so only Submit and lock makes uploaded work
-- immutable.
CREATE TABLE IF NOT EXISTS order_workflow_advances (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  order_id INT NOT NULL,
  phase_key VARCHAR(64) NOT NULL,
  advanced_by_user_id INT NOT NULL,
  advanced_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY order_workflow_advances_order_phase_unique (order_id, phase_key),
  KEY order_workflow_advances_order_idx (order_id, advanced_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
