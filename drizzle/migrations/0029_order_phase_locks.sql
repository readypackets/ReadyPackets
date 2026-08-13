-- Customer phase submission locks with administrator-confirmed reopen support.
CREATE TABLE order_phase_locks (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  order_id INT NOT NULL,
  phase_key VARCHAR(64) NOT NULL,
  acknowledgement_text TEXT NOT NULL,
  locked_by_user_id INT NOT NULL,
  locked_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  unlocked_by_user_id INT NULL,
  unlocked_at TIMESTAMP NULL,
  unlock_reason VARCHAR(1000) NULL,
  UNIQUE KEY order_phase_locks_order_phase_unique (order_id, phase_key),
  KEY order_phase_locks_active_idx (order_id, unlocked_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
