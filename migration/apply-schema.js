/**
 * Phase 3 — Apply PostgreSQL schema (001_init_postgres.sql)
 *
 * Reads the SQL file at schema/001_init_postgres.sql and executes it
 * against the Postgres database referenced by .env (PG* vars) or
 * explicit env vars.
 *
 * Usage: node apply-schema.js [path/to/sql]
 *   - defaults to ./schema/001_init_postgres.sql (relative to this file)
 *
 * Environment:
 *   PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE
 *   OR PG_URL (postgres://user:pass@host:port/db)
 *
 *   Optional override:
 *     MIGRATION_PG_URL — explicit connection string (takes precedence)
 *
 * Exit codes:
 *   0 — success
 *   1 — failure (logged)
 *
 * NOTE: Phase 3 does NOT execute this script; it's provided for
 * Phase 9 or manual review. Run from horse-racing-backend/ where pg is
 * available in node_modules.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

// ---------------------------------------------------------------------
// Resolve .env (best-effort; do NOT mutate backend .env)
// ---------------------------------------------------------------------
function tryLoadEnv() {
    const candidates = [
        path.resolve(__dirname, '..', 'horse-racing-backend', '.env'),
        path.resolve(__dirname, '..', 'horse-racing-backend', '.env.example'),
        path.resolve(process.cwd(), 'horse-racing-backend', '.env'),
        path.resolve(process.cwd(), 'horse-racing-backend', '.env.example')
    ];
    for (const file of candidates) {
        try {
            if (fs.existsSync(file)) {
                const content = fs.readFileSync(file, 'utf8');
                content.split(/\r?\n/).forEach((line) => {
                    const trimmed = line.trim();
                    if (!trimmed || trimmed.startsWith('#')) return;
                    const eq = trimmed.indexOf('=');
                    if (eq < 0) return;
                    const key = trimmed.slice(0, eq).trim();
                    const value = trimmed.slice(eq + 1).trim().replace(/^['"]|['"]$/g, '');
                    if (!process.env[key]) {
                        process.env[key] = value;
                    }
                });
                return file;
            }
        } catch (err) {
            // ignore
        }
    }
    return null;
}

// ---------------------------------------------------------------------
// Resolve SQL file path
// ---------------------------------------------------------------------
function resolveSqlPath(argPath) {
    const candidates = [
        argPath,
        path.resolve(__dirname, 'schema', '001_init_postgres.sql'),
        path.resolve(__dirname, '001_init_postgres.sql'),
        path.resolve(process.cwd(), 'schema', '001_init_postgres.sql'),
        path.resolve(process.cwd(), 'migration', 'schema', '001_init_postgres.sql')
    ].filter(Boolean);
    for (const p of candidates) {
        if (fs.existsSync(p)) return p;
    }
    return null;
}

// ---------------------------------------------------------------------
// Resolve Postgres connection options
// ---------------------------------------------------------------------
function resolveConnectionOptions() {
    const explicit = process.env.MIGRATION_PG_URL || process.env.PG_URL;
    if (explicit) {
        return { connectionString: explicit };
    }
    const host = process.env.PGHOST;
    const port = process.env.PGPORT;
    const user = process.env.PGUSER;
    const password = process.env.PGPASSWORD;
    const database = process.env.PGDATABASE;
    if (!host || !user || !database) {
        return null;
    }
    return { host, port: port ? Number(port) : 5432, user, password, database };
}

// ---------------------------------------------------------------------
// Run the SQL file
// ---------------------------------------------------------------------
async function applySchema(sqlPath) {
    const opts = resolveConnectionOptions();
    if (!opts) {
        console.error(
            '[apply-schema] ERROR: no Postgres connection info found.\n' +
            'Set MIGRATION_PG_URL (or PG_URL) OR (PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE).'
        );
        process.exit(1);
    }

    const sql = fs.readFileSync(sqlPath, 'utf8');

    const client = new Client({ ...opts, multipleStatements: false });
    console.log(`[apply-schema] connecting to Postgres...`);
    console.log(`[apply-schema] target: ${opts.connectionString || `${opts.user}@${opts.host}:${opts.port}/${opts.database}`}`);
    await client.connect();
    try {
        console.log(`[apply-schema] applying SQL file: ${sqlPath}`);
        console.log(`[apply-schema] file length: ${sql.length} bytes`);
        await client.query(sql);
        console.log(`[apply-schema] ✔ schema applied successfully`);

        // Post-apply summary
        const summary = await client.query(`
            SELECT
                (SELECT count(*) FROM information_schema.tables
                    WHERE table_schema='public' AND table_type='BASE TABLE') AS tables,
                (SELECT count(*) FROM pg_indexes WHERE schemaname='public') AS indexes,
                (SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal) AS triggers,
                (SELECT count(*) FROM pg_constraint
                    WHERE contype='f' AND connamespace='public'::regnamespace) AS fks;
        `);
        const row = summary.rows[0];
        console.log(`[apply-schema] summary: ${row.tables} tables, ${row.indexes} indexes, ${row.triggers} triggers, ${row.fks} FKs`);
    } catch (err) {
        console.error(`[apply-schema] ✖ failed: ${err.message}`);
        console.error(err.stack);
        process.exitCode = 1;
    } finally {
        await client.end();
    }
}

// ---------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------
async function main() {
    const argPath = process.argv[2];
    const sqlPath = resolveSqlPath(argPath);
    if (!sqlPath) {
        console.error(`[apply-schema] ERROR: SQL file not found. Tried:`);
        console.error(`  - ${argPath || '(none)'}`);
        console.error(`  - ${path.resolve(__dirname, 'schema', '001_init_postgres.sql')}`);
        console.error(`  - ${path.resolve(process.cwd(), 'schema', '001_init_postgres.sql')}`);
        process.exit(1);
    }

    const envFile = tryLoadEnv();
    if (envFile) {
        console.log(`[apply-schema] loaded env from: ${envFile}`);
    }

    await applySchema(sqlPath);
    if (process.exitCode !== 1) {
        console.log(`[apply-schema] done.`);
    }
}

if (require.main === module) {
    main().catch((err) => {
        console.error('[apply-schema] unexpected error:', err);
        process.exit(1);
    });
}

module.exports = { applySchema, resolveConnectionOptions };