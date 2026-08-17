-- 000_bootstrap_schema_migrations.sql
-- Creates the schema_migrations tracking table used by scripts/migrate.js.
-- This is the only migration that bootstraps its own bookkeeping table;
-- every later migration is idempotent because the runner checks this table
-- before executing a file.

CREATE TABLE IF NOT EXISTS schema_migrations (
    version      VARCHAR(255) PRIMARY KEY,
    description  TEXT,
    applied_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    checksum     VARCHAR(64)
);