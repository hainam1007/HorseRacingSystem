'use strict';

/**
 * Phase 6 — Real-data smoke test using the MongoDB export from Phase 8.
 *
 * Loads a few sample Mongo documents from the backup bson/metadata.json,
 * runs them through `rewriteDocument`, and prints the result.
 *
 * Usage (from project root):
 *   node migration/utils/uuid-mapper.smoke.js
 */

const fs = require('fs');
const path = require('path');
const { rewriteDocument, isUuid, isObjectId } = require('./uuid-mapper');

const SAMPLE_DIR = path.join(__dirname, '..', 'export', 'samples');
const SAMPLE_FILES = ['batch1.json', 'batch2.json', 'batch3.json', 'batch4.json'];

let total = 0;
let rewritten = 0;
let samples = 0;

console.log('\n--- Phase 6 Real-Data Smoke Test ---\n');

for (const fname of SAMPLE_FILES) {
    const p = path.join(SAMPLE_DIR, fname);
    if (!fs.existsSync(p)) {
        console.log(`  ⚠ missing ${fname}`);
        continue;
    }
    let raw;
    try {
        raw = JSON.parse(fs.readFileSync(p, 'utf8'));
    } catch (e) {
        console.log(`  ⚠ ${fname} not JSON: ${e.message}`);
        continue;
    }

    // Heuristic: each sample file may be { collection: [ docs... ] } or just [docs]
    let docs = [];
    if (Array.isArray(raw)) {
        docs = raw;
    } else if (typeof raw === 'object' && raw) {
        for (const k of Object.keys(raw)) {
            if (Array.isArray(raw[k])) {
                docs = docs.concat(raw[k].map((d) => ({ ...d, _collection: k })));
            }
        }
    }

    console.log(`\n  ${fname}: ${docs.length} docs`);
    for (const doc of docs) {
        total++;
        if (!doc || typeof doc !== 'object' || !doc._id) continue;
        if (!isObjectId(doc._id)) continue;

        const r = rewriteDocument(doc);
        if (isUuid(r._id)) {
            rewritten++;
            if (samples < 3) {
                console.log(`  ${doc._collection || '?'}: _id=${doc._id}`);
                console.log(`      → ${r._id}`);
                samples++;
            }
        }
    }
}

console.log(`\n--- Result: ${rewritten}/${total} docs rewritten to UUIDs ---\n`);
process.exit(0);