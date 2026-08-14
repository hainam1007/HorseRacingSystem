'use strict';

/**
 * Phase 10 — MongoDB JSON → Postgres-ready normalized JSON.
 *
 * For each collection in `migration/export/*.json`:
 *   1. Map every ObjectId to UUID v5 (via uuid-mapper).
 *   2. Lift embedded sub-docs (e.g. meeting{}, terms{}) into child-table files.
 *   3. Lift arrays of primitives (e.g. default_gears[], gears[]) into child tables.
 *   4. Lift arrays of sub-docs (e.g. participants[], finish_order[]) into child tables.
 *   5. Lift arrays of ObjectId refs (e.g. applied_violation_ids[]) into child tables.
 *   6. Collapse 3 penalty sub-docs (suggested/proposed/penalty) into a single
 *      violation_penalties child table with a `kind` column.
 *   7. Drop Mongo-only fields (e.g. `__v`, `created_at`/`updated_at` if not needed).
 *   8. Drop `id` virtual (Mongoose mirror of `_id`).
 *   9. Drop empty arrays so the resulting row is clean.
 *  10. Convert all dates to ISO 8601 (already done by Phase 9 export, but defensive).
 *
 * Output: `migration/export/normalized/<table>.json` — one array per table.
 *
 * The transformer is collection-specific. Each transformer returns:
 *   {
 *     [targetTableName]: [normalizedRow1, normalizedRow2, ...],
 *     [targetTableName2]: [...],
 *     ...
 *   }
 */

const fs = require('fs');
const path = require('path');
const { mapObjectId, mapCompositeKey, isObjectId, isUuid, rewriteDocument } = require('./uuid-mapper');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const SRC_DIR = path.join(PROJECT_ROOT, 'migration', 'export');
const DST_DIR = path.join(PROJECT_ROOT, 'migration', 'export', 'normalized');

if (!fs.existsSync(DST_DIR)) fs.mkdirSync(DST_DIR, { recursive: true });

const out = {}; // { [tableName]: [...rows] }

function emit(table, row) {
    if (!out[table]) out[table] = [];
    out[table].push(row);
}

/**
 * Strip Mongo-only bookkeeping fields and remap ObjectIds in a value
 * without recursing into sub-doc `_id`s (those are handled by the
 * per-collection transformers).
 */
function remapRefsDeep(value) {
    if (value === null || value === undefined) return value;
    if (Array.isArray(value)) return value.map(remapRefsDeep);
    if (typeof value === 'object') {
        const out = {};
        for (const k of Object.keys(value)) {
            const v = value[k];
            if (typeof v === 'string' && isObjectId(v)) {
                out[k] = mapObjectId(v);
            } else if (typeof v === 'string' && isUuid(v)) {
                out[k] = v;
            } else {
                out[k] = remapRefsDeep(v);
            }
        }
        return out;
    }
    return value;
}

/**
 * Lift an embedded sub-doc (single object) into a child table.
 * Returns the inserted child row, or null if the embedded doc is absent.
 */
function liftSubDoc({ parentId, pathClassifier, embedded, targetTable, foreignKey, extraFields = {} }) {
    if (!embedded || typeof embedded !== 'object') return null;
    const newId = mapObjectId(parentId) + '/' + pathClassifier; // for uniqueness within child table
    // Compute child row: assign UUID id, link via FK to parent, lift all fields.
    const row = {
        id: mapObjectId(`${parentId}:${pathClassifier}:_id`),
        [foreignKey]: isUuid(parentId) ? parentId : mapObjectId(parentId),
        ...extraFields
    };
    for (const k of Object.keys(embedded)) {
        if (k === '_id') continue;
        const v = embedded[k];
        if (typeof v === 'string' && isObjectId(v)) {
            row[k] = mapObjectId(v);
        } else if (k === 'updated_by' || k === 'approved_by' || k === 'reviewed_by' || k === 'settled_by' || k === 'paid_by' || k === 'decided_by' || k === 'discipline_applied_by' || k === 'proposed_by' || k === 'entries_finalized_by' || k === 'entry_finalized_by' || k === 'generated_by' || k === 'manually_adjusted_by' || k === 'recorded_by' || k === 'confirmed_by' || k === 'published_by' || k === 'penalties_applied_by' || k === 'submitted_to_admin_by' || k === 'correction_requested_by' || k === 'correction_resolved_by' || k === 'refund_sent_by' || k === 'initiated_by' || k === 'responded_by' || k === 'reviewed_by' || k === 'rating_updated_by' || k === 'calculated_by' || k === 'created_by' || k === 'updated_by') {
            // FK -> users.id
            row[k] = mapObjectId(v);
        } else {
            row[k] = v;
        }
    }
    emit(targetTable, row);
    return row.id;
}

