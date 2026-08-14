'use strict';
// Debug single row insert with full error details
const path = require('path');
process.env.NODE_PATH = path.resolve(__dirname, '..', '..', 'horse-racing-backend', 'node_modules');
require('module').Module._initPaths();
require('dotenv').config({ path: path.resolve(__dirname, '..', '..', 'horse-racing-backend', '.env') });
const { loadSequelizeModels } = require('../../horse-racing-backend/models/sequelize');
const fs = require('fs');

(async () => {
    const { sequelize, models } = loadSequelizeModels();
    const tables = ['roles', 'users', 'tournaments', 'user_roles', 'horses', 'horse_checks', 'horse_rating_history', 'race_run_participants', 'race_run_finish_orders', 'violation_penalties'];
    for (const table of tables) {
        const rows = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'export', 'normalized', `${table}.json`), 'utf8'));
        if (rows.length === 0) continue;
        const r = rows[0];
        try {
            await models[table].create(r, { validate: false });
            console.log(`${table}: create OK on first try (id=${r.id})`);
            await models[table].destroy({ where: {}, truncate: true, cascade: true });
        } catch (e) {
            console.log(`\n${table}: create FAIL`);
            console.log('  message:', e.message);
            console.log('  name:', e.name);
            if (e.errors) {
                for (const err of e.errors) {
                    console.log(`  error: ${err.message} | path=${err.path} | type=${err.type} | value=${JSON.stringify(err.value)}`);
                }
            }
            console.log(`  raw row keys: ${Object.keys(r).join(', ')}`);
        }
    }
    await sequelize.close();
})();