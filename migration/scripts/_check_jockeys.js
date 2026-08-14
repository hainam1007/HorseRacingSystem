'use strict';
const path = require('path');
process.env.NODE_PATH = path.resolve(__dirname, '..', '..', 'horse-racing-backend', 'node_modules');
require('module').Module._initPaths();
require('dotenv').config({ path: path.resolve(__dirname, '..', '..', 'horse-racing-backend', '.env') });
const { sequelize } = require('../../horse-racing-backend/models/sequelize');

(async () => {
    const [cols] = await sequelize.query(`
        SELECT column_name AS "column_name", data_type AS "data_type"
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'jockeys'
        ORDER BY ordinal_position;
    `);
    for (const c of cols) console.log(`  ${c.column_name.padEnd(30, ' ')} ${c.data_type}`);
    await sequelize.close();
})();