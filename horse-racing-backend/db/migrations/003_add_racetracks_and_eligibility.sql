-- 003_add_racetracks_and_eligibility.sql
-- Phase 1: racetrack catalogue, race-rule snapshots, and eligibility audit fields.
--
-- This file is executed inside a transaction by scripts/migrate.js. Keep
-- racetrack_id nullable for this migration so existing installations can be
-- backfilled before a later phase makes it mandatory for newly-created races.

CREATE TABLE IF NOT EXISTS racetracks (
    id                  UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    code                VARCHAR(64)     NOT NULL,
    name                VARCHAR(255)    NOT NULL,
    address             VARCHAR(512),
    province            VARCHAR(255),
    country_code        VARCHAR(2)      NOT NULL DEFAULT 'VN',
    status              VARCHAR(16)     NOT NULL DEFAULT 'draft',
    eligibility_rule    JSONB           NOT NULL,
    rule_version        INTEGER         NOT NULL DEFAULT 1,
    created_by          UUID            REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    updated_by          UUID            REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ     NOT NULL DEFAULT now(),
    deleted_at          TIMESTAMPTZ,
    CONSTRAINT racetracks_country_code_check CHECK (country_code = 'VN'),
    CONSTRAINT racetracks_status_check CHECK (status IN ('draft', 'active', 'inactive')),
    CONSTRAINT racetracks_rule_version_check CHECK (rule_version >= 1)
);

CREATE UNIQUE INDEX IF NOT EXISTS racetracks_code_uniq ON racetracks (code);
CREATE INDEX IF NOT EXISTS racetracks_status_idx ON racetracks (status);

-- Standard Vietnamese racetracks. Do not overwrite a track subsequently
-- maintained by an administrator when this migration is replayed manually.
INSERT INTO racetracks (code, name, country_code, status, eligibility_rule, rule_version)
VALUES
    (
        'PHU_THO',
        'Phu Tho Racetrack',
        'VN',
        'active',
        '{"schema_version": 1, "type": "horse_weight_range", "min_kg": 450, "max_kg": 500, "ballast_allowed": true}'::jsonb,
        1
    ),
    (
        'THIEN_MA',
        'Thien Ma Racetrack',
        'VN',
        'active',
        '{"schema_version": 1, "type": "horse_weight_range", "min_kg": 400, "max_kg": 450, "ballast_allowed": true}'::jsonb,
        1
    ),
    (
        'QUAN_NGUA',
        'Quan Ngua Racetrack',
        'VN',
        'active',
        '{"schema_version": 1, "type": "horse_age_range", "min_years": 4, "max_years": 5}'::jsonb,
        1
    ),
    (
        'SOC_SON',
        'Soc Son Racetrack',
        'VN',
        'active',
        '{"schema_version": 1, "type": "horse_breed", "allowed_values": ["Thoroughbred"]}'::jsonb,
        1
    ),
    (
        'LEGACY_VN',
        'Trường đua lịch sử Việt Nam',
        'VN',
        'inactive',
        '{"schema_version": 1, "type": "horse_weight_range", "min_kg": 0, "max_kg": 99999, "ballast_allowed": false}'::jsonb,
        1
    )
ON CONFLICT (code) DO NOTHING;

ALTER TABLE races
    ADD COLUMN IF NOT EXISTS racetrack_id UUID,
    ADD COLUMN IF NOT EXISTS eligibility_rule_snapshot JSONB;

-- Map legacy race metadata where it identifies one of the new standard
-- tracks. Both current canonical codes and common historical abbreviations
-- are supported; all other races intentionally fall through to LEGACY_VN.
UPDATE races AS race
SET racetrack_id = racetrack.id
FROM racetracks AS racetrack
WHERE race.racetrack_id IS NULL
  AND racetrack.code = CASE
      WHEN upper(trim(COALESCE(race.venue_code, ''))) IN ('PHU_THO', 'PHU-THO', 'PHUTHO', 'PT')
        OR COALESCE(race.location, '') ILIKE ANY (ARRAY['%Phu Tho Racetrack%', '%Trường đua Phú Thọ%', '%Phú Thọ%', '%Truong dua Phu Tho%', '%Phu Tho%'])
          THEN 'PHU_THO'
      WHEN upper(trim(COALESCE(race.venue_code, ''))) IN ('THIEN_MA', 'THIEN-MA', 'THIENMA', 'TM')
        OR COALESCE(race.location, '') ILIKE ANY (ARRAY['%Thien Ma Racetrack%', '%Trường đua Thiên Mã%', '%Thiên Mã%', '%Truong dua Thien Ma%', '%Thien Ma%'])
          THEN 'THIEN_MA'
      WHEN upper(trim(COALESCE(race.venue_code, ''))) IN ('QUAN_NGUA', 'QUAN-NGUA', 'QUANNGUA', 'QN')
        OR COALESCE(race.location, '') ILIKE ANY (ARRAY['%Quan Ngua Racetrack%', '%Trường đua Quần Ngựa%', '%Quần Ngựa%', '%Truong dua Quan Ngua%', '%Quan Ngua%'])
          THEN 'QUAN_NGUA'
      WHEN upper(trim(COALESCE(race.venue_code, ''))) IN ('SOC_SON', 'SOC-SON', 'SOCSON', 'SS')
        OR COALESCE(race.location, '') ILIKE ANY (ARRAY['%Soc Son Racetrack%', '%Trường đua Sóc Sơn%', '%Sóc Sơn%', '%Truong dua Soc Son%', '%Soc Son%'])
          THEN 'SOC_SON'
      ELSE NULL
  END;

