-- 002_add_starting_to_races_status_check.sql
-- Adds 'starting' to races_status_check CHECK constraint.
-- Required because raceService.startRace transitions scheduled -> starting
-- before opening participants and starting the race engine. The original
-- migration (001_init_postgres.sql) only listed:
--   scheduled, entries_finalized, running, completed, cancelled, postponed
-- so Postgres rejected status='starting' with constraint violation 23514.

BEGIN;

ALTER TABLE races DROP CONSTRAINT IF EXISTS races_status_check;

ALTER TABLE races ADD CONSTRAINT races_status_check CHECK (
    status = ANY (
        ARRAY[
            'scheduled',
            'entries_finalized',
            'starting',
            'running',
            'completed',
            'cancelled',
            'postponed'
        ]
    )
);

COMMIT;
