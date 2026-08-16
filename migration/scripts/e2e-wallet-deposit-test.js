'use strict';

/**
 * End-to-end Wallet + Deposit test (Sequelize mode).
 *
 * Boots a minimal Express server with the real routers. Tests:
 *   1. GET /api/wallet/me → auto-creates wallet
 *   2. POST /api/wallet/deposit (10000 VND → 1 token)
 *   3. POST /api/wallet/deposit with duplicate reference → 409
 *   4. GET /api/wallet/transactions → returns the deposit log
 *   5. GET /api/deposit/packages → lists active packages
 *   6. POST /api/deposit/preview-custom (5 tokens)
 *   7. POST /api/deposit/intent (using package PKG_50K, MOCK)
 *   8. GET /api/deposit/history → lists deposit requests
 */

process.env.STORAGE_DRIVER = 'postgres';

const path = require('path');
process.env.NODE_PATH = path.resolve(__dirname, '..', '..', 'horse-racing-backend', 'node_modules');
require('module').Module._initPaths();
require('dotenv').config({ path: path.resolve(__dirname, '..', '..', 'horse-racing-backend', '.env') });

const express = require('express');
const http = require('http');

const walletRouter = require('../../horse-racing-backend/routes/wallet');
const depositRouter = require('../../horse-racing-backend/routes/deposit');
const authRouter = require('../../horse-racing-backend/routes/auth');
const { loadSequelizeModels } = require('../../horse-racing-backend/models/sequelize/index.js');

let passed = 0, failed = 0;

function assert(name, cond, detail = '') {
    if (cond) {
        passed++;
        console.log(`  ✔ ${name}${detail ? '  — ' + detail : ''}`);
    } else {
        failed++;
        console.log(`  ✖ ${name}${detail ? '  — ' + detail : ''}`);
    }
}

