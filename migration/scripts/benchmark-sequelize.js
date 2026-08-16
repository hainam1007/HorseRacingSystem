'use strict';

/**
 * Phase 15 — Performance benchmarks.
 *
 * Measures p50/p95 latency for the most common query patterns the backend
 * will issue under load. Compares against an arbitrary 50ms budget per
 * query. We do NOT use formal benchmarking tooling here — instead, we
 * compute mean of N runs and report min/mean/max.
 *
 * Goal: confirm that with the existing indexes, the database can handle
 * the read patterns Phase 16+ controllers will issue, and identify any
 * pattern that is unexpectedly slow (likely missing index).
 *
 * Tests:
 *   1. `findByPk` (User lookup)
 *   2. `findOne` with `where` (Race by id + status filter)
 *   3. `findAll` with `where` (active horses, LIMIT 20)
 *   4. `findAll` with `include` (Race + registrations)
 *   5. `findAll` with `Op.in` (Roles by name list)
 *   6. Aggregation `COUNT(*) GROUP BY status`
 *   7. JSONB containment (`betting_market @> '...'`)
 *   8. JOIN-heavy list (registrations → race + horse + jockey + horse_owner)
 *
 * Usage: node migration/scripts/benchmark-sequelize.js
 */

const path = require('path');
process.env.NODE_PATH = path.resolve(__dirname, '..', '..', 'horse-racing-backend', 'node_modules');
require('module').Module._initPaths();

require('dotenv').config({ path: path.resolve(__dirname, '..', '..', 'horse-racing-backend', '.env') });
const { Op } = require('sequelize');
const { loadSequelizeModels } = require('../../horse-racing-backend/models/sequelize');

const RESULTS = [];
const RUNS = 5;

async function bench(name, fn) {
    const times = [];
    let lastResult;
    for (let i = 0; i < RUNS; i++) {
        const t0 = process.hrtime.bigint();
        lastResult = await fn();
        const t1 = process.hrtime.bigint();
        times.push(Number(t1 - t0) / 1e6); // ns → ms
    }
    const mean = times.reduce((a, b) => a + b, 0) / times.length;
    const min = Math.min(...times);
    const max = Math.max(...times);
    const budget = 50; // 50ms
    const ok = mean < budget;
    RESULTS.push({ name, mean, min, max, ok });
    const tag = ok ? '✔' : '⚠';
    console.log(`  ${tag} ${name.padEnd(58, ' ')} mean=${mean.toFixed(2)}ms min=${min.toFixed(2)} max=${max.toFixed(2)}`);
    return lastResult;
}

