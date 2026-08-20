-- Independent public visibility control for Policy Center documents.
-- Existing documents remain visible to avoid an accidental public-policy outage.
ALTER TABLE policy_documents
  ADD COLUMN is_visible BOOLEAN NOT NULL DEFAULT TRUE AFTER requires_acceptance;

CREATE INDEX policy_documents_visible_idx ON policy_documents (is_visible);