async function request(server, method, urlPath, body, token) {
    return new Promise((resolve, reject) => {
        const port = server.address().port;
        const opts = {
            hostname: '127.0.0.1',
            port,
            path: urlPath,
            method,
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
    console.log('\n--- Phase 17-19: Wallet + Deposit E2E (Postgres mode) ---\n');

    const app = express();
    app.use(express.json());
    app.use('/api/auth', authRouter);
    app.use('/api/wallet', walletRouter);
    app.use('/api/deposit', depositRouter);

    app.use((err, req, res, next) => {
        res.status(err.statusCode || err.status || 500).json({
            error: err.message, code: err.code
        });
    });

    const server = app.listen(0, '127.0.0.1');
    await new Promise((r) => server.on('listening', r));
    console.log(`[boot] test server listening on 127.0.0.1:${server.address().port}\n`);

    let userToken, userId, baselineBalance = 0;
    const newEmail = `phase17-${Date.now()}@racing.test`;

    try {
        // ── Setup: register + verify + login
        const reg = await request(server, 'POST', '/api/auth/register', {
            email: newEmail, password: 'Wallet123!', full_name: 'Wallet Test', roles: ['spectator']
        });
        assert('register returns 201', reg.status === 201, `status=${reg.status}`);
        userId = reg.body?.data?.user?.id;

        await request(server, 'POST', '/api/auth/verify-account', { otp: reg.body?.data?.verification?.otp });
        // verify-account is permissive about OTP in dev mode — we just want the row verified.
        const { sequelize, models: M } = loadSequelizeModels();
        await M.User.update(
            { email_verified: true, email_verified_at: new Date(), status: 'active' },
            { where: { email: newEmail } }
        );
        // Don't close the connection here — the next requests reuse it.

        const login = await request(server, 'POST', '/api/auth/login', {
            email: newEmail, password: 'Wallet123!'
        });
        assert('login returns 200', login.status === 200, `status=${login.status} body=${JSON.stringify(login.body).slice(0, 300)}`);
        userToken = login.body?.data?.token;
        assert('login returns JWT', typeof userToken === 'string' && userToken.length > 20);

        // ── 1. GET /api/wallet/me (auto-create)
        const me1 = await request(server, 'GET', '/api/wallet/me', null, userToken);
        assert('GET /api/wallet/me returns 200', me1.status === 200, `status=${me1.status} body=${JSON.stringify(me1.body).slice(0, 200)}`);
        const wallet1 = me1.body?.data?.wallet;
        assert('wallet created with zero balance', wallet1 && parseFloat(wallet1.token_balance) === 0, `balance=${wallet1?.token_balance}`);
        baselineBalance = parseFloat(wallet1.token_balance);

        // ── 2. POST /api/wallet/deposit (50000 VND @ 1000 VND/token = 50 tokens)
        const REF1 = `phase17-ref-${Date.now()}`;
        const dep = await request(server, 'POST', '/api/wallet/deposit', {
            vnd_amount: 50000, reference_id: REF1
        }, userToken);
        assert('deposit returns 200', dep.status === 200, `status=${dep.status} body=${JSON.stringify(dep.body).slice(0, 200)}`);
        const wallet2 = dep.body?.data?.wallet;
        const VND_PER_TOKEN = Number(process.env.VND_PER_TOKEN) || 1000;
        const expectedTokens = Math.floor(50000 / VND_PER_TOKEN);
        assert('balance increased correctly',
            parseFloat(wallet2.token_balance) === baselineBalance + expectedTokens,
            `before=${baselineBalance} expected=${baselineBalance + expectedTokens} after=${wallet2?.token_balance}`);

        // ── 3. Duplicate reference returns 409
        const dup = await request(server, 'POST', '/api/wallet/deposit', {
            vnd_amount: 50000, reference_id: REF1
        }, userToken);
        assert('duplicate reference returns 409', dup.status === 409, `status=${dup.status} body=${JSON.stringify(dup.body).slice(0, 200)}`);

        // ── 4. GET /api/wallet/transactions
        const tx = await request(server, 'GET', '/api/wallet/transactions', null, userToken);
        assert('GET /api/wallet/transactions returns 200', tx.status === 200, `status=${tx.status}`);
        assert('transactions list non-empty', Array.isArray(tx.body?.data?.transactions) && tx.body.data.transactions.length >= 1);
        assert('first tx is deposit', tx.body.data.transactions[0].transaction_type === 'deposit');
        assert('meta.total >= 1', tx.body?.data?.meta?.total >= 1);

        // ── 5. GET /api/deposit/packages
        const pkgs = await request(server, 'GET', '/api/deposit/packages', null, userToken);
        assert('GET /api/deposit/packages returns 200', pkgs.status === 200, `status=${pkgs.status}`);
        const pkgList = pkgs.body?.data?.packages || [];
        assert('packages list non-empty', pkgList.length >= 1, `${pkgList.length} packages`);
        assert('first package has package_id', !!pkgList[0]?.package_id, `id=${pkgList[0]?.package_id}`);

        // ── 6. POST /api/deposit/preview-custom (5 tokens)
        const preview = await request(server, 'POST', '/api/deposit/preview-custom', {
            token_amount: 5
        }, userToken);
        assert('POST /api/deposit/preview-custom returns 200', preview.status === 200, `status=${preview.status}`);
        assert('preview returns vnd_price', typeof preview.body?.data?.vnd_price === 'number', `got vnd_price=${preview.body?.data?.vnd_price}`);

        // ── 7. POST /api/deposit/intent (MOCK payment)
        const intent = await request(server, 'POST', '/api/deposit/intent', {
            package_id: 'PKG_500K',
            payment_method: 'MOCK',
            mock_secret: 'PHASE17_INTENT'
        }, userToken);
        assert('POST /api/deposit/intent returns 201', intent.status === 201, `status=${intent.status} body=${JSON.stringify(intent.body).slice(0, 250)}`);
        assert('intent returns order_id', !!intent.body?.data?.order?.order_id);
        assert('intent order status = pending', intent.body?.data?.order?.status === 'pending');

        const orderId = intent.body?.data?.order?.order_id;

        // ── 8. GET /api/deposit/history
        const hist = await request(server, 'GET', '/api/deposit/history', null, userToken);
        assert('GET /api/deposit/history returns 200', hist.status === 200, `status=${hist.status}`);
        assert('deposit history list non-empty', Array.isArray(hist.body?.data?.orders) && hist.body.data.orders.length >= 1, `orders=${hist.body?.data?.orders?.length}`);

// ── 9. Cleanup — disable the append-only trigger, delete TransactionHistory,
        // re-enable trigger. Then delete the rest of the user's rows.
        await sequelize.query(`ALTER TABLE transaction_histories DISABLE TRIGGER USER;`);
        await M.TransactionHistory.destroy({ where: { user_id: userId } });
        await sequelize.query(`ALTER TABLE transaction_histories ENABLE TRIGGER USER;`);
        await M.DepositRequest.destroy({ where: { user_id: userId } });
        await M.Wallet.destroy({ where: { user_id: userId } });
        await M.UserRole.destroy({ where: { user_id: userId } });
        await M.User.destroy({ where: { id: userId } });
        await sequelize.close();
        assert('cleanup done', true);

    } finally {
        await new Promise((r) => server.close(r));
    }

    console.log(`\n--- Summary ---`);
    console.log(`  Passed: ${passed}`);
    console.log(`  Failed: ${failed}\n`);

    if (failed > 0) process.exit(1);
}

run().catch((err) => {
    console.error('✖ Wallet+Deposit E2E failed:', err.message);
    console.error(err.stack);
    process.exit(1);
});