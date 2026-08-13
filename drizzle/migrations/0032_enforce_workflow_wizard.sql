-- Make the customer order workspace consistently sequential across all assigned workflows.
ALTER TABLE order_workflows
  MODIFY COLUMN customer_presentation ENUM('cards', 'wizard') NOT NULL DEFAULT 'wizard';

UPDATE order_workflows
SET customer_presentation = 'wizard'
WHERE customer_presentation <> 'wizard';
