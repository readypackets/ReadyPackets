-- Customer-facing invoice publication and delivery state.
-- Existing paid invoices become visible in the customer portal immediately; the
-- invoice ledger remains the authoritative record for administrator workspaces.

ALTER TABLE invoices
  ADD COLUMN customer_visible BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN published_at TIMESTAMP NULL,
  ADD COLUMN email_queued_at TIMESTAMP NULL,
  ADD COLUMN email_queued_by_user_id INT NULL;

UPDATE invoices
SET published_at = COALESCE(issued_at, created_at)
WHERE customer_visible = TRUE
  AND published_at IS NULL;

CREATE INDEX invoices_customer_visible_idx
  ON invoices (user_id, customer_visible, issued_at);
