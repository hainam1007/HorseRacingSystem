'use strict';
// Phase 11 verification — sample queries across the data graph
const path = require('path');
process.env.NODE_PATH = path.resolve(__dirname, '..', '..', 'horse-racing-backend', 'node_modules');
require('module').Module._initPaths();
require('dotenv').config({ path: path.resolve(__dirname, '..', '..', 'horse-racing-backend', '.env') });
const { sequelize } = require('../../horse-racing-backend/models/sequelize');

(async () => {
    const TABLES = [
        'roles', 'users', 'tournaments', 'user_roles', 'horse_owners',
        'jockeys', 'race_referees', 'rounds', 'wallets', 'reward_items',
        'deposit_packages', 'horses', 'registrations', 'horse_checks',
        'horse_rating_history', 'deposit_requests', 'role_applications',
        'transaction_histories', 'races', 'jockey_assignments',
        'race_engine_runs', 'race_odds_markets', 'race_runs', 'race_results',
        'prizes', 'referee_reports', 'race_prize_distribution_items',
        'race_odds_market_odds', 'race_run_participants', 'race_run_finish_orders',
        'jockey_assignment_meetings', 'jockey_assignment_terms',
        'jockey_assignment_contracts', 'violations', 'prize_awards',
        'violation_penalties'
    ];
    console.log('--- Postgres row counts after Phase 11 import ---');
    let total = 0;
    for (const t of TABLES) {
        const [[{ count }]] = await sequelize.query(`SELECT COUNT(*)::int AS count FROM "${t}";`);
        total += count;
        console.log(`  ${t.padEnd(45, ' ')} ${String(count).padStart(5, ' ')} rows`);
    }
    console.log(`\nTotal: ${total} rows`);
    await sequelize.close();
})().catch(err => { console.error(err.message); process.exit(1); });