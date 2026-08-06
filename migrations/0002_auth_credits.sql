-- Community auth, dashboard, API key request workflow, and credit
-- management. Adds Wikimedia identity + session tables, the
-- key-request queue, and a fully audited credit engine on top of the
-- existing api_keys / quota_usage tables from 0001_init.sql.

-- Community member identity. A user starts life here the moment they
-- complete Wikimedia login; `status` governs both dashboard state and
-- whether their linked api_keys row (if any) is usable.
CREATE TABLE users (
  id                  TEXT PRIMARY KEY,
  wikimedia_user_id   TEXT NOT NULL UNIQUE,   -- Wikimedia OAuth `sub`
  wikimedia_username  TEXT NOT NULL,
  status              TEXT NOT NULL DEFAULT 'pending', -- pending | active | disabled | rejected
  weekly_credit       REAL NOT NULL DEFAULT 0,
  low_usage_weeks     INTEGER NOT NULL DEFAULT 0,
  full_usage_weeks    INTEGER NOT NULL DEFAULT 0,
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL
);

CREATE INDEX idx_users_wikimedia_user_id ON users(wikimedia_user_id);
CREATE INDEX idx_users_status ON users(status);

-- api_keys rows issued to community members are linked back to `users`.
-- For these rows api_keys.id == users.id, so every existing quota/auth
-- code path (which only knows about api_keys.id) already operates on the
-- community user's identity with no extra joins required.
ALTER TABLE api_keys ADD COLUMN user_id TEXT REFERENCES users(id);
CREATE INDEX idx_api_keys_user_id ON api_keys(user_id);

-- Server-side sessions created after a successful Wikimedia login.
-- `id` is the SHA-256 hash of the random token stored in the session
-- cookie -- the plaintext token is never persisted, mirroring how
-- api_keys stores key_hash instead of the plaintext API key.
CREATE TABLE sessions (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id),
  created_at  TEXT NOT NULL,
  expires_at  TEXT NOT NULL
);

CREATE INDEX idx_sessions_user_id ON sessions(user_id);

-- One row per POST /api/request-key call. Manual review moves a request
-- from pending -> approved/rejected.
CREATE TABLE key_requests (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id),
  status        TEXT NOT NULL DEFAULT 'pending', -- pending | approved | rejected
  requested_at  TEXT NOT NULL,
  decided_at    TEXT
);

CREATE INDEX idx_key_requests_user_id ON key_requests(user_id);
CREATE INDEX idx_key_requests_status ON key_requests(status);

-- One row per unit of Perseus API usage. `user_id` matches api_keys.id
-- (which equals users.id for community-issued keys). Usage from
-- non-community/service api_keys rows (e.g. scripts/create-api-key.ts)
-- is also recorded here for completeness, so no FK is enforced.
CREATE TABLE usage_events (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL,
  cost        REAL NOT NULL,
  created_at  TEXT NOT NULL
);

CREATE INDEX idx_usage_events_user_created ON usage_events(user_id, created_at);

-- Full audit trail of every credit change. Current credit is always
-- users.weekly_credit; this table explains how it got there.
CREATE TABLE credit_transactions (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id),
  type        TEXT NOT NULL, -- INITIAL | USAGE | INCREASE | RELEASE
  amount      REAL NOT NULL,
  created_at  TEXT NOT NULL
);

CREATE INDEX idx_credit_transactions_user_id ON credit_transactions(user_id);

-- Users who qualified for a credit increase while the global budget did
-- not have enough headroom. Drained by creditEngine.processCreditQueue
-- whenever budget frees up (weekly, after RELEASE events).
CREATE TABLE credit_queue (
  id                 TEXT PRIMARY KEY,
  user_id            TEXT NOT NULL REFERENCES users(id),
  requested_amount   REAL NOT NULL,
  created_at         TEXT NOT NULL,
  status             TEXT NOT NULL DEFAULT 'pending' -- pending | processed
);

CREATE INDEX idx_credit_queue_status ON credit_queue(status);

-- Minimal fixed-window counter backing basic abuse protection on the
-- auth/request-key endpoints (see src/middleware/rateLimit.ts).
CREATE TABLE auth_rate_limits (
  bucket_key  TEXT PRIMARY KEY, -- "<ip>:<route>:<windowStart>"
  count       INTEGER NOT NULL DEFAULT 0
);
