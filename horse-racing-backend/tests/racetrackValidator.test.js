'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
    validateCreateRacetrack,
    validateUpdateRacetrack
} = require('../validators/racetrackValidator');

function runValidator(validator, body) {
    const req = { body };
    let error;
    validator(req, {}, function(nextError) { error = nextError; });
    return { error, payload: req.validatedBody };
}

test('racetrack validator normalizes a valid weight rule and enforces VN country code', () => {
    const result = runValidator(validateCreateRacetrack, {
        name: '  Trường đua kiểm thử  ',
        code: 'test_track',
        address: '  1  Test Street ',
        country_code: 'vn',
        status: 'ACTIVE',
        eligibility_rule: {
            schema_version: 1,
            type: 'horse_weight_range',
            min_kg: '400',
            max_kg: 450,
            ballast_allowed: true
        }
    });

    assert.equal(result.error, undefined);
    assert.equal(result.payload.name, 'Trường đua kiểm thử');
    assert.equal(result.payload.code, 'TEST_TRACK');
    assert.equal(result.payload.country_code, 'VN');
    assert.equal(result.payload.status, 'active');
    assert.deepEqual(result.payload.eligibility_rule, {
        schema_version: 1,
        type: 'horse_weight_range',
        min_kg: 400,
        max_kg: 450,
        ballast_allowed: true
    });
});

test('racetrack validator rejects mixed rule fields and inverted ranges', () => {
    const result = runValidator(validateCreateRacetrack, {
        name: 'Test',
        code: 'TEST',
        eligibility_rule: {
            schema_version: 1,
            type: 'horse_weight_range',
            min_kg: 500,
            max_kg: 450,
            ballast_allowed: true,
            min_years: 4
        }
    });

    assert.equal(result.error.statusCode, 400);
    assert.ok(result.error.details.some(function(item) { return item.field === 'eligibility_rule.min_years'; }));
    assert.ok(result.error.details.some(function(item) { return item.field === 'eligibility_rule'; }));
});

test('racetrack validator accepts only a non-empty normalized breed list', () => {
    const valid = runValidator(validateCreateRacetrack, {
        name: 'Breed track',
        code: 'BREED_TRACK',
        eligibility_rule: {
            schema_version: 1,
            type: 'horse_breed',
            allowed_values: [' Thoroughbred ', 'thoroughbred']
        }
    });
    assert.equal(valid.error, undefined);
    assert.deepEqual(valid.payload.eligibility_rule.allowed_values, ['Thoroughbred']);

    const invalid = runValidator(validateCreateRacetrack, {
        name: 'Breed track',
        code: 'BREED_TRACK_2',
        eligibility_rule: {
            schema_version: 1,
            type: 'horse_breed',
            allowed_values: []
        }
    });
    assert.equal(invalid.error.statusCode, 400);
    assert.ok(invalid.error.details.some(function(item) { return item.field === 'eligibility_rule.allowed_values'; }));
});

test('racetrack update validator rejects audit fields and requires an actual update field', () => {
    const invalid = runValidator(validateUpdateRacetrack, { rule_version: 2 });
    assert.equal(invalid.error.statusCode, 400);
    assert.ok(invalid.error.details.some(function(item) { return item.field === 'rule_version'; }));

    const valid = runValidator(validateUpdateRacetrack, { province: ' Hà Nội ' });
    assert.equal(valid.error, undefined);
    assert.deepEqual(valid.payload, { province: 'Hà Nội' });
});
