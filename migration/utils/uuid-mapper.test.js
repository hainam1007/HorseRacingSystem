'use strict';

/**
 * Phase 6 — UUID mapping tests.
 *
 * Run from project root:
 *   node migration/utils/uuid-mapper.test.js
 *
 * Verifies:
 *   1. Determinism — same input → same UUID on every run.
 *   2. UUID v5 RFC compliance — version-bit set, variant-bit set.
 *   3. ObjectId → UUID stability for repeated keys.
 *   4. Embedded ObjectIds in different parent contexts produce different UUIDs.
 *   5. Document rewrite preserves structure & rewrites all ObjectIds.
 *   6. Idempotency — running a UUID through rewriteDocument is a no-op.
 *   7. Realistic Mongoose shape (jockey_assignment with embedded meeting/terms).
 */

const assert = require('assert');
const {
    isObjectId,
    isUuid,
    uuidv5,
    mapObjectId,
    mapEmbeddedObjectId,
    rewriteDocument,
    rewriteObjectIds,
    ROOT_OBJECT_ID_NS,
    EMBEDDED_OBJECT_ID_NS
} = require('./uuid-mapper');

let pass = 0;
let fail = 0;

function it(name, fn) {
    try {
        fn();
        console.log(`  ✔ ${name}`);
        pass++;
    } catch (e) {
        console.log(`  ✖ ${name}`);
        console.log(`    ${e.message}`);
        fail++;
    }
}

console.log('\n--- Phase 6 UUID Mapper Tests ---\n');

it('deterministic: same ObjectId → same UUID', () => {
    const oid = '507f1f77bcf86cd799439011';
    const a = mapObjectId(oid);
    const b = mapObjectId(oid);
    assert.strictEqual(a, b);
});

