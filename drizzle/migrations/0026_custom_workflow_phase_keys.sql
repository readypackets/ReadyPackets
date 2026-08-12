-- Custom workflow stages may use stable keys longer than the original Phase I/II names.
-- Widen the phase columns while retaining the existing indexed values and data.
ALTER TABLE files MODIFY COLUMN phase VARCHAR(64) NOT NULL DEFAULT 'unassigned';
ALTER TABLE order_questions MODIFY COLUMN phase VARCHAR(64) NOT NULL DEFAULT 'unassigned';
ALTER TABLE order_question_templates MODIFY COLUMN phase VARCHAR(64) NOT NULL DEFAULT 'unassigned';

-- The existing standard workflow becomes phase-workspace aware. Existing custom
-- workflows without a capabilities member retain backward-compatible defaults
-- in the application until an administrator edits and saves them.
UPDATE order_workflows
SET stages = JSON_ARRAY(
  JSON_OBJECT('key', 'new', 'label', 'Payment confirmed', 'order', 1, 'capabilities', JSON_ARRAY('questions')),
  JSON_OBJECT('key', 'phase_1_intake', 'label', 'Phase 1 intake', 'order', 2, 'capabilities', JSON_ARRAY('documents', 'questions', 'recording')),
  JSON_OBJECT('key', 'phase_2_synthesis', 'label', 'Phase 2 synthesis', 'order', 3, 'capabilities', JSON_ARRAY('documents', 'questions', 'recording')),
  JSON_OBJECT('key', 'phase_3_review', 'label', 'Phase 3 review', 'order', 4, 'capabilities', JSON_ARRAY('documents', 'questions')),
  JSON_OBJECT('key', 'phase_4_delivery', 'label', 'Phase 4 delivery', 'order', 5, 'capabilities', JSON_ARRAY('documents')),
  JSON_OBJECT('key', 'delivered', 'label', 'Delivered', 'order', 6, 'capabilities', JSON_ARRAY('documents')),
  JSON_OBJECT('key', 'closed', 'label', 'Closed', 'order', 7, 'capabilities', JSON_ARRAY())
)
WHERE id = 1 AND name = 'ReadyPackets standard workflow';

-- Keep historical standard-workflow materials visible in their new stage workspace.
UPDATE files
INNER JOIN orders ON orders.id = files.order_id
SET files.phase = CASE files.phase
  WHEN 'phase_1' THEN 'phase_1_intake'
  WHEN 'phase_2' THEN 'phase_2_synthesis'
  ELSE files.phase
END
WHERE orders.workflow_id = 1 AND files.phase IN ('phase_1', 'phase_2');

UPDATE order_questions
INNER JOIN orders ON orders.id = order_questions.order_id
SET order_questions.phase = CASE order_questions.phase
  WHEN 'phase_1' THEN 'phase_1_intake'
  WHEN 'phase_2' THEN 'phase_2_synthesis'
  ELSE order_questions.phase
END
WHERE orders.workflow_id = 1 AND order_questions.phase IN ('phase_1', 'phase_2');
