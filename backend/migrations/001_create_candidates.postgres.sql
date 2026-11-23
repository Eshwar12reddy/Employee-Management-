CREATE TABLE IF NOT EXISTS candidates (
  id TEXT PRIMARY KEY,
  payload JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT candidates_payload_id_matches CHECK (payload->>'id' = id)
);

CREATE INDEX IF NOT EXISTS candidates_updated_at_idx ON candidates (updated_at DESC);
