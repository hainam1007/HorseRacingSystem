'use strict';

/**
 * Phase 4 — smoke test for Sequelize connection.
 *
 * Run from horse-racing-backend/:
 *   node ../migration/scripts/test-sequelize-connection.js
 * (or directly from project root)
 */

const path = require('path');

// Resolve modules from horse-racing-backend/node_modules so we use the same
// dotenv + pg + sequelize versions as the backend.
const backendRoot = path.resolve(__dirname, '..', '..', 'horse-racing-backend');
const dotenv = require(path.join(backendRoot, 'node_modules', 'dotenv'));
const { Client } = require(path.join(backendRoot, 'node_modules', 'pg'));
const { connectSequelize, disconnectSequelize } = require(path.join(backendRoot, 'config', 'sequelize'));

const backendEnvPath = path.join(backendRoot, '.env');
dotenv.config({ path: backendEnvPath });

(async function main() {
    let exitCode = 0;
    try {
        console.log('[test] loading env from', backendEnvPath);
        console.log('[test] PG* env vars present:');
        console.log('  PGHOST =', process.env.PGHOST || '(missing)');
        console.log('  PGPORT =', process.env.PGPORT || '(missing)');
        console.log('  PGUSER =', process.env.PGUSER || '(missing)');
        console.log('  PGDATABASE =', process.env.PGDATABASE || '(missing)');
        const password = process.env.PGPASSWORD;
        console.log('  PGPASSWORD =', password ? '***MASKED***' : '(missing)');

        console.log('\n[test] authenticating Sequelize...');
        const instance = await connectSequelize();
        console.log('[test] ✔ authenticated');

        console.log('\n[test] querying tables via pg client...');
        const pgClient = new Client({
            host: process.env.PGHOST,
            port: Number(process.env.PGPORT || 5432),
            user: process.env.PGUSER,
            password: process.env.PGPASSWORD,
            database: process.env.PGDATABASE
        });
        await pgClient.connect();
        const tablesRes = await pgClient.query(
            "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name"
        );
        const tableNames = tablesRes.rows.map((row) => row.table_name);
        console.log(`[test] found ${tableNames.length} base tables`);
        if (tableNames.length < 40) {
            console.error(`[test] ✖ expected ≥40 tables (Phase 3 created 50). Did you forget to apply schema?`);
            exitCode = 2;
        }
        console.log('[test] first 10 tables:');
        tableNames.slice(0, 10).forEach((name) => console.log('   -', name));
        await pgClient.end();

        console.log('\n[test] counting indexes/triggers/fks...');
        const [counts] = await instance.query(`
            SELECT
              (SELECT count(*) FROM pg_indexes WHERE schemaname='public') AS indexes,
              (SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal) AS triggers,
              (SELECT count(*) FROM pg_constraint WHERE contype='f') AS fks,
              (SELECT count(*) FROM pg_constraint WHERE contype='c') AS checks
        `);
        const c = counts[0];
        console.log(`  indexes = ${c.indexes}`);
        console.log(`  triggers = ${c.triggers}`);
        console.log(`  foreign_keys = ${c.fks}`);
        console.log(`  check_constraints = ${c.checks}`);

        console.log('\n[test] ✔ all checks passed');
    } catch (err) {
        console.error('[test] ✖ error:', err.message);
        console.error(err.stack);
        exitCode = 1;
    } finally {
        await disconnectSequelize();
        process.exit(exitCode);
    }
})();
