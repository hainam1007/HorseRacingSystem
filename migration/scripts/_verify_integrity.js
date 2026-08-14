'use strict';
// Spot-check relational integrity across tables
const path = require('path');
process.env.NODE_PATH = path.resolve(__dirname, '..', '..', 'horse-racing-backend', 'node_modules');
require('module').Module._initPaths();
require('dotenv').config({ path: path.resolve(__dirname, '..', '..', 'horse-racing-backend', '.env') });
const { sequelize } = require('../../horse-racing-backend/models/sequelize');

(async () => {
    console.log('--- FK integrity spot-checks ---');

    // 1. user_roles should match users and roles
    const [[{ orphaned_user_roles }]] = await sequelize.query(`
        SELECT COUNT(*)::int AS orphaned_user_roles FROM user_roles ur
        WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id = ur.user_id)
           OR NOT EXISTS (SELECT 1 FROM roles r WHERE r.id = ur.role_id);
    `);
    console.log(`  orphaned user_roles:    ${orphaned_user_roles}`);

    // 2. jockey_assignments → race, horse, owner, jockey
    const [[{ orphaned_ja }]] = await sequelize.query(`
        SELECT COUNT(*)::int AS orphaned_ja FROM jockey_assignments ja
        WHERE NOT EXISTS (SELECT 1 FROM races r WHERE r.id = ja.race_id)
           OR NOT EXISTS (SELECT 1 FROM horses h WHERE h.id = ja.horse_id)
           OR NOT EXISTS (SELECT 1 FROM horse_owners ho WHERE ho.id = ja.owner_id)
           OR NOT EXISTS (SELECT 1 FROM jockeys j WHERE j.id = ja.jockey_id);
    `);
    console.log(`  orphaned jockey_assignments: ${orphaned_ja}`);

    // 3. races → tournament, round
    const [[{ orphaned_races }]] = await sequelize.query(`
        SELECT COUNT(*)::int AS orphaned_races FROM races
        WHERE NOT EXISTS (SELECT 1 FROM tournaments t WHERE t.id = tournament_id)
           OR NOT EXISTS (SELECT 1 FROM rounds r WHERE r.id = round_id);
    `);
    console.log(`  orphaned races:         ${orphaned_races}`);

    // 4. prize_awards → prize, race_result, horse
    const [[{ orphaned_pa }]] = await sequelize.query(`
        SELECT COUNT(*)::int AS orphaned_pa FROM prize_awards pa
        WHERE NOT EXISTS (SELECT 1 FROM prizes p WHERE p.id = pa.prize_id)
           OR NOT EXISTS (SELECT 1 FROM race_results rr WHERE rr.id = pa.race_result_id)
           OR NOT EXISTS (SELECT 1 FROM horses h WHERE h.id = pa.horse_id);
    `);
    console.log(`  orphaned prize_awards:  ${orphaned_pa}`);

    // 5. Sample UUID derivation consistency: each tournament should have races, each horse in jockey_assignments
    const [[{ t_with_races }]] = await sequelize.query(`
        SELECT COUNT(DISTINCT tournament_id)::int AS t_with_races FROM races;
    `);
    const [[{ total_t }]] = await sequelize.query(`SELECT COUNT(*)::int AS total_t FROM tournaments;`);
    console.log(`  tournaments with races: ${t_with_races} / ${total_t}`);

    // 6. sample joins
    const [rows] = await sequelize.query(`
        SELECT u.full_name AS user, r.role_name AS role
        FROM user_roles ur
        JOIN users u ON u.id = ur.user_id
        JOIN roles r ON r.id = ur.role_id
        ORDER BY u.full_name LIMIT 5;
    `);
    console.log('\n--- Sample: users and their roles ---');
    for (const r of rows) console.log(`  ${r.user.padEnd(25, ' ')} -> ${r.role}`);

    const [jrows] = await sequelize.query(`
        SELECT ja.id, ra.name AS race, ho.name AS horse, j.full_name AS jockey
        FROM jockey_assignments ja
        JOIN races ra ON ra.id = ja.race_id
        JOIN horses ho ON ho.id = ja.horse_id
        JOIN jockeys j ON j.id = ja.jockey_id
        LIMIT 3;
    `);
    console.log('\n--- Sample: jockey assignments (joins) ---');
    for (const r of jrows) console.log(`  ${r.id.slice(0, 8)}.. race=${r.race} horse=${r.horse} jockey=${r.jockey}`);

    await sequelize.close();
})().catch(err => { console.error(err.message); process.exit(1); });