-- Secure, single-use OAuth authorization attempts for the delegated SharePoint sync identity.
-- Browser-visible state is stored only as SHA-256; the PKCE verifier is encrypted by the application.
CREATE TABLE IF NOT EXISTS sharepoint_delegated_auth_attempts (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  state_hash CHAR(64) NOT NULL,
  code_verifier_enc TEXT NOT NULL,
  initiated_by_user_id INT NOT NULL,
  request_ip VARCHAR(64) NULL,
  expires_at TIMESTAMP NOT NULL,
  consumed_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY sharepoint_delegated_auth_state_unique (state_hash),
  KEY sharepoint_delegated_auth_expiry_idx (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
