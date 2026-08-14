'use strict';
// Debug races batch insert
const path = require('path');
process.env.NODE_PATH = path.resolve(__dirname, '..', '..', 'horse-racing-backend', 'node_modules');
require('module').Module._initPaths();
require('dotenv').config({ path: path.resolve(__dirname, '..', '..', 'horse-racing-backend', '.env') });
const { loadSequelizeModels } = require('../../horse-racing-backend/models/sequelize');
const fs = require('fs');

(async () => {
    const { sequelize, models } = loadSequelizeModels();
    const rows = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'export', 'normalized', 'races.json'), 'utf8'));
    for (const row of rows) {
        for (const k of Object.keys(row)) {
            if (row[k] && typeof row[k] === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(row[k])) {
                row[k] = new Date(row[k]);
            }
        }
    }
    try {
        const result = await models.races.bulkCreate(rows, { validate: false, returning: false });
        console.log('insert OK:', result.length);
        await models.races.destroy({ where: {}, truncate: true, cascade: true });
    } catch (e) {
        console.log('FAIL:', e.message);
        if (e.errors) {
            for (const err of e.errors) {
                console.log('  →', err.message, '|', err.path, '|', err.value);
            }
        }
        // Check which row failed
        for (let i = 0; i < rows.length; i++) {
            try {
                await models.races.create(rows[i]);
            } catch (e2) {
                console.log(`row ${i} (${rows[i].name}) FAIL:`, e2.message);
                if (e2.errors) {
                    for (const err of e2.errors) {
                        console.log('  →', err.message, '|', err.path, '|', err.value);
                    }
                }
            }
        }
    }
    await sequelize.close();
})();