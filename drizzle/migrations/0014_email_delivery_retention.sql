ALTER TABLE email_log
  ADD COLUMN to_address_enc TEXT NULL AFTER to_address_hash,
  ADD COLUMN bcc_address_enc TEXT NULL AFTER to_address_enc,
  ADD COLUMN body_html_enc TEXT NULL AFTER subject,
  ADD COLUMN body_text_enc TEXT NULL AFTER body_html_enc,
  ADD COLUMN sent_at TIMESTAMP NULL AFTER detail;
