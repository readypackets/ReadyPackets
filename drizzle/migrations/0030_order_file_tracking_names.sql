-- Backfill existing order-linked file display/download names. Physical objects remain
-- under opaque storage keys, so this does not move or expose stored bytes.
UPDATE files AS f
INNER JOIN orders AS o ON o.id = f.order_id
INNER JOIN users AS u ON u.id = o.user_id
SET f.original_name = CASE
  WHEN f.original_name LIKE CONCAT(u.public_id, '__', o.order_number, '__%') THEN f.original_name
  ELSE CONCAT(
    u.public_id,
    '__',
    o.order_number,
    '__',
    LEFT(f.original_name, GREATEST(1, 255 - CHAR_LENGTH(u.public_id) - CHAR_LENGTH(o.order_number) - 4))
  )
END
WHERE f.order_id IS NOT NULL
  AND f.deleted_at IS NULL
  AND u.public_id IS NOT NULL
  AND u.public_id <> '';
