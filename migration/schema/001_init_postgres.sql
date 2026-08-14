-- =====================================================================
-- Phase 3 — PostgreSQL DDL for horse_racing
-- Generated: 2026-08-14
-- Target: PostgreSQL 18.4
-- Strategy: destructive — DROP SCHEMA public CASCADE; rebuild from scratch
-- Conventions: snake_case, plural table names, UUID PKs, TIMESTAMPTZ,
--              ON DELETE RESTRICT, soft-delete via deleted_at,
--              TEXT + CHECK for enums, JSONB for free-form snapshots
-- =====================================================================

\set ON_ERROR_STOP on

-- ---------------------------------------------------------------------
-- 0. Destroy & recreate the public schema
-- ---------------------------------------------------------------------
DROP SCHEMA public CASCADE;
CREATE SCHEMA public;

GRANT ALL ON SCHEMA public TO postgres;
GRANT ALL ON SCHEMA public TO public;

-- ---------------------------------------------------------------------
-- 1. Extensions
-- ---------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------------------------------------------------------------------
-- 2. Identity & Roles (no FKs to other tables)
-- ---------------------------------------------------------------------

-- 2.1 users
CREATE TABLE users (
    id                              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name                       TEXT            NOT NULL,
    email                           TEXT            NOT NULL,
    password                        TEXT            NOT NULL,
    phone_number                    TEXT,
    date_of_birth                   TIMESTAMPTZ,
    avatar_url                      TEXT,
    avatar_public_id                TEXT,
    status                          TEXT            NOT NULL DEFAULT 'active'
                                                    CHECK (status IN ('active','inactive','pending_verification','suspended','banned','deleted')),
    email_verified                  BOOLEAN         NOT NULL DEFAULT FALSE,
    email_verified_at               TIMESTAMPTZ,
    email_verification_token        TEXT,
    email_verification_expires_at   TIMESTAMPTZ,
    password_reset_token            TEXT,
    password_reset_expires_at       TIMESTAMPTZ,
    password_changed_at             TIMESTAMPTZ,
    created_at                      TIMESTAMPTZ     NOT NULL DEFAULT now(),
    updated_at                      TIMESTAMPTZ     NOT NULL DEFAULT now(),
    deleted_at                      TIMESTAMPTZ
);

CREATE UNIQUE INDEX users_email_lower_uniq
    ON users (LOWER(email))
    WHERE deleted_at IS NULL;

CREATE INDEX users_phone_idx
    ON users (phone_number)
    WHERE phone_number IS NOT NULL;

-- 2.2 roles
CREATE TABLE roles (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    role_name   TEXT        NOT NULL
                            CHECK (role_name IN ('admin','horse_owner','jockey','race_referee','spectator')),
    description TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at  TIMESTAMPTZ
);

CREATE UNIQUE INDEX roles_role_name_uniq
    ON roles (role_name)
    WHERE deleted_at IS NULL;

