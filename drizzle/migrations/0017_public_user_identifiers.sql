-- ReadyPackets public user identifiers and legacy customer-number reconciliation.
-- Internal numeric primary keys remain stable for relational integrity. Public-facing
-- account identifiers are opaque, alphanumeric, and unique.

SET @has_customer_number := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'users' AND column_name = 'customer_number'
);
SET @customer_number_sql := IF(
  @has_customer_number = 0,
  'ALTER TABLE users ADD COLUMN customer_number VARCHAR(24) NULL AFTER referral_code',
  'SELECT 1'
);
PREPARE customer_number_statement FROM @customer_number_sql;
EXECUTE customer_number_statement;
DEALLOCATE PREPARE customer_number_statement;

SET @has_public_id := (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'users' AND column_name = 'public_id'
);
SET @public_id_sql := IF(
  @has_public_id = 0,
  'ALTER TABLE users ADD COLUMN public_id VARCHAR(32) NULL AFTER customer_number',
  'SELECT 1'
);
PREPARE public_id_statement FROM @public_id_sql;
EXECUTE public_id_statement;
DEALLOCATE PREPARE public_id_statement;

UPDATE users
SET customer_number = CONCAT('RP-CUST-', LPAD(id, 6, '0'))
WHERE customer_number IS NULL OR customer_number = '';

UPDATE users
SET public_id = CONCAT('RP-U-', UPPER(SUBSTRING(REPLACE(UUID(), '-', ''), 1, 12)))
WHERE public_id IS NULL OR public_id = '';

SET @has_customer_number_index := (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'users' AND index_name = 'users_customer_number_unique'
);
SET @customer_number_index_sql := IF(
  @has_customer_number_index = 0,
  'ALTER TABLE users ADD UNIQUE INDEX users_customer_number_unique (customer_number)',
  'SELECT 1'
);
PREPARE customer_number_index_statement FROM @customer_number_index_sql;
EXECUTE customer_number_index_statement;
DEALLOCATE PREPARE customer_number_index_statement;

SET @has_public_id_index := (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'users' AND index_name = 'users_public_id_unique'
);
SET @public_id_index_sql := IF(
  @has_public_id_index = 0,
  'ALTER TABLE users ADD UNIQUE INDEX users_public_id_unique (public_id)',
  'SELECT 1'
);
PREPARE public_id_index_statement FROM @public_id_index_sql;
EXECUTE public_id_index_statement;
DEALLOCATE PREPARE public_id_index_statement;
