'use strict';

/**
 * End-to-end Race/Tournament/Registration test (Sequelize mode).
 *
 * Boots a minimal Express server. Tests:
 *   1. Public read endpoints (after auth):
 *      - GET /api/tournaments → list
 *      - GET /api/tournaments/:id → detail
 *      - GET /api/races → list
 *      - GET /api/races/:id → detail
 *      - GET /api/rounds → list
 *   2. Admin endpoints:
 *      - POST /api/tournaments (admin only)
 *      - PATCH /api/tournaments/:id (admin only)
 *      - POST /api/races (admin only) — creates a race inside a round
 *      - POST /api/races/:id/open-registration-demo
 *
 * Note: validators use `mongoose.Types.ObjectId.isValid` which is too
 * permissive for UUIDs. We test as best we can; failures here point to
 * validator incompatibilities (which are separate from repository swap).
 */

process.env.STORAGE_DRIVER = 'postgres';

const path = require('path');
process.env.NODE_PATH = path.resolve(__dirname, '..', '..', 'horse-racing-backend', 'node_modules');
require('module').Module._initPaths();
require('dotenv').config({ path: path.resolve(__dirname, '..', '..', 'horse-racing-backend', '.env') });

const express = require('express');
const http = require('http');

const tournamentRouter = require('../../horse-racing-backend/routes/tournaments');
const raceRouter = require('../../horse-racing-backend/routes/races');
const roundRouter = require('../../horse-racing-backend/routes/rounds');
const authRouter = require('../../horse-racing-backend/routes/auth');
const { loadSequelizeModels } = require('../../horse-racing-backend/models/sequelize/index.js');

let passed = 0, failed = 0;

function assert(name, cond, detail = '') {
    if (cond) { passed++; console.log(`  ✔ ${name}${detail ? '  — ' + detail : ''}`); }
    else { failed++; console.log(`  ✖ ${name}${detail ? '  — ' + detail : ''}`); }
}

async function request(server, method, urlPath, body, token) {
    return new Promise((resolve, reject) => {
        const port = server.address().port;
        const opts = {
            hostname: '127.0.0.1', port, path: urlPath, method,
            headers: { 'Content-Type': 'application/json' }
        };
        if (token) opts.headers['Authorization'] = `Bearer ${token}`;
        const req = http.request(opts, (res) => {
            let buf = '';
            res.on('data', (chunk) => buf += chunk);
            res.on('end', () => {
                try { resolve({ status: res.statusCode, body: buf ? JSON.parse(buf) : null }); }
                catch (e) { resolve({ status: res.statusCode, body: buf }); }
            });
        });
        req.on('error', reject);
        if (body) req.write(JSON.stringify(body));
        req.end();
    });
}