function toFk(value) {
    if (value === null || value === undefined) return null;
    if (isUuid(value)) return value;
    if (isObjectId(value)) return mapObjectId(value);
    return value;
}

function liftGearStringArray({ parentId, array, targetTable, foreignKey }) {
    if (!Array.isArray(array)) return;
    for (let i = 0; i < array.length; i++) {
        const code = array[i];
        if (typeof code !== 'string') continue;
        emit(targetTable, {
            id: mapCompositeKey(`${parentId}:${targetTable}:${i}:${code}`),
            [foreignKey]: toFk(parentId),
            gear_code: code
        });
    }
}

function liftSubDocArray({ parentId, array, targetTable, foreignKey, fieldMap = {} }) {
    if (!Array.isArray(array)) return;
    const fk = toFk(parentId);
    for (let i = 0; i < array.length; i++) {
        const sub = array[i];
        if (!sub || typeof sub !== 'object') continue;
        const row = {
            id: mapCompositeKey(`${parentId}:${targetTable}:${i}:_id`),
            [foreignKey]: fk
        };
        for (const [srcKey, dstKey] of Object.entries(fieldMap)) {
            const v = sub[srcKey];
            if (typeof v === 'string' && isObjectId(v)) row[dstKey] = mapObjectId(v);
            else if (v !== undefined) row[dstKey] = v;
        }
        // Include any unmapped keys so we don't drop data
        for (const k of Object.keys(sub)) {
            if (k === '_id') continue;
            if (fieldMap[k] || row[k] !== undefined) continue;
            const v = sub[k];
            if (typeof v === 'string' && isObjectId(v)) row[k] = mapObjectId(v);
            else row[k] = v;
        }
        emit(targetTable, row);
    }
}

function liftObjectIdArray({ parentId, array, targetTable, foreignKey, parentForeignKey }) {
    if (!Array.isArray(array)) return;
    const fk = toFk(parentId);
    for (let i = 0; i < array.length; i++) {
        const oid = array[i];
        if (typeof oid !== 'string' || !isObjectId(oid)) continue;
        emit(targetTable, {
            id: mapCompositeKey(`${parentId}:${targetTable}:${i}:${oid}`),
            [parentForeignKey]: fk,
            [foreignKey]: mapObjectId(oid)
        });
    }
}

function liftPenalty({ parentId, embedded, kind }) {
    if (!embedded || typeof embedded !== 'object') return;
    const row = {
        id: mapCompositeKey(`${parentId}:violation_penalties:${kind}`),
        violation_id: toFk(parentId),
        kind
    };
    for (const k of Object.keys(embedded)) {
        const v = embedded[k];
        if (v !== undefined) row[k] = v;
    }
    emit('violation_penalties', row);
}

// ─────────────────────────────────────────────────────────────────────────────
// Collection transformers
// ─────────────────────────────────────────────────────────────────────────────

function transformUsers(docs) {
    for (const doc of docs) {
        const r = rewriteDocument(doc);
        const { _id, __v, id, ...rest } = r;
        emit('users', { id: _id, ...rest });
    }
}

function transformRoles(docs) {
    for (const doc of docs) {
        const r = rewriteDocument(doc);
        const { _id, __v, id, ...rest } = r;
        emit('roles', { id: _id, ...rest });
    }
}

function transformUserRoles(docs) {
    for (const doc of docs) {
        const r = rewriteDocument(doc);
        const { _id, __v, id, ...rest } = r;
        emit('user_roles', { id: _id, ...rest });
    }
}

