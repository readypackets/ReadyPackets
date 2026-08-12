-- Administrator-created order payment and pricing controls.
ALTER TABLE orders
  ADD COLUMN payment_requirement VARCHAR(20) NOT NULL DEFAULT 'required' AFTER payment_status,
  ADD COLUMN price_source VARCHAR(20) NOT NULL DEFAULT 'catalog' AFTER total_cents,
  ADD COLUMN manual_price_cents INT NULL AFTER price_source,
  ADD COLUMN is_test_order TINYINT(1) NOT NULL DEFAULT 0 AFTER manual_price_cents;

CREATE INDEX orders_test_order_idx ON orders (is_test_order);
CREATE INDEX orders_payment_requirement_idx ON orders (payment_requirement);

-- Existing orders retain their catalog-derived price and normal payment requirement.
