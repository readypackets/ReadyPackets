-- Finance and coupon audit expansion: 2026-08-13

ALTER TABLE coupons
  ADD COLUMN created_by_user_id INT NULL AFTER active,
  ADD COLUMN updated_by_user_id INT NULL AFTER created_by_user_id,
  ADD COLUMN disabled_by_user_id INT NULL AFTER updated_by_user_id,
  ADD COLUMN disabled_at TIMESTAMP NULL AFTER disabled_by_user_id,
  ADD KEY coupons_creator_idx (created_by_user_id);

CREATE TABLE coupon_redemptions (
  id INT NOT NULL AUTO_INCREMENT,
  coupon_id INT NOT NULL,
  order_id INT NOT NULL,
  user_id INT NOT NULL,
  payment_id INT NULL,
  code_snapshot VARCHAR(48) NOT NULL,
  discount_cents INT NOT NULL DEFAULT 0,
  redeemed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY coupon_redemptions_order_unique (order_id),
  KEY coupon_redemptions_coupon_idx (coupon_id, redeemed_at),
  KEY coupon_redemptions_user_idx (user_id, redeemed_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE refunds
  ADD COLUMN provider_reference VARCHAR(190) NULL AFTER status;

-- Preserve historic coupon use where a paid order retains its coupon reference.
INSERT IGNORE INTO coupon_redemptions (coupon_id, order_id, user_id, payment_id, code_snapshot, discount_cents, redeemed_at)
SELECT
  o.coupon_id,
  o.id,
  o.user_id,
  p.id,
  c.code,
  o.discount_cents,
  COALESCE(p.received_at, o.created_at)
FROM orders o
JOIN coupons c ON c.id = o.coupon_id
LEFT JOIN payments p ON p.order_id = o.id AND p.status = 'succeeded'
WHERE o.coupon_id IS NOT NULL
  AND o.payment_status IN ('paid', 'partially_refunded', 'refunded');
