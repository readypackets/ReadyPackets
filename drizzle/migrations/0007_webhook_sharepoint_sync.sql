-- Webhook payload metadata and SharePoint sync log
ALTER TABLE orders
  ADD COLUMN canon_version varchar(128) DEFAULT NULL,
  ADD COLUMN run_mode varchar(32) DEFAULT NULL,
  ADD COLUMN release_status varchar(128) DEFAULT NULL,
  ADD COLUMN order_scope_mode varchar(64) DEFAULT NULL,
  ADD COLUMN bundle_scope_manifest text DEFAULT NULL;

CREATE TABLE sharepoint_sync_log (
  id int NOT NULL AUTO_INCREMENT,
  order_id int NOT NULL,
  operation_type varchar(32) NOT NULL,
  status varchar(32) NOT NULL DEFAULT 'pending',
  sharepoint_path varchar(1024) NOT NULL,
  file_id int DEFAULT NULL,
  error_message text DEFAULT NULL,
  attempts int NOT NULL DEFAULT 0,
  file_expiry_date timestamp NULL DEFAULT NULL,
  created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY sharepoint_sync_log_order_idx (order_id),
  KEY sharepoint_sync_log_status_idx (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
