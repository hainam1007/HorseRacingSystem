#!/usr/bin/env bash
# Docker entrypoint for horse-racing-backend.
#
# Behavior:
#   1. Wait for Postgres to be reachable (when DB host is set).
#   2. If DB appears empty, apply /app/001_init_postgres.sql via apply-schema.js.
#   3. Start the Node server.
#
# Env vars consumed (set in docker-compose):
#   PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE
#   DB_AUTO_APPLY_SCHEMA (default: true)
#   DB_BOOTSTRAP_SKIP_TABLES (default: "" — comma-separated table names whose
#       presence means the DB is already initialised)
set -euo pipefail

cd /app

log() { printf '[entrypoint] %s\n' "$*"; }

wait_for_pg() {
  local host="${PGHOST:-}"
  local port="${PGPORT:-5432}"
  if [[ -z "$host" ]]; then
    log "PGHOST not set — skipping wait."
    return 0
  fi
  log "Waiting for Postgres at ${host}:${port}..."
  local i=0
  local max=60
  while (( i < max )); do
    if (echo > "/dev/tcp/${host}/${port}") >/dev/null 2>&1; then
      log "Postgres is reachable."
      return 0
    fi
    i=$((i + 1))
    sleep 1
  done
  log "ERROR: Postgres not reachable after ${max}s."
  return 1
}

db_already_initialised() {
  # Skip applying schema if any known table exists.
  local probe="${DB_BOOTSTRAP_PROBE_TABLE:-users}"
  local query="SELECT to_regclass('public.${probe}') IS NOT NULL AS present;"
  local out
  out=$(PGPASSWORD="${PGPASSWORD:-}" psql \
        --host="${PGHOST}" --port="${PGPORT}" \
        --username="${PGUSER}" --dbname="${PGDATABASE}" \
        --no-align --tuples-only --field-separator '|' \
        -c "${query}" 2>/dev/null || true)
  [[ "${out// /}" == "t" ]]
}

apply_schema() {
  if [[ "${DB_AUTO_APPLY_SCHEMA:-true}" != "true" ]]; then
    log "DB_AUTO_APPLY_SCHEMA=false — skipping schema apply."
    return 0
  fi
  log "Applying schema from /app/001_init_postgres.sql via psql..."
  # psql -f supports multi-statement SQL natively (apply-schema.js did not).
  PGPASSWORD="${PGPASSWORD:-}" psql \
    --host="${PGHOST}" --port="${PGPORT}" \
    --username="${PGUSER}" --dbname="${PGDATABASE}" \
    --variable=ON_ERROR_STOP=1 \
    --file=/app/001_init_postgres.sql
  log "Schema applied."
}

# Allow disabling auto-migrate by passing SKIP_DB_BOOTSTRAP=1
if [[ "${SKIP_DB_BOOTSTRAP:-0}" == "1" ]]; then
  log "SKIP_DB_BOOTSTRAP=1 — skipping DB bootstrap."
else
  wait_for_pg
  if db_already_initialised; then
    log "DB already initialised (probe table present) — skipping schema apply."
  else
    apply_schema
  fi
fi

cd /app/horse-racing-backend
log "Starting server: $*"
exec "$@"