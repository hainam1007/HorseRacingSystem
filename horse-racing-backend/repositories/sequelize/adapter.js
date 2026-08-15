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
 * Apply a `$set` / `$unset` legacy-ORM update payload to a plain object
 * and return the fields to write.
 */
function projectUpdate(update) {
    if (!update) return {};
    const set = update.$set || {};
    const unset = update.$unset || {};
    // Most migrated services pass a plain update object, while a few legacy
    // paths still use {$set, $unset}. Preserve both forms instead of silently
    // dropping plain fields such as betting_status.
    const fields = { ...update, ...set };
    delete fields.$set;
    delete fields.$unset;
    for (const k of Object.keys(unset)) fields[k] = null;
    return fields;
}

module.exports = {
    toPlain,
    withIdAlias,
    serializeDates,
    projectUpdate
};
