/**
 * Phase 3 — Validate PostgreSQL schema
 *
 * Connects to the Postgres database, inspects information_schema + pg_catalog,
 * and reports:
 *   - list of tables (count + names)
 *   - list of indexes (count + UNIQUE + partial UNIQUE)
 *   - list of triggers (count + names + tables)
 *   - list of FKs (count + relationships)
 *   - CHECK constraints (count + samples)
 *   - extensions installed
 *
 * Usage:
 *   node validate-schema.js
 *
 * Exit codes:
 *   0 — all expected counts match (within tolerance)
 *   1 — connection / read failure
 *
 * Environment: same as apply-schema.js
 *   MIGRATION_PG_URL | PG_URL | (PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE)
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

// ---------------------------------------------------------------------
// Expected counts (derived from PHASE_3_SCHEMA_DESIGN.md)
// ---------------------------------------------------------------------
const EXPECTED = {
    tables: {
        min: 45,
        max: 55
    },
    indexes: {
        min: 70,
        max: 110
    },
    triggers: {
        min: 30,
        max: 50
    },
    foreignKeys: {
        min: 100,
        max: 200
    },
    checkConstraints: {
        min: 60,
        max: 100
    },
    uniqueIndexes: {
        min: 30
    },
    partialUniqueIndexes: {
        min: 15
    },
    extensions: ['uuid-ossp', 'pgcrypto']
};

// ---------------------------------------------------------------------
// Env loader (same as apply-schema.js)
// ---------------------------------------------------------------------
function tryLoadEnv() {
    const candidates = [
        path.resolve(__dirname, '..', 'horse-racing-backend', '.env'),
        path.resolve(__dirname, '..', 'horse-racing-backend', '.env.example'),
        path.resolve(process.cwd(), 'horse-racing-backend', '.env'),
        path.resolve(process.cwd(), 'horse-racing-backend', '.env.example')
    ];
    for (const file of candidates) {
        try {
            if (fs.existsSync(file)) {
                const content = fs.readFileSync(file, 'utf8');
                content.split(/\r?\n/).forEach((line) => {
                    const trimmed = line.trim();
                    if (!trimmed || trimmed.startsWith('#')) return;
                    const eq = trimmed.indexOf('=');
                    if (eq < 0) return;
                    const key = trimmed.slice(0, eq).trim();
                    const value = trimmed.slice(eq + 1).trim().replace(/^['"]|['"]$/g, '');
                    if (!process.env[key]) process.env[key] = value;
                });
                return file;
            }
        } catch (err) {
            // ignore
        }
    }
    return null;
}

function resolveConnectionOptions() {
    const explicit = process.env.MIGRATION_PG_URL || process.env.PG_URL;
    if (explicit) return { connectionString: explicit };
    const host = process.env.PGHOST;
    const port = process.env.PGPORT;
    const user = process.env.PGUSER;
    const password = process.env.PGPASSWORD;
    const database = process.env.PGDATABASE;
    if (!host || !user || !database) return null;
    return { host, port: port ? Number(port) : 5432, user, password, database };
}

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------
function pad(s, n) {
    s = String(s);
    if (s.length >= n) return s;
    return s + ' '.repeat(n - s.length);
}

function ok(cond) {
    return cond ? '✔' : '✖';
}

// ---------------------------------------------------------------------
// Validation queries
// ---------------------------------------------------------------------
async function getCounts(client) {
    const counts = {};

    // Tables
    const tablesRes = await client.query(`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
        ORDER BY table_name
    `);
    counts.tables = tablesRes.rows.map((r) => r.table_name);

    // Indexes (total)
    const indexesRes = await client.query(`
        SELECT indexname, indexdef, tablename
        FROM pg_indexes
        WHERE schemaname = 'public'
        ORDER BY tablename, indexname
    `);
    counts.indexes = indexesRes.rows;

    // Unique indexes
    const uniqueIdxRes = await client.query(`
        SELECT count(*)::int AS total,
               count(*) FILTER (WHERE indexdef ILIKE '%WHERE%')::int AS partial
        FROM pg_indexes
        WHERE schemaname = 'public'
          AND indexdef ILIKE '%UNIQUE%'
    `);
    counts.uniqueIndexesTotal = uniqueIdxRes.rows[0].total;
    counts.partialUniqueIndexes = uniqueIdxRes.rows[0].partial;

    // Triggers (excluding system)
    const triggersRes = await client.query(`
        SELECT t.tgname AS trigger_name,
               c.relname AS table_name,
               t.tgenabled AS enabled,
               pg_get_triggerdef(t.oid) AS definition
        FROM pg_trigger t
        JOIN pg_class c ON c.oid = t.tgrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE NOT t.tgisinternal
          AND n.nspname = 'public'
        ORDER BY c.relname, t.tgname
    `);
    counts.triggers = triggersRes.rows;

    // FKs
    const fksRes = await client.query(`
        SELECT
            tc.table_name,
            tc.constraint_name,
            kcu.column_name,
            ccu.table_name AS foreign_table_name,
            ccu.column_name AS foreign_column_name,
            rc.update_rule,
            rc.delete_rule
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
            ON tc.constraint_name = kcu.constraint_name
            AND tc.table_schema = kcu.table_schema
        JOIN information_schema.constraint_column_usage ccu
            ON tc.constraint_name = ccu.constraint_name
            AND tc.table_schema = ccu.table_schema
        JOIN information_schema.referential_constraints rc
            ON tc.constraint_name = rc.constraint_name
            AND tc.table_schema = rc.constraint_schema
        WHERE tc.constraint_type = 'FOREIGN KEY'
          AND tc.table_schema = 'public'
        ORDER BY tc.table_name, tc.constraint_name
    `);
    counts.fks = fksRes.rows;

    // CHECK constraints
    const checksRes = await client.query(`
        SELECT tc.table_name, tc.constraint_name
        FROM information_schema.table_constraints tc
        WHERE tc.constraint_type = 'CHECK'
          AND tc.table_schema = 'public'
        ORDER BY tc.table_name, tc.constraint_name
    `);
    counts.checks = checksRes.rows;

    // Extensions
    const extRes = await client.query(`
        SELECT extname FROM pg_extension ORDER BY extname
    `);
    counts.extensions = extRes.rows.map((r) => r.extname);

    return counts;
}

// ---------------------------------------------------------------------
// Print report
// ---------------------------------------------------------------------
function printReport(counts) {
    const lines = [];

    lines.push('');
    lines.push('='.repeat(72));
    lines.push(' Phase 3 — Schema validation report');
    lines.push('='.repeat(72));
    lines.push('');

    // Extensions
    lines.push('-- Extensions installed --');
    for (const ext of counts.extensions) {
        lines.push(`  ${ok(EXPECTED.extensions.includes(ext))} ${ext}`);
    }
    const missingExt = EXPECTED.extensions.filter((e) => !counts.extensions.includes(e));
    if (missingExt.length) {
        lines.push(`  ! MISSING: ${missingExt.join(', ')}`);
    }
    lines.push('');

    // Tables
    lines.push('-- Tables --');
    lines.push(`  ${pad('Count', 6)}: ${counts.tables.length} (expected ${EXPECTED.tables.min}-${EXPECTED.tables.max})`);
    lines.push(`  ${pad('OK', 6)}: ${ok(counts.tables.length >= EXPECTED.tables.min && counts.tables.length <= EXPECTED.tables.max)}`);
    lines.push('  Names:');
    counts.tables.forEach((t, i) => {
        lines.push(`    ${pad(String(i + 1), 4)} ${t}`);
    });
    lines.push('');

    // Indexes
    lines.push('-- Indexes --');
    lines.push(`  ${pad('Count', 6)}: ${counts.indexes.length} (expected ${EXPECTED.indexes.min}-${EXPECTED.indexes.max})`);
    lines.push(`  ${pad('OK', 6)}: ${ok(counts.indexes.length >= EXPECTED.indexes.min && counts.indexes.length <= EXPECTED.indexes.max)}`);
    lines.push(`  ${pad('Unique', 6)}: ${counts.uniqueIndexesTotal} (expected >= ${EXPECTED.uniqueIndexes.min})`);
    lines.push(`  ${pad('OK', 6)}: ${ok(counts.uniqueIndexesTotal >= EXPECTED.uniqueIndexes.min)}`);
    lines.push(`  ${pad('Partial', 6)}: ${counts.partialUniqueIndexes} (expected >= ${EXPECTED.partialUniqueIndexes.min})`);
    lines.push(`  ${pad('OK', 6)}: ${ok(counts.partialUniqueIndexes >= EXPECTED.partialUniqueIndexes.min)}`);
    lines.push('');

    // Triggers
    lines.push('-- Triggers --');
    lines.push(`  ${pad('Count', 6)}: ${counts.triggers.length} (expected ${EXPECTED.triggers.min}-${EXPECTED.triggers.max})`);
    lines.push(`  ${pad('OK', 6)}: ${ok(counts.triggers.length >= EXPECTED.triggers.min && counts.triggers.length <= EXPECTED.triggers.max)}`);
    lines.push('  Names:');
    counts.triggers.forEach((t, i) => {
        lines.push(`    ${pad(String(i + 1), 4)} ${t.table_name}.${t.trigger_name}`);
    });
    lines.push('');

    // FKs
    lines.push('-- Foreign keys --');
    lines.push(`  ${pad('Count', 6)}: ${counts.fks.length} (expected ${EXPECTED.foreignKeys.min}-${EXPECTED.foreignKeys.max})`);
    lines.push(`  ${pad('OK', 6)}: ${ok(counts.fks.length >= EXPECTED.foreignKeys.min && counts.fks.length <= EXPECTED.foreignKeys.max)}`);
    // spot-check ON DELETE RESTRICT
    const cascadeDeletes = counts.fks.filter((f) => f.delete_rule === 'CASCADE');
    lines.push(`  ${pad('Cascade', 6)}: ${cascadeDeletes.length} (expected: only child tables like *_meetings, *_terms, *_contracts, *_promotions, *_cancellation_requests, *_withdrawals, *_issues, *_evidence_files, *_penalties, *_applied_violations, *_penalty_snapshot_violations, *_documents, *_run_participants, *_run_finish_orders)`);
    lines.push('');

    // CHECK
    lines.push('-- CHECK constraints --');
    lines.push(`  ${pad('Count', 6)}: ${counts.checks.length} (expected ${EXPECTED.checkConstraints.min}-${EXPECTED.checkConstraints.max})`);
    lines.push(`  ${pad('OK', 6)}: ${ok(counts.checks.length >= EXPECTED.checkConstraints.min && counts.checks.length <= EXPECTED.checkConstraints.max)}`);
    lines.push('');

    // Specific MUST-HAVE checks
    lines.push('-- Specific invariant checks --');

    const mustHaveTables = [
        'users', 'roles', 'user_roles', 'horse_owners', 'jockeys', 'race_referees',
        'wallets', 'tournaments', 'rounds', 'races', 'horses', 'horse_rating_history',
        'deposit_packages', 'deposit_requests', 'transaction_histories',
        'registrations', 'registration_cancellation_tickets', 'jockey_assignments',
        'jockey_assignment_meetings', 'jockey_assignment_terms', 'jockey_assignment_contracts',
        'horse_checks', 'horse_check_issues', 'violations', 'violation_evidence_files',
        'violation_penalties', 'race_odds_markets', 'race_odds_market_odds', 'bets',
        'referee_reports', 'prizes', 'prize_awards', 'race_results',
        'race_result_applied_violations', 'race_result_penalty_snapshot_violations',
        'race_engine_runs', 'race_runs', 'race_run_participants', 'race_run_finish_orders',
        'reward_items', 'redemption_histories', 'notifications', 'role_applications',
        'role_application_documents', 'race_prize_distribution_items',
        'jockey_assignment_standby_terms', 'jockey_assignment_standby_contracts',
        'jockey_assignment_promotions', 'jockey_assignment_cancellation_requests',
        'jockey_assignment_withdrawals'
    ];
    const missingTables = mustHaveTables.filter((t) => !counts.tables.includes(t));
    lines.push(`  ${pad('Tables', 6)}: ${ok(missingTables.length === 0)} ${missingTables.length === 0 ? 'all ' + mustHaveTables.length + ' expected tables present' : 'MISSING: ' + missingTables.join(', ')}`);

    const mustHaveTriggers = [
        'races_registration_slot_check',
        'races_registration_lock_at_auto',
        'transaction_histories_no_update',
        'transaction_histories_no_delete',
        'wallet_token_balance_nonneg',
        'reward_items_stock_nonneg'
    ];
    const triggerNames = counts.triggers.map((t) => t.trigger_name);
    const missingTriggers = mustHaveTriggers.filter((t) => !triggerNames.includes(t));
    lines.push(`  ${pad('Triggers', 6)}: ${ok(missingTriggers.length === 0)} ${missingTriggers.length === 0 ? 'all ' + mustHaveTriggers.length + ' critical triggers present' : 'MISSING: ' + missingTriggers.join(', ')}`);

    const mustHaveExtensions = ['uuid-ossp', 'pgcrypto'];
    const missingExt2 = mustHaveExtensions.filter((e) => !counts.extensions.includes(e));
    lines.push(`  ${pad('Ext', 6)}: ${ok(missingExt2.length === 0)} ${missingExt2.length === 0 ? 'all ' + mustHaveExtensions.length + ' extensions present' : 'MISSING: ' + missingExt2.join(', ')}`);

    // Check partial unique indexes specifically
    const mustHavePartialUnique = [
        'horse_rating_history_race_horse_pubresult_uniq',
        'registrations_payment_order_id_uniq',
        'registrations_gateway_reference_id_uniq',
        'registrations_race_horse_no_uniq',
        'registrations_race_draw_uniq',
        'registration_cancellation_tickets_reg_status_pending_uniq',
        'transaction_histories_reference_id_uniq',
        'deposit_requests_gateway_reference_id_uniq',
        'jockey_assignments_race_horse_primary_uniq',
        'jockey_assignments_race_horse_backup_uniq',
        'jockey_assignments_race_jockey_confirmed_uniq'
    ];
    const indexNames = counts.indexes.map((i) => i.indexname);
    const missingPartial = mustHavePartialUnique.filter((n) => !indexNames.includes(n));
    lines.push(`  ${pad('PU idx', 6)}: ${ok(missingPartial.length === 0)} ${missingPartial.length === 0 ? 'all ' + mustHavePartialUnique.length + ' partial-unique indexes present' : 'MISSING: ' + missingPartial.join(', ')}`);

    lines.push('');
    lines.push('='.repeat(72));
    const allPass = missingTables.length === 0
        && missingTriggers.length === 0
        && missingExt2.length === 0
        && missingPartial.length === 0
        && counts.tables.length >= EXPECTED.tables.min
        && counts.triggers.length >= EXPECTED.triggers.min
        && counts.fks.length >= EXPECTED.foreignKeys.min
        && counts.checks.length >= EXPECTED.checkConstraints.min;
    lines.push(` Result: ${allPass ? 'PASS' : 'INCOMPLETE'}`);
    lines.push('='.repeat(72));
    lines.push('');

    return { allPass, lines };
}

// ---------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------
async function main() {
    const envFile = tryLoadEnv();
    if (envFile) console.log(`[validate-schema] loaded env from: ${envFile}`);

    const opts = resolveConnectionOptions();
    if (!opts) {
        console.error(
            '[validate-schema] ERROR: no Postgres connection info found.\n' +
            'Set MIGRATION_PG_URL (or PG_URL) OR (PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE).'
        );
        process.exit(1);
    }

    const client = new Client(opts);
    console.log(`[validate-schema] connecting...`);
    console.log(`[validate-schema] target: ${opts.connectionString || `${opts.user}@${opts.host}:${opts.port}/${opts.database}`}`);
    await client.connect();

    try {
        const counts = await getCounts(client);
        const { allPass, lines } = printReport(counts);
        lines.forEach((l) => console.log(l));
        process.exitCode = allPass ? 0 : 1;
    } catch (err) {
        console.error(`[validate-schema] ERROR: ${err.message}`);
        console.error(err.stack);
        process.exitCode = 1;
    } finally {
        await client.end();
    }
}

if (require.main === module) {
    main().catch((err) => {
        console.error('[validate-schema] unexpected error:', err);
        process.exit(1);
    });
}

module.exports = { getCounts, EXPECTED };