-- Approved customer knowledge base.

CREATE TABLE knowledge_base_articles (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  slug VARCHAR(160) NOT NULL,
  category VARCHAR(96) NULL,
  excerpt TEXT NULL,
  body_markdown TEXT NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'draft',
  author_user_id INT NOT NULL,
  reviewed_by_user_id INT NULL,
  submitted_at TIMESTAMP NULL,
  reviewed_at TIMESTAMP NULL,
  published_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY knowledge_base_articles_slug_unique (slug),
  KEY knowledge_base_articles_visible_idx (status, published_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