function transformHorseOwners(docs) {
    for (const doc of docs) {
        const r = rewriteDocument(doc);
        const { _id, __v, id, ...rest } = r;
        emit('horse_owners', { id: _id, ...rest });
    }
}

function transformJockeys(docs) {
    for (const doc of docs) {
        const r = rewriteDocument(doc);
        const { _id, __v, id, ...rest } = r;
        emit('jockeys', { id: _id, ...rest });
    }
}

function transformRaceReferees(docs) {
    for (const doc of docs) {
        const r = rewriteDocument(doc);
        const { _id, __v, id, ...rest } = r;
        emit('race_referees', { id: _id, ...rest });
    }
}

function transformWallets(docs) {
    for (const doc of docs) {
        const r = rewriteDocument(doc);
        const { _id, __v, id, ...rest } = r;
        emit('wallets', { id: _id, ...rest });
    }
}

function transformNotifications(docs) {
    for (const doc of docs) {
        const r = rewriteDocument(doc);
        const { _id, __v, id, ...rest } = r;
        emit('notifications', { id: _id, ...rest });
    }
}

function transformRewardItems(docs) {
    for (const doc of docs) {
        const r = rewriteDocument(doc);
        const { _id, __v, id, ...rest } = r;
        emit('reward_items', { id: _id, ...rest });
    }
}

function transformTournaments(docs) {
    for (const doc of docs) {
        const r = rewriteDocument(doc);
        const { _id, __v, id, ...rest } = r;
        emit('tournaments', { id: _id, ...rest });
    }
}

function transformRounds(docs) {
    for (const doc of docs) {
        const r = rewriteDocument(doc);
        const { _id, __v, id, ...rest } = r;
        emit('rounds', { id: _id, ...rest });
    }
}

function transformRaces(docs) {
    for (const doc of docs) {
        const r = rewriteDocument(doc);
        const { _id, prize_distribution, ...rest } = r;
        emit('races', { id: _id, ...rest });

        // Lift prize_distribution[] into race_prize_distribution_items
        if (Array.isArray(prize_distribution)) {
            for (let i = 0; i < prize_distribution.length; i++) {
                const item = prize_distribution[i];
                if (!item || typeof item !== 'object') continue;
                emit('race_prize_distribution_items', {
                    id: mapCompositeKey(`${_id}:race_prize_distribution_items:${i}`),
                    race_id: _id,
                    position: item.position ?? null,
                    percent: item.percent ?? null,
                    amount: item.amount ?? null,
                    label: item.label ?? null
                });
            }
        }
    }
}

function transformHorses(docs) {
    for (const doc of docs) {
        const r = rewriteDocument(doc);
        // Keep `default_gears` as a TEXT[] inside the parent row (Postgres-side design
        // from Phase 3 keeps string array inline rather than lifting to a child table).
        const { _id, ...rest } = r;
        emit('horses', { id: _id, ...rest });
    }
}

function transformHorseChecks(docs) {
    for (const doc of docs) {
        const r = rewriteDocument(doc);
        const { _id, issues, ...rest } = r;
        emit('horse_checks', { id: _id, ...rest });
        if (Array.isArray(issues)) {
            for (let i = 0; i < issues.length; i++) {
                const issue = issues[i];
                if (!issue) continue;
                emit('horse_check_issues', {
                    id: mapCompositeKey(`${_id}:horse_check_issues:${i}`),
                    horse_check_id: _id,
                    code: issue.code ?? null,
                    severity: issue.severity ?? null,
                    note: issue.note ?? null
                });
            }
        }
    }
}

function transformHorseRatingHistory(docs) {
    for (const doc of docs) {
        const r = rewriteDocument(doc);
        const { _id, __v, id, ...rest } = r;
        emit('horse_rating_history', { id: _id, ...rest });
    }
}

function transformRegistrations(docs) {
    for (const doc of docs) {
        const r = rewriteDocument(doc);
        // Keep `gears` as a TEXT[] inside the parent row (same rationale as horses.default_gears).
        const { _id, gears, ...rest } = r;
        emit('registrations', { id: _id, ...rest, gears: gears || [] });
    }
}

