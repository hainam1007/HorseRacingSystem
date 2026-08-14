'use strict';

/**
 * Phase 9 — Export MongoDB collections to JSON.
 *
 * Reads from the live MongoDB instance (preferred) or from the BSON backup
 * directory (fallback) and writes each collection's documents to
 *   migration/export/<collection>.json
 *
 * Each output file is an array of JSON documents with:
 *   - all top-level fields preserved as-is from MongoDB
 *   - ObjectIds preserved (Phase 10 will normalize to UUID v5)
 *   - Date fields converted to ISO 8601 strings (JSON-friendly)
 *   - Decimal128, ObjectId, BinData serialized to plain strings/objects
 *
 * Usage:
 *   node migration/scripts/export-mongo-to-json.js [--from=bson] [--batch=500]
 */

const path = require('path');
// Make sure node can resolve backend dependencies (mongoose/mongodb/bson live there)
process.env.NODE_PATH = path.resolve(__dirname, '..', '..', 'horse-racing-backend', 'node_modules');
require('module').Module._initPaths();

const dotenv = require('dotenv');
const fs = require('fs');
dotenv.config({ path: path.resolve(__dirname, '..', '..', 'horse-racing-backend', '.env') });

const args = process.argv.slice(2);
const opt = { source: 'live', batchSize: 500 };
for (const a of args) {
    if (a.startsWith('--from=')) opt.source = a.slice(7);
    else if (a.startsWith('--batch=')) opt.batchSize = parseInt(a.slice(8), 10) || 500;
}

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const EXPORT_DIR = path.join(PROJECT_ROOT, 'migration', 'export');
const BACKUP_DIR = path.join(PROJECT_ROOT, 'migration', 'backup', 'mongo_backup_20260813_235329', 'horse_racing');

if (!fs.existsSync(EXPORT_DIR)) fs.mkdirSync(EXPORT_DIR, { recursive: true });

/**
 * JSON.stringify replacer that handles special Mongo types that aren't
 * natively JSON-serializable: ObjectId, Date, Decimal128, Long, BinData,
 * BSONRegExp, BSONSymbol, etc.
 */
function jsonReplacer(key, value) {
    if (value === null || value === undefined) return value;

    // ObjectId -> hex string (24 chars). Phase 10 will convert to UUID.
    if (typeof value === 'object' && value.constructor && value.constructor.name === 'ObjectID') {
        return value.toHexString();
    }

    // Date -> ISO string (so the JSON stays compact and re-importable).
    if (value instanceof Date) {
        return value.toISOString();
    }

    // Decimal128 -> string (preserve precision).
    if (typeof value === 'object' && value.constructor && value.constructor.name === 'Decimal128') {
        return value.toString();
    }

    // Long/Int64 -> string to avoid JS Number precision loss.
    if (typeof value === 'object' && value.constructor && (value.constructor.name === 'Long' || value.constructor.name === 'Int32' || value.constructor.name === 'Timestamp')) {
        return value.toString();
    }

    // BSONRegExp -> { pattern, options }
    if (typeof value === 'object' && value.constructor && value.constructor.name === 'BSONRegExp') {
        return { _regex: value.pattern, options: value.options };
    }

    // BinData -> { _bin: '<hex>' }
    if (typeof value === 'object' && value.constructor && value.constructor.name === 'Binary') {
        return { _bin: value.toString('hex'), sub_type: value.sub_type || 0 };
    }

    return value;
}

/**
 * Write a JSON document array to disk. Uses pretty-print for human inspection
 * but keeps it as a single line array structure for streaming reads.
 */
function writeJson(filePath, docs) {
    const json = JSON.stringify(docs, jsonReplacer, 2);
    fs.writeFileSync(filePath, json, 'utf8');
    return json.length;
}

