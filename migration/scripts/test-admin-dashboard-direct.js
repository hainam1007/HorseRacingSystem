/**
 * Local sanity check for the rewritten adminDashboardService.
 *
 * Reads Postgres directly via Sequelize models — NO HTTP, NO JWT, NO auth.
 * Just verifies the service methods load and return well-formed JSON.
 */
const path = require('path');
process.env.NODE_PATH = path.resolve(__dirname, '..', '..', 'horse-racing-backend', 'node_modules');
require('module').Module._initPaths();

process.env.STORAGE_DRIVER = 'postgres';

const { loadSequelizeModels } = require(path.resolve('horse-racing-backend/models/sequelize/index.js'));
const service = require(path.resolve('horse-racing-backend/services/adminDashboardService.js'));

async function check(label, fn) {
    try {
        const start = Date.now();
        const result = await fn();
        const ms = Date.now() - start;
        const keys = result && typeof result === 'object' ? Object.keys(result).slice(0, 8) : [];
        console.log(`✔ ${label} (${ms}ms) — keys: ${keys.join(', ')}`);
        return result;
    } catch (e) {
        console.log(`✖ ${label} — ${e.message}`);
        if (e.sql) console.log(`    SQL: ${e.sql.slice(0, 200)}`);
        return null;
    }
}

async function main() {
    loadSequelizeModels(); // warm up
    console.log('--- Direct service call (no HTTP) ---\n');

    const d = await check('getDashboardSummary()', () => service.getDashboardSummary('2026-08-01', '2026-08-14'));
    if (d) {
        console.log('  metrics keys:', Object.keys(d.metrics || {}).length);
        console.log('  charts days:', (d.charts?.daily || []).length);
        console.log('  alerts:', (d.alerts || []).length);
    }

    const b = await check('getBettingSummary()', () => service.getBettingSummary('2026-08-01', '2026-08-14'));
    if (b) console.log('  breakdown:', b.breakdown.length);

    const dr = await check('getDepositRequests()', () => service.getDepositRequests('2026-08-01', '2026-08-14', null, 1, 5));
    if (dr) console.log('  list:', dr.list.length, '/ total:', dr.total);

    const p = await check('getPrizeAwardsSummary()', () => service.getPrizeAwardsSummary('2026-08-01', '2026-08-14'));
    if (p) console.log('  currencies:', Object.keys(p).length);

    const l = await check('getLegacyDashboardSummary()', () => service.getLegacyDashboardSummary());
    if (l) console.log('  legacy total_users:', l.total_users);

    process.exit(0);
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
