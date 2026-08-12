-- Immutable revision history for administrator-managed public release notes.

CREATE TABLE IF NOT EXISTS changelog_entry_versions (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  changelog_entry_id INT NOT NULL,
  revision_number INT NOT NULL,
  version VARCHAR(32) NOT NULL,
  title VARCHAR(190) NOT NULL,
  body_markdown TEXT NOT NULL,
  entry_type VARCHAR(24) NOT NULL,
  is_public TINYINT(1) NOT NULL DEFAULT 0,
  change_kind VARCHAR(24) NOT NULL DEFAULT 'draft',
  changed_by_user_id INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY changelog_entry_versions_entry_revision_unique (changelog_entry_id, revision_number),
  KEY changelog_entry_versions_entry_idx (changelog_entry_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO changelog_entry_versions (
  changelog_entry_id, revision_number, version, title, body_markdown,
  entry_type, is_public, change_kind, changed_by_user_id, created_at
)
SELECT
  entry.id, 1, entry.version, entry.title, entry.body_markdown,
  entry.entry_type, entry.is_public,
  CASE WHEN entry.is_public THEN 'published' ELSE 'draft' END,
  entry.created_by_user_id, entry.created_at
FROM changelog_entries AS entry
WHERE NOT EXISTS (
  SELECT 1 FROM changelog_entry_versions AS history
  WHERE history.changelog_entry_id = entry.id
);
