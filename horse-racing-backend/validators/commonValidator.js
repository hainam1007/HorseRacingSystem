const ApiError = require('../utils/ApiError');

/**
 * UUID v4 format validator (PostgreSQL primary keys).
 *
 * The previous implementation accepted the legacy 24-char hex identifier
 * format. PostgreSQL uses UUIDs (32 hex chars with dashes), so we accept the
 * standard UUID v4 format and reject anything else with the same 400 status
 * to preserve the API contract.
 *
 * NOTE: Newer PostgreSQL versions also generate UUIDv7 / UUIDv8 identifiers
 * whose version nibble is not 1-5. We keep the variant nibble check (`8/9/a/b`
 * per RFC 4122) but accept any hex version nibble to avoid 400s for newer
 * UUID variants that still live in the `races`/`tournaments` tables.
 */
const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value) {
    if (typeof value !== 'string') return false;
    return UUID_V4_REGEX.test(value);
}

function validateUuidParam(paramName) {
    return function (req, res, next) {
        const value = req.params[paramName];

        if (!isUuid(value)) {
            return next(new ApiError(400, paramName + ' is invalid'));
        }

        return next();
    };
}

function validateRequiredFields(fields) {
    return function (req, res, next) {
        const body = req.body || {};
        const errors = fields
            .filter(function (field) {
                return body[field] === undefined || body[field] === null || body[field] === '';
            })
            .map(function (field) {
                return {
                    field: field,
                    message: field + ' is required'
                };
            });

        if (errors.length) {
            return next(new ApiError(400, 'Validation failed', errors));
        }

        return next();
    };
}

module.exports = {
    isUuid,
    isObjectId: isUuid, // Backward-compat alias used by some callers
    validateObjectIdParam: validateUuidParam,
    validateUuidParam,
    validateRequiredFields
};