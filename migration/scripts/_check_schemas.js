'use strict';
// Inspect specific table schemas
const path = require('path');
process.env.NODE_PATH = path.resolve(__dirname, '..', '..', 'horse-racing-backend', 'node_modules');
require('module').Module._initPaths();
require('dotenv').config({ path: path.resolve(__dirname, '..', '..', 'horse-racing-backend', '.env') });
const { sequelize } = require('../../horse-racing-backend/models/sequelize');

(async () => {
    const TABLES = ['races', 'user_roles', 'horse_rating_history', 'race_run_participants', 'race_run_finish_orders', 'horse_checks', 'violation_penalties', 'horse_default_gears', 'registration_gears'];
    for (const t of TABLES) {
        const [cols] = await sequelize.query(`
            SELECT column_name AS "column_name", data_type AS "data_type", is_nullable AS "is_nullable"
            FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = '${t}'
            ORDER BY ordinal_position;
        `);
        console.log(`\n--- ${t} (${cols.length} columns) ---`);
        for (const c of cols) {
            console.log(`  ${c.column_name.padEnd(40, ' ')} ${c.data_type.padEnd(30, ' ')} ${c.is_nullable}`);
        }
        const [cons] = await sequelize.query(`
            SELECT conname AS "conname", pg_get_constraintdef(oid) AS "def"
            FROM pg_constraint
            WHERE conrelid = '${t}'::regclass
            ORDER BY contype, conname;
        `);
        if (cons.length) {
            console.log(`  constraints:`);
            for (const c of cons) {
                console.log(`    ${c.conname}: ${c.def}`);
            }
        }
    }
    await sequelize.close();
})().catch(err => { console.error(err.message); process.exit(1); });