it('UUID v5 format: 8-4-4-4-12 hex', () => {
    const u = mapObjectId('507f1f77bcf86cd799439011');
    assert.match(u, /^[a-f0-9]{8}-[a-f0-9]{4}-5[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
});

it('different ObjectIds → different UUIDs', () => {
    const a = mapObjectId('507f1f77bcf86cd799439011');
    const b = mapObjectId('507f1f77bcf86cd799439012');
    assert.notStrictEqual(a, b);
});

it('isObjectId recognizes hex 24-char', () => {
    assert.strictEqual(isObjectId('507f1f77bcf86cd799439011'), true);
    assert.strictEqual(isObjectId('zzz'), false);
    assert.strictEqual(isObjectId('507f1f77bcf86cd79943901'), false); // 23 chars
    assert.strictEqual(isObjectId('507f1f77bcf86cd7994390111'), false); // 25 chars
});

it('isUuid recognizes UUID format', () => {
    assert.strictEqual(isUuid(mapObjectId('507f1f77bcf86cd799439011')), true);
    assert.strictEqual(isUuid('not-a-uuid'), false);
});

it('mapObjectId is idempotent on UUIDs', () => {
    const u = mapObjectId('507f1f77bcf86cd799439011');
    assert.strictEqual(mapObjectId(u), u);
});

it('embedded ObjectId changes with parent context', () => {
    const oid = '507f1f77bcf86cd799439099';
    const a = mapEmbeddedObjectId('507f1f77bcf86cd799439011', 'meeting._id', oid);
    const b = mapEmbeddedObjectId('507f1f77bcf86cd799439012', 'meeting._id', oid);
    const c = mapEmbeddedObjectId('507f1f77bcf86cd799439011', 'terms._id', oid);
    assert.notStrictEqual(a, b, 'different parent');
    assert.notStrictEqual(a, c, 'different path');
});

it('embedded ObjectId is stable for same context', () => {
    const a = mapEmbeddedObjectId('507f1f77bcf86cd799439011', 'meeting._id', '507f1f77bcf86cd799439099');
    const b = mapEmbeddedObjectId('507f1f77bcf86cd799439011', 'meeting._id', '507f1f77bcf86cd799439099');
    assert.strictEqual(a, b);
});

it('rewriteDocument: top-level _id becomes UUID', () => {
    const doc = { _id: '507f1f77bcf86cd799439011', name: 'horse A', rating: 80 };
    const r = rewriteDocument(doc);
    assert.ok(isUuid(r._id));
    assert.strictEqual(r.name, 'horse A');
    assert.strictEqual(r.rating, 80);
});

it('rewriteDocument: FK references rewritten', () => {
    const doc = {
        _id: '507f1f77bcf86cd799439011',
        owner_id: '507f1f77bcf86cd799439012',
        breed: 'Arabian'
    };
    const r = rewriteDocument(doc);
    assert.ok(isUuid(r.owner_id));
    assert.strictEqual(r.breed, 'Arabian');
});

it('rewriteDocument: embedded sub-doc _id namespaced', () => {
    const doc = {
        _id: '507f1f77bcf86cd799439020',
        meeting: { _id: '507f1f77bcf86cd799439021', url: 'https://meet.example' }
    };
    const r = rewriteDocument(doc);
    assert.ok(isUuid(r._id));
    assert.ok(isUuid(r.meeting._id));
    assert.notStrictEqual(r._id, r.meeting._id);
    assert.strictEqual(r.meeting.url, 'https://meet.example');
});

it('rewriteDocument: gear array elements', () => {
    const doc = {
        _id: '507f1f77bcf86cd799439030',
        default_gears: [
            { _id: '507f1f77bcf86cd799439031', code: 'B' },
            { _id: '507f1f77bcf86cd799439032', code: 'V' }
        ]
    };
    const r = rewriteDocument(doc);
    assert.ok(isUuid(r.default_gears[0]._id));
    assert.ok(isUuid(r.default_gears[1]._id));
    assert.notStrictEqual(r.default_gears[0]._id, r.default_gears[1]._id);
});

it('rewriteDocument: realistic Mongoose jockey_assignment shape', () => {
    const doc = {
        _id: '507f1f77bcf86cd799439040',
        race_id: '507f1f77bcf86cd799439041',
        horse_id: '507f1f77bcf86cd799439042',
        owner_id: '507f1f77bcf86cd799439043',
        jockey_id: '507f1f77bcf86cd799439044',
        status: 'meeting_invited',
        meeting: {
            _id: '507f1f77bcf86cd799439045',
            meeting_url: 'https://meet.example',
            meeting_time: new Date('2025-09-01T08:00:00Z')
        },
        terms: {
            _id: '507f1f77bcf86cd799439046',
            agreed_at: new Date('2025-09-01T08:30:00Z')
        },
        evidence_urls: ['https://example.com/p1.jpg', 'https://example.com/p2.jpg']
    };

    const r = rewriteDocument(doc);

    // Top-level refs are UUIDs
    assert.ok(isUuid(r._id));
    assert.ok(isUuid(r.race_id));
    assert.ok(isUuid(r.horse_id));
    assert.ok(isUuid(r.owner_id));
    assert.ok(isUuid(r.jockey_id));

    // Embedded sub-doc ids are UUIDs, distinct from parent and each other
    assert.ok(isUuid(r.meeting._id));
    assert.ok(isUuid(r.terms._id));
    assert.notStrictEqual(r.meeting._id, r.terms._id);
    assert.notStrictEqual(r.meeting._id, r._id);

    // Non-ObjectId values preserved
    assert.strictEqual(r.status, 'meeting_invited');
    assert.strictEqual(r.meeting.meeting_url, 'https://meet.example');
    assert.strictEqual(r.evidence_urls[0], 'https://example.com/p1.jpg');
    // Date preserves its time value (Date instance may not survive JSON parser,
    // but in-memory it remains an instanceof Date).
    assert.strictEqual(r.meeting.meeting_time.toISOString(), '2025-09-01T08:00:00.000Z');
});

it('rewriteDocument is idempotent (UUIDs pass through unchanged)', () => {
    const doc = {
        _id: '507f1f77bcf86cd799439050',
        owner_id: '507f1f77bcf86cd799439051'
    };
    const r1 = rewriteDocument(doc);
    // Synthesize a new doc that already has UUIDs
    const doc2 = { _id: r1._id, owner_id: r1.owner_id };
    const r2 = rewriteDocument(doc2);
    assert.strictEqual(r1._id, r2._id);
    // Note: assumes idempotency on already-UUID; we map isUuid → returns same.
});

it('rewriteDocument: array of FK refs', () => {
    const doc = {
        _id: '507f1f77bcf86cd799439060',
        applied_violation_ids: [
            '507f1f77bcf86cd799439061',
            '507f1f77bcf86cd799439062'
        ]
    };
    const r = rewriteDocument(doc);
    assert.ok(isUuid(r.applied_violation_ids[0]));
    assert.ok(isUuid(r.applied_violation_ids[1]));
    assert.notStrictEqual(r.applied_violation_ids[0], r.applied_violation_ids[1]);
});

it('throwing root _id is not an ObjectId', () => {
    assert.throws(() => rewriteDocument({ _id: 'not-an-oid' }), /top-level _id/);
});

it('namespace constants are stable', () => {
    assert.strictEqual(ROOT_OBJECT_ID_NS, '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d');
    assert.strictEqual(EMBEDDED_OBJECT_ID_NS, '1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed');
});

it('rewriteObjectIds handles primitive null/undefined', () => {
    assert.strictEqual(rewriteObjectIds(null), null);
    assert.strictEqual(rewriteObjectIds(undefined), undefined);
});

it('rewriteObjectIds handles array of primitives', () => {
    const r = rewriteObjectIds(['a', 'b', 'c']);
    assert.deepStrictEqual(r, ['a', 'b', 'c']);
});

it('cross-document: same FK ref in two docs yields same UUID', () => {
    const owner = '507f1f77bcf86cd799439080';
    const a = rewriteDocument({ _id: '507f1f77bcf86cd799439081', owner_id: owner });
    const b = rewriteDocument({ _id: '507f1f77bcf86cd799439082', owner_id: owner });
    assert.strictEqual(a.owner_id, b.owner_id, 'FK UUID consistency across docs');
});

it('uuidv5 RFC: variant + version bits', () => {
    const u = uuidv5('hello', ROOT_OBJECT_ID_NS);
    assert.strictEqual(u[14], '5', 'version nibble');
    assert.match(u[19], /[89ab]/, 'variant nibble');
});

console.log(`\n--- Result: ${pass} passed, ${fail} failed ---\n`);
process.exit(fail === 0 ? 0 : 1);