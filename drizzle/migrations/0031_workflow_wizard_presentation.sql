ALTER TABLE order_workflows
  ADD COLUMN customer_presentation ENUM('cards', 'wizard') NOT NULL DEFAULT 'cards' AFTER stages;
