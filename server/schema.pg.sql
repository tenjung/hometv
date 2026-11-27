-- 집TV Postgres(Neon) 스키마. drizzle/0000 (SQLite)과 같은 구조, 시간 값은 bigint.
CREATE TABLE IF NOT EXISTS attempts (
  id text PRIMARY KEY,
  failures integer NOT NULL DEFAULT 0,
  window_at bigint NOT NULL
);
CREATE TABLE IF NOT EXISTS channels (
  id text PRIMARY KEY,
  payload text NOT NULL,
  revision integer NOT NULL DEFAULT 1,
  updated_at bigint NOT NULL
);
CREATE TABLE IF NOT EXISTS reports (
  id text PRIMARY KEY,
  channel_id text NOT NULL,
  reason text NOT NULL,
  created_at bigint NOT NULL
);
CREATE TABLE IF NOT EXISTS settings (
  key text PRIMARY KEY,
  value text NOT NULL
);
