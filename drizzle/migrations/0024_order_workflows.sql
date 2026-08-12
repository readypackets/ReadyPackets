CREATE TABLE IF NOT EXISTS order_workflows (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  description TEXT NULL,
  stages JSON NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by_user_id INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY order_workflows_name_unique (name),
  KEY order_workflows_active_idx (active, is_default)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE orders
  ADD COLUMN workflow_id INT NULL AFTER bundle_scope_manifest,
  ADD KEY orders_workflow_idx (workflow_id);

INSERT IGNORE INTO order_workflows (id, name, description, stages, is_default, active, created_by_user_id)
VALUES (
  1,
  'ReadyPackets standard workflow',
  'The standard ReadyPackets lifecycle from payment through delivery and closeout.',
  JSON_ARRAY(
    JSON_OBJECT('key', 'new', 'label', 'Payment confirmed', 'order', 1),
    JSON_OBJECT('key', 'phase_1_intake', 'label', 'Phase 1 intake', 'order', 2),
    JSON_OBJECT('key', 'phase_2_synthesis', 'label', 'Phase 2 synthesis', 'order', 3),
    JSON_OBJECT('key', 'phase_3_review', 'label', 'Phase 3 review', 'order', 4),
    JSON_OBJECT('key', 'phase_4_delivery', 'label', 'Phase 4 delivery', 'order', 5),
    JSON_OBJECT('key', 'delivered', 'label', 'Delivered', 'order', 6),
    JSON_OBJECT('key', 'closed', 'label', 'Closed', 'order', 7)
  ),
  TRUE,
  TRUE,
  NULL
);

UPDATE orders SET workflow_id = 1 WHERE workflow_id IS NULL;
