ALTER TABLE order_questions
  ADD COLUMN phase VARCHAR(16) NOT NULL DEFAULT 'phase_1' AFTER question_enc,
  ADD KEY order_questions_phase_idx (order_id, phase, status);
