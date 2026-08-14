'use strict';
// Inspect which tables exist and their columns
const path = require('path');
process.env.NODE_PATH = path.resolve(__dirname, '..', '..', 'horse-racing-backend', 'node_modules');
require('module').Module._initPaths();
require('dotenv').config({ path: path.resolve(__dirname, '..', '..', 'horse-racing-backend', '.env') });

const { sequelize } = require('../../horse-racing-backend/models/sequelize');

(async () => {
    const [tables] = await sequelize.query(`
        SELECT table_name AS "table_name" FROM information_schema.tables
        WHERE table_schema = 'public'
        ORDER BY table_name;
    `);
    console.log('--- tables in public schema ---');
    console.log(`count: ${tables.length}`);
    for (const t of tables) {
        console.log(`  ${t.table_name}`);
    }
    await sequelize.close();
})().catch(err => { console.error(err.message); process.exit(1); });