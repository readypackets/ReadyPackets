CREATE TABLE IF NOT EXISTS portal_announcement_recipients (
  id INT NOT NULL AUTO_INCREMENT,
  announcement_id INT NOT NULL,
  user_id INT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY portal_announcement_recipient_unique (announcement_id, user_id),
  KEY portal_announcement_recipient_announcement_idx (announcement_id),
  KEY portal_announcement_recipient_user_idx (user_id),
  CONSTRAINT portal_announcement_recipients_announcement_fk
    FOREIGN KEY (announcement_id) REFERENCES portal_announcements(id) ON DELETE CASCADE,
  CONSTRAINT portal_announcement_recipients_user_fk
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