function transformRegistrationCancellationTickets(docs) {
    for (const doc of docs) {
        const r = rewriteDocument(doc);
        const { _id, __v, id, ...rest } = r;
        emit('registration_cancellation_tickets', { id: _id, ...rest });
    }
}

function transformJockeyAssignments(docs) {
    for (const doc of docs) {
        const r = rewriteDocument(doc);
        const { _id, meeting, terms, contract, ...rest } = r;
        emit('jockey_assignments', { id: _id, ...rest });

        if (meeting) {
            const row = { id: mapCompositeKey(`${_id}:meeting:_id`), assignment_id: _id };
            for (const k of Object.keys(meeting)) {
                if (k === '_id') continue;
                const v = meeting[k];
                if (typeof v === 'string' && isObjectId(v)) row[k] = mapObjectId(v);
                else row[k] = v;
            }
            emit('jockey_assignment_meetings', row);
        }

        if (terms) {
            const row = { id: mapCompositeKey(`${_id}:terms:_id`), assignment_id: _id };
            for (const k of Object.keys(terms)) {
                if (k === '_id') continue;
                const v = terms[k];
                if (typeof v === 'string' && isObjectId(v)) row[k] = mapObjectId(v);
                else row[k] = v;
            }
            emit('jockey_assignment_terms', row);
        }

        if (contract) {
            const row = { id: mapCompositeKey(`${_id}:contract:_id`), assignment_id: _id };
            for (const k of Object.keys(contract)) {
                if (k === '_id') continue;
                const v = contract[k];
                if (typeof v === 'string' && isObjectId(v)) row[k] = mapObjectId(v);
                else row[k] = v;
            }
            emit('jockey_assignment_contracts', row);
        }
    }
}

function transformPrizes(docs) {
    for (const doc of docs) {
        const r = rewriteDocument(doc);
        const { _id, __v, id, ...rest } = r;
        emit('prizes', { id: _id, ...rest });
    }
}

function transformPrizeAwards(docs) {
    for (const doc of docs) {
        const r = rewriteDocument(doc);
        const { _id, __v, id, ...rest } = r;
        emit('prize_awards', { id: _id, ...rest });
    }
}

function transformBets(docs) {
    for (const doc of docs) {
        const r = rewriteDocument(doc);
        const { _id, __v, id, ...rest } = r;
        emit('bets', { id: _id, ...rest });
    }
}

function transformRefereeReports(docs) {
    for (const doc of docs) {
        const r = rewriteDocument(doc);
        const { _id, __v, id, ...rest } = r;
        emit('referee_reports', { id: _id, ...rest });
    }
}

function transformRaceResults(docs) {
    for (const doc of docs) {
        const r = rewriteDocument(doc);
        const { _id, applied_violation_ids, penalty_snapshot_violation_ids, ...rest } = r;
        emit('race_results', { id: _id, ...rest });

        liftObjectIdArray({
            parentId: _id,
            array: applied_violation_ids,
            targetTable: 'race_result_applied_violations',
            foreignKey: 'violation_id',
            parentForeignKey: 'race_result_id'
        });
        liftObjectIdArray({
            parentId: _id,
            array: penalty_snapshot_violation_ids,
            targetTable: 'race_result_penalty_snapshot_violations',
            foreignKey: 'violation_id',
            parentForeignKey: 'race_result_id'
        });
    }
}

function transformRaceEngineRuns(docs) {
    for (const doc of docs) {
        const r = rewriteDocument(doc);
        const { _id, __v, id, ...rest } = r;
        emit('race_engine_runs', { id: _id, ...rest });
    }
}

