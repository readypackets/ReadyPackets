-- Capture receiver response diagnostics for webhook delivery logs.
ALTER TABLE webhook_deliveries
  ADD COLUMN response_detail varchar(1000) DEFAULT NULL AFTER response_code;