async function run() {
    console.log('\n--- Phase 15: Performance benchmarks ---\n');
    const { sequelize, models } = loadSequelizeModels();

    // Pick one user to keep ids stable across runs.
    const adminUser = await models.User.findOne({ where: { email: 'admin@racing.test' } });
    const adminUserId = adminUser.id;

    const completedRace = await models.Race.findOne({ where: { status: 'completed' } });
    const completedRaceId = completedRace?.id;

    const tournamentId = (await models.Tournament.findOne())?.id;

    // ─────────────────────────────────────────────────────────────
    // 1. findByPk
    // ─────────────────────────────────────────────────────────────
    console.log('\n1. PK lookup\n');
    await bench('User.findByPk', () => models.User.findByPk(adminUserId));

    // ─────────────────────────────────────────────────────────────
    // 2. findOne with where
    // ─────────────────────────────────────────────────────────────
    console.log('\n2. findOne with where clause\n');
    await bench('Race.findOne by id + status', () => models.Race.findOne({ where: { id: completedRaceId, status: 'completed' } }));

    // ─────────────────────────────────────────────────────────────
    // 3. findAll with where + limit
    // ─────────────────────────────────────────────────────────────
    console.log('\n3. findAll with limit\n');
    await bench('Horse.findAll active, limit 20', () => models.Horse.findAll({ where: { status: 'active' }, limit: 20 }));

    // ─────────────────────────────────────────────────────────────
    // 4. findAll with include
    // ─────────────────────────────────────────────────────────────
    console.log('\n4. findAll with associations (Eager Loading)\n');
    await bench('Race + RefereeReport', () => models.Race.findAll({
        where: { tournament_id: tournamentId },
        include: [{ model: models.RefereeReport, as: 'referee_reports', required: false }],
        limit: 5
    }));

    // ─────────────────────────────────────────────────────────────
    // 5. findAll with Op.in
    // ─────────────────────────────────────────────────────────────
    console.log('\n5. findAll with Op.in\n');
    await bench('Roles by name list', () => models.Role.findAll({ where: { role_name: { [Op.in]: ['admin', 'horse_owner', 'jockey'] } } }));

    // ─────────────────────────────────────────────────────────────
    // 6. Aggregation via raw query
    // ─────────────────────────────────────────────────────────────
    console.log('\n6. Aggregation: COUNT(*) GROUP BY status\n');
    await bench('race count by status', () => sequelize.query(`
        SELECT status, COUNT(*)::int AS n FROM races GROUP BY status ORDER BY n DESC;
    `));

    // ─────────────────────────────────────────────────────────────
    // 7. JSONB containment query
    // ─────────────────────────────────────────────────────────────
    console.log('\n7. JSONB containment query (betting_market)\n');
    await bench('races with min_stake <= 5000', () => sequelize.query(`
        SELECT id, name FROM races
        WHERE betting_market @> '{"min_stake": 5000}'::jsonb
        LIMIT 20;
    `));

    // ─────────────────────────────────────────────────────────────
    // 8. JOIN-heavy: registrations → race + horse + jockey + horse_owner
    // ─────────────────────────────────────────────────────────────
    console.log('\n8. JOIN-heavy list\n');
    await bench('Registration → Race, Horse, HorseOwner', () => models.Registration.findAll({
        include: [
            { model: models.Race, as: 'race', attributes: ['id', 'name', 'race_date'] },
            { model: models.Horse, as: 'horse', include: [{ model: models.HorseOwner, as: 'owner' }] },
            { model: models.HorseOwner, as: 'owner' }
        ],
        limit: 20
    }));

    // ─────────────────────────────────────────────────────────────
    // Summary
    // ─────────────────────────────────────────────────────────────
    console.log(`\n--- Summary ---`);
    const slow = RESULTS.filter((r) => !r.ok);
    if (slow.length === 0) {
        console.log(`  ✔ All ${RESULTS.length} queries within 50ms budget.`);
    } else {
        console.log(`  ⚠ ${slow.length} queries exceeded 50ms budget. Consider indexing.`);
        for (const r of slow) {
            console.log(`    - ${r.name} mean=${r.mean.toFixed(2)}ms`);
        }
    }
    const overallMean = RESULTS.reduce((acc, r) => acc + r.mean, 0) / RESULTS.length;
    console.log(`  Mean across all: ${overallMean.toFixed(2)}ms`);

    // Explain plan for the JOIN-heavy query so we can recommend indexes
    console.log('\n--- EXPLAIN on heaviest query ---\n');
    const explain = await sequelize.query(`
        EXPLAIN (ANALYZE, BUFFERS) SELECT r.id, r.race_id
        FROM registrations r
        LEFT JOIN races ra ON r.race_id = ra.id
        LEFT JOIN horses h ON r.horse_id = h.id
        LEFT JOIN horse_owners ho ON h.owner_id = ho.id
        LIMIT 20;
    `);
    for (const row of explain[0]) {
        console.log('  ' + Object.values(row)[0]);
    }

    await sequelize.close();
}

run().catch((err) => {
    console.error('✖ Phase 15 failed:', err.message);
    console.error(err.stack);
    process.exit(1);
});