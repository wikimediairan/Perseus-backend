-- No table stores article text, titles, wikitext, prompts, or translated
-- output. Only auth (api_keys) and aggregate weekly usage (quota_usage).

CREATE TABLE api_keys (
  id                  TEXT PRIMARY KEY,
  key_hash            TEXT NOT NULL UNIQUE,
  label               TEXT,                    -- human-readable / Wikimedia username
  active              INTEGER NOT NULL DEFAULT 1,
  weekly_cost_limit  INTEGER NOT NULL,
  created_at          TEXT NOT NULL,
  revoked_at          TEXT
);

CREATE INDEX idx_api_keys_hash ON api_keys(key_hash);

CREATE TABLE quota_usage (
  user_id             TEXT NOT NULL REFERENCES api_keys(id),
  week_start          TEXT NOT NULL,
  cost_used           REAL NOT NULL DEFAULT 0,
  chunks_translated   INTEGER NOT NULL DEFAULT 0,
  updated_at          TEXT NOT NULL,
  PRIMARY KEY (user_id, week_start)
);
