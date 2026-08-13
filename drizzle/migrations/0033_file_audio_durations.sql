-- Persist server-probed duration for audio files so workflow stage governance can
-- enforce cumulative recording time after the browser session has ended.
ALTER TABLE files
  ADD COLUMN duration_seconds INT NULL AFTER size_bytes;

CREATE INDEX files_order_phase_duration_idx
  ON files (order_id, phase, deleted_at, duration_seconds);
