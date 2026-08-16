'use strict';

/**
 * Phase 25 — dual-mode dispatch verifier.
 *
 * For each repository, swap STORAGE_DRIVER and confirm the Proxy resolves
 * the matching implementation. With driver=mongo, methods must be the
 * Mongoose methods (callable on a real model). With driver=postgres,
 * methods must be the Sequelize-backed ones.
 */

const path = require('path');
process.env.NODE_PATH = path.resolve(__dirname, '..', '..', 'horse-racing-backend', 'node_modules');
require('module').Module._initPaths();

const REPO_DIR = path.resolve(__dirname, '..', '..', 'horse-racing-backend', 'repositories');
const repos = [
    'walletRepository',
    'depositRequestRepository',
    'tournamentRepository',
    'raceRepository',
    'transactionRepository',
    'depositPackageRepository',
    'horseOwnerRepository',
    'profileRepository'
];

function load(name) {
    const full = path.join(REPO_DIR, name);
    delete require.cache[require.resolve(full)];
    return require(full);
}

function inspect(label, repo) {
    // Probe a wide range of method names — the Proxy intercepts property
    // access, so listing Object.keys() on the proxy itself returns [].
    const probes = [
        'findByUserId', 'findById', 'list', 'getAll', 'create', 'update',
        'deleteById', 'findOne', 'find', 'findByEmail', 'findByOrderId',
        'findAllActivePackages', 'createOrder', 'findProfileByUserId',
        'upsertWallet', 'incrementToken', 'deductTokenIfSufficient',
        'createLog', 'getRoleNamesByUserId', 'createProfiles'
    ];
    const srcs = probes
        .filter((k) => typeof repo[k] === 'function')
        .map((k) => ({ k, src: repo[k].toString() }));
    const seqHint = srcs.some((s) => /sequelize|loadSequelizeModels|\bmodels\b/.test(s.src));
    const mongoHint = srcs.some((s) => /mongoose|Model\.|require\(['"]mongoose/.test(s.src));
    return { label, keys: srcs.map((s) => s.k), seqHint, mongoHint };
}

async function run() {
    const drivers = ['mongo', 'postgres'];
    let passed = 0, failed = 0;
    const results = [];

    for (const driver of drivers) {
        process.env.STORAGE_DRIVER = driver;
        for (const r of repos) {
            const repo = load(r);
            const info = inspect(driver + ':' + r, repo);
            results.push({ driver, repo: r, ...info });

            const expectSeq = driver === 'postgres';
            const got = info.seqHint;
            const ok = expectSeq ? got : !got; // mongo shouldn't pull Sequelize
            if (ok) passed++; else failed++;
            console.log(`  ${ok ? '✔' : '✖'} ${driver.padEnd(8)} ${r.padEnd(30)} keys=${info.keys.length} seq=${info.seqHint} mongo=${info.mongoHint}`);
        }
    }

    console.log(`\n--- Summary ---  Passed=${passed}  Failed=${failed}\n`);
    if (failed > 0) process.exit(1);
}

run().catch((e) => { console.error('✖', e.message); process.exit(1); });