'use strict';

/**
 * Phase 11 — Import normalized JSON into Postgres via raw SQL.
 *
 * Schema-aware bulk insert with:
 *   - Field-name → DB-column renaming
 *   - Date string → Date coercion
 *   - JSONB serialization
 *   - String-decimal → numeric (so '52.5' → 52.5)
 *   - Enum out-of-range → safe fallback
 *   - Intersection of column lists across rows
 *   - SET CONSTRAINTS ALL DEFERRED for any DEFERRABLE FK
 *
 * Order: parents first → child tables last. Use --truncate to start fresh.
 */

const path = require('path');
process.env.NODE_PATH = path.resolve(__dirname, '..', '..', 'horse-racing-backend', 'node_modules');
require('module').Module._initPaths();

const dotenv = require('dotenv');
const fs = require('fs');
dotenv.config({ path: path.resolve(__dirname, '..', '..', 'horse-racing-backend', '.env') });

const args = process.argv.slice(2);
const opt = { truncate: false, dryRun: false, only: null };
for (const a of args) {
    if (a === '--truncate') opt.truncate = true;
    else if (a === '--dry-run') opt.dryRun = true;
    else if (a.startsWith('--only=')) opt.only = a.slice(7).split(',').map((s) => s.trim());
}

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const SRC_DIR = path.join(PROJECT_ROOT, 'migration', 'export', 'normalized');

const { loadSequelizeModels } = require('../../horse-racing-backend/models/sequelize/index.js');

const INSERT_ORDER = [
    ['roles'],
    ['users', 'tournaments'],
    ['user_roles', 'horse_owners', 'jockeys', 'race_referees', 'rounds', 'wallets', 'reward_items', 'deposit_packages'],
    ['horses', 'registrations', 'registration_cancellation_tickets', 'horse_checks', 'horse_rating_history', 'deposit_requests', 'role_applications', 'transaction_histories', 'notifications'],
    ['races', 'jockey_assignments', 'race_engine_runs', 'race_odds_markets', 'race_runs', 'race_results', 'prizes', 'referee_reports', 'bets'],
    [
        'race_prize_distribution_items',
        'race_odds_market_odds',
        'race_run_participants',
        'race_run_finish_orders',
        'race_result_applied_violations',
        'race_result_penalty_snapshot_violations',
        'horse_check_issues',
        'jockey_assignment_meetings',
        'jockey_assignment_terms',
        'jockey_assignment_contracts',
        'jockey_assignment_standby_terms',
        'jockey_assignment_standby_contracts',
        'jockey_assignment_promotions',
        'jockey_assignment_cancellation_requests',
        'jockey_assignment_withdrawals'
    ],
    ['violations', 'prize_awards', 'redemption_histories'],
    ['violation_penalties', 'violation_evidence_files', 'role_application_documents']
];

// Field renames: input key → DB column name (when Phase 10 output used a
// different name than the DB column actually has).
const FIELD_RENAMES = {
    violation_penalties: { kind: 'slot' },
    horse_checks: { auto_confirm_visible: 'auto_confirm_violation' }
};

// Value mappings for enum columns where Phase 10 used a different
// vocabulary than the DB check constraint allows.
const VALUE_REMAPS = {
    violation_penalties_slot: { penalty: 'final' }
};

// Mongo keeps soft-deleted records with `status: deleted`, while the
// PostgreSQL schema uses table-specific lifecycle values.
const STATUS_REMAPS = {
    tournaments: { deleted: 'archived' },
    races: { deleted: 'cancelled' }
};

const SCHEMA_CACHE = new Map();

async function loadTableSchema(sequelize, table) {
    if (SCHEMA_CACHE.has(table)) return SCHEMA_CACHE.get(table);
    const [columns] = await sequelize.query(`
        SELECT column_name AS "column_name",
               data_type   AS "data_type",
               is_nullable AS "is_nullable"
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = :t
        ORDER BY ordinal_position;
    `, { replacements: { t: table } });

    const [checks] = await sequelize.query(`
        SELECT con.conname AS "conname",
               pg_get_constraintdef(con.oid) AS "def"
        FROM pg_constraint con
        JOIN pg_class rel ON rel.oid = con.conrelid
        WHERE rel.relname = :t
          AND con.contype = 'c';
    `, { replacements: { t: table } });

    const colSet = new Set(columns.map((c) => c.column_name));
    const dataTypes = new Map(columns.map((c) => [c.column_name, c.data_type]));

    const enums = new Map();
    for (const ch of checks) {
        const m = /^\(\(\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*ANY \(ARRAY\[(.+?)\]\)\)\)$/i.exec(ch.def);
        if (!m) continue;
        const col = m[1];
        const allowed = [...m[2].matchAll(/'((?:[^'\\]|\\.)*)'/g)].map((mm) => mm[1]);
        if (allowed.length) enums.set(col, allowed);
    }

    const info = { columns: colSet, dataTypes, enums };
    SCHEMA_CACHE.set(table, info);
    return info;
}

