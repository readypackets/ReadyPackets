-- Delivery control, richer order automation, and flexible question-bank phases.
-- Applied after 0014_email_delivery_retention.sql.

ALTER TABLE email_queue
  ADD COLUMN cancelled_at TIMESTAMP NULL,
  ADD COLUMN source_queue_id INT NULL;

ALTER TABLE order_automation_rules
  ADD COLUMN email_template_key VARCHAR(64) NULL,
  ADD COLUMN webhook_endpoint_id INT NULL;

ALTER TABLE order_question_templates
  MODIFY COLUMN phase VARCHAR(16) NOT NULL DEFAULT 'unassigned';

-- Preserve existing question behavior while giving new templates a neutral default.
UPDATE order_question_templates SET phase = 'unassigned' WHERE phase IS NULL OR phase = '';
