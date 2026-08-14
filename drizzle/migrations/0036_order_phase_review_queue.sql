-- Staff acknowledgement state for customer-submitted workflow phases: 2026-08-14
-- Existing active locks intentionally begin unreviewed so the operations team can
-- explicitly clear any historical customer submission that still needs review.

ALTER TABLE order_phase_locks
  ADD COLUMN reviewed_at TIMESTAMP NULL AFTER locked_at,
  ADD COLUMN reviewed_by_user_id INT NULL AFTER reviewed_at,
  ADD KEY order_phase_locks_review_queue_idx (order_id, unlocked_at, reviewed_at);