-- Every historic race needs a stable track and rule snapshot. The inactive,
-- permissive LEGACY_VN rule preserves old records whose free-text venue could
-- not be identified without making the track available for future races.
UPDATE races AS race
SET racetrack_id = racetrack.id
FROM racetracks AS racetrack
WHERE race.racetrack_id IS NULL
  AND racetrack.code = 'LEGACY_VN';

UPDATE races AS race
SET eligibility_rule_snapshot = jsonb_build_object(
    'racetrack_id', racetrack.id,
    'racetrack_code', racetrack.code,
    'rule_version', racetrack.rule_version,
    'rule', racetrack.eligibility_rule
)
FROM racetracks AS racetrack
WHERE race.racetrack_id = racetrack.id
  AND race.eligibility_rule_snapshot IS NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'races_racetrack_id_fkey'
          AND conrelid = 'races'::regclass
    ) THEN
        ALTER TABLE races
            ADD CONSTRAINT races_racetrack_id_fkey
            FOREIGN KEY (racetrack_id)
            REFERENCES racetracks(id)
            ON DELETE RESTRICT
            ON UPDATE CASCADE;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS races_racetrack_idx ON races (racetrack_id);

ALTER TABLE registrations
    ADD COLUMN IF NOT EXISTS eligibility_status VARCHAR(32),
    ADD COLUMN IF NOT EXISTS eligibility_snapshot JSONB,
    ADD COLUMN IF NOT EXISTS eligibility_checked_at TIMESTAMPTZ;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'registrations_eligibility_status_check'
          AND conrelid = 'registrations'::regclass
    ) THEN
        ALTER TABLE registrations
            ADD CONSTRAINT registrations_eligibility_status_check
            CHECK (eligibility_status IS NULL OR eligibility_status IN ('eligible', 'conditional_ballast', 'ineligible'));
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS registrations_eligibility_status_idx
    ON registrations (eligibility_status)
    WHERE eligibility_status IS NOT NULL;

ALTER TABLE horse_checks
    ADD COLUMN IF NOT EXISTS ballast_required_kg NUMERIC(6,2),
    ADD COLUMN IF NOT EXISTS ballast_added_kg NUMERIC(6,2),
    ADD COLUMN IF NOT EXISTS ballast_confirmed BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS ballast_confirmed_by UUID,
    ADD COLUMN IF NOT EXISTS ballast_confirmed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS eligibility_result JSONB;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'horse_checks_ballast_required_kg_check'
          AND conrelid = 'horse_checks'::regclass
    ) THEN
        ALTER TABLE horse_checks
            ADD CONSTRAINT horse_checks_ballast_required_kg_check
            CHECK (ballast_required_kg IS NULL OR ballast_required_kg >= 0);
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'horse_checks_ballast_added_kg_check'
          AND conrelid = 'horse_checks'::regclass
    ) THEN
        ALTER TABLE horse_checks
            ADD CONSTRAINT horse_checks_ballast_added_kg_check
            CHECK (ballast_added_kg IS NULL OR ballast_added_kg >= 0);
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'horse_checks_ballast_confirmed_by_fkey'
          AND conrelid = 'horse_checks'::regclass
    ) THEN
        ALTER TABLE horse_checks
            ADD CONSTRAINT horse_checks_ballast_confirmed_by_fkey
            FOREIGN KEY (ballast_confirmed_by)
            REFERENCES users(id)
            ON DELETE RESTRICT
            ON UPDATE CASCADE;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS horse_checks_ballast_confirmed_idx
    ON horse_checks (ballast_confirmed)
    WHERE ballast_confirmed = TRUE;
