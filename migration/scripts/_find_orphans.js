'use strict';
const path = require('path');
process.env.NODE_PATH = path.resolve(__dirname, '..', '..', 'horse-racing-backend', 'node_modules');
require('module').Module._initPaths();
require('dotenv').config({ path: path.resolve(__dirname, '..', '..', 'horse-racing-backend', '.env') });
const { sequelize } = require('../../horse-racing-backend/models/sequelize');

(async () => {
    const [orphans] = await sequelize.query(`
        SELECT ja.id, ja.race_id
        FROM jockey_assignments ja
        WHERE NOT EXISTS (SELECT 1 FROM races r WHERE r.id = ja.race_id);
    `);
    console.log('--- orphaned jockey_assignments (race_id not in races) ---');
    for (const r of orphans) console.log(`  ${r.id}  race_id=${r.race_id}`);

    const [missingRaces] = await sequelize.query(`
        SELECT race_id FROM jockey_assignments
        WHERE race_id NOT IN (SELECT id FROM races);
    `);
    console.log('\n--- distinct missing race_ids ---');
    for (const r of missingRaces) console.log(`  ${r.race_id}`);

    const [usersNoRole] = await sequelize.query(`
        SELECT u.id, u.full_name FROM users u
        WHERE NOT EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id = u.id);
    `);
    console.log('\n--- users without roles ---');
    for (const r of usersNoRole) console.log(`  ${r.id}  ${r.full_name}`);

    await sequelize.close();
})();