-- 2.3 user_roles
CREATE TABLE user_roles (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    role_id     UUID        NOT NULL REFERENCES roles(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at  TIMESTAMPTZ
);

CREATE INDEX user_roles_user_id_idx ON user_roles (user_id);
CREATE INDEX user_roles_role_id_idx ON user_roles (role_id);
CREATE UNIQUE INDEX user_roles_pair_uniq
    ON user_roles (user_id, role_id)
    WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------------
-- 3. Profile tables (FK -> users)
-- ---------------------------------------------------------------------

-- 3.1 horse_owners
CREATE TABLE horse_owners (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID        NOT NULL REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    stable_name     TEXT,
    address         TEXT,
    license_number  TEXT,
    status          TEXT        NOT NULL DEFAULT 'active'
                                CHECK (status IN ('active','inactive','suspended')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at      TIMESTAMPTZ
);

CREATE UNIQUE INDEX horse_owners_user_uniq
    ON horse_owners (user_id)
    WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX horse_owners_license_uniq
    ON horse_owners (license_number)
    WHERE license_number IS NOT NULL AND deleted_at IS NULL;

-- 3.2 jockeys
CREATE TABLE jockeys (
    id                      UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                 UUID            NOT NULL REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    height                  INTEGER,
    weight                  INTEGER,
    weight_kg               NUMERIC(5,2)    CHECK (weight_kg IS NULL OR (weight_kg BETWEEN 30 AND 100)),
    experience_years        INTEGER         NOT NULL DEFAULT 0
                                            CHECK (experience_years >= 0),
    license_number          TEXT,
    total_races             INTEGER         NOT NULL DEFAULT 0
                                            CHECK (total_races >= 0),
    total_wins              INTEGER         NOT NULL DEFAULT 0
                                            CHECK (total_wins >= 0),
    suspended_until         TIMESTAMPTZ,
    outstanding_fine_amount NUMERIC(15,2)   NOT NULL DEFAULT 0
                                            CHECK (outstanding_fine_amount >= 0),
    disciplinary_status     TEXT            NOT NULL DEFAULT 'clear'
                                            CHECK (disciplinary_status IN ('clear','suspended')),
    status                  TEXT            NOT NULL DEFAULT 'active',
    created_at              TIMESTAMPTZ     NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ     NOT NULL DEFAULT now(),
    deleted_at              TIMESTAMPTZ
);

CREATE UNIQUE INDEX jockeys_user_uniq
    ON jockeys (user_id)
    WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX jockeys_license_uniq
    ON jockeys (license_number)
    WHERE license_number IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX jockeys_status_idx ON jockeys (status) WHERE deleted_at IS NULL;

-- 3.3 race_referees
CREATE TABLE race_referees (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID        NOT NULL REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    license_number      TEXT,
    experience_years    INTEGER     NOT NULL DEFAULT 0
                                    CHECK (experience_years >= 0),
    status              TEXT        NOT NULL DEFAULT 'active',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at          TIMESTAMPTZ
);

CREATE UNIQUE INDEX race_referees_user_uniq
    ON race_referees (user_id)
    WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX race_referees_license_uniq
    ON race_referees (license_number)
    WHERE license_number IS NOT NULL AND deleted_at IS NULL;

-- ---------------------------------------------------------------------
-- 4. Tier-2 tables (FK -> users, horse_owners, jockeys, race_referees)
-- ---------------------------------------------------------------------

-- 4.1 wallets
CREATE TABLE wallets (
    id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID            NOT NULL REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    token_balance   NUMERIC(15,2)   NOT NULL DEFAULT 0
                                    CHECK (token_balance >= 0),
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ     NOT NULL DEFAULT now(),
    deleted_at      TIMESTAMPTZ
);

CREATE UNIQUE INDEX wallets_user_uniq
    ON wallets (user_id)
    WHERE deleted_at IS NULL;

-- 4.2 tournaments
CREATE TABLE tournaments (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT        NOT NULL,
    description TEXT,
    location    TEXT,
    image_url   TEXT,
    image_public_id TEXT,
    start_date  TIMESTAMPTZ,
    end_date    TIMESTAMPTZ CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date),
    status      TEXT        NOT NULL DEFAULT 'draft'
                            CHECK (status IN ('draft','active','completed','cancelled','archived')),
    created_by  UUID        NOT NULL REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at  TIMESTAMPTZ
);

CREATE INDEX tournaments_created_by_idx ON tournaments (created_by);
CREATE INDEX tournaments_status_idx ON tournaments (status) WHERE deleted_at IS NULL;

-- 4.3 reward_items
CREATE TABLE reward_items (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT        NOT NULL,
    description TEXT,
    token_price INTEGER     NOT NULL CHECK (token_price >= 1),
    stock       INTEGER     NOT NULL DEFAULT 0 CHECK (stock >= 0),
    is_active   BOOLEAN     NOT NULL DEFAULT TRUE,
    image_url   TEXT,
    created_by  UUID        REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    updated_by  UUID        REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at  TIMESTAMPTZ
);

CREATE UNIQUE INDEX reward_items_name_uniq
    ON reward_items (name)
    WHERE deleted_at IS NULL;
CREATE INDEX reward_items_is_active_idx
    ON reward_items (is_active)
    WHERE deleted_at IS NULL;

-- 4.4 notifications
CREATE TABLE notifications (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    title       TEXT        NOT NULL,
    content     TEXT        NOT NULL,
    type        TEXT,
    is_read     BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at  TIMESTAMPTZ
);

CREATE INDEX notifications_user_idx
    ON notifications (user_id, created_at DESC)
    WHERE deleted_at IS NULL;
CREATE INDEX notifications_is_read_idx
    ON notifications (is_read)
    WHERE is_read = FALSE;

-- 4.5 role_applications
CREATE TABLE role_applications (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID        NOT NULL REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    requested_role      TEXT        NOT NULL
                                    CHECK (requested_role IN ('horse_owner','jockey','race_referee')),
    status              TEXT        NOT NULL DEFAULT 'pending'
                                    CHECK (status IN ('pending','approved','rejected')),
    application_data    JSONB       NOT NULL DEFAULT '{}'::jsonb,
    admin_note          TEXT,
    reviewed_by         UUID        REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    reviewed_at         TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at          TIMESTAMPTZ
);

CREATE INDEX role_applications_user_requested_status_idx
    ON role_applications (user_id, requested_role, status)
    WHERE deleted_at IS NULL;
CREATE INDEX role_applications_status_idx
    ON role_applications (status)
    WHERE deleted_at IS NULL;

-- 4.5.1 role_application_documents
CREATE TABLE role_application_documents (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    role_application_id UUID        NOT NULL REFERENCES role_applications(id) ON DELETE CASCADE ON UPDATE CASCADE,
    type                TEXT,
    url                 TEXT,
    public_id           TEXT,
    note                TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX role_application_documents_app_idx
    ON role_application_documents (role_application_id);

-- ---------------------------------------------------------------------
-- 5. Tier-3 tables (FK -> tournaments / horse_owners / users / roles)
-- ---------------------------------------------------------------------

-- 5.1 rounds
CREATE TABLE rounds (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    tournament_id UUID       NOT NULL REFERENCES tournaments(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    name         TEXT        NOT NULL,
    round_order  INTEGER     NOT NULL CHECK (round_order > 0),
    description  TEXT,
    status       TEXT        NOT NULL DEFAULT 'draft',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at   TIMESTAMPTZ
);

CREATE INDEX rounds_tournament_idx ON rounds (tournament_id) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX rounds_tournament_order_uniq
    ON rounds (tournament_id, round_order)
    WHERE deleted_at IS NULL;

-- 5.2 races
CREATE TABLE races (
    id                                  UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    tournament_id                       UUID            NOT NULL REFERENCES tournaments(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    round_id                            UUID            NOT NULL REFERENCES rounds(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    name                                TEXT            NOT NULL,
    image_url                           TEXT,
    image_public_id                     TEXT,
    race_no                             INTEGER         NOT NULL DEFAULT 1 CHECK (race_no > 0),
    race_date                           TIMESTAMPTZ,
    distance                            INTEGER         CHECK (distance IS NULL OR distance > 0),
    max_participants                    INTEGER         CHECK (max_participants IS NULL OR max_participants > 0),
    location                            TEXT,
    venue_code                          TEXT,
    course                              TEXT            NOT NULL DEFAULT 'B+2'
                                                        CHECK (course IN ('A','A+3','B','B+2','C','C+3')),
    race_class                          TEXT            NOT NULL DEFAULT '5'
                                                        CHECK (race_class IN ('1','2','3','4','5')),
    going                               TEXT            NOT NULL DEFAULT 'Good'
                                                        CHECK (going IN ('Fast','Good','Good To Firm','Good To Yielding','Wet Slow','Yielding')),
    surface                             TEXT            NOT NULL DEFAULT 'Turf'
                                                        CHECK (surface IN ('Turf','Dirt','Synthetic')),
    referee_id                          UUID            REFERENCES race_referees(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    registration_lock_at                TIMESTAMPTZ,
    registration_locked                 BOOLEAN         NOT NULL DEFAULT FALSE,
    registration_slot_count             INTEGER         NOT NULL DEFAULT 0
                                                        CHECK (registration_slot_count >= 0),
    registration_slots_initialized      BOOLEAN         NOT NULL DEFAULT FALSE,
    entries_finalized_at                TIMESTAMPTZ,
    entries_finalized_by                UUID            REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    model_input_version                 INTEGER         NOT NULL DEFAULT 0
                                                        CHECK (model_input_version >= 0),
    status                              TEXT            NOT NULL DEFAULT 'scheduled'
                                                        CHECK (status IN ('scheduled','entries_finalized','running','completed','cancelled','postponed')),
    starting_at                         TIMESTAMPTZ,
    started_at                          TIMESTAMPTZ,
    assignment_revision                 INTEGER         NOT NULL DEFAULT 0
                                                        CHECK (assignment_revision >= 0),
    betting_status                      TEXT            NOT NULL DEFAULT 'unavailable'
                                                        CHECK (betting_status IN ('unavailable','open','closed','settled')),
    betting_closes_at                   TIMESTAMPTZ,
    betting_market                      JSONB           NOT NULL DEFAULT '{}'::jsonb,
    entry_fee                           NUMERIC(15,2)   NOT NULL DEFAULT 0
                                                        CHECK (entry_fee >= 0),
    entry_fee_currency                  TEXT            NOT NULL DEFAULT 'VND',
    prize_pool                          NUMERIC(15,2)   NOT NULL DEFAULT 0
                                                        CHECK (prize_pool >= 0),
    prize_currency                      TEXT            NOT NULL DEFAULT 'VND',
    created_at                          TIMESTAMPTZ     NOT NULL DEFAULT now(),
    updated_at                          TIMESTAMPTZ     NOT NULL DEFAULT now(),
    deleted_at                          TIMESTAMPTZ
);

CREATE INDEX races_tournament_idx ON races (tournament_id) WHERE deleted_at IS NULL;
CREATE INDEX races_round_idx ON races (round_id) WHERE deleted_at IS NULL;
CREATE INDEX races_registration_lock_idx ON races (registration_locked, registration_lock_at);
CREATE INDEX races_referee_date_idx ON races (referee_id, race_date);
CREATE INDEX races_referee_status_idx ON races (referee_id, status);
CREATE INDEX races_betting_status_idx ON races (betting_status) WHERE deleted_at IS NULL;

-- 5.3 horses
CREATE TABLE horses (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id            UUID        NOT NULL REFERENCES horse_owners(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    name                TEXT        NOT NULL,
    breed               TEXT,
    gender              TEXT,
    date_of_birth       TIMESTAMPTZ,
    color               TEXT,
    weight              INTEGER,
    current_rating      INTEGER     NOT NULL DEFAULT 50
                                    CHECK (current_rating BETWEEN 0 AND 140),
    rating_updated_at   TIMESTAMPTZ,
    rating_updated_by   UUID        REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    default_gears       TEXT[]      NOT NULL DEFAULT ARRAY[]::TEXT[],
    health_status       TEXT,
    registration_number TEXT        NOT NULL,
    image_url           TEXT,
    image_public_id     TEXT,
    status              TEXT        NOT NULL DEFAULT 'active'
                                    CHECK (status IN ('active','inactive','retired')),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at          TIMESTAMPTZ
);

CREATE UNIQUE INDEX horses_registration_number_uniq
    ON horses (registration_number)
    WHERE deleted_at IS NULL;
CREATE INDEX horses_owner_idx ON horses (owner_id) WHERE deleted_at IS NULL;
CREATE INDEX horses_status_idx ON horses (status) WHERE deleted_at IS NULL;

-- 5.4 horse_rating_history
CREATE TABLE horse_rating_history (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    horse_id            UUID        NOT NULL REFERENCES horses(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    race_id             UUID        REFERENCES races(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    previous_rating     INTEGER     NOT NULL CHECK (previous_rating BETWEEN 0 AND 140),
    rating_delta        INTEGER     NOT NULL,
    new_rating          INTEGER     NOT NULL CHECK (new_rating BETWEEN 0 AND 140),
    expected_score      NUMERIC(6,5),
    actual_score        NUMERIC(6,5),
    raw_position        INTEGER,
    participant_count   INTEGER,
    calculation_version TEXT        NOT NULL DEFAULT 'pairwise_elo_v1',
    source              TEXT        NOT NULL
                                    CHECK (source IN ('published_result','manual_admin','migration')),
    reason              TEXT,
    calculated_by       UUID        REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    calculated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at          TIMESTAMPTZ
);

CREATE INDEX horse_rating_history_horse_idx ON horse_rating_history (horse_id);
CREATE INDEX horse_rating_history_source_idx ON horse_rating_history (source);
CREATE UNIQUE INDEX horse_rating_history_race_horse_pubresult_uniq
    ON horse_rating_history (race_id, horse_id)
    WHERE race_id IS NOT NULL
      AND source = 'published_result'
      AND deleted_at IS NULL;

-- 5.5 deposit_packages
CREATE TABLE deposit_packages (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    package_id      TEXT        NOT NULL
                                CHECK (package_id ~ '^PKG_[A-Z0-9_]+$'),
    label           TEXT        NOT NULL,
    vnd_price       INTEGER     NOT NULL
                                CHECK (vnd_price IN (10000,20000,50000,100000,200000,500000)),
    token_received  INTEGER     NOT NULL CHECK (token_received >= 1),
    bonus_token     INTEGER     NOT NULL DEFAULT 0 CHECK (bonus_token >= 0),
    is_active       BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at      TIMESTAMPTZ,
    CONSTRAINT deposit_packages_package_id_key UNIQUE (package_id)
);
CREATE INDEX deposit_packages_is_active_idx
    ON deposit_packages (is_active)
    WHERE deleted_at IS NULL;

-- 5.6 transaction_histories (audit, immutable)
CREATE TABLE transaction_histories (
    id                  UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID            NOT NULL REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    transaction_type    TEXT            NOT NULL
                                        CHECK (transaction_type IN (
                                            'deposit','bet_deduct','bet_refund','bet_win',
                                            'race_prize','redeem','registration_fee','registration_refund'
                                        )),
    amount              NUMERIC(15,2)   NOT NULL CHECK (amount >= 0),
    direction           TEXT            NOT NULL
                                        CHECK (direction IN ('credit','debit')),
    balance_before      NUMERIC(15,2)   NOT NULL,
    balance_after       NUMERIC(15,2)   NOT NULL,
    status              TEXT            NOT NULL DEFAULT 'completed'
                                        CHECK (status IN ('pending','completed','failed')),
    reference_id        TEXT,
    note                TEXT,
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ     NOT NULL DEFAULT now()
);

CREATE INDEX transaction_histories_user_id_idx ON transaction_histories (user_id);
CREATE INDEX transaction_histories_user_created_idx ON transaction_histories (user_id, created_at DESC);
CREATE INDEX transaction_histories_created_at_idx ON transaction_histories (created_at DESC);
CREATE UNIQUE INDEX transaction_histories_reference_id_uniq
    ON transaction_histories (reference_id)
    WHERE reference_id IS NOT NULL;

-- 5.7 deposit_requests
CREATE TABLE deposit_requests (
    id                  UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id            TEXT            NOT NULL,
    user_id             UUID            NOT NULL REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    package_id          TEXT            NOT NULL
                                        REFERENCES deposit_packages(package_id) ON DELETE RESTRICT ON UPDATE CASCADE,
    total_vnd           NUMERIC(15,2)   NOT NULL CHECK (total_vnd >= 1000),
    total_token         INTEGER         NOT NULL CHECK (total_token >= 1),
    payment_method      TEXT            NOT NULL
                                        CHECK (payment_method IN ('VNPAY','MOMO','MOCK')),
    status              TEXT            NOT NULL DEFAULT 'pending'
                                        CHECK (status IN ('pending','success','failed')),
    gateway_reference_id TEXT,
    note                TEXT,
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ     NOT NULL DEFAULT now(),
    deleted_at          TIMESTAMPTZ
);

CREATE UNIQUE INDEX deposit_requests_order_id_uniq
    ON deposit_requests (order_id)
    WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX deposit_requests_gateway_reference_id_uniq
    ON deposit_requests (gateway_reference_id)
    WHERE gateway_reference_id IS NOT NULL
      AND deleted_at IS NULL;
CREATE INDEX deposit_requests_user_created_idx ON deposit_requests (user_id, created_at DESC);
CREATE INDEX deposit_requests_status_created_idx ON deposit_requests (status, created_at DESC);

-- 5.8 redemption_histories
CREATE TABLE redemption_histories (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID        NOT NULL REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    item_id         UUID        NOT NULL REFERENCES reward_items(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    token_spent     INTEGER     NOT NULL CHECK (token_spent >= 0),
    status          TEXT        NOT NULL DEFAULT 'pending'
                                CHECK (status IN ('pending','processing','completed','cancelled')),
    transaction_id  UUID        REFERENCES transaction_histories(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    delivery_info   JSONB,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at      TIMESTAMPTZ
);

CREATE INDEX redemption_histories_user_idx ON redemption_histories (user_id);
CREATE INDEX redemption_histories_item_idx ON redemption_histories (item_id);
CREATE INDEX redemption_histories_transaction_idx ON redemption_histories (transaction_id)
    WHERE transaction_id IS NOT NULL;

-- ---------------------------------------------------------------------
-- 6. Tier-4 tables (depend on tier-3)
-- ---------------------------------------------------------------------

-- 6.1 registrations
CREATE TABLE registrations (
    id                          UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    tournament_id               UUID            NOT NULL REFERENCES tournaments(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    race_id                     UUID            NOT NULL REFERENCES races(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    horse_id                    UUID            NOT NULL REFERENCES horses(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    owner_id                    UUID            NOT NULL REFERENCES horse_owners(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    horse_no                    INTEGER         CHECK (horse_no IS NULL OR horse_no > 0),
    draw                        INTEGER         CHECK (draw IS NULL OR draw > 0),
    rating_snapshot             INTEGER         CHECK (rating_snapshot IS NULL OR rating_snapshot BETWEEN 0 AND 140),
    gears                       TEXT[]          NOT NULL DEFAULT ARRAY[]::TEXT[],
    declared_weight_kg          NUMERIC(6,2)    NOT NULL DEFAULT 54.5
                                                CHECK (declared_weight_kg BETWEEN 40 AND 75),
    entry_finalized_at          TIMESTAMPTZ,
    entry_finalized_by          UUID            REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    status                      TEXT            NOT NULL DEFAULT 'pending'
                                                CHECK (status IN ('pending','approved','rejected','cancelled')),
    note                        TEXT,
    admin_note                  TEXT,
    entry_fee_vnd               NUMERIC(15,2)   NOT NULL DEFAULT 0
                                                CHECK (entry_fee_vnd >= 0),
    entry_fee_token             INTEGER         NOT NULL DEFAULT 0
                                                CHECK (entry_fee_token >= 0),
    payment_status              TEXT            NOT NULL DEFAULT 'not_required'
                                                CHECK (payment_status IN ('not_required','pending','paid','failed','refund_pending','refund_sent','refunded')),
    payment_method              TEXT            CHECK (payment_method IS NULL OR payment_method IN ('VNPAY','MOMO','MOCK')),
    payment_order_id            TEXT,
    payment_expires_at          TIMESTAMPTZ,
    gateway_reference_id        TEXT,
    payment_transaction_id      UUID            REFERENCES transaction_histories(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    payment_paid_at             TIMESTAMPTZ,
    payment_refunded_at         TIMESTAMPTZ,
    slot_reserved               BOOLEAN         NOT NULL DEFAULT FALSE,
    slot_reserved_at            TIMESTAMPTZ,
    slot_released_at            TIMESTAMPTZ,
    registered_at               TIMESTAMPTZ     NOT NULL DEFAULT now(),
    approved_by                 UUID            REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    approved_at                 TIMESTAMPTZ,
    created_at                  TIMESTAMPTZ     NOT NULL DEFAULT now(),
    updated_at                  TIMESTAMPTZ     NOT NULL DEFAULT now(),
    deleted_at                  TIMESTAMPTZ
);

CREATE UNIQUE INDEX registrations_race_horse_uniq
    ON registrations (race_id, horse_id)
    WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX registrations_race_horse_no_uniq
    ON registrations (race_id, horse_no)
    WHERE horse_no IS NOT NULL AND deleted_at IS NULL;
CREATE UNIQUE INDEX registrations_race_draw_uniq
    ON registrations (race_id, draw)
    WHERE draw IS NOT NULL AND deleted_at IS NULL;
CREATE UNIQUE INDEX registrations_payment_order_id_uniq
    ON registrations (payment_order_id)
    WHERE payment_order_id IS NOT NULL AND deleted_at IS NULL;
CREATE UNIQUE INDEX registrations_gateway_reference_id_uniq
    ON registrations (gateway_reference_id)
    WHERE gateway_reference_id IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX registrations_race_status_idx ON registrations (race_id, status);
CREATE INDEX registrations_payment_status_idx ON registrations (payment_status);
CREATE INDEX registrations_slot_reserved_idx ON registrations (slot_reserved) WHERE slot_reserved = TRUE;
CREATE INDEX registrations_tournament_idx ON registrations (tournament_id);
CREATE INDEX registrations_owner_idx ON registrations (owner_id);
CREATE INDEX registrations_horse_idx ON registrations (horse_id);
CREATE INDEX registrations_approved_by_idx ON registrations (approved_by);
CREATE INDEX registrations_payment_transaction_idx
    ON registrations (payment_transaction_id)
    WHERE payment_transaction_id IS NOT NULL;

-- 6.2 registration_cancellation_tickets
CREATE TABLE registration_cancellation_tickets (
    id                          UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    registration_id             UUID            NOT NULL REFERENCES registrations(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    tournament_id               UUID            NOT NULL REFERENCES tournaments(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    race_id                     UUID            NOT NULL REFERENCES races(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    owner_id                    UUID            NOT NULL REFERENCES horse_owners(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    horse_id                    UUID            NOT NULL REFERENCES horses(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    reason                      TEXT            NOT NULL CHECK (length(reason) <= 1000),
    status                      TEXT            NOT NULL DEFAULT 'pending'
                                                CHECK (status IN ('pending','approved','rejected')),
    refund_status               TEXT            NOT NULL DEFAULT 'not_required'
                                                CHECK (refund_status IN ('not_required','awaiting_approval','pending','awaiting_owner_confirmation','completed','failed')),
    refund_amount_vnd           NUMERIC(15,2)   NOT NULL DEFAULT 0
                                                CHECK (refund_amount_vnd >= 0),
    requested_at                TIMESTAMPTZ     NOT NULL DEFAULT now(),
    reviewed_by                 UUID            REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    reviewed_at                 TIMESTAMPTZ,
    admin_note                  TEXT            CHECK (admin_note IS NULL OR length(admin_note) <= 1000),
    refund_reference            TEXT            CHECK (refund_reference IS NULL OR length(refund_reference) <= 255),
    refund_sent_by              UUID            REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    refund_sent_at              TIMESTAMPTZ,
    owner_confirmed_at          TIMESTAMPTZ,
    owner_confirmation_note     TEXT            CHECK (owner_confirmation_note IS NULL OR length(owner_confirmation_note) <= 1000),
    created_at                  TIMESTAMPTZ     NOT NULL DEFAULT now(),
    updated_at                  TIMESTAMPTZ     NOT NULL DEFAULT now(),
    deleted_at                  TIMESTAMPTZ
);

CREATE UNIQUE INDEX registration_cancellation_tickets_reg_status_pending_uniq
    ON registration_cancellation_tickets (registration_id, status)
    WHERE status = 'pending' AND deleted_at IS NULL;
CREATE INDEX registration_cancellation_tickets_owner_created_idx
    ON registration_cancellation_tickets (owner_id, created_at DESC);
CREATE INDEX registration_cancellation_tickets_status_created_idx
    ON registration_cancellation_tickets (status, created_at);

-- 6.3 jockey_assignments (top-level)
CREATE TABLE jockey_assignments (
    id                          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    race_id                     UUID        NOT NULL REFERENCES races(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    horse_id                    UUID        NOT NULL REFERENCES horses(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    owner_id                    UUID        NOT NULL REFERENCES horse_owners(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    jockey_id                   UUID        NOT NULL REFERENCES jockeys(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    assignment_type             TEXT        NOT NULL DEFAULT 'primary'
                                            CHECK (assignment_type IN ('primary','backup')),
    backup_priority             INTEGER     CHECK (backup_priority IS NULL OR backup_priority > 0),
    backup_for_assignment_id    UUID        REFERENCES jockey_assignments(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    status                      TEXT        NOT NULL DEFAULT 'meeting_invited'
                                            CHECK (status IN (
                                                'meeting_invited','meeting_accepted','meeting_rejected',
                                                'terms_pending_confirmation','standby_terms_pending_confirmation',
                                                'standby_confirmed','terms_agreed','terms_rejected',
                                                'contract_uploaded','contract_rejected','accepted',
                                                'cancelled','replaced'
                                            )),
    invitation_message          TEXT,
    response_message            TEXT,
    invited_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
    responded_at                TIMESTAMPTZ,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at                  TIMESTAMPTZ
);

CREATE INDEX jockey_assignments_role_status_idx
    ON jockey_assignments (race_id, horse_id, assignment_type, status);
CREATE INDEX jockey_assignments_race_horse_priority_idx
    ON jockey_assignments (race_id, horse_id, backup_priority);
CREATE INDEX jockey_assignments_race_status_idx
    ON jockey_assignments (race_id, status);
CREATE INDEX jockey_assignments_owner_idx
    ON jockey_assignments (owner_id);
CREATE INDEX jockey_assignments_jockey_idx
    ON jockey_assignments (jockey_id);

CREATE UNIQUE INDEX jockey_assignments_race_horse_primary_uniq
    ON jockey_assignments (race_id, horse_id, assignment_type)
    WHERE assignment_type = 'primary'
      AND status IN ('pending','meeting_invited','meeting_accepted',
                     'terms_pending_confirmation','terms_agreed','terms_rejected',
                     'contract_uploaded','accepted')
      AND deleted_at IS NULL;

CREATE UNIQUE INDEX jockey_assignments_race_horse_backup_uniq
    ON jockey_assignments (race_id, horse_id, assignment_type)
    WHERE assignment_type = 'backup'
      AND status IN ('pending','meeting_invited','meeting_accepted',
                     'terms_pending_confirmation','terms_agreed','terms_rejected',
                     'contract_uploaded','accepted',
                     'standby_terms_pending_confirmation','standby_confirmed')
      AND deleted_at IS NULL;

CREATE UNIQUE INDEX jockey_assignments_race_jockey_confirmed_uniq
    ON jockey_assignments (race_id, jockey_id)
    WHERE status IN ('accepted','standby_confirmed')
      AND deleted_at IS NULL;

-- 6.4 jockey_assignment_meetings (1-1)
CREATE TABLE jockey_assignment_meetings (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    assignment_id       UUID        NOT NULL UNIQUE
                                    REFERENCES jockey_assignments(id) ON DELETE CASCADE ON UPDATE CASCADE,
    title               TEXT,
    meeting_url         TEXT,
    meeting_time        TIMESTAMPTZ,
    location_name       TEXT,
    address             TEXT,
    city                TEXT,
    district            TEXT,
    ward                TEXT,
    map_url             TEXT,
    contact_name        TEXT,
    contact_phone       TEXT,
    note                TEXT,
    accepted_at         TIMESTAMPTZ,
    rejected_at         TIMESTAMPTZ,
    response_message    TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6.5 jockey_assignment_terms (1-1)
CREATE TABLE jockey_assignment_terms (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    assignment_id       UUID        NOT NULL UNIQUE
                                    REFERENCES jockey_assignments(id) ON DELETE CASCADE ON UPDATE CASCADE,
    agreed_terms        TEXT,
    meeting_note        TEXT,
    agreed_at           TIMESTAMPTZ,
    sent_at             TIMESTAMPTZ,
    confirmed_at        TIMESTAMPTZ,
    rejected_at         TIMESTAMPTZ,
    response_message    TEXT,
    updated_by          UUID        REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6.6 jockey_assignment_standby_terms (1-1)
CREATE TABLE jockey_assignment_standby_terms (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    assignment_id       UUID        NOT NULL UNIQUE
                                    REFERENCES jockey_assignments(id) ON DELETE CASCADE ON UPDATE CASCADE,
    agreed_terms        TEXT,
    meeting_note        TEXT,
    agreed_at           TIMESTAMPTZ,
    sent_at             TIMESTAMPTZ,
    confirmed_at        TIMESTAMPTZ,
    rejected_at         TIMESTAMPTZ,
    response_message    TEXT,
    updated_by          UUID        REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6.7 jockey_assignment_contracts (1-1)
CREATE TABLE jockey_assignment_contracts (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    assignment_id       UUID        NOT NULL UNIQUE
                                    REFERENCES jockey_assignments(id) ON DELETE CASCADE ON UPDATE CASCADE,
    contract_number     TEXT,
    title               TEXT,
    file_url            TEXT,
    file_public_id      TEXT,
    file_type           TEXT,
    file_name           TEXT,
    signed_at           TIMESTAMPTZ,
    uploaded_at         TIMESTAMPTZ,
    confirmed_at        TIMESTAMPTZ,
    rejected_at         TIMESTAMPTZ,
    response_message    TEXT,
    note                TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6.8 jockey_assignment_standby_contracts (1-1)
CREATE TABLE jockey_assignment_standby_contracts (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    assignment_id       UUID        NOT NULL UNIQUE
                                    REFERENCES jockey_assignments(id) ON DELETE CASCADE ON UPDATE CASCADE,
    contract_number     TEXT,
    title               TEXT,
    file_url            TEXT,
    file_public_id      TEXT,
    file_type           TEXT,
    file_name           TEXT,
    signed_at           TIMESTAMPTZ,
    uploaded_at         TIMESTAMPTZ,
    confirmed_at        TIMESTAMPTZ,
    rejected_at         TIMESTAMPTZ,
    response_message    TEXT,
    note                TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6.9 jockey_assignment_promotions (1-1)
CREATE TABLE jockey_assignment_promotions (
    id                                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    assignment_id                       UUID        NOT NULL UNIQUE
                                            REFERENCES jockey_assignments(id) ON DELETE CASCADE ON UPDATE CASCADE,
    promoted_at                         TIMESTAMPTZ,
    promoted_by                         UUID        REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    reason                              TEXT,
    previous_primary_assignment_id      UUID        REFERENCES jockey_assignments(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    created_at                          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6.10 jockey_assignment_cancellation_requests (1-1)
CREATE TABLE jockey_assignment_cancellation_requests (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    assignment_id       UUID        NOT NULL UNIQUE
                                    REFERENCES jockey_assignments(id) ON DELETE CASCADE ON UPDATE CASCADE,
    status              TEXT        CHECK (status IS NULL OR status IN ('pending','approved','rejected')),
    initiated_by_party  TEXT        CHECK (initiated_by_party IS NULL OR initiated_by_party IN ('horse_owner','jockey')),
    initiated_by        UUID        REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    reason              TEXT        CHECK (reason IS NULL OR length(reason) <= 1000),
    requested_at        TIMESTAMPTZ,
    responded_by_party  TEXT        CHECK (responded_by_party IS NULL OR responded_by_party IN ('horse_owner','jockey')),
    responded_by        UUID        REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    response_message    TEXT        CHECK (response_message IS NULL OR length(response_message) <= 1000),
    responded_at        TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6.11 jockey_assignment_withdrawals (1-1)
CREATE TABLE jockey_assignment_withdrawals (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    assignment_id       UUID        NOT NULL UNIQUE
                                    REFERENCES jockey_assignments(id) ON DELETE CASCADE ON UPDATE CASCADE,
    initiated_by_party  TEXT        CHECK (initiated_by_party IS NULL OR initiated_by_party IN ('horse_owner','jockey')),
    initiated_by        UUID        REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    reason              TEXT        CHECK (reason IS NULL OR length(reason) <= 1000),
    withdrawn_at        TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6.12 horse_checks
CREATE TABLE horse_checks (
    id                          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    race_id                     UUID        NOT NULL REFERENCES races(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    horse_id                    UUID        NOT NULL REFERENCES horses(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    jockey_id                   UUID        REFERENCES jockeys(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    referee_id                  UUID        NOT NULL REFERENCES race_referees(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    phase                       TEXT        NOT NULL DEFAULT 'pre_race'
                                            CHECK (phase IN ('pre_race','during_race','post_race')),
    status                      TEXT        NOT NULL DEFAULT 'passed'
                                            CHECK (status IN (
                                                'passed','failed','needs_review','scratched','normal',
                                                'incident_recorded','race_stopped','minor_issue',
                                                'injury_detected','requires_vet_follow_up','under_investigation'
                                            )),
    checklist                   JSONB       NOT NULL DEFAULT '{}'::jsonb,
    event_type                  TEXT,
    severity                    TEXT,
    time_marker                 TEXT,
    description                 TEXT,
    evidence_urls               TEXT[]      NOT NULL DEFAULT ARRAY[]::TEXT[],
    requires_violation          BOOLEAN     NOT NULL DEFAULT FALSE,
    auto_confirm_violation      BOOLEAN     NOT NULL DEFAULT FALSE,
    linked_violation_id         UUID,
    health_status               TEXT,
    weight                      INTEGER,
    check_note                  TEXT,
    is_eligible                 BOOLEAN     NOT NULL DEFAULT TRUE,
    checked_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at                  TIMESTAMPTZ
);

CREATE INDEX horse_checks_race_horse_phase_idx ON horse_checks (race_id, horse_id, phase);
CREATE INDEX horse_checks_referee_race_phase_idx ON horse_checks (referee_id, race_id, phase);
CREATE INDEX horse_checks_referee_status_idx ON horse_checks (referee_id, status);
CREATE INDEX horse_checks_phase_idx ON horse_checks (phase);
CREATE INDEX horse_checks_status_idx ON horse_checks (status);

-- 6.13 horse_check_issues (normalize)
CREATE TABLE horse_check_issues (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    horse_check_id      UUID        NOT NULL REFERENCES horse_checks(id) ON DELETE CASCADE ON UPDATE CASCADE,
    code                TEXT,
    severity            TEXT,
    note                TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX horse_check_issues_check_idx ON horse_check_issues (horse_check_id);

-- 6.14 violations
CREATE TABLE violations (
    id                      UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    race_id                 UUID            NOT NULL REFERENCES races(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    horse_id                UUID            REFERENCES horses(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    jockey_id               UUID            REFERENCES jockeys(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    referee_id              UUID            NOT NULL REFERENCES race_referees(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    horse_check_id          UUID            REFERENCES horse_checks(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    violation_type          TEXT            NOT NULL
                                            CHECK (violation_type IN (
                                                'dangerous_riding','interference','illegal_whip_use',
                                                'lane_violation','false_start','equipment_violation',
                                                'horse_abuse','disobey_referee','doping_suspected',
                                                'track_safety_issue','other'
                                            )),
    description             TEXT,
    severity                TEXT            NOT NULL DEFAULT 'minor'
                                            CHECK (severity IN ('minor','major','critical')),
    time_marker             TEXT,
    evidence_urls           TEXT[]          NOT NULL DEFAULT ARRAY[]::TEXT[],
    decision                TEXT,
    deviates_from_policy    BOOLEAN         NOT NULL DEFAULT FALSE,
    deviation_reason        TEXT            CHECK (deviation_reason IS NULL OR length(deviation_reason) <= 1000),
    decision_scope          TEXT            CHECK (decision_scope IS NULL OR decision_scope IN (
                                            'referee_policy_match','referee_adjustment','referee_dismissal',
                                            'admin_policy_match','admin_approval','admin_override','admin_dismissal'
                                        )),
    proposed_by             UUID            REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    proposed_at             TIMESTAMPTZ,
    status                  TEXT            NOT NULL DEFAULT 'recorded'
                                            CHECK (status IN ('recorded','under_review','confirmed','dismissed','resolved')),
    decided_by              UUID            REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    decided_at              TIMESTAMPTZ,
    penalty_source          TEXT            CHECK (penalty_source IS NULL OR penalty_source IN (
                                            'auto_policy','policy_confirm','referee_adjustment','manual_admin'
                                        )),
    policy_version          TEXT,
    discipline_applied_at   TIMESTAMPTZ,
    discipline_applied_by   UUID            REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    created_at              TIMESTAMPTZ     NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ     NOT NULL DEFAULT now(),
    deleted_at              TIMESTAMPTZ
);

CREATE INDEX violations_referee_race_status_idx ON violations (referee_id, race_id, status);
CREATE INDEX violations_race_status_idx ON violations (race_id, status);
CREATE INDEX violations_horse_idx ON violations (horse_id);
CREATE INDEX violations_jockey_idx ON violations (jockey_id);

-- Now add the deferred FK horse_checks.linked_violation_id -> violations.id
ALTER TABLE horse_checks
    ADD CONSTRAINT horse_checks_linked_violation_fk
    FOREIGN KEY (linked_violation_id)
    REFERENCES violations(id)
    ON DELETE RESTRICT ON UPDATE CASCADE
    DEFERRABLE INITIALLY DEFERRED;

-- 6.15 violation_evidence_files
CREATE TABLE violation_evidence_files (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    violation_id    UUID        NOT NULL REFERENCES violations(id) ON DELETE CASCADE ON UPDATE CASCADE,
    url             TEXT,
    public_id       TEXT,
    type            TEXT,
    file_name       TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX violation_evidence_files_violation_idx ON violation_evidence_files (violation_id);

-- 6.16 violation_penalties
CREATE TABLE violation_penalties (
    id                      UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    violation_id            UUID            NOT NULL REFERENCES violations(id) ON DELETE CASCADE ON UPDATE CASCADE,
    slot                    TEXT            NOT NULL
                                            CHECK (slot IN ('suggested','proposed','final')),
    type                    TEXT            CHECK (type IS NULL OR type IN (
                                            'warning','score_deduction','time_penalty',
                                            'position_demotion','disqualification','suspension','fine'
                                        )),
    score_deduction         INTEGER         NOT NULL DEFAULT 0 CHECK (score_deduction >= 0),
    position_delta          INTEGER         NOT NULL DEFAULT 0 CHECK (position_delta >= 0),
    time_penalty_seconds    INTEGER         NOT NULL DEFAULT 0 CHECK (time_penalty_seconds >= 0),
    suspension_days         INTEGER         NOT NULL DEFAULT 0 CHECK (suspension_days >= 0),
    fine_amount             NUMERIC(15,2)   NOT NULL DEFAULT 0 CHECK (fine_amount >= 0),
    disqualified            BOOLEAN         NOT NULL DEFAULT FALSE,
    note                    TEXT,
    created_at              TIMESTAMPTZ     NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ     NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX violation_penalties_violation_slot_uniq
    ON violation_penalties (violation_id, slot);

-- 6.17 referee_reports
CREATE TABLE referee_reports (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    race_id             UUID        NOT NULL REFERENCES races(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    referee_id          UUID        NOT NULL REFERENCES race_referees(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    report_title        TEXT        NOT NULL,
    report_content      TEXT,
    race_condition      TEXT,
    weather             TEXT,
    track_condition     TEXT,
    conclusion          TEXT,
    status              TEXT        NOT NULL DEFAULT 'draft'
                                    CHECK (status IN ('draft','submitted','approved','rejected')),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    submitted_at        TIMESTAMPTZ,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at          TIMESTAMPTZ
);

CREATE INDEX referee_reports_referee_race_status_idx
    ON referee_reports (referee_id, race_id, status);
CREATE INDEX referee_reports_race_status_idx
    ON referee_reports (race_id, status);

-- 6.18 race_engine_runs
CREATE TABLE race_engine_runs (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    race_id         UUID        NOT NULL REFERENCES races(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    engine_run_id   TEXT        NOT NULL,
    status          TEXT        NOT NULL,
    started_at      TIMESTAMPTZ,
    completed_at    TIMESTAMPTZ,
    error           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at      TIMESTAMPTZ
);

CREATE UNIQUE INDEX race_engine_runs_race_uniq
    ON race_engine_runs (race_id)
    WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX race_engine_runs_engine_run_id_uniq
    ON race_engine_runs (engine_run_id)
    WHERE deleted_at IS NULL;

-- 6.19 race_runs
CREATE TABLE race_runs (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    race_id         UUID        NOT NULL REFERENCES races(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    status          TEXT        NOT NULL DEFAULT 'generated'
                                CHECK (status IN ('generated','used','cancelled')),
    generated_by    UUID        REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    generated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    seed            TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at      TIMESTAMPTZ
);

CREATE UNIQUE INDEX race_runs_race_uniq
    ON race_runs (race_id)
    WHERE deleted_at IS NULL;

-- 6.20 race_run_participants
CREATE TABLE race_run_participants (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    race_run_id     UUID        NOT NULL REFERENCES race_runs(id) ON DELETE CASCADE ON UPDATE CASCADE,
    horse_id        UUID        NOT NULL REFERENCES horses(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    jockey_id       UUID        NOT NULL REFERENCES jockeys(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    assignment_id   UUID        REFERENCES jockey_assignments(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    lane            INTEGER,
    seed_position   INTEGER,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX race_run_participants_run_idx ON race_run_participants (race_run_id);
CREATE UNIQUE INDEX race_run_participants_run_horse_uniq
    ON race_run_participants (race_run_id, horse_id);
CREATE UNIQUE INDEX race_run_participants_run_jockey_uniq
    ON race_run_participants (race_run_id, jockey_id);

-- 6.21 race_run_finish_orders
CREATE TABLE race_run_finish_orders (
    id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    race_run_id     UUID            NOT NULL REFERENCES race_runs(id) ON DELETE CASCADE ON UPDATE CASCADE,
    horse_id        UUID            NOT NULL REFERENCES horses(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    jockey_id       UUID            NOT NULL REFERENCES jockeys(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    position        INTEGER         NOT NULL CHECK (position > 0),
    finish_time     NUMERIC(8,3)    NOT NULL,
    score           NUMERIC(8,2),
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT now()
);

CREATE INDEX race_run_finish_orders_run_idx ON race_run_finish_orders (race_run_id);
CREATE UNIQUE INDEX race_run_finish_orders_run_position_uniq
    ON race_run_finish_orders (race_run_id, position);

-- 6.22 race_prize_distribution_items
CREATE TABLE race_prize_distribution_items (
    id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    race_id         UUID            NOT NULL REFERENCES races(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    position        INTEGER         NOT NULL CHECK (position > 0),
    percent         NUMERIC(5,2)    CHECK (percent IS NULL OR (percent BETWEEN 0 AND 100)),
    amount          NUMERIC(15,2)   CHECK (amount IS NULL OR amount >= 0),
    label           TEXT,
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ     NOT NULL DEFAULT now(),
    deleted_at      TIMESTAMPTZ
);

CREATE INDEX race_prize_distribution_items_race_idx
    ON race_prize_distribution_items (race_id)
    WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX race_prize_distribution_items_race_position_uniq
    ON race_prize_distribution_items (race_id, position)
    WHERE deleted_at IS NULL;

-- 6.23 race_odds_markets
CREATE TABLE race_odds_markets (
    id                          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    race_id                     UUID        NOT NULL REFERENCES races(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    status                      TEXT        NOT NULL DEFAULT 'generated'
                                            CHECK (status IN ('generated','stale','open','closed','settled')),
    model_name                  TEXT        NOT NULL DEFAULT 'probability_engine_history_v1',
    model_version               TEXT        NOT NULL DEFAULT 'history_v1.0.0',
    source                      TEXT        NOT NULL DEFAULT 'app_probability_engine_history_v1_runtime',
    payout_factor               NUMERIC(5,4) NOT NULL DEFAULT 0.85
                                            CHECK (payout_factor BETWEEN 0 AND 1),
    model_input_version         INTEGER     NOT NULL DEFAULT 0
                                            CHECK (model_input_version >= 0),
    input_snapshot              JSONB       NOT NULL DEFAULT '{}'::jsonb,
    model_metrics               JSONB       NOT NULL DEFAULT '{}'::jsonb,
    input_diagnostics           JSONB       NOT NULL DEFAULT '{}'::jsonb,
    generated_by                UUID        REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    generated_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
    manually_adjusted_by        UUID        REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    manually_adjusted_at        TIMESTAMPTZ,
    manual_adjustment_note      TEXT        CHECK (manual_adjustment_note IS NULL OR length(manual_adjustment_note) <= 500),
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at                  TIMESTAMPTZ
);

CREATE UNIQUE INDEX race_odds_markets_race_uniq
    ON race_odds_markets (race_id)
    WHERE deleted_at IS NULL;
CREATE INDEX race_odds_markets_race_status_idx
    ON race_odds_markets (race_id, status);
CREATE INDEX race_odds_markets_generated_at_idx
    ON race_odds_markets (generated_at);
CREATE INDEX race_odds_markets_generated_by_idx
    ON race_odds_markets (generated_by);
CREATE INDEX race_odds_markets_manually_adjusted_by_idx
    ON race_odds_markets (manually_adjusted_by);

-- 6.24 race_odds_market_odds
CREATE TABLE race_odds_market_odds (
    id                          UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    odds_market_id              UUID            NOT NULL REFERENCES race_odds_markets(id) ON DELETE CASCADE ON UPDATE CASCADE,
    horse_id                    UUID            NOT NULL REFERENCES horses(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    jockey_id                   UUID            REFERENCES jockeys(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    horse_no                    INTEGER,
    horse_name                  TEXT,
    jockey_name                 TEXT,
    win_probability             NUMERIC(6,5)    NOT NULL
                                                CHECK (win_probability BETWEEN 0 AND 1),
    fair_odds                   NUMERIC(8,2)    NOT NULL CHECK (fair_odds >= 1),
    game_odds                   NUMERIC(8,2)    NOT NULL CHECK (game_odds >= 1),
    generated_game_odds         NUMERIC(8,2)    CHECK (generated_game_odds IS NULL OR generated_game_odds >= 1),
    probability_rank            INTEGER         NOT NULL CHECK (probability_rank >= 1),
    fallbacks_used              TEXT[]          NOT NULL DEFAULT ARRAY[]::TEXT[],
    created_at                  TIMESTAMPTZ     NOT NULL DEFAULT now(),
    updated_at                  TIMESTAMPTZ     NOT NULL DEFAULT now()
);

CREATE INDEX race_odds_market_odds_market_idx
    ON race_odds_market_odds (odds_market_id);
CREATE INDEX race_odds_market_odds_horse_idx
    ON race_odds_market_odds (horse_id);
CREATE INDEX race_odds_market_odds_jockey_idx
    ON race_odds_market_odds (jockey_id);
CREATE UNIQUE INDEX race_odds_market_odds_market_rank_uniq
    ON race_odds_market_odds (odds_market_id, probability_rank);

-- 6.25 prizes
CREATE TABLE prizes (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    tournament_id   UUID        NOT NULL REFERENCES tournaments(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    race_id         UUID        NOT NULL REFERENCES races(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    prize_name      TEXT        NOT NULL,
    position        INTEGER,
    amount          NUMERIC(15,2) NOT NULL DEFAULT 0,
    percent         NUMERIC(5,2)  NOT NULL DEFAULT 0
                                CHECK (percent BETWEEN 0 AND 100),
    currency        TEXT        NOT NULL DEFAULT 'VND',
    description     TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at      TIMESTAMPTZ
);

CREATE INDEX prizes_race_position_idx ON prizes (race_id, position);

-- ---------------------------------------------------------------------
-- 7. Tier-5 tables (depend on tier-4)
-- ---------------------------------------------------------------------

-- 7.1 race_results
CREATE TABLE race_results (
    id                          UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    race_id                     UUID            NOT NULL REFERENCES races(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    horse_id                    UUID            NOT NULL REFERENCES horses(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    jockey_id                   UUID            NOT NULL REFERENCES jockeys(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    position                    INTEGER         CHECK (position IS NULL OR position > 0),
    finish_time                 NUMERIC(8,3),
    score                       NUMERIC(8,2),
    raw_position                INTEGER,
    raw_finish_time             NUMERIC(8,3),
    raw_score                   NUMERIC(8,2),
    final_position              INTEGER         CHECK (final_position IS NULL OR final_position > 0),
    final_finish_time           NUMERIC(8,3),
    final_score                 NUMERIC(8,2),
    penalties_applied_by        UUID            REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    penalties_applied_at        TIMESTAMPTZ,
    submitted_to_admin_by       UUID            REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    submitted_to_admin_at       TIMESTAMPTZ,
    status                      TEXT            NOT NULL DEFAULT 'draft'
                                                CHECK (status IN ('draft','confirmed','published')),
    note                        TEXT,
    correction_requested        BOOLEAN         NOT NULL DEFAULT FALSE,
    correction_note             TEXT,
    correction_requested_by     UUID            REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    correction_requested_at     TIMESTAMPTZ,
    correction_resolved_by      UUID            REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    correction_resolved_at      TIMESTAMPTZ,
    recorded_by                 UUID            REFERENCES race_referees(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    recorded_at                 TIMESTAMPTZ,
    confirmed_by                UUID            REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    confirmed_at                TIMESTAMPTZ,
    published_by                UUID            REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    published_at                TIMESTAMPTZ,
    created_at                  TIMESTAMPTZ     NOT NULL DEFAULT now(),
    updated_at                  TIMESTAMPTZ     NOT NULL DEFAULT now(),
    deleted_at                  TIMESTAMPTZ
);

CREATE UNIQUE INDEX race_results_race_horse_uniq
    ON race_results (race_id, horse_id)
    WHERE deleted_at IS NULL;
CREATE INDEX race_results_race_status_idx
    ON race_results (race_id, status);
CREATE INDEX race_results_recorded_by_status_idx
    ON race_results (recorded_by, status);
CREATE INDEX race_results_submitted_at_status_idx
    ON race_results (submitted_to_admin_at, status);
CREATE INDEX race_results_correction_requested_idx
    ON race_results (correction_requested)
    WHERE correction_requested = TRUE;

-- 7.2 race_result_applied_violations
CREATE TABLE race_result_applied_violations (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    race_result_id      UUID        NOT NULL REFERENCES race_results(id) ON DELETE CASCADE ON UPDATE CASCADE,
    violation_id        UUID        NOT NULL REFERENCES violations(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX race_result_applied_violations_pair_uniq
    ON race_result_applied_violations (race_result_id, violation_id);
CREATE INDEX race_result_applied_violations_violation_idx
    ON race_result_applied_violations (violation_id);

-- 7.3 race_result_penalty_snapshot_violations
CREATE TABLE race_result_penalty_snapshot_violations (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    race_result_id      UUID        NOT NULL REFERENCES race_results(id) ON DELETE CASCADE ON UPDATE CASCADE,
    violation_id        UUID        NOT NULL REFERENCES violations(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX race_result_penalty_snapshot_violations_pair_uniq
    ON race_result_penalty_snapshot_violations (race_result_id, violation_id);
CREATE INDEX race_result_penalty_snapshot_violations_violation_idx
    ON race_result_penalty_snapshot_violations (violation_id);

-- 7.4 prize_awards
CREATE TABLE prize_awards (
    id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    prize_id        UUID            NOT NULL REFERENCES prizes(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    race_result_id  UUID            NOT NULL REFERENCES race_results(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    horse_id        UUID            NOT NULL REFERENCES horses(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    owner_id        UUID            NOT NULL REFERENCES horse_owners(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    jockey_id       UUID            REFERENCES jockeys(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    position        INTEGER,
    amount          NUMERIC(15,2)   NOT NULL DEFAULT 0 CHECK (amount >= 0),
    gross_amount    NUMERIC(15,2)   NOT NULL DEFAULT 0 CHECK (gross_amount >= 0),
    owner_amount    NUMERIC(15,2)   NOT NULL DEFAULT 0 CHECK (owner_amount >= 0),
    jockey_amount   NUMERIC(15,2)   NOT NULL DEFAULT 0 CHECK (jockey_amount >= 0),
    currency        TEXT            NOT NULL DEFAULT 'VND',
    status          TEXT            NOT NULL DEFAULT 'calculated'
                                    CHECK (status IN ('calculated','approved','paid','cancelled')),
    awarded_at      TIMESTAMPTZ,
    calculated_at   TIMESTAMPTZ,
    approved_at     TIMESTAMPTZ,
    approved_by     UUID            REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    paid_at         TIMESTAMPTZ,
    paid_by         UUID            REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ     NOT NULL DEFAULT now(),
    deleted_at      TIMESTAMPTZ
);

CREATE UNIQUE INDEX prize_awards_race_result_uniq
    ON prize_awards (race_result_id)
    WHERE deleted_at IS NULL;
CREATE INDEX prize_awards_owner_status_idx
    ON prize_awards (owner_id, status);
CREATE INDEX prize_awards_jockey_status_idx
    ON prize_awards (jockey_id, status);

-- 7.5 bets
CREATE TABLE bets (
    id                  UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
    spectator_id        UUID            NOT NULL REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    race_id             UUID            NOT NULL REFERENCES races(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    predicted_horse_id  UUID            NOT NULL REFERENCES horses(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    stake_amount        INTEGER         NOT NULL CHECK (stake_amount >= 1),
    odds_market_id      UUID            REFERENCES race_odds_markets(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    odds_snapshot       JSONB           NOT NULL DEFAULT '{}'::jsonb,
    potential_payout    NUMERIC(15,2)   NOT NULL CHECK (potential_payout >= 0),
    payout_amount       NUMERIC(15,2)   NOT NULL DEFAULT 0 CHECK (payout_amount >= 0),
    status              TEXT            NOT NULL DEFAULT 'pending'
                                        CHECK (status IN ('pending','won','lost','cancelled')),
    settled_result_id   UUID            REFERENCES race_results(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    settled_by          UUID            REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    settled_at          TIMESTAMPTZ,
    submitted_at        TIMESTAMPTZ     NOT NULL DEFAULT now(),
    checked_at          TIMESTAMPTZ,
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ     NOT NULL DEFAULT now(),
    deleted_at          TIMESTAMPTZ
);

CREATE INDEX bets_spectator_submitted_idx
    ON bets (spectator_id, submitted_at DESC);
CREATE INDEX bets_race_status_idx
    ON bets (race_id, status);
CREATE INDEX bets_odds_market_idx
    ON bets (odds_market_id)
    WHERE odds_market_id IS NOT NULL;
CREATE INDEX bets_settled_result_idx
    ON bets (settled_result_id)
    WHERE settled_result_id IS NOT NULL;

-- ---------------------------------------------------------------------
-- 8. TRIGGERS — updated_at touch
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to every table that has updated_at
DO $$
DECLARE
    t TEXT;
BEGIN
    FOR t IN
        SELECT unnest(ARRAY[
            'users','horse_owners','jockeys','race_referees','wallets','tournaments',
            'reward_items','notifications','role_applications','rounds','races',
            'horses','horse_rating_history','deposit_packages','transaction_histories',
            'deposit_requests','redemption_histories','registrations',
            'registration_cancellation_tickets','jockey_assignments',
            'jockey_assignment_meetings','jockey_assignment_terms',
            'jockey_assignment_standby_terms','jockey_assignment_contracts',
            'jockey_assignment_standby_contracts','jockey_assignment_promotions',
            'jockey_assignment_cancellation_requests','jockey_assignment_withdrawals',
            'horse_checks','violations','violation_penalties','referee_reports',
            'race_engine_runs','race_runs','race_prize_distribution_items',
            'race_odds_markets','race_odds_market_odds','prizes','race_results',
            'prize_awards','bets'
        ])
    LOOP
        EXECUTE format(
            'CREATE TRIGGER %I_updated_at_touch BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION touch_updated_at()',
            t, t
        );
    END LOOP;
END
$$ LANGUAGE plpgsql;

-- user_roles has no updated_at
CREATE OR REPLACE FUNCTION set_user_role_created_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.created_at = COALESCE(NEW.created_at, now());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER user_roles_set_created_at
    BEFORE INSERT ON user_roles
    FOR EACH ROW EXECUTE FUNCTION set_user_role_created_at();

-- role_application_documents has only created_at
CREATE TRIGGER role_application_documents_created_only
    BEFORE UPDATE ON role_application_documents
    FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- violation_evidence_files has only created_at
CREATE TRIGGER violation_evidence_files_created_only
    BEFORE UPDATE ON violation_evidence_files
    FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- race_run_participants has only created_at
CREATE TRIGGER race_run_participants_created_only
    BEFORE UPDATE ON race_run_participants
    FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- race_run_finish_orders has only created_at
CREATE TRIGGER race_run_finish_orders_created_only
    BEFORE UPDATE ON race_run_finish_orders
    FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- ---------------------------------------------------------------------
-- 9. TRIGGERS — business invariants
-- ---------------------------------------------------------------------

-- 9.1 races.registration_slot_count vs max_participants
CREATE OR REPLACE FUNCTION races_registration_slot_check()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.max_participants IS NOT NULL
       AND NEW.max_participants > 0
       AND NEW.registration_slot_count > NEW.max_participants THEN
        RAISE EXCEPTION
            'races.registration_slot_count (%) exceeds max_participants (%)',
            NEW.registration_slot_count, NEW.max_participants;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER races_registration_slot_check
    BEFORE INSERT OR UPDATE ON races
    FOR EACH ROW EXECUTE FUNCTION races_registration_slot_check();

-- 9.2 races.registration_lock_at auto = race_date - 3h if NULL
CREATE OR REPLACE FUNCTION races_registration_lock_at_auto()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.registration_lock_at IS NULL AND NEW.race_date IS NOT NULL THEN
        NEW.registration_lock_at = NEW.race_date - interval '3 hours';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER races_registration_lock_at_auto
    BEFORE INSERT OR UPDATE ON races
    FOR EACH ROW EXECUTE FUNCTION races_registration_lock_at_auto();

-- 9.3 transaction_histories immutable
CREATE OR REPLACE FUNCTION transaction_histories_immutable()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'transaction_histories is append-only; UPDATE/DELETE not allowed';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER transaction_histories_no_update
    BEFORE UPDATE ON transaction_histories
    FOR EACH ROW EXECUTE FUNCTION transaction_histories_immutable();

CREATE TRIGGER transaction_histories_no_delete
    BEFORE DELETE ON transaction_histories
    FOR EACH ROW EXECUTE FUNCTION transaction_histories_immutable();

-- 9.4 wallets.token_balance >= 0
CREATE OR REPLACE FUNCTION wallet_token_balance_nonneg()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.token_balance < 0 THEN
        RAISE EXCEPTION 'wallets.token_balance cannot be negative (got %)', NEW.token_balance;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER wallet_token_balance_nonneg
    BEFORE UPDATE ON wallets
    FOR EACH ROW EXECUTE FUNCTION wallet_token_balance_nonneg();

-- 9.5 reward_items.stock >= 0
CREATE OR REPLACE FUNCTION reward_items_stock_nonneg()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.stock < 0 THEN
        RAISE EXCEPTION 'reward_items.stock cannot be negative (got %)', NEW.stock;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER reward_items_stock_nonneg
    BEFORE UPDATE ON reward_items
    FOR EACH ROW EXECUTE FUNCTION reward_items_stock_nonneg();

-- 9.6 horses.default_gears gear-code check
CREATE OR REPLACE FUNCTION gears_code_check(gears TEXT[])
RETURNS BOOLEAN AS $$
DECLARE
    allowed TEXT[] := ARRAY['B','BO','V','TT','CP','CO','H','P','PC','PS','SR','SB','E','XB','CC'];
    g TEXT;
BEGIN
    IF gears IS NULL THEN
        RETURN TRUE;
    END IF;
    FOREACH g IN ARRAY gears LOOP
        IF NOT (g = ANY(allowed)) THEN
            RAISE EXCEPTION 'invalid gear code: % (allowed: %)', g, allowed;
        END IF;
    END LOOP;
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION horses_default_gears_check()
RETURNS TRIGGER AS $$
BEGIN
    PERFORM gears_code_check(NEW.default_gears);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER horses_default_gears_check_trg
    BEFORE INSERT OR UPDATE ON horses
    FOR EACH ROW EXECUTE FUNCTION horses_default_gears_check();

-- 9.7 registrations.gears gear-code check
CREATE OR REPLACE FUNCTION registrations_gears_check()
RETURNS TRIGGER AS $$
BEGIN
    PERFORM gears_code_check(NEW.gears);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER registrations_gears_check_trg
    BEFORE INSERT OR UPDATE ON registrations
    FOR EACH ROW EXECUTE FUNCTION registrations_gears_check();

-- 9.8 horse_rating_history.calculated_at default
CREATE OR REPLACE FUNCTION horse_rating_history_calculated_at_default()
RETURNS TRIGGER AS $$
BEGIN
    NEW.calculated_at = COALESCE(NEW.calculated_at, now());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER horse_rating_history_calculated_at_default_trg
    BEFORE INSERT ON horse_rating_history
    FOR EACH ROW EXECUTE FUNCTION horse_rating_history_calculated_at_default();

-- ---------------------------------------------------------------------
-- 10. Summary
-- ---------------------------------------------------------------------
DO $$
DECLARE
    table_count   INT;
    index_count   INT;
    trigger_count INT;
    fk_count      INT;
BEGIN
    SELECT count(*) INTO table_count
        FROM information_schema.tables
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE';
    SELECT count(*) INTO index_count
        FROM pg_indexes
        WHERE schemaname = 'public';
    SELECT count(*) INTO trigger_count
        FROM pg_trigger
        WHERE NOT tgisinternal;
    SELECT count(*) INTO fk_count
        FROM pg_constraint
        WHERE contype = 'f' AND connamespace = 'public'::regnamespace;

    RAISE NOTICE 'DDL applied: % tables, % indexes, % triggers, % FKs',
        table_count, index_count, trigger_count, fk_count;
END
$$ LANGUAGE plpgsql;