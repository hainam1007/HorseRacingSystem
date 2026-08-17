/**
 * Wipe tournaments that are NOT part of the current seedFullDemo pack.
 *
 * The current seed defines exactly 5 tournaments named:
 *   DEMO 2026 Cup 1 - Opening Stakes
 *   DEMO 2026 Cup 2 - Mekong Classic
 *   DEMO 2026 Cup 3 - Saigon Derby
 *   DEMO 2026 Cup 4 - Heritage Sprint
 *   DEMO 2026 Cup 5 - Grand Finale
 *
 * Any other tournament (older DEMO, manual test data, leftover from a previous
 * seed with a different prefix) is removed along with everything that
 * cascades off it.
 *
 * Usage:
 *   node scripts/wipeDemoTournaments.js                 # actually delete
 *   node scripts/wipeDemoTournaments.js --dry-run       # show what would be deleted
 */

'use strict';

require('dotenv').config();

const { Client } = require('pg');

// MUST stay in sync with seedFullDemo.js
const DEMO_PREFIX = 'DEMO 2026';
const SEED_TOURNAMENT_NAMES = [
  `${DEMO_PREFIX} Cup 1 - Opening Stakes`,
  `${DEMO_PREFIX} Cup 2 - Mekong Classic`,
  `${DEMO_PREFIX} Cup 3 - Saigon Derby`,
  `${DEMO_PREFIX} Cup 4 - Heritage Sprint`,
  `${DEMO_PREFIX} Cup 5 - Grand Finale`,
];

function buildClient() {
  return new Client({
    host: process.env.PGHOST || '127.0.0.1',
    port: Number(process.env.PGPORT || 5432),
    user: process.env.PGUSER || 'postgres',
    password: process.env.PGPASSWORD || '',
    database: process.env.PGDATABASE || 'horse_racing',
  });
}

async function tableExists(client, tableName) {
  const r = await client.query(
    'SELECT 1 FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = $1 LIMIT 1',
    [tableName]
  );
  return r.rowCount > 0;
}

async function listTournaments(client) {
  const result = await client.query(
    `SELECT id, name, status, created_at
     FROM tournaments
     ORDER BY created_at`
  );
  return result.rows;
}

async function countChildren(client, tournamentIds) {
  if (tournamentIds.length === 0) return {};
  const counts = {};
  for (const table of ['races', 'rounds']) {
    if (!(await tableExists(client, table))) continue;
    const result = await client.query(
      `SELECT COUNT(*)::int AS n FROM ${table} WHERE tournament_id = ANY($1::uuid[])`,
      [tournamentIds]
    );
    counts[table] = result.rows[0].n;
  }
  return counts;
}

