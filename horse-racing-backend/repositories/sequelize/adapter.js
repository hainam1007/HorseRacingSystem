'use strict';

/**
 * Adapter utilities — bridge Sequelize ↔ legacy ORM shape.
 *
 * The legacy service code assumes:
 *   - `.toObject()` to plain JS
 *   - `._id` as the primary key (string in our case)
 *   - `.lean()` for plain objects
 *   - Update operators like `$set`, `$unset`, `$gt`, `$in`
 *
 * To minimize service-side rewrites, we expose helpers that turn Sequelize
 * rows / instances into plain JS objects with a `._id` alias and serialize
 * Dates to ISO strings (the legacy ORM default).
 */

function toPlain(instance) {
    if (instance === null || instance === undefined) return instance;
    if (Array.isArray(instance)) return instance.map(toPlain);
    if (typeof instance.toJSON === 'function') {
        const obj = instance.toJSON();
        return withIdAlias(toPlainObject(obj));
    }
    if (typeof instance.get === 'function' && typeof instance.dataValues !== 'undefined') {
        // Sequelize model instance
        const obj = { ...instance.dataValues };
        return withIdAlias(toPlainObject(obj));
    }
    if (typeof instance === 'object') {
        return withIdAlias(toPlainObject({ ...instance }));
    }
    return instance;
}

function toPlainObject(obj) {
    if (!obj || typeof obj !== 'object') return obj;
    if (obj instanceof Date) return obj.toISOString();
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
        if (v && typeof v === 'object' && typeof v.toJSON === 'function' && !(v instanceof Date)) {
            out[k] = withIdAlias(toPlainObject(v.toJSON()));
        } else if (v && typeof v === 'object' && typeof v.get === 'function' && v.dataValues) {
            out[k] = withIdAlias(toPlainObject({ ...v.dataValues }));
        } else if (Array.isArray(v)) {
            out[k] = v.map((item) => {
                if (item && typeof item === 'object' && typeof item.toJSON === 'function') {
                    return withIdAlias(toPlainObject(item.toJSON()));
                }
                if (item && typeof item === 'object' && typeof item.get === 'function' && item.dataValues) {
                    return withIdAlias(toPlainObject({ ...item.dataValues }));
                }
                return item;
            });
        } else {
            out[k] = v;
        }
    }
    return out;
}

function withIdAlias(obj) {
    if (!obj || typeof obj !== 'object') return obj;
    // Legacy code uses _id; Sequelize uses id. Some services do `.id.toString()`
    // and others `._id.toString()`. To minimize changes, expose BOTH as
    // string-shaped ids. (Sequelize returns UUID as string already.)
    if (obj._id === undefined && obj.id !== undefined) {
        Object.defineProperty(obj, '_id', {
            value: obj.id,
            enumerable: false,
            writable: true,
            configurable: true
        });
    }
    return obj;
}

function serializeDates(obj) {
    if (obj === null || obj === undefined) return obj;
    if (obj instanceof Date) return obj.toISOString();
    if (Array.isArray(obj)) return obj.map(serializeDates);
    if (typeof obj !== 'object') return obj;
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
        out[k] = serializeDates(v);
    }
    return out;
}

/**
 * Normalize a legacy-ORM update payload to a flat fields object.
 *
 * Accepts both shapes that callers use:
 *   - Mongoose-style operator: { $set: {a:1}, $unset: {b:1} }
 *   - Plain object:            { a: 1, b: 2 }
 *
 * Always returns a flat object with the fields to write. Returning an empty
 * object would make `Model.update()` affect 0 rows and the callers interpret
 * that as "row not found" (HTTP 404), which is the bug we are fixing here.
 */
function projectUpdate(update) {
    if (!update || typeof update !== 'object') return {};

    // Legacy mongoose operator form
    if (Object.prototype.hasOwnProperty.call(update, '$set') ||
        Object.prototype.hasOwnProperty.call(update, '$unset')) {
        const set = update.$set || {};
        const unset = update.$unset || {};
        const fields = { ...set };
        for (const k of Object.keys(unset)) fields[k] = null;
        return fields;
    }

    // Plain object form (used by the modernized services)
    return { ...update };
}

/**
 * Soft-delete a row by `id` using a raw SQL UPDATE.
 *
 * Many Sequelize models in this codebase do NOT declare the `deleted_at`
 * column (it lives in Postgres but was omitted from the model definition),
 * which makes `Model.update({ deleted_at: now })` a no-op (affected = 0).
 * Going through raw SQL keeps the call idempotent across models regardless
 * of whether they declare the field, and keeps the soft-delete semantics
 * identical to what every service expects.
 */
async function softDeleteById(model, id, deletedAt) {
    const sequelize = model.sequelize;
    const tableName = model.tableName;
    const pkCol = model.primaryKeyAttribute || 'id';
    const ts = (deletedAt || new Date()).toISOString();
    const [results] = await sequelize.query(
        `UPDATE ${tableName} SET deleted_at = :ts WHERE ${pkCol} = :id RETURNING *`,
        { replacements: { id, ts }, type: sequelize.QueryTypes.UPDATE }
    );
    if (!results || !results.length) return null;
    return toPlain(results[0]);
}

module.exports = {
    toPlain,
    withIdAlias,
    serializeDates,
    projectUpdate,
    softDeleteById
};