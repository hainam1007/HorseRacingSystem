/**
 * Database migration runner.
 *
 * Applies every .sql file in db/migrations/ in lexicographical order that has
 * not yet been recorded in the schema_migrations table. Each file is wrapped
 * in its own transaction so a failure leaves the database untouched.
 *
 * Usage:
 *   node scripts/migrate.js            # apply pending migrations
 *   node scripts/migrate.js --status   # show applied / pending
 *   node scripts/migrate.js --dry-run  # list pending without running
 *
 * Naming convention:
 *   NNN_description.sql   (e.g. 002_add_starting_to_races_status_check.sql)
 * The NNN prefix becomes the migration version recorded in schema_migrations.
 */

'use strict';

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Client } = require('pg');

const MIGRATIONS_DIR = path.join(__dirname, '..', 'db', 'migrations');

function buildClient() {
    return new Client({
        host: process.env.PGHOST || '127.0.0.1',
        port: Number(process.env.PGPORT || 5432),
        user: process.env.PGUSER || 'postgres',
        password: process.env.PGPASSWORD || '',
        database: process.env.PGDATABASE || 'horse_racing'
    });
}

function listMigrationFiles() {
    if (!fs.existsSync(MIGRATIONS_DIR)) {
        throw new Error(`Migrations directory not found: ${MIGRATIONS_DIR}`);
    }
    return fs.readdirSync(MIGRATIONS_DIR)
        .filter((name) => name.endsWith('.sql'))
        .sort();
}

function parseVersion(filename) {
    const match = /^(\d+)_/.exec(filename);
    if (!match) {
        throw new Error(
            `Migration file "${filename}" must start with a numeric prefix ` +
            'like 001_, 002_, ...'
        );
    }
    return match[1];
}

function parseDescription(filename) {
    return filename
        .replace(/^\d+_/, '')
        .replace(/\.sql$/, '')
        .replace(/_/g, ' ');
}

function checksum(text) {
    return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

async function ensureBookkeepingTable(client) {
    await client.query(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
            version      VARCHAR(255) PRIMARY KEY,
            description  TEXT,
            applied_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            checksum     VARCHAR(64)
        )
    `);
}

async function loadAppliedVersions(client) {
    const result = await client.query(
        'SELECT version, description, applied_at, checksum FROM schema_migrations ORDER BY version'
    );
    return new Map(result.rows.map((row) => [row.version, row]));
}

async function printStatus(client) {
    await ensureBookkeepingTable(client);
    const applied = await loadAppliedVersions(client);
    const files = listMigrationFiles();

    console.log('\n=== Migration status ===');
    if (files.length === 0) {
        console.log('(no migration files found)');
    }
    for (const file of files) {
        const version = parseVersion(file);
        const record = applied.get(version);
        const status = record ? 'applied' : 'pending';
        const when = record ? ` @ ${record.applied_at.toISOString()}` : '';
        console.log(`  [${status.padEnd(7)}] ${version}  ${file}${when}`);
    }
    console.log('');
}

async function applyPending(client, { dryRun = false } = {}) {
    await ensureBookkeepingTable(client);
    const applied = await loadAppliedVersions(client);
    const files = listMigrationFiles();

    const pending = files.filter((file) => !applied.has(parseVersion(file)));
    if (pending.length === 0) {
        console.log('Nothing to migrate. Database is up to date.');
        return 0;
    }

    console.log(`Found ${pending.length} pending migration(s):`);
    for (const file of pending) {
        console.log(`  - ${file}`);
    }

    if (dryRun) {
        console.log('\nDry run — nothing was executed.');
        return 0;
    }

    let appliedCount = 0;
    for (const file of pending) {
        const version = parseVersion(file);
        const description = parseDescription(file);
        const fullPath = path.join(MIGRATIONS_DIR, file);
        const sql = fs.readFileSync(fullPath, 'utf8');
        const hash = checksum(sql);

        console.log(`\n→ Applying ${file}`);
        try {
            await client.query('BEGIN');
            await client.query(sql);
            await client.query(
                `INSERT INTO schema_migrations (version, description, checksum)
                 VALUES ($1, $2, $3)
                 ON CONFLICT (version) DO NOTHING`,
                [version, description, hash]
            );
            await client.query('COMMIT');
            appliedCount += 1;
            console.log(`  ✓ done`);
        } catch (error) {
            await client.query('ROLLBACK');
            console.error(`  ✗ failed: ${error.message}`);
            throw error;
        }
    }

    console.log(`\nApplied ${appliedCount} migration(s).`);
    return appliedCount;
}

async function main() {
    const args = process.argv.slice(2);
    const showStatus = args.includes('--status');
    const dryRun = args.includes('--dry-run');

    const client = buildClient();
    await client.connect();
    try {
        if (showStatus) {
            await printStatus(client);
        } else {
            await applyPending(client, { dryRun });
        }
    } finally {
        await client.end();
    }
}

main().catch((error) => {
    console.error('\nMigration runner failed:', error.message);
    process.exit(1);
});