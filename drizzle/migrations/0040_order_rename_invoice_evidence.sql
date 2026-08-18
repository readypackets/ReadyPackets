-- 0040_order_rename_invoice_evidence.sql
-- Immutable creation-origin evidence and durable attachment intent for invoices.

ALTER TABLE orders
  ADD COLUMN created_by_origin VARCHAR(20) NOT NULL DEFAULT 'customer' AFTER user_id;

-- Historical administrator-created orders already have a server-side audit event.
UPDATE orders o
JOIN activity_logs a
  ON a.entity_type = 'order'
  AND a.action = 'order.admin_created'
  AND a.entity_id = CAST(o.id AS CHAR)
SET o.created_by_origin = 'admin';

ALTER TABLE email_queue
  ADD COLUMN attachment_manifest JSON NULL AFTER body_text;

ALTER TABLE email_log
  ADD COLUMN attachment_manifest JSON NULL AFTER body_text_enc;
