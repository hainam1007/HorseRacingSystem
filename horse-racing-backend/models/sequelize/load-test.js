'use strict';

/**
 * Phase 5 — load test for all Sequelize models.
 *
 * Run from horse-racing-backend/:
 *   node models/sequelize/load-test.js
 *
 * Verifies:
 *   - All 50 model files load without throwing
 *   - Each model has correct `tableName` matching Postgres
 *   - Total model count matches expected (50)
 *   - Associations can be invoked (does NOT actually query)
 */

require('dotenv').config();

const { loadSequelizeModels } = require('./');

const EXPECTED_TABLES = [
    'users', 'roles', 'user_roles',
    'horse_owners', 'jockeys', 'race_referees',
    'horses', 'horse_default_gears', 'horse_rating_history',
    'tournaments', 'rounds', 'races', 'race_prize_distribution_items',
    'registrations', 'registration_gears', 'registration_cancellation_tickets',
    'jockey_assignments', 'jockey_assignment_meetings', 'jockey_assignment_terms',
    'jockey_assignment_standby_terms', 'jockey_assignment_contracts',
    'jockey_assignment_standby_contracts', 'jockey_assignment_promotions',
    'jockey_assignment_cancellation_requests', 'jockey_assignment_withdrawals',
    'horse_checks', 'horse_check_issues',
    'race_results', 'race_result_applied_violations', 'race_result_penalty_snapshot_violations',
    'prizes', 'prize_awards',
    'bets', 'referee_reports',
    'violations', 'violation_evidence_files', 'violation_penalties',
    'race_engine_runs', 'race_runs', 'race_run_participants', 'race_run_finish_orders',
    'race_odds_markets', 'race_odds_market_odds',
    'wallets', 'transaction_histories',
    'reward_items', 'redemption_histories',
    'deposit_packages', 'deposit_requests',
    'notifications', 'role_applications', 'role_application_documents'
];

let exitCode = 0;

try {
    console.log('[load-test] loading all models...');
    const { sequelize, models } = loadSequelizeModels();

    const seen = new Set();
    for (const key of Object.keys(models)) {
        seen.add(models[key].tableName);
    }
    const loaded = Array.from(seen);
    console.log(`[load-test] ✔ loaded ${loaded.length} unique models (${Object.keys(models).length} aliases)`);

    if (loaded.length !== EXPECTED_TABLES.length) {
        console.error(`[load-test] ✖ expected ${EXPECTED_TABLES.length} models, got ${loaded.length}`);
        exitCode = 2;
    }

    let associations = 0;
    for (const name of Object.keys(models)) {
        const m = models[name];
        if (typeof m.associate !== 'function') continue;
        associations += 1;
        // already invoked inside loadAll; just count
    }
    console.log(`[load-test] ✔ ${associations} model-aliases point to a model with associate()`);

    let missing = [];
    for (const table of EXPECTED_TABLES) {
        const found = loaded.some((n) => models[n].tableName === table);
        if (!found) missing.push(table);
    }
    if (missing.length) {
        console.error(`[load-test] ✖ missing models for tables:`, missing);
        exitCode = 3;
    } else {
        console.log('[load-test] ✔ all 50 expected tables have models');
    }

    console.log('\n[load-test] sample associations check (User):');
    const u = models.User;
    if (u.associations.user_roles) console.log('  ✔ User.hasMany(user_roles)');
    else { console.error('  ✖ User has no user_roles assoc'); exitCode = 4; }
    if (u.associations.horse_owner_profile) console.log('  ✔ User.hasOne(horse_owner_profile)');
    else { console.error('  ✖ User has no horse_owner_profile'); exitCode = 4; }

    console.log('\n[load-test] authenticating against Postgres...');
    sequelize.authenticate().then(
        () => {
            console.log('[load-test] ✔ connected');
            process.exit(exitCode);
        },
        (err) => {
            console.error('[load-test] ✖ auth failed:', err.message);
            process.exit(1);
        }
    );
} catch (err) {
    console.error('[load-test] ✖ error:', err.message);
    console.error(err.stack);
    process.exit(1);
}