-- Migration 002: Add rate_limit_penalties table for persistent rate limit state
CREATE TABLE IF NOT EXISTS `rate_limit_penalties` (
  `id` int NOT NULL AUTO_INCREMENT,
  `penalty_key` varchar(128) NOT NULL,
  `ip_address` varchar(45) NOT NULL,
  `category` varchar(32) NOT NULL,
  `level` int NOT NULL DEFAULT 1,
  `until` timestamp NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `rlp_key_unique` (`penalty_key`),
  KEY `rlp_until_idx` (`until`),
  KEY `rlp_ip_idx` (`ip_address`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
