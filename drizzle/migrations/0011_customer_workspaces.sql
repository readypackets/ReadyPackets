-- Customer collaboration workspaces for shared ReadyPackets orders.
CREATE TABLE IF NOT EXISTS customer_workspaces (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(190) NOT NULL,
  slug VARCHAR(96) NOT NULL,
  owner_user_id INT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY customer_workspace_slug_unique (slug),
  KEY customer_workspace_owner_idx (owner_user_id)
);

CREATE TABLE IF NOT EXISTS customer_workspace_members (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  workspace_id INT NOT NULL,
  user_id INT NOT NULL,
  role VARCHAR(24) NOT NULL DEFAULT 'member',
  invited_by_user_id INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revoked_at TIMESTAMP NULL,
  UNIQUE KEY customer_workspace_member_unique (workspace_id, user_id),
  KEY customer_workspace_member_user_idx (user_id)
);
