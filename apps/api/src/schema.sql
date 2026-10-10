-- HawkDoc PostgreSQL schema
-- Run this once to initialize the database

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name          TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS documents (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title      TEXT NOT NULL DEFAULT 'Untitled',
  yjs_state  BYTEA,                        -- Yjs binary state (full snapshot)
  starred    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ                    -- set when trashed; NULL = active
);

-- Existing installs predating the trash feature
ALTER TABLE documents ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Existing installs predating starring
ALTER TABLE documents ADD COLUMN IF NOT EXISTS starred BOOLEAN NOT NULL DEFAULT FALSE;

-- Listing the sidebar (active documents) and the trash are both covered here.
-- id is part of the key because the list is paginated on (updated_at, id):
-- without it the tiebreak is unindexed and two documents saved in the same
-- instant can repeat or disappear across a page boundary.
DROP INDEX IF EXISTS documents_owner_updated;
CREATE INDEX IF NOT EXISTS documents_owner_updated_id
  ON documents (owner_id, deleted_at, updated_at DESC, id DESC);

-- Starred documents are a small slice of the table, so a partial index covers
-- them without carrying every unstarred row. The sort stays (updated_at, id) —
-- starring filters the list, it does not reorder it.
CREATE INDEX IF NOT EXISTS documents_owner_starred_updated_id
  ON documents (owner_id, updated_at DESC, id DESC)
  WHERE starred AND deleted_at IS NULL;

-- The trash is paginated on (deleted_at, id) for the same reason
CREATE INDEX IF NOT EXISTS documents_owner_deleted_id
  ON documents (owner_id, deleted_at DESC, id DESC)
  WHERE deleted_at IS NOT NULL;

-- document_versions stores incremental Yjs update deltas (not full snapshots).
-- Each row holds the changes since the row before it, so the state at any
-- version is the merge of every delta up to and including it. state_vector
-- describes the document as of this version, which is what the next delta is
-- computed against; seq orders the chain (created_at can tie).
CREATE TABLE IF NOT EXISTS document_versions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id  UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  update_data  BYTEA NOT NULL,
  state_vector BYTEA,
  seq          BIGSERIAL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Existing installs predating version history
ALTER TABLE document_versions ADD COLUMN IF NOT EXISTS state_vector BYTEA;
ALTER TABLE document_versions ADD COLUMN IF NOT EXISTS seq BIGSERIAL;

-- Walking one document's chain, oldest first, and finding its newest version
CREATE INDEX IF NOT EXISTS document_versions_document_seq
  ON document_versions (document_id, seq);