function transformRaceRuns(docs) {
    for (const doc of docs) {
        const r = rewriteDocument(doc);
        const { _id, participants, finish_order, ...rest } = r;
        emit('race_runs', { id: _id, ...rest });

        if (Array.isArray(participants)) {
            for (let i = 0; i < participants.length; i++) {
                const p = participants[i];
                if (!p) continue;
                emit('race_run_participants', {
                    id: mapCompositeKey(`${_id}:race_run_participants:${i}`),
                    race_run_id: _id,
                    horse_id: toFk(p.horse_id),
                    jockey_id: toFk(p.jockey_id),
                    assignment_id: toFk(p.assignment_id),
                    lane: p.lane ?? null,
                    seed_position: p.seed_position ?? null
                });
            }
        }

        if (Array.isArray(finish_order)) {
            for (let i = 0; i < finish_order.length; i++) {
                const f = finish_order[i];
                if (!f) continue;
                emit('race_run_finish_orders', {
                    id: mapCompositeKey(`${_id}:race_run_finish_orders:${i}`),
                    race_run_id: _id,
                    horse_id: toFk(f.horse_id),
                    jockey_id: toFk(f.jockey_id),
                    position: f.position ?? null,
                    finish_time: f.finish_time ?? null,
                    score: f.score ?? null
                });
            }
        }
    }
}

function transformRaceOddsMarkets(docs) {
    for (const doc of docs) {
        const r = rewriteDocument(doc);
        const { _id, odds, ...rest } = r;
        emit('race_odds_markets', { id: _id, ...rest });

        if (Array.isArray(odds)) {
            for (let i = 0; i < odds.length; i++) {
                const o = odds[i];
                if (!o) continue;
                emit('race_odds_market_odds', {
                    id: mapCompositeKey(`${_id}:race_odds_market_odds:${i}`),
                    odds_market_id: _id,
                    horse_id: toFk(o.horse_id),
                    jockey_id: toFk(o.jockey_id),
                    horse_no: o.horse_no ?? null,
                    horse_name: o.horse_name ?? null,
                    jockey_name: o.jockey_name ?? null,
                    win_probability: o.win_probability ?? null,
                    fair_odds: o.fair_odds ?? null,
                    game_odds: o.game_odds ?? null,
                    generated_game_odds: o.generated_game_odds ?? null,
                    probability_rank: o.probability_rank ?? null,
                    fallbacks_used: Array.isArray(o.fallbacks_used) ? o.fallbacks_used : null
                });
            }
        }
    }
}

function transformViolations(docs) {
    for (const doc of docs) {
        const r = rewriteDocument(doc);
        const { _id, suggested_penalty, proposed_penalty, penalty, evidence_files, ...rest } = r;
        emit('violations', { id: _id, ...rest });

        liftPenalty({ parentId: _id, embedded: suggested_penalty, kind: 'suggested' });
        liftPenalty({ parentId: _id, embedded: proposed_penalty, kind: 'proposed' });
        liftPenalty({ parentId: _id, embedded: penalty, kind: 'penalty' });

        if (Array.isArray(evidence_files)) {
            for (let i = 0; i < evidence_files.length; i++) {
                const f = evidence_files[i];
                if (!f) continue;
                emit('violation_evidence_files', {
                    id: mapCompositeKey(`${_id}:violation_evidence_files:${i}`),
                    violation_id: _id,
                    url: f.url ?? null,
                    public_id: f.public_id ?? null,
                    file_type: f.file_type ?? null,
                    file_name: f.file_name ?? null
                });
            }
        }
    }
}

function transformTransactionHistories(docs) {
    for (const doc of docs) {
        const r = rewriteDocument(doc);
        const { _id, __v, id, ...rest } = r;
        emit('transaction_histories', { id: _id, ...rest });
    }
}

function transformRedemptionHistories(docs) {
    for (const doc of docs) {
        const r = rewriteDocument(doc);
        const { _id, __v, id, ...rest } = r;
        emit('redemption_histories', { id: _id, ...rest });
    }
}

function transformDepositPackages(docs) {
    for (const doc of docs) {
        const r = rewriteDocument(doc);
        const { _id, __v, id, ...rest } = r;
        emit('deposit_packages', { id: _id, ...rest });
    }
}

function transformDepositRequests(docs) {
    for (const doc of docs) {
        const r = rewriteDocument(doc);
        const { _id, __v, id, ...rest } = r;
        emit('deposit_requests', { id: _id, ...rest });
    }
}

