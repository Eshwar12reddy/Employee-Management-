CREATE TABLE IF NOT EXISTS candidates (
  id TEXT PRIMARY KEY,
  payload TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS candidates_updated_at_idx ON candidates (updated_at DESC);
