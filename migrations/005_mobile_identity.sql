-- ReadyPackets mobile OAuth/device identity foundation.
-- Stores only hashes of authorization codes, refresh tokens, and idempotency keys.

CREATE TABLE IF NOT EXISTS mobile_devices (
  id varchar(96) NOT NULL,
  user_id int NOT NULL,
  platform varchar(16) NOT NULL,
  app_version varchar(32) NOT NULL,
  device_name varchar(128) NULL,
  push_token_hash char(64) NULL,
  push_platform varchar(16) NULL,
  status varchar(16) NOT NULL DEFAULT 'active',
  last_seen_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revoked_at timestamp NULL,
  revoked_reason varchar(190) NULL,
  created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY mobile_devices_user_idx (user_id),
  KEY mobile_devices_status_idx (status),
  KEY mobile_devices_last_seen_idx (last_seen_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS mobile_device_sessions (
  id varchar(64) NOT NULL,
  token_family_id varchar(64) NOT NULL,
  device_id varchar(96) NOT NULL,
  user_id int NOT NULL,
  status varchar(16) NOT NULL DEFAULT 'active',
  last_seen_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at timestamp NOT NULL,
  revoked_at timestamp NULL,
  revoked_reason varchar(190) NULL,
  created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY mobile_device_sessions_family_uq (token_family_id),
  KEY mobile_device_sessions_user_idx (user_id),
  KEY mobile_device_sessions_device_idx (device_id),
  KEY mobile_device_sessions_expires_idx (expires_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS mobile_authorization_codes (
  id varchar(64) NOT NULL,
  code_hash char(64) NOT NULL,
  user_id int NOT NULL,
  device_id varchar(96) NOT NULL,
  redirect_uri varchar(512) NOT NULL,
  code_challenge varchar(128) NOT NULL,
  scopes json NOT NULL,
  expires_at timestamp NOT NULL,
  used_at timestamp NULL,
  created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY mobile_authorization_codes_hash_uq (code_hash),
  KEY mobile_authorization_codes_expires_idx (expires_at),
  KEY mobile_authorization_codes_user_idx (user_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS mobile_refresh_tokens (
  id varchar(64) NOT NULL,
  token_hash char(64) NOT NULL,
  session_id varchar(64) NOT NULL,
  token_family_id varchar(64) NOT NULL,
  status varchar(16) NOT NULL DEFAULT 'active',
  expires_at timestamp NOT NULL,
  rotated_at timestamp NULL,
  revoked_at timestamp NULL,
  created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY mobile_refresh_tokens_hash_uq (token_hash),
  KEY mobile_refresh_tokens_session_idx (session_id),
  KEY mobile_refresh_tokens_family_idx (token_family_id),
  KEY mobile_refresh_tokens_expires_idx (expires_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS mobile_idempotency_keys (
  id varchar(64) NOT NULL,
  user_id int NOT NULL,
  route varchar(128) NOT NULL,
  key_hash char(64) NOT NULL,
  request_hash char(64) NOT NULL,
  response_json json NOT NULL,
  expires_at timestamp NOT NULL,
  created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY mobile_idempotency_keys_user_key_uq (user_id, key_hash),
  KEY mobile_idempotency_keys_expires_idx (expires_at)
) ENGINE=InnoDB;