function transformRoleApplications(docs) {
    for (const doc of docs) {
        const r = rewriteDocument(doc);
        const { _id, documents, ...rest } = r;
        emit('role_applications', { id: _id, ...rest });

        if (Array.isArray(documents)) {
            for (let i = 0; i < documents.length; i++) {
                const d = documents[i];
                if (!d) continue;
                emit('role_application_documents', {
                    id: mapCompositeKey(`${_id}:role_application_documents:${i}`),
                    role_application_id: _id,
                    type: d.type ?? null,
                    url: d.url ?? null,
                    public_id: d.public_id ?? null,
                    note: d.note ?? null
                });
            }
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Dispatcher
// ─────────────────────────────────────────────────────────────────────────────

const TRANSFORMERS = {
    users: transformUsers,
    roles: transformRoles,
    user_roles: transformUserRoles,
    horse_owners: transformHorseOwners,
    jockeys: transformJockeys,
    race_referees: transformRaceReferees,
    wallets: transformWallets,
    notifications: transformNotifications,
    reward_items: transformRewardItems,
    tournaments: transformTournaments,
    rounds: transformRounds,
    races: transformRaces,
    horses: transformHorses,
    horse_checks: transformHorseChecks,
    horse_rating_history: transformHorseRatingHistory,
    registrations: transformRegistrations,
    registration_cancellation_tickets: transformRegistrationCancellationTickets,
    jockey_assignments: transformJockeyAssignments,
    prizes: transformPrizes,
    prize_awards: transformPrizeAwards,
    bets: transformBets,
    referee_reports: transformRefereeReports,
    race_results: transformRaceResults,
    race_engine_runs: transformRaceEngineRuns,
    race_runs: transformRaceRuns,
    race_odds_markets: transformRaceOddsMarkets,
    violations: transformViolations,
    transaction_histories: transformTransactionHistories,
    redemption_histories: transformRedemptionHistories,
    deposit_packages: transformDepositPackages,
    deposit_requests: transformDepositRequests,
    role_applications: transformRoleApplications
};

function loadCollection(name) {
    const p = path.join(SRC_DIR, `${name}.json`);
    if (!fs.existsSync(p)) return [];
    try {
        return JSON.parse(fs.readFileSync(p, 'utf8'));
    } catch (e) {
        console.error(`[phase10] failed to load ${name}: ${e.message}`);
        return [];
    }
}

function run() {
    console.log('\n--- Phase 10: Transform MongoDB → Postgres-ready JSON ---\n');
    const files = fs.readdirSync(SRC_DIR).filter(f => f.endsWith('.json') && f !== '_summary.json');
    let totalIn = 0;
    let totalOut = 0;

    for (const f of files) {
        const collection = f.replace(/\.json$/, '');
        const transformer = TRANSFORMERS[collection];
        if (!transformer) {
            console.log(`  ⚠ no transformer for ${collection}`);
            continue;
        }
        const docs = loadCollection(collection);
        totalIn += docs.length;
        transformer(docs);
    }

    // Write all out tables
    const writtenFiles = [];
    for (const table of Object.keys(out).sort()) {
        const rows = out[table];
        const p = path.join(DST_DIR, `${table}.json`);
        fs.writeFileSync(p, JSON.stringify(rows, null, 2), 'utf8');
        writtenFiles.push({ table, rows: rows.length, bytes: fs.statSync(p).size });
        totalOut += rows.length;
    }

    console.log('--- Output tables ---');
    for (const { table, rows, bytes } of writtenFiles) {
        console.log(`  ${table.padEnd(50, ' ')} ${String(rows).padStart(5, ' ')} rows  ${(bytes / 1024).toFixed(1).padStart(7, ' ')} KB`);
    }

    fs.writeFileSync(path.join(DST_DIR, '_summary.json'), JSON.stringify(writtenFiles, null, 2), 'utf8');

    console.log(`\n--- Summary ---`);
    console.log(`  Source collections: ${files.length}`);
    console.log(`  Source docs:        ${totalIn}`);
    console.log(`  Output tables:      ${writtenFiles.length}`);
    console.log(`  Output rows:        ${totalOut}\n`);
}

if (require.main === module) {
    run();
}

module.exports = { run, emit, out };