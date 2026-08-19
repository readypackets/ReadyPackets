-- Replace retired sequential customer references without changing internal keys.
-- customer_number is the public customer-facing ID; users.id remains relational only.
UPDATE users
SET customer_number = CONCAT('RP-CUS-', UPPER(SUBSTRING(SHA2(CONCAT(UUID(), id, NOW(6)), 256), 1, 8)))
WHERE customer_number IS NULL
   OR customer_number NOT REGEXP '^RP-CUS-[A-Z0-9]{6,8}$';

-- Keep the compatibility display identifier synchronized so older UI consumers
-- also show the mandated RP-CUS reference rather than the retired RP-U form.
UPDATE users
SET public_id = customer_number
WHERE public_id IS NULL
   OR public_id <> customer_number;

-- Replace current-order references that embed the retired RP-C0000XX customer
-- pattern. The stable portion of each historical order reference is retained,
-- while the current opaque customer token becomes the visible association.
UPDATE orders AS o
INNER JOIN users AS u ON u.id = o.user_id
SET o.order_number = CONCAT(
  'RP-ORD-',
  SUBSTRING(u.customer_number, 8),
  SUBSTRING(o.order_number, 11)
)
WHERE o.order_number REGEXP '^RP-C[0-9]{6}-[0-9]{4}-[A-Z0-9]{6}$';

-- Existing non-legacy order references are intentionally retained. Future
-- references are allocated by generateOrderNumber() using RP-ORD-RP-CUS token format.
