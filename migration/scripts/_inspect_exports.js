'use strict';
/**
 * Inspect all exported JSON files to understand their structure.
 * Prints the keys + array/object types of each top-level doc.
 */

const fs = require('fs');
const path = require('path');

const EXPORT_DIR = path.join(__dirname, '..', 'export');
const files = fs.readdirSync(EXPORT_DIR).filter(f => f.endsWith('.json') && f !== '_summary.json');

function describe(value, depth = 0, maxDepth = 3) {
    if (depth > maxDepth) return '...';
    if (value === null) return 'null';
    if (value === undefined) return 'undefined';
    if (typeof value === 'string') {
        if (/^[a-f0-9]{24}$/i.test(value)) return '<ObjectId>';
        if (/^\d{4}-\d{2}-\d{2}T/.test(value)) return '<Date>';
        return JSON.stringify(value.slice(0, 50));
    }
    if (typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) {
        if (value.length === 0) return '[]';
        const inner = describe(value[0], depth + 1, maxDepth);
        return `[${value.length}]: ${inner}`;
    }
    const keys = Object.keys(value);
    if (keys.length === 0) return '{}';
    const lines = keys.map(k => {
        const v = value[k];
        const t = describe(v, depth + 1, maxDepth);
        return `${'  '.repeat(depth + 1)}${k}: ${t}`;
    }).join('\n');
    return `{\n${lines}\n${'  '.repeat(depth)}}`;
}

for (const f of files) {
    const p = path.join(EXPORT_DIR, f);
    const docs = JSON.parse(fs.readFileSync(p, 'utf8'));
    if (docs.length === 0) {
        console.log(`\n=== ${f} (empty) ===`);
        continue;
    }
    console.log(`\n=== ${f} (${docs.length} docs) — sample 0 ===`);
    console.log(describe(docs[0]));
}