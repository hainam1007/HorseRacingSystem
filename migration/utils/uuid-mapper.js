'use strict';

/**
 * Phase 6 — ObjectId → UUID (v5) deterministic mapping.
 *
 * Every MongoDB `_id` (24-hex ObjectId) and any embedded/array'd ObjectId
 * must map to a stable UUID so that FK relationships stay intact across
 * the entire migration.
 *
 * Why v5?
 *   - Deterministic: same input → same UUID every run.
 *   - No state to persist (no lookup table needed).
 *   - Generates UUIDs that look and sort like real UUIDs.
 *
 * Two distinct namespaces:
 *   - ROOT_OBJECT_ID_NS  : for top-level collection documents and any
 *                          FK reference (e.g. `owner_id`, `race_id`) which
 *                          itself points to a top-level doc.
 *   - EMBEDDED_OBJECT_ID_NS : for embedded sub-document `_id` fields
 *                              (e.g. `meeting._id`, `terms._id`, `gear._id`).
 *                              These are scoped to the parent document so
 *                              that two different parents don't collide.
 *
 * Naming convention:
 *   - `mapObjectId` uses ROOT_OBJECT_ID_NS.
 *   - `mapEmbeddedObjectId` uses EMBEDDED_OBJECT_ID_NS with a parent scope.
 *   - `rewriteDocument` rewrites the root _id under ROOT_OBJECT_ID_NS, and
 *     delegates FK and embedded sub-doc through their respective paths.
 */

const crypto = require('crypto');

const ROOT_OBJECT_ID_NS = '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d'; // arbitrary fixed UUID
const EMBEDDED_OBJECT_ID_NS = '1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed'; // arbitrary fixed UUID

const OBJECT_ID_RE = /^[a-fA-F0-9]{24}$/;
const UUID_RE = /^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$/;

function uuidv5(input, namespace) {
    const ns = Buffer.from(namespace.replace(/-/g, ''));
    const key = Buffer.isBuffer(input) ? input : Buffer.from(String(input));
    const buf = crypto.createHash('sha1').update(ns).update(key).digest();
    // Set version (5) and variant (10) bits per RFC 4122.
    buf[6] = (buf[6] & 0x0f) | 0x50;
    buf[8] = (buf[8] & 0x3f) | 0x80;
    const hex = buf.toString('hex');
    return (
        hex.slice(0, 8) + '-' +
        hex.slice(8, 12) + '-' +
        hex.slice(12, 16) + '-' +
        hex.slice(16, 20) + '-' +
        hex.slice(20, 32)
    );
}

function isObjectId(value) {
    return typeof value === 'string' && OBJECT_ID_RE.test(value);
}

function isUuid(value) {
    return typeof value === 'string' && UUID_RE.test(value);
}

/**
 * Convert a top-level ObjectId (or any FK reference to a top-level doc)
 * into a UUID.
 */
function mapObjectId(objectId) {
    if (isUuid(objectId)) return objectId;
    if (!isObjectId(objectId)) {
        throw new TypeError(`mapObjectId: not a valid ObjectId: ${objectId}`);
    }
    return uuidv5(objectId, ROOT_OBJECT_ID_NS);
}

/**
 * Convert an embedded sub-document's `_id` into a UUID scoped to the parent
 * document + a path classifier (so e.g. `parent.gear` and `parent.term`
 * namespaces stay separate).
 */
function mapEmbeddedObjectId(parentObjectId, pathClassifier, subObjectId) {
    if (isUuid(subObjectId)) return subObjectId;
    if (!isObjectId(subObjectId)) {
        throw new TypeError(`mapEmbeddedObjectId: not a valid ObjectId: ${subObjectId}`);
    }
    const compositeKey = `${parentObjectId}::${pathClassifier}::${subObjectId}`;
    return uuidv5(compositeKey, EMBEDDED_OBJECT_ID_NS);
}

/**
 * Convert any string into a UUID via a stable SHA-1 v5 hash. Used for child
 * table row ids where the input is a composite (parent_id + path + index)
 * and is NOT itself an ObjectId.
 *
 * Uses EMBEDDED_OBJECT_ID_NS so that two different composite keys never
 * collide.
 */