async function exportFromLiveMongoDB() {
    const { MongoClient } = require('mongodb');
    const uri = process.env.MONGODB_URI;
    const dbName = process.env.MONGODB_DB_NAME || 'horse_racing';
    if (!uri) {
        throw new Error('MONGODB_URI is not set in .env');
    }
    const client = new MongoClient(uri, { serverSelectionTimeoutMS: 10000 });
    await client.connect();
    const db = client.db(dbName);
    const collections = await db.listCollections().toArray();
    console.log(`[live] connected to ${dbName}; found ${collections.length} collections`);

    const summary = {};
    for (const c of collections) {
        const name = c.name;
        if (name.startsWith('system.')) continue;
        const cursor = db.collection(name).find({}, { batchSize: opt.batchSize });
        const docs = await cursor.toArray();
        const outPath = path.join(EXPORT_DIR, `${name}.json`);
        const bytes = writeJson(outPath, docs);
        summary[name] = { count: docs.length, bytes };
        console.log(`  ✔ ${name}: ${docs.length} docs → ${outPath} (${(bytes / 1024).toFixed(1)} KB)`);
    }
    await client.close();
    return summary;
}

function exportFromBsonBackup() {
    const { deserialize } = require('bson');
    if (!fs.existsSync(BACKUP_DIR)) {
        throw new Error(`Backup directory not found: ${BACKUP_DIR}`);
    }
    const files = fs.readdirSync(BACKUP_DIR).filter((f) => f.endsWith('.bson'));
    console.log(`[bson] found ${files.length} .bson files in ${BACKUP_DIR}`);

    const summary = {};
    for (const f of files) {
        const collection = f.replace(/\.bson$/, '');
        const buf = fs.readFileSync(path.join(BACKUP_DIR, f));
        const docs = [];
        let offset = 0;
        // Each doc begins with a 4-byte little-endian length prefix.
        while (offset < buf.length) {
            const len = buf.readUInt32LE(offset);
            if (len === 0 || offset + len > buf.length) break;
            try {
                const doc = deserialize(buf.slice(offset + 4, offset + len));
                docs.push(doc);
            } catch (err) {
                console.log(`  ⚠ failed to parse ${f} @${offset}: ${err.message}`);
                break;
            }
            offset += 4 + len + 1; // +1 for null terminator
        }
        const outPath = path.join(EXPORT_DIR, `${collection}.json`);
        const bytes = writeJson(outPath, docs);
        summary[collection] = { count: docs.length, bytes };
        console.log(`  ✔ ${collection}: ${docs.length} docs → ${outPath} (${(bytes / 1024).toFixed(1)} KB)`);
    }
    return summary;
}

async function main() {
    console.log(`\n--- Phase 9: Export MongoDB → JSON ---\n`);
    console.log(`Source: ${opt.source}`);
    console.log(`Export dir: ${EXPORT_DIR}\n`);

    let summary = {};
    if (opt.source === 'bson') {
        summary = exportFromBsonBackup();
    } else {
        try {
            summary = await exportFromLiveMongoDB();
        } catch (err) {
            console.log(`[live] ✖ ${err.message}`);
            console.log('[live] falling back to BSON backup');
            summary = exportFromBsonBackup();
        }
    }

    const totalDocs = Object.values(summary).reduce((acc, s) => acc + s.count, 0);
    const totalBytes = Object.values(summary).reduce((acc, s) => acc + s.bytes, 0);
    console.log(`\n--- Summary ---`);
    console.log(`  Collections: ${Object.keys(summary).length}`);
    console.log(`  Total docs:  ${totalDocs}`);
    console.log(`  Total size:  ${(totalBytes / 1024 / 1024).toFixed(2)} MB`);

    fs.writeFileSync(path.join(EXPORT_DIR, '_summary.json'), JSON.stringify(summary, null, 2), 'utf8');
    console.log(`\n✔ Wrote summary → ${path.join(EXPORT_DIR, '_summary.json')}\n`);
}

main().catch((err) => {
    console.error('✖ Phase 9 failed:', err.message);
    console.error(err.stack);
    process.exit(1);
});