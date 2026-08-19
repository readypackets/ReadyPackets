-- Centralized ReadyPackets business profile for future public pages, emails, invoices,
-- and generated document templates. Historical documents remain unchanged.
INSERT INTO site_settings (
  setting_key,
  setting_value,
  value_type,
  category,
  description,
  is_secret,
  updated_by_user_id,
  updated_at
) VALUES (
  'business.profile',
  '{"legalName":"Ready Packets Consulting LLC","publicName":"ReadyPackets","addressLine1":"7404 Executive Pl","addressLine2":null,"city":"Lanham","state":"MD","postalCode":"20706","country":"US"}',
  'json',
  'business_profile',
  'Administrator-managed business name and mailing address used in future public, email, invoice, and generated-document outputs.',
  0,
  NULL,
  CURRENT_TIMESTAMP
)
ON DUPLICATE KEY UPDATE
  setting_value = VALUES(setting_value),
  value_type = VALUES(value_type),
  category = VALUES(category),
  description = VALUES(description),
  is_secret = VALUES(is_secret),
  updated_at = CURRENT_TIMESTAMP;

-- Publish address-only replacements as new policy versions without changing the
-- immutable accepted versions. Required policies retain their prior acceptance
-- history and may be managed normally through Policy Center.
INSERT INTO policy_versions (policy_id, version, effective_date, body_markdown, published, created_at)
SELECT
  documents.id,
  '2026.08.19-address',
  'August 19, 2026',
  REPLACE(current_versions.body_markdown, '347 5th Ave Ste 1402-158, New York, NY 10016', '7404 Executive Pl, Lanham, MD 20706'),
  1,
  CURRENT_TIMESTAMP
FROM policy_documents AS documents
INNER JOIN policy_versions AS current_versions
  ON current_versions.policy_id = documents.id
LEFT JOIN policy_versions AS replacement
  ON replacement.policy_id = documents.id
  AND replacement.version = '2026.08.19-address'
WHERE documents.slug IN ('privacy-policy', 'refund-policy')
  AND current_versions.published = 1
  AND current_versions.body_markdown LIKE '%347 5th Ave Ste 1402-158, New York, NY 10016%'
  AND replacement.id IS NULL;

UPDATE policy_versions AS versions
INNER JOIN policy_documents AS documents ON documents.id = versions.policy_id
INNER JOIN policy_versions AS replacement
  ON replacement.policy_id = versions.policy_id
  AND replacement.version = '2026.08.19-address'
  AND replacement.published = 1
SET versions.published = 0
WHERE documents.slug IN ('privacy-policy', 'refund-policy')
  AND versions.version <> '2026.08.19-address'
  AND versions.published = 1;