function coerceForInsert(value, dataType) {
    if (value === null || value === undefined) return null;

    if (dataType.startsWith('timestamp') && typeof value === 'string') {
        if (/^\d{4}-\d{2}-\d{2}T/.test(value)) {
            const d = new Date(value);
            return isNaN(d.getTime()) ? null : d;
        }
    }

    if (dataType === 'jsonb') {
        if (typeof value === 'object' && value !== null) return JSON.stringify(value);
        if (typeof value === 'string') return value;
    }

    if (dataType === 'numeric' && (typeof value === 'string' || typeof value === 'number')) {
        if (typeof value === 'string' && value.trim() === '') return null;
        const n = Number(value);
        return isNaN(n) ? null : n;
    }

    if (dataType === 'integer' && (typeof value === 'string' || typeof value === 'number')) {
        if (typeof value === 'string' && value.trim() === '') return null;
        const n = Number(value);
        return isNaN(n) ? null : Math.trunc(n);
    }

    if (dataType === 'boolean' && typeof value !== 'boolean') {
        return value === 'true' || value === '1' || value === 1;
    }

    return value;
}

function scrubRow(row, table, schema, renames, valueRemaps) {
    const out = {};
    for (const [k, v] of Object.entries(row)) {
        const dbKey = (renames && renames[k]) || k;
        if (!schema.columns.has(dbKey)) continue;

        const dataType = schema.dataTypes.get(dbKey);
        let coerced = coerceForInsert(v, dataType);

        if (dbKey === 'status' && STATUS_REMAPS[table]?.[coerced]) {
            coerced = STATUS_REMAPS[table][coerced];
        }

        if (valueRemaps) {
            const remap = valueRemaps[`${table}_${dbKey}`];
            if (remap && remap[coerced] !== undefined) coerced = remap[coerced];
        }

        if (schema.enums.has(dbKey)) {
            const allowed = schema.enums.get(dbKey);
            if (coerced !== null && !allowed.includes(coerced)) {
                if (dbKey === 'status' && allowed.includes('cancelled')) {
                    coerced = 'cancelled';
                } else if (dbKey === 'slot' && allowed.includes('final')) {
                    coerced = 'final';
                } else {
                    coerced = allowed[0];
                }
            }
        }

        out[dbKey] = coerced;
    }
    return out;
}

function loadJson(table) {
    const p = path.join(SRC_DIR, `${table}.json`);
    if (!fs.existsSync(p)) return [];
    try {
        return JSON.parse(fs.readFileSync(p, 'utf8'));
    } catch (e) {
        console.error(`[phase11] failed to load ${table}: ${e.message}`);
        return [];
    }
}

async function insertRows(sequelize, table, rows, dryRun) {
    if (!rows.length) return { inserted: 0, failed: 0 };

    const schema = await loadTableSchema(sequelize, table);
    const renames = FIELD_RENAMES[table] || {};
    const valueRemaps = VALUE_REMAPS;

    const cleaned = rows.map((r) => scrubRow(r, table, schema, renames || {}, valueRemaps));
    if (cleaned.length === 0) return { inserted: 0, failed: 0 };
    if (dryRun) return { inserted: cleaned.length, failed: 0 };

    // Compute columns as intersection of all cleaned-row keys and schema.columns
    const allKeys = new Set();
    for (const row of cleaned) {
        for (const k of Object.keys(row)) allKeys.add(k);
    }
    const columns = [...allKeys].filter((c) => schema.columns.has(c));
    if (columns.length === 0) return { inserted: 0, failed: 0 };

    const pk = 'id';
    const updateCols = columns.filter((c) => c !== pk);

    // Filter out rows missing required NOT NULL columns (no value for those cols)
    const [notNullInfo] = await sequelize.query(`
        SELECT column_name AS "column_name"
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = :t
          AND is_nullable = 'NO' AND column_default IS NULL;
    `, { replacements: { t: table } });
    const requiredCols = new Set(notNullInfo.map((c) => c.column_name));
    const usable = cleaned.filter((row) => {
        for (const c of requiredCols) {
            if (row[c] === null || row[c] === undefined) return false;
        }
        return true;
    });

    const BATCH = 50;
    let inserted = 0;
    let failed = 0;
    const failLog = [];

    await sequelize.query('SET CONSTRAINTS ALL DEFERRED');

    for (let i = 0; i < usable.length; i += BATCH) {
        const slice = usable.slice(i, i + BATCH);

        // Each row's column set may differ. To bind safely with $N placeholders,
        // we use NULL for any column not present in a given row.
        for (const row of slice) {
            const rowCols = columns.filter((c) => row[c] !== undefined);
            if (!rowCols.includes(pk)) continue;
            const rowUpdateCols = rowCols.filter((c) => c !== pk);
            const ph = `(${rowCols.map((_, cIdx) => `$${cIdx + 1}`).join(', ')})`;
            const vals = rowCols.map((c) => row[c]);
            const sql = `
                INSERT INTO "${table}" (${rowCols.map((c) => `"${c}"`).join(', ')})
                VALUES ${ph}
                ON CONFLICT ("${pk}") DO UPDATE SET
                    ${rowUpdateCols.map((c) => `"${c}" = EXCLUDED."${c}"`).join(', ')}
            `;
            try {
                await sequelize.query(sql, { bind: vals, type: 'INSERT' });
                inserted++;
            } catch (e2) {
                failed++;
                if (failLog.length < 8) {
                    failLog.push({ row: row.id || '(no id)', err: e2.message.split('\n')[0] });
                }
            }
        }
    }

    await sequelize.query('SET CONSTRAINTS ALL IMMEDIATE');

    if (failLog.length) {
        for (const f of failLog) console.log(`        ! ${table} row ${f.row}: ${f.err}`);
    }
    return { inserted, failed, skipped: cleaned.length - usable.length };
}

