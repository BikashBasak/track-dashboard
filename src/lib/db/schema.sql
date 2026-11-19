-- Track Dashboard durable store (Neon Postgres)

CREATE TABLE IF NOT EXISTS store_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS account_categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS tracked_apps (
  app_id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT '',
  developer TEXT NOT NULL DEFAULT '',
  developer_id TEXT,
  added_at BIGINT NOT NULL,
  category_id TEXT,
  genre TEXT,
  genre_id TEXT,
  listing_status TEXT NOT NULL DEFAULT 'live',
  unpublished_at BIGINT
);

CREATE TABLE IF NOT EXISTS app_snapshots (
  id BIGSERIAL PRIMARY KEY,
  app_id TEXT NOT NULL REFERENCES tracked_apps(app_id) ON DELETE CASCADE,
  ts BIGINT NOT NULL,
  payload JSONB NOT NULL,
  UNIQUE (app_id, ts)
);

CREATE INDEX IF NOT EXISTS idx_app_snapshots_app_ts ON app_snapshots (app_id, ts DESC);

CREATE TABLE IF NOT EXISTS tracked_accounts (
  developer_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  added_at BIGINT NOT NULL,
  sample_icon TEXT,
  app_count INTEGER NOT NULL DEFAULT 0,
  category_id TEXT,
  last_app_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  catalog JSONB NOT NULL DEFAULT '[]'::jsonb,
  listing_memory JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS account_snapshots (
  id BIGSERIAL PRIMARY KEY,
  developer_id TEXT NOT NULL REFERENCES tracked_accounts(developer_id) ON DELETE CASCADE,
  ts BIGINT NOT NULL,
  payload JSONB NOT NULL,
  UNIQUE (developer_id, ts)
);

CREATE INDEX IF NOT EXISTS idx_account_snapshots_dev_ts ON account_snapshots (developer_id, ts DESC);

CREATE TABLE IF NOT EXISTS removed_apps (
  app_id TEXT PRIMARY KEY,
  removed_at BIGINT NOT NULL,
  reason TEXT NOT NULL,
  play_status TEXT,
  payload JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS removed_accounts (
  developer_id TEXT PRIMARY KEY,
  removed_at BIGINT NOT NULL,
  reason TEXT NOT NULL,
  play_status TEXT,
  payload JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS tracked_keywords (
  term TEXT PRIMARY KEY,
  added_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS keyword_snapshots (
  id BIGSERIAL PRIMARY KEY,
  term TEXT NOT NULL REFERENCES tracked_keywords(term) ON DELETE CASCADE,
  ts BIGINT NOT NULL,
  payload JSONB NOT NULL,
  UNIQUE (term, ts)
);