async function dropCyclicFks(client, tables) {
  // Find FKs whose from/to are both in the table set and that have no
  // topological ordering. We disable the trigger for them temporarily.
  // Strategy: pick a direction (the FK whose ON DELETE is CASCADE/SET NULL)
  // and disable trigger on it; the other direction stays enabled.
  // For simplicity we disable ALL triggers on every table in the cycle
  // inside a transaction; this lets us DELETE rows regardless of FK order.
  await client.query(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = current_schema() AND table_name = ANY($1::text[])`,
    [tables]
  );
  // We rely on SET LOCAL session_replication_role = replica to bypass
  // trigger-based FK checks during this transaction. PostgreSQL supports
  // this since 9.4. We restore at COMMIT.
  await client.query(`SET LOCAL session_replication_role = 'replica'`);
}

/**
 * Generic dependency-graph cascade delete.
 */
async function cascadeDelete(client, rootTable, rootColumn, rootIds) {
  if (rootIds.length === 0) return [];

  // Collect every table reachable via FK from the root table.
  const discovered = new Set([rootTable]);
  let changed = true;
  while (changed) {
    changed = false;
    const known = Array.from(discovered);
    const fkRes = await client.query(
      `SELECT DISTINCT conrelid::regclass::text AS from_table,
              confrelid::regclass::text AS to_table
       FROM pg_constraint
       WHERE contype = 'f'
         AND connamespace = current_schema()::regnamespace
         AND (conrelid::regclass::text = ANY($1::text[])
              OR confrelid::regclass::text = ANY($1::text[]))`,
      [known]
    );
    for (const row of fkRes.rows) {
      if (!discovered.has(row.from_table)) { discovered.add(row.from_table); changed = true; }
      if (!discovered.has(row.to_table)) { discovered.add(row.to_table); changed = true; }
    }
  }

  const tables = Array.from(discovered);

  // Build FK edges within the set.
  const fkEdgesRes = await client.query(
    `SELECT conrelid::regclass::text AS from_table,
            a.attname AS from_col,
            confrelid::regclass::text AS to_table,
            af.attname AS to_col
     FROM pg_constraint c
     JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
     JOIN pg_attribute af ON af.attrelid = c.confrelid AND af.attnum = ANY(c.confkey)
     WHERE c.contype = 'f'
       AND c.connamespace = current_schema()::regnamespace
       AND conrelid::regclass::text = ANY($1::text[])
       AND confrelid::regclass::text = ANY($1::text[])`,
    [tables]
  );

  const edges = fkEdgesRes.rows.map((r) => ({
    from: r.from_table,
    fromCol: r.from_col,
    to: r.to_table,
    toCol: r.to_col,
  }));

  // Bypass FK trigger checks for the duration of the transaction.
  // This is safe because we're inside a transaction; on COMMIT the role
  // reverts and any other session is unaffected.
  await client.query(`SET LOCAL session_replication_role = 'replica'`);

  const deleted = [];

  // Track ids we still need to reach.
  // Format: Map<table, Map<col, Set<id>>>
  const liveIds = new Map();
  liveIds.set(rootTable, new Map([[rootColumn, new Set(rootIds)]]));

  // Process tables roughly from leaves (no FK to other tables) to root,
  // but since we bypass FK checks we can simply do them in dependency
  // order based on what ids we have. For the root table we use rootColumn;
  // for others we use the first FK whose target column we have ids for.

  // First: handle the root table.
  const rootIdsArr = Array.from(liveIds.get(rootTable).get(rootColumn));
  if (rootIdsArr.length > 0) {
    const res = await client.query(
      `DELETE FROM ${rootTable} WHERE ${rootColumn} = ANY($1::uuid[]) RETURNING id AS ${rootColumn}`,
      [rootIdsArr]
    );
    deleted.push({ table: rootTable, count: res.rowCount });
    // After root delete, propagate: collect ids returned so downstream can use them.
    if (!liveIds.has(rootTable)) liveIds.set(rootTable, new Map());
  }

  // Now: process child tables. We iterate in any order; for each table we
  // pick the FK column whose target ids we already have. The `SET LOCAL
  // session_replication_role = 'replica'` makes DELETE order irrelevant.
  for (const table of tables) {
    if (table === rootTable) continue;
    const myEdges = edges.filter((e) => e.from === table);

    // Pick the first FK whose target we have ids for.
    let chosen = null;
    for (const e of myEdges) {
      const targetLive = liveIds.get(e.to);
      if (targetLive && targetLive.has(e.toCol)) {
        chosen = e;
        break;
      }
    }
    if (!chosen) continue;

    const ids = Array.from(liveIds.get(chosen.to).get(chosen.toCol));
    if (ids.length === 0) continue;

    const res = await client.query(
      `DELETE FROM ${table} WHERE ${chosen.fromCol} = ANY($1::uuid[]) RETURNING id, ${chosen.fromCol} AS ${chosen.toCol}`,
      [ids]
    );
    deleted.push({ table, count: res.rowCount });

    if (!liveIds.has(table)) liveIds.set(table, new Map());
    const myLive = liveIds.get(table);
    if (!myLive.has(chosen.toCol)) myLive.set(chosen.toCol, new Set());
    const set = myLive.get(chosen.toCol);
    for (const row of res.rows) set.add(row[chosen.toCol]);
  }

  return deleted;
}

async function deleteTournaments(client, tournamentIds) {
  if (tournamentIds.length === 0) return [];

  await client.query('BEGIN');
  try {
    const deleted = await cascadeDelete(client, 'tournaments', 'id', tournamentIds);
    await client.query('COMMIT');
    return deleted;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  }
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const client = buildClient();
  await client.connect();
  try {
    const all = await listTournaments(client);

    const seedSet = new Set(SEED_TOURNAMENT_NAMES);
    const seedRows = all.filter((t) => seedSet.has(t.name));
    const toDelete = all.filter((t) => !seedSet.has(t.name));

    console.log('=== Seed pack (will be KEPT) ===');
    for (const t of seedRows) {
      const tag = t.name.startsWith(DEMO_PREFIX) ? '✓ seed' : '! not seed by name';
      console.log(`  [${tag}] ${t.name}  (${t.status}, created ${t.created_at.toISOString()})`);
    }
    const missingSeeds = SEED_TOURNAMENT_NAMES.filter(
      (n) => !all.some((t) => t.name === n)
    );
    if (missingSeeds.length > 0) {
      console.log('\n⚠ Seed tournaments NOT present in DB yet:');
      for (const n of missingSeeds) console.log(`  - ${n}`);
      console.log('  → Run `npm run seed:demo:full` after wiping to repopulate.');
    }

    console.log('\n=== Will be DELETED ===');
    if (toDelete.length === 0) {
      console.log('  (nothing)');
    } else {
      for (const t of toDelete) {
        console.log(`  - ${t.name}  (${t.status}, created ${t.created_at.toISOString()})`);
      }
      const counts = await countChildren(client, toDelete.map((t) => t.id));
      console.log('\nCascading rows that will also be removed:');
      for (const [table, n] of Object.entries(counts)) {
        console.log(`  - ${table}: ${n}`);
      }
    }

    if (dryRun) {
      console.log('\nDry run — nothing was deleted.');
      return;
    }

    if (toDelete.length === 0) {
      console.log('\nNothing to delete.');
      return;
    }

    console.log('\nDeleting...');
    const deleted = await deleteTournaments(client, toDelete.map((t) => t.id));
    console.log(`✓ Cascade delete complete:`);
    for (const { table, count } of deleted) {
      console.log(`  - ${table}: ${count}`);
    }
    console.log('\nNext step: npm run seed:demo:full   (only if missing seeds were listed above)');
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('Wipe failed:', err);
  process.exit(1);
});