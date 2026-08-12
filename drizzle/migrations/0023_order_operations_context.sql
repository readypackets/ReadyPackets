-- Phase-aware order files and contextual webhook delivery logs.
ALTER TABLE files
  ADD COLUMN phase VARCHAR(16) NOT NULL DEFAULT 'unassigned' AFTER category,
  ADD INDEX files_order_phase_idx (order_id, phase, deleted_at);

UPDATE files
  SET phase = 'phase_1'
  WHERE category = 'intake_attachment' AND phase = 'unassigned';

ALTER TABLE webhook_deliveries
  ADD COLUMN order_id INT NULL AFTER endpoint_id,
  ADD COLUMN order_number VARCHAR(64) NULL AFTER order_id,
  ADD COLUMN customer_name VARCHAR(255) NULL AFTER order_number,
  ADD INDEX webhook_deliveries_order_idx (order_id, created_at);

UPDATE webhook_deliveries wd
JOIN orders o ON o.order_number = JSON_UNQUOTE(JSON_EXTRACT(wd.payload, '$.order_id'))
SET wd.order_id = o.id,
    wd.order_number = o.order_number
WHERE wd.order_id IS NULL
  AND JSON_EXTRACT(wd.payload, '$.order_id') IS NOT NULL;