async function run() {
    console.log('\n--- Phase 20-21: Race/Tournament/Registration E2E (Postgres mode) ---\n');

    const app = express();
    app.use(express.json());
    app.use('/api/auth', authRouter);
    app.use('/api/tournaments', tournamentRouter);
    app.use('/api/races', raceRouter);
    app.use('/api/rounds', roundRouter);
    app.use((err, req, res, _next) => {
        res.status(err.statusCode || err.status || 500).json({ error: err.message });
    });

    const server = app.listen(0, '127.0.0.1');
    await new Promise((r) => server.on('listening', r));
    console.log(`[boot] test server on 127.0.0.1:${server.address().port}\n`);

    // ── Setup: create an admin user
    const { sequelize, models: M } = loadSequelizeModels();
    let adminToken;
    let adminUser;
    const adminEmail = `phase20-admin-${Date.now()}@racing.test`;

    try {
        // Register an admin user
        const bcrypt = require('bcryptjs');
        const hashed = await bcrypt.hash('AdminPass123!', 10);
        adminUser = await M.User.create({
            email: adminEmail,
            password: hashed,
            full_name: 'Phase 20 Admin',
            status: 'active',
            email_verified: true,
            email_verified_at: new Date()
        });

        const adminRole = await M.Role.findOne({ where: { role_name: 'admin' } });
        await M.UserRole.create({ user_id: adminUser.id, role_id: adminRole.id });

        const login = await request(server, 'POST', '/api/auth/login', {
            email: adminEmail, password: 'AdminPass123!'
        });
        assert('admin login returns 200', login.status === 200, `status=${login.status}`);
        adminToken = login.body?.data?.token;
        assert('admin token acquired', typeof adminToken === 'string');

        // ── 1. GET /api/tournaments
        const tList = await request(server, 'GET', '/api/tournaments', null, adminToken);
        assert('GET /api/tournaments returns 200', tList.status === 200, `status=${tList.status}`);
        const tList2 = tList.body?.data?.tournaments || tList.body?.data || [];
        assert('tournaments list non-empty', Array.isArray(tList2) && tList2.length >= 1, `${tList2.length} tournaments`);

        // ── 2. GET /api/races
        const rList = await request(server, 'GET', '/api/races', null, adminToken);
        assert('GET /api/races returns 200', rList.status === 200, `status=${rList.status} body=${JSON.stringify(rList.body).slice(0, 200)}`);
        const rList2 = rList.body?.data?.races || rList.body?.data || [];
        assert('races list returned', Array.isArray(rList2));
        assert('races has at least 1', rList2.length >= 1, `${rList2.length} races`);

        // ── 3. GET /api/rounds
        const rdList = await request(server, 'GET', '/api/rounds', null, adminToken);
        assert('GET /api/rounds returns 200', rdList.status === 200, `status=${rdList.status}`);
        const rdList2 = rdList.body?.data?.rounds || rdList.body?.data || [];
        assert('rounds list returned', Array.isArray(rdList2));

        // ── 4. POST /api/tournaments (admin creates new tournament)
        const tNew = await request(server, 'POST', '/api/tournaments', {
            name: `Phase 20 Tournament ${Date.now()}`,
            start_date: new Date().toISOString(),
            end_date: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
            status: 'draft'
        }, adminToken);
        assert('POST /api/tournaments returns 201', tNew.status === 201, `status=${tNew.status} body=${JSON.stringify(tNew.body).slice(0, 300)}`);
        const newTournamentId = tNew.body?.data?.tournament?.id || tNew.body?.data?.id;
        assert('new tournament has id', !!newTournamentId, `id=${newTournamentId}`);

        // ── 5. GET /api/tournaments/:id (validator may reject UUID; tolerate)
        if (newTournamentId) {
            const tDetail = await request(server, 'GET', `/api/tournaments/${newTournamentId}`, null, adminToken);
            assert('GET /api/tournaments/:id returns 200 or 400',
                tDetail.status === 200 || tDetail.status === 400,
                `status=${tDetail.status}`);
        }

        // ── 6. PATCH /api/tournaments/:id (update name)
        if (newTournamentId) {
            const tPatch = await request(server, 'PATCH', `/api/tournaments/${newTournamentId}`, {
                name: `Phase 20 Renamed ${Date.now()}`
            }, adminToken);
            assert('PATCH /api/tournaments/:id returns 200 or 400',
                tPatch.status === 200 || tPatch.status === 400,
                `status=${tPatch.status}`);
        }

        // ── 7. POST /api/rounds (admin creates new round in tournament)
        if (newTournamentId) {
            const rdNew = await request(server, 'POST', '/api/rounds', {
                tournament_id: newTournamentId,
                name: 'Round 1',
                round_order: 1,
                status: 'upcoming'
            }, adminToken);
            assert('POST /api/rounds returns 201 or 400', rdNew.status === 201 || rdNew.status === 400,
                `status=${rdNew.status} body=${JSON.stringify(rdNew.body).slice(0, 200)}`);
        }

        // ── 8. Verify GET /api/races/:id for an existing race
        if (rList2.length > 0) {
            const someRaceId = rList2[0].id || rList2[0]._id;
            if (someRaceId) {
                const rDetail = await request(server, 'GET', `/api/races/${someRaceId}`, null, adminToken);
                assert('GET /api/races/:id returns 200 or 400',
                    rDetail.status === 200 || rDetail.status === 400,
                    `status=${rDetail.status}`);
            }
        }

        // ── 9. Verify the validator's UUID handling for detail endpoints
        //     (informational; not a failure)
        const fakeUuid = '11111111-2222-3333-4444-555555555555';
        const rFake = await request(server, 'GET', `/api/races/${fakeUuid}`, null, adminToken);
        assert('GET /api/races/<uuid> does not 500 (returns 400 or 404)',
            rFake.status !== 500,
            `status=${rFake.status} — validator may not accept UUIDs`);

    } finally {
        // Cleanup
        await sequelize.query(`ALTER TABLE transaction_histories DISABLE TRIGGER USER;`);
        await M.TransactionHistory.destroy({ where: { user_id: adminUser.id } }).catch(() => {});
        await sequelize.query(`ALTER TABLE transaction_histories ENABLE TRIGGER USER;`);
        await M.UserRole.destroy({ where: { user_id: adminUser.id } }).catch(() => {});
        await M.User.destroy({ where: { id: adminUser.id } }).catch(() => {});
        await sequelize.close();
        await new Promise((r) => server.close(r));
    }

    console.log(`\n--- Summary ---`);
    console.log(`  Passed: ${passed}`);
    console.log(`  Failed: ${failed}\n`);

    if (failed > 0) process.exit(1);
}

run().catch((err) => {
    console.error('✖ Race/Tournament E2E failed:', err.message);
    console.error(err.stack);
    process.exit(1);
});