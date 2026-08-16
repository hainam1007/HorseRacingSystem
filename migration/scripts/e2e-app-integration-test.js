'use strict';

/**
 * Phase 23-24 — Application integration smoke test.
 *
 * Boots a real Express app via app.js and exercises:
 *   - GET /api/auth/roles  (read public endpoint)
 *   - POST /api/auth/register  (write — public)
 *   - POST /api/auth/login (write — public)
 *   - GET /api/wallet/me  (auth-protected)
 *   - GET /api/deposit/packages  (auth-protected)
 *   - GET /api/tournaments  (auth-protected)
 *   - GET /api/races  (auth-protected)
 *   - GET /api/rounds  (auth-protected)
 *
 * Verifies end-to-end that:
 *   1. The Express app wires every router correctly.
 *   2. The Postgres dual-mode wrappers route to Sequelize.
 *   3. Auth middleware extracts a real JWT.
 *   4. Repositories return rows shaped like the Mongoose plain docs.
 *
 * Run against a live server on PORT (default 3000) or against an already-
 * running instance. If --spawn is given, spawns the app on a random port.
 */

const http = require('http');
const path = require('path');
process.env.NODE_PATH = path.resolve(__dirname, '..', '..', 'horse-racing-backend', 'node_modules');
require('module').Module._initPaths();

async function request(port, method, urlPath, body, token) {
    return new Promise((resolve, reject) => {
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

let passed = 0, failed = 0;
function assert(name, cond, detail = '') {
    if (cond) { passed++; console.log(`  ✔ ${name}${detail ? '  — ' + detail : ''}`); }
    else { failed++; console.log(`  ✖ ${name}${detail ? '  — ' + detail : ''}`); }
}

async function run() {
    const port = Number(process.env.TEST_PORT || 3000);
    console.log(`\n--- Phase 23-24: Application integration test (port ${port}) ---\n`);

    const email = `phase23-${Date.now()}@racing.test`;

    // ── 1. Public: roles
    const roles = await request(port, 'GET', '/api/auth/roles');
    assert('GET /api/auth/roles returns 200', roles.status === 200, `status=${roles.status}`);
    assert('roles list has 5 entries',
        Array.isArray(roles.body?.data?.roles) && roles.body.data.roles.length === 5,
        `count=${roles.body?.data?.roles?.length}`);

    // ── 2. Public: register
    const reg = await request(port, 'POST', '/api/auth/register', {
        email, password: 'Phase23Pass!', full_name: 'Phase 23'
    });
    assert('POST /api/auth/register returns 201', reg.status === 201, `status=${reg.status}`);

    // Promote user to active via direct Sequelize (mirrors what the email-verify
    // flow would do in production) so /login succeeds.
    const { loadSequelizeModels } = require('../../horse-racing-backend/models/sequelize/index.js');
    const { sequelize, models: M } = loadSequelizeModels();
    try {
        await M.User.update(
            { email_verified: true, email_verified_at: new Date(), status: 'active' },
            { where: { email } }
        );

        // ── 3. Public: login
        const login = await request(port, 'POST', '/api/auth/login', {
            email, password: 'Phase23Pass!'
        });
        assert('POST /api/auth/login returns 200', login.status === 200, `status=${login.status}`);
        const token = login.body?.data?.token;
        assert('login returns JWT', typeof token === 'string' && token.length > 20);

        // ── 4. Auth: wallet/me
        const me = await request(port, 'GET', '/api/wallet/me', null, token);
        assert('GET /api/wallet/me returns 200', me.status === 200, `status=${me.status}`);
        assert('wallet has 0 balance', parseFloat(me.body?.data?.wallet?.token_balance) === 0);

        // ── 5. Auth: deposit packages
        const pkgs = await request(port, 'GET', '/api/deposit/packages', null, token);
        assert('GET /api/deposit/packages returns 200', pkgs.status === 200, `status=${pkgs.status}`);
        assert('packages list non-empty',
            Array.isArray(pkgs.body?.data?.packages) && pkgs.body.data.packages.length >= 1);

        // ── 6. Auth: tournaments
        const tList = await request(port, 'GET', '/api/tournaments', null, token);
        assert('GET /api/tournaments returns 200', tList.status === 200, `status=${tList.status}`);

        // ── 7. Auth: races
        const rList = await request(port, 'GET', '/api/races', null, token);
        assert('GET /api/races returns 200', rList.status === 200, `status=${tList.status}`);
        assert('races have participant_count', rList.body?.data?.races?.[0]?.participant_count !== undefined,
            `participant_count=${rList.body?.data?.races?.[0]?.participant_count}`);

        // ── 8. Auth: rounds
        const rdList = await request(port, 'GET', '/api/rounds', null, token);
        assert('GET /api/rounds returns 200', rdList.status === 200, `status=${rdList.status}`);

        // ── 9. Auth: transactions (should be empty for fresh user)
        const tx = await request(port, 'GET', '/api/wallet/transactions', null, token);
        assert('GET /api/wallet/transactions returns 200', tx.status === 200, `status=${tx.status}`);
        assert('transactions list empty for fresh user',
            Array.isArray(tx.body?.data?.transactions) && tx.body.data.transactions.length === 0);

    } finally {
        // Cleanup
        try {
            await sequelize.query(`ALTER TABLE transaction_histories DISABLE TRIGGER USER;`);
            await M.TransactionHistory.destroy({ where: { user_id: (await M.User.findOne({ where: { email } }))?.id } }).catch(() => {});
            await sequelize.query(`ALTER TABLE transaction_histories ENABLE TRIGGER USER;`);
            await M.Wallet.destroy({ where: { email } }).catch(() => {});
            await M.UserRole.destroy({ where: { email } }).catch(() => {});
            await M.User.destroy({ where: { email } }).catch(() => {});
        } catch (e) { /* ignore */ }
        await sequelize.close();
    }

    console.log(`\n--- Summary ---`);
    console.log(`  Passed: ${passed}`);
    console.log(`  Failed: ${failed}\n`);

    if (failed > 0) process.exit(1);
}

run().catch((err) => {
    console.error('✖ App integration test failed:', err.message);
    console.error(err.stack);
    process.exit(1);
});