-- Unified customer and administrator order-message center: 2026-08-14
-- Message contents remain in encrypted order_notes. This table holds only
-- recipient-specific read state, so no message text is duplicated.

CREATE TABLE order_message_receipts (
  id INT NOT NULL AUTO_INCREMENT,
  order_note_id INT NOT NULL,
  user_id INT NOT NULL,
  read_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY order_message_receipts_note_user_unique (order_note_id, user_id),
  KEY order_message_receipts_user_read_idx (user_id, read_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Existing shared order messages are historical/read by default. The first new
-- message sent after this release creates an explicit unread receipt for each
-- eligible recipient, avoiding surprise alerts for archival conversations.
INSERT IGNORE INTO order_message_receipts (order_note_id, user_id, read_at)
SELECT n.id, o.user_id, n.created_at
FROM order_notes n
INNER JOIN orders o ON o.id = n.order_id
WHERE n.visibility = 'shared';

INSERT IGNORE INTO order_message_receipts (order_note_id, user_id, read_at)
SELECT n.id, s.shared_with_user_id, n.created_at
FROM order_notes n
INNER JOIN order_shares s ON s.order_id = n.order_id AND s.revoked_at IS NULL
WHERE n.visibility = 'shared';