function mapCompositeKey(compositeKey) {
    if (typeof compositeKey !== 'string' || compositeKey.length === 0) {
        throw new TypeError(`mapCompositeKey: empty key`);
    }
    return uuidv5(compositeKey, EMBEDDED_OBJECT_ID_NS);
}

/**
 * Recursively rewrite ObjectIds inside a value.
 *
 *   - At root, FK strings (e.g. top-level `owner_id`) are mapped via
 *     `mapObjectId` — they reference an independent top-level doc.
 *   - When descending into an object whose `_id` is an ObjectId, that
 *     sub-doc id is mapped via `mapEmbeddedObjectId(parentId, path)`.
 *   - String fields inside that sub-doc that look like ObjectIds are
 *     treated as references to OTHER top-level docs (e.g. `gear.code`
 *     is a code, but `meeting.jockey_id` would be a FK). We default to
 *     `mapObjectId` for those.
 *
 * `parentId` is the parent document's _id (ObjectId). When recursing into
 * an embedded sub-doc, we pass the parent's _id as the new parentId so
 * further nested sub-doc ids stay scoped correctly.
 */
function rewriteObjectIds(value, ctx = {}) {
    const { parentId = null, pathHint = '' } = ctx;

    if (value === null || value === undefined) return value;

    if (value instanceof Date) return value; // never rewrite Date

    if (Array.isArray(value)) {
        return value.map((v, i) => rewriteObjectIds(v, { parentId, pathHint: `${pathHint}[${i}]` }));
    }

    if (typeof value === 'object') {
        // Sub-document with an ObjectId `_id` -- namespace it under parent.
        if (typeof value._id === 'string' && isObjectId(value._id)) {
            const embeddedId = parentId
                ? mapEmbeddedObjectId(parentId, pathHint || '_id', value._id)
                : mapObjectId(value._id);
            const cloned = { ...value, _id: embeddedId };
            for (const k of Object.keys(cloned)) {
                if (k === '_id') continue;
                cloned[k] = rewriteObjectIds(cloned[k], { parentId: parentId || value._id, pathHint: k });
            }
            return cloned;
        }

        // Mongoose virtual `id` mirroring `_id` (rare).
        if (typeof value.id === 'string' && isObjectId(value.id) && !value._id) {
            value = { ...value, id: parentId ? mapEmbeddedObjectId(parentId, pathHint || 'id', value.id) : mapObjectId(value.id) };
        }

        const out = {};
        for (const k of Object.keys(value)) {
            const v = value[k];
            if (typeof v === 'string' && isObjectId(v)) {
                // FK reference to a top-level doc.
                out[k] = mapObjectId(v);
            } else {
                out[k] = rewriteObjectIds(v, { parentId, pathHint: pathHint ? `${pathHint}.${k}` : k });
            }
        }
        return out;
    }

    if (typeof value === 'string' && isObjectId(value)) {
        return mapObjectId(value);
    }

    return value;
}

/**
 * Rewrite a single Mongo document: its `_id` becomes a UUID via `mapObjectId`,
 * and every nested ObjectId (FK or sub-doc) is rewritten under the document's
 * id namespace.
 *
 * Idempotent: if the input is already a UUID document, returns it unchanged.
 */
function rewriteDocument(doc) {
    if (!doc || typeof doc !== 'object') return doc;
    const rootId = doc._id;

    // Already in UUID form — return as-is.
    if (isUuid(rootId)) return doc;

    if (!isObjectId(rootId)) {
        throw new TypeError(`rewriteDocument: top-level _id is not an ObjectId: ${rootId}`);
    }
    const newRootId = mapObjectId(rootId);
    const rewritten = rewriteObjectIds(doc, { parentId: rootId });
    rewritten._id = newRootId;
    // Also rewrite `id` if it mirrors ObjectId (Mongoose virtual).
    if (typeof rewritten.id === 'string' && isObjectId(rewritten.id)) {
        rewritten.id = newRootId;
    }
    return rewritten;
}

module.exports = {
    OBJECT_ID_RE,
    UUID_RE,
    isObjectId,
    isUuid,
    uuidv5,
    mapObjectId,
    mapEmbeddedObjectId,
    mapCompositeKey,
    rewriteObjectIds,
    rewriteDocument,
    ROOT_OBJECT_ID_NS,
    EMBEDDED_OBJECT_ID_NS
};