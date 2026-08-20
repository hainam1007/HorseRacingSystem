'use strict';

const ApiError = require('../utils/ApiError');

const RACETRACK_STATUSES = ['draft', 'active', 'inactive'];
const RULE_TYPES = ['horse_weight_range', 'horse_age_range', 'horse_breed'];
const CREATE_FIELDS = ['name', 'code', 'address', 'province', 'country_code', 'status', 'eligibility_rule'];
const UPDATE_FIELDS = CREATE_FIELDS;

function hasOwn(object, key) {
    return Object.prototype.hasOwnProperty.call(object, key);
}

function addError(errors, field, message) {
    errors.push({ field, message });
}

function isPlainObject(value) {
    return value !== null
        && typeof value === 'object'
        && !Array.isArray(value)
        && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

function normalizeString(value) {
    return typeof value === 'string' ? value.trim() : '';
}

function normalizeWhitespace(value) {
    return normalizeString(value).replace(/\s+/g, ' ');
}

function parseNonNegativeNumber(value, field, errors, { integer = false } = {}) {
    if (value === undefined || value === null || value === '') {
        addError(errors, field, field + ' is required');
        return undefined;
    }

    const number = Number(value);
    if (!Number.isFinite(number) || number < 0 || (integer && !Number.isInteger(number))) {
        addError(errors, field, field + (integer ? ' must be a non-negative integer' : ' must be a non-negative number'));
        return undefined;
    }
    return number;
}

function validateRule(rawRule, errors) {
    const fieldPrefix = 'eligibility_rule';
    if (!isPlainObject(rawRule)) {
        addError(errors, fieldPrefix, 'eligibility_rule must be an object');
        return undefined;
    }

    const type = normalizeString(rawRule.type);
    const commonFields = ['schema_version', 'type'];
    const allowedFieldsByType = {
        horse_weight_range: commonFields.concat(['min_kg', 'max_kg', 'ballast_allowed']),
        horse_age_range: commonFields.concat(['min_years', 'max_years']),
        horse_breed: commonFields.concat(['allowed_values'])
    };

    if (!RULE_TYPES.includes(type)) {
        addError(errors, fieldPrefix + '.type', 'type must be one of: ' + RULE_TYPES.join(', '));
        return undefined;
    }

    Object.keys(rawRule).forEach(function(key) {
        if (!allowedFieldsByType[type].includes(key)) {
            addError(errors, fieldPrefix + '.' + key, 'field is not allowed for rule type ' + type);
        }
    });

    if (rawRule.schema_version !== 1) {
        addError(errors, fieldPrefix + '.schema_version', 'schema_version must be 1');
    }

    if (type === 'horse_weight_range') {
        const minKg = parseNonNegativeNumber(rawRule.min_kg, fieldPrefix + '.min_kg', errors);
        const maxKg = parseNonNegativeNumber(rawRule.max_kg, fieldPrefix + '.max_kg', errors);

        if (typeof rawRule.ballast_allowed !== 'boolean') {
            addError(errors, fieldPrefix + '.ballast_allowed', 'ballast_allowed must be a boolean');
        }
        if (minKg !== undefined && maxKg !== undefined && minKg > maxKg) {
            addError(errors, fieldPrefix, 'min_kg must be less than or equal to max_kg');
        }

        return {
            schema_version: 1,
            type,
            min_kg: minKg,
            max_kg: maxKg,
            ballast_allowed: rawRule.ballast_allowed
        };
    }

    if (type === 'horse_age_range') {
        const minYears = parseNonNegativeNumber(rawRule.min_years, fieldPrefix + '.min_years', errors, { integer: true });
        const maxYears = parseNonNegativeNumber(rawRule.max_years, fieldPrefix + '.max_years', errors, { integer: true });

        if (minYears !== undefined && maxYears !== undefined && minYears > maxYears) {
            addError(errors, fieldPrefix, 'min_years must be less than or equal to max_years');
        }

        return {
            schema_version: 1,
            type,
            min_years: minYears,
            max_years: maxYears
        };
    }

    if (!Array.isArray(rawRule.allowed_values) || rawRule.allowed_values.length === 0) {
        addError(errors, fieldPrefix + '.allowed_values', 'allowed_values must contain at least one value');
        return { schema_version: 1, type, allowed_values: [] };
    }

    const seen = new Set();
    const allowedValues = [];
    rawRule.allowed_values.forEach(function(value, index) {
        const normalized = normalizeWhitespace(value);
        if (!normalized) {
            addError(errors, fieldPrefix + '.allowed_values[' + index + ']', 'breed value must be a non-empty string');
            return;
        }
        if (normalized.length > 120) {
            addError(errors, fieldPrefix + '.allowed_values[' + index + ']', 'breed value must be at most 120 characters');
            return;
        }
        const comparisonValue = normalized.toLowerCase();
        if (!seen.has(comparisonValue)) {
            seen.add(comparisonValue);
            allowedValues.push(normalized);
        }
    });

    if (allowedValues.length === 0) {
        addError(errors, fieldPrefix + '.allowed_values', 'allowed_values must contain at least one valid value');
    }

    return { schema_version: 1, type, allowed_values: allowedValues };
}

function addOptionalText(body, payload, field, errors, maxLength) {
    if (!hasOwn(body, field)) return;

    if (body[field] === null || body[field] === '') {
        payload[field] = null;
        return;
    }

    const value = normalizeWhitespace(body[field]);
    if (!value) {
        addError(errors, field, field + ' must be a string');
    } else if (value.length > maxLength) {
        addError(errors, field, field + ' must be at most ' + maxLength + ' characters');
    } else {
        payload[field] = value;
    }
}

function buildPayload(body, { creating }) {
    const errors = [];
    const payload = {};
    const allowedFields = creating ? CREATE_FIELDS : UPDATE_FIELDS;

    if (!isPlainObject(body)) {
        return { errors: [{ field: 'body', message: 'request body must be an object' }], payload };
    }

    Object.keys(body).forEach(function(field) {
        if (!allowedFields.includes(field)) {
            addError(errors, field, 'field is not allowed');
        }
    });

    if (creating || hasOwn(body, 'name')) {
        const name = normalizeWhitespace(body.name);
        if (!name) {
            addError(errors, 'name', 'name is required');
        } else if (name.length > 255) {
            addError(errors, 'name', 'name must be at most 255 characters');
        } else {
            payload.name = name;
        }
    }

    if (creating || hasOwn(body, 'code')) {
        const code = normalizeString(body.code).toUpperCase();
        if (!code) {
            addError(errors, 'code', 'code is required');
        } else if (!/^[A-Z0-9][A-Z0-9_-]{1,63}$/.test(code)) {
            addError(errors, 'code', 'code must be 2-64 uppercase letters, numbers, underscores, or hyphens');
        } else {
            payload.code = code;
        }
    }

    addOptionalText(body, payload, 'address', errors, 512);
    addOptionalText(body, payload, 'province', errors, 255);

    if (hasOwn(body, 'country_code') && normalizeString(body.country_code).toUpperCase() !== 'VN') {
        addError(errors, 'country_code', 'country_code must be VN');
    }
    if (creating) payload.country_code = 'VN';

    if (hasOwn(body, 'status')) {
        const status = normalizeString(body.status).toLowerCase();
        if (!RACETRACK_STATUSES.includes(status)) {
            addError(errors, 'status', 'status must be one of: ' + RACETRACK_STATUSES.join(', '));
        } else {
            payload.status = status;
        }
    } else if (creating) {
        payload.status = 'draft';
    }

    if (creating || hasOwn(body, 'eligibility_rule')) {
        const rule = validateRule(body.eligibility_rule, errors);
        if (rule) payload.eligibility_rule = rule;
    }

    if (!creating && Object.keys(payload).length === 0 && errors.length === 0) {
        addError(errors, 'body', 'At least one updatable field must be provided');
    }

    return { errors, payload };
}

function validateCreateRacetrack(req, res, next) {
    const { errors, payload } = buildPayload(req.body || {}, { creating: true });
    if (errors.length) return next(new ApiError(400, 'Validation failed', errors));
    req.validatedBody = payload;
    return next();
}

function validateUpdateRacetrack(req, res, next) {
    const { errors, payload } = buildPayload(req.body || {}, { creating: false });
    if (errors.length) return next(new ApiError(400, 'Validation failed', errors));
    req.validatedBody = payload;
    return next();
}

module.exports = {
    RACETRACK_STATUSES,
    RULE_TYPES,
    validateRule,
    validateCreateRacetrack,
    validateUpdateRacetrack
};
