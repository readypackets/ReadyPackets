-- Publish cookie-consent language as a new privacy-policy version without changing
-- any historical accepted policy record. The current policy remains available in
-- version history for evidentiary purposes.
INSERT INTO policy_versions (policy_id, version, effective_date, body_markdown, published, created_at)
SELECT
  documents.id,
  '2026.08.19-cookie',
  'August 19, 2026',
  CONCAT(
    SUBSTRING_INDEX(current_versions.body_markdown, '## 7.', 1),
    '## 7. Cookies, Browser Storage, and Privacy Preferences\n\n',
    '### 7.1 Essential Cookies and Storage\n\n',
    'We use strictly necessary cookies and related browser storage to operate and secure the website and customer portal. These include the portal session cookie, a CSRF security token, security controls where applicable, and functional storage needed to preserve an in-progress order or authentication state. These technologies are required to deliver the service you request and cannot be disabled through our preference center. Disabling them in your browser may prevent sign-in, checkout, order intake, or other portal functions from working.\n\n',
    '### 7.2 Preference Technologies\n\n',
    'With your permission, we may store optional preferences such as visual theme or other convenience settings. You may allow or withdraw preference storage at any time through **Manage cookie preferences** in the website footer or platform preference center.\n\n',
    '### 7.3 Analytics Technologies\n\n',
    'ReadyPackets does not activate analytics cookies or analytics tags unless the applicable analytics category is enabled by the Company and you provide consent through the preference center. You may decline or withdraw analytics consent at any time without affecting essential portal services.\n\n',
    '### 7.4 Marketing Technologies\n\n',
    'ReadyPackets does not activate marketing or advertising cookies, pixels, or similar tracking technologies unless the applicable marketing category is enabled by the Company and you provide consent through the preference center. You may decline or withdraw marketing consent at any time without affecting essential portal services.\n\n',
    '### 7.5 Your Choices and Consent Records\n\n',
    'When you first visit ReadyPackets, you can accept all optional categories, reject all optional categories, or choose categories individually. We record your choice using a protected browser token and a versioned consent record. We retain a privacy-preserving record of the consent decision, category choices, consent-policy version, time of decision, and limited security evidence; we do not store your raw IP address or raw user-agent in the consent record. You can reopen and change your choices at any time through **Manage cookie preferences**. A changed preference applies going forward and does not invalidate processing that occurred before withdrawal where processing was lawful.\n\n',
    'You may also manage cookies through your browser settings. Browser controls do not replace the ReadyPackets preference center for choices associated with this platform.\n\n',
    '## 8.', SUBSTRING_INDEX(current_versions.body_markdown, '## 8.', -1)
  ),
  1,
  CURRENT_TIMESTAMP
FROM policy_documents AS documents
INNER JOIN policy_versions AS current_versions
  ON current_versions.policy_id = documents.id
LEFT JOIN policy_versions AS replacement
  ON replacement.policy_id = documents.id
  AND replacement.version = '2026.08.19-cookie'
WHERE documents.slug = 'privacy-policy'
  AND current_versions.published = 1
  AND current_versions.body_markdown LIKE '%## 7.%'
  AND current_versions.body_markdown LIKE '%## 8.%'
  AND replacement.id IS NULL;

UPDATE policy_versions AS versions
INNER JOIN policy_documents AS documents ON documents.id = versions.policy_id
INNER JOIN policy_versions AS replacement
  ON replacement.policy_id = versions.policy_id
  AND replacement.version = '2026.08.19-cookie'
  AND replacement.published = 1
SET versions.published = 0
WHERE documents.slug = 'privacy-policy'
  AND versions.version <> '2026.08.19-cookie'
  AND versions.published = 1;
