CREATE TABLE admins (
  id                  TEXT PRIMARY KEY,
  wikimedia_user_id   TEXT NOT NULL UNIQUE, -- Wikimedia OAuth `sub`; stable even if the username changes
  wikimedia_username  TEXT NOT NULL,
  created_at          TEXT NOT NULL,
  created_by          TEXT -- wikimedia_user_id of the admin who granted access, or NULL for the initial seed admin
);

CREATE INDEX idx_admins_wikimedia_user_id ON admins(wikimedia_user_id);