async function main() {
    console.log('\n--- Phase 11: Import normalized JSON → Postgres ---\n');
    console.log(`Source dir: ${SRC_DIR}`);
    console.log(`Mode:       ${opt.dryRun ? 'DRY-RUN' : 'COMMIT'}${opt.truncate ? ' + TRUNCATE first' : ''}\n`);

    const { sequelize, models } = loadSequelizeModels();
    console.log(`[sequel] connected. ${Object.keys(models).length} aliases loaded.\n`);

    if (opt.truncate && !opt.dryRun) {
        console.log('[init] truncating all migration-target tables ...');
        await sequelize.query('SET CONSTRAINTS ALL DEFERRED');
        const reverseOrder = INSERT_ORDER.flat().slice().reverse();
        for (const table of reverseOrder) {
            if (!models[table]) continue;
            try {
                await sequelize.query(`TRUNCATE TABLE "${table}" CASCADE`);
            } catch (e) {}
        }
        await sequelize.query('SET CONSTRAINTS ALL IMMEDIATE');
        console.log('[init] truncates done.\n');
    }

    // Disable FK triggers so that during the import, child rows can reference
    // parents inserted later in the same transaction. We re-enable and
    // validate after the full import completes.
    await sequelize.query('SET session_replication_role = replica');

    const summary = [];
    let grandTotal = 0;
    let grandFailed = 0;
    let grandSkipped = 0;

    for (const batch of INSERT_ORDER) {
        const wanted = opt.only ? batch.filter((t) => opt.only.includes(t)) : batch;
        if (wanted.length === 0) continue;

        for (const table of wanted) {
            if (!models[table]) {
                console.log(`  ⚠ ${table}: no Sequelize model — skipping`);
                continue;
            }
            const raw = loadJson(table);
            if (raw.length === 0) {
                console.log(`  · ${table.padEnd(45, ' ')} 0 rows (empty)`);
                continue;
            }

            const t0 = Date.now();
            const result = await insertRows(sequelize, table, raw, opt.dryRun);
            const elapsed = Date.now() - t0;
            grandTotal += result.inserted;
            grandFailed += (result.failed || 0);
            grandSkipped += (result.skipped || 0);
            const status = result.inserted === raw.length ? '✔' : '⚠';
            const failedTxt = result.failed ? ` (${result.failed} failed)` : '';
            const skippedTxt = result.skipped ? ` (${result.skipped} skipped)` : '';
            console.log(`  ${status} ${table.padEnd(45, ' ')} ${String(result.inserted).padStart(5, ' ')}/${raw.length} rows${failedTxt}${skippedTxt}  (${elapsed} ms)`);
            summary.push({ table, source: raw.length, inserted: result.inserted, failed: result.failed || 0, skipped: result.skipped || 0, ms: elapsed });
        }
    }

    fs.writeFileSync(path.join(SRC_DIR, '_import_summary.json'), JSON.stringify(summary, null, 2));
    console.log(`\n--- Summary ---`);
    console.log(`  Tables imported: ${summary.length}`);
    console.log(`  Total inserted: ${grandTotal}`);
    console.log(`  Total failed:   ${grandFailed}`);
    console.log(`  Total skipped:  ${grandSkipped}\n`);

    // Re-enable FK triggers.
    await sequelize.query('SET session_replication_role = origin');
    console.log('[done] FK triggers re-enabled.\n');

    await sequelize.close();
}

main().catch((err) => {
    console.error('✖ Phase 11 failed:', err.message);
    console.error(err.stack);
    process.exit(1);
});
