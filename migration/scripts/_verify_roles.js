'use strict';
// Verify roles were inserted into Postgres.
const path = require('path');
process.env.NODE_PATH = path.resolve(__dirname, '..', '..', 'horse-racing-backend', 'node_modules');
require('module').Module._initPaths();
require('dotenv').config({ path: path.resolve(__dirname, '..', '..', 'horse-racing-backend', '.env') });

const { sequelize } = require('../../horse-racing-backend/models/sequelize');

(async () => {
  const [rows] = await sequelize.query('SELECT id, role_name, description FROM roles ORDER BY role_name;');
  console.log(`Found ${rows.length} rows in roles table:`);
  for (const r of rows) {
    console.log(`  ${r.role_name.padEnd(20)} ${r.id}  ${r.description || ''}`);
  }
  await sequelize.close();
})().catch(err => {
  console.error(err.message);
  process.exit(1);
});