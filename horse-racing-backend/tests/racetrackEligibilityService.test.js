'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
    ELIGIBILITY_STATUS,
    REASON_CODES,
    calculateAgeAtRaceDate,
    assertHorseCanRegister,
    evaluateHorseForRace,
    evaluatePreRaceEligibility
} = require('../services/racetrackEligibilityService');

function raceFor(rule, overrides = {}) {
    return {
        _id: 'race-1',
        race_date: '2026-08-20T09:00:00.000Z',
        eligibility_rule_snapshot: {
            racetrack_id: 'track-1',
            racetrack_code: 'TEST_TRACK',
            rule_version: 1,
            rule
        },
        ...overrides
    };
}

function activeHorse(overrides = {}) {
    return {
        _id: 'horse-1',
        status: 'active',
        weight: 450,
        breed: 'Thoroughbred',
        date_of_birth: '2021-08-20T00:00:00.000Z',
        ...overrides
    };
}

const phuThoRule = {
    schema_version: 1,
    type: 'horse_weight_range',
    min_kg: 450,
    max_kg: 500,
    ballast_allowed: true
};

test('weight eligibility is inclusive at both bounds and supports conditional ballast below the minimum', () => {
    const race = raceFor(phuThoRule);

    assert.equal(evaluateHorseForRace(race, activeHorse({ weight: 450 })).status, ELIGIBILITY_STATUS.ELIGIBLE);
    assert.equal(evaluateHorseForRace(race, activeHorse({ weight: 500 })).status, ELIGIBILITY_STATUS.ELIGIBLE);

    const conditional = evaluateHorseForRace(race, activeHorse({ weight: 438 }));
    assert.equal(conditional.status, ELIGIBILITY_STATUS.CONDITIONAL_BALLAST);
    assert.equal(conditional.required_ballast_kg, 12);
    assert.deepEqual(conditional.reasons[0], {
        code: REASON_CODES.HORSE_WEIGHT_BELOW_MIN,
        actual: 438,
        required_min: 450
    });

    const tooHeavy = evaluateHorseForRace(race, activeHorse({ weight: 501 }));
    assert.equal(tooHeavy.status, ELIGIBILITY_STATUS.INELIGIBLE);
    assert.equal(tooHeavy.reasons[0].code, REASON_CODES.HORSE_WEIGHT_ABOVE_MAX);
});

test('inactive and missing-weight horses are ineligible', () => {
    const race = raceFor(phuThoRule);

    const inactive = evaluateHorseForRace(race, activeHorse({ status: 'retired' }));
    assert.equal(inactive.status, ELIGIBILITY_STATUS.INELIGIBLE);
    assert.equal(inactive.reasons[0].code, REASON_CODES.HORSE_NOT_ACTIVE);

    const missingWeight = evaluateHorseForRace(race, activeHorse({ weight: null }));
    assert.equal(missingWeight.status, ELIGIBILITY_STATUS.INELIGIBLE);
    assert.equal(missingWeight.reasons[0].code, REASON_CODES.HORSE_WEIGHT_MISSING);
});

test('age eligibility uses the race date and not a 365-day approximation', () => {
    const race = raceFor({
        schema_version: 1,
        type: 'horse_age_range',
        min_years: 4,
        max_years: 5
    });

    assert.equal(calculateAgeAtRaceDate('2021-08-21', race.race_date), 4);
    assert.equal(calculateAgeAtRaceDate('2020-02-29', '2025-02-28'), 4);
    assert.equal(evaluateHorseForRace(race, activeHorse({ date_of_birth: '2021-08-21' })).status, ELIGIBILITY_STATUS.ELIGIBLE);

    const tooYoung = evaluateHorseForRace(race, activeHorse({ date_of_birth: '2022-08-21' }));
    assert.equal(tooYoung.status, ELIGIBILITY_STATUS.INELIGIBLE);
    assert.equal(tooYoung.reasons[0].code, REASON_CODES.HORSE_AGE_BELOW_MIN);

    const tooOld = evaluateHorseForRace(race, activeHorse({ date_of_birth: '2020-08-20' }));
    assert.equal(tooOld.status, ELIGIBILITY_STATUS.INELIGIBLE);
    assert.equal(tooOld.reasons[0].code, REASON_CODES.HORSE_AGE_ABOVE_MAX);

    const missingDob = evaluateHorseForRace(race, activeHorse({ date_of_birth: null }));
    assert.equal(missingDob.reasons[0].code, REASON_CODES.HORSE_DOB_MISSING);
});

test('breed eligibility normalizes whitespace and case', () => {
    const race = raceFor({
        schema_version: 1,
        type: 'horse_breed',
        allowed_values: ['Thoroughbred']
    });

    assert.equal(evaluateHorseForRace(race, activeHorse({ breed: ' thoroughbred ' })).status, ELIGIBILITY_STATUS.ELIGIBLE);

    const otherBreed = evaluateHorseForRace(race, activeHorse({ breed: 'Arabian' }));
    assert.equal(otherBreed.status, ELIGIBILITY_STATUS.INELIGIBLE);
    assert.deepEqual(otherBreed.reasons[0], {
        code: REASON_CODES.HORSE_BREED_NOT_ALLOWED,
        actual: 'Arabian',
        allowed_values: ['Thoroughbred']
    });

    const missingBreed = evaluateHorseForRace(race, activeHorse({ breed: '   ' }));
    assert.equal(missingBreed.reasons[0].code, REASON_CODES.HORSE_BREED_MISSING);
});

test('registration assertion accepts conditional ballast but rejects ineligible horses', () => {
    const race = raceFor(phuThoRule);
    const conditional = assertHorseCanRegister(race, activeHorse({ weight: 440 }));
    assert.equal(conditional.status, ELIGIBILITY_STATUS.CONDITIONAL_BALLAST);

    assert.throws(
        () => assertHorseCanRegister(race, activeHorse({ weight: 501 })),
        function(error) {
            return error.statusCode === 422
                && error.details.eligibility.reasons[0].code === REASON_CODES.HORSE_WEIGHT_ABOVE_MAX;
        }
    );
});

test('pre-race eligibility requires and verifies confirmed ballast', () => {
    const race = raceFor(phuThoRule);
    const horse = activeHorse({ weight: 438 });

    const measuredInRange = evaluatePreRaceEligibility(race, horse, { weight: 460 });
    assert.equal(measuredInRange.status, ELIGIBILITY_STATUS.ELIGIBLE);
    assert.equal(measuredInRange.required_ballast_kg, 0);

    const unconfirmed = evaluatePreRaceEligibility(race, horse, { weight: 438, ballast_added_kg: 12, ballast_confirmed: false });
    assert.equal(unconfirmed.status, ELIGIBILITY_STATUS.INELIGIBLE);
    assert.equal(unconfirmed.reasons[0].code, REASON_CODES.BALLAST_CONFIRMATION_REQUIRED);

    const insufficient = evaluatePreRaceEligibility(race, horse, { weight: 438, ballast_added_kg: 10, ballast_confirmed: true });
    assert.equal(insufficient.status, ELIGIBILITY_STATUS.INELIGIBLE);
    assert.equal(insufficient.reasons[0].code, REASON_CODES.BALLAST_AMOUNT_INSUFFICIENT);

    const passed = evaluatePreRaceEligibility(race, horse, { weight: 438, ballast_added_kg: 12, ballast_confirmed: true });
    assert.equal(passed.status, ELIGIBILITY_STATUS.ELIGIBLE);
    assert.equal(passed.required_ballast_kg, 12);
    assert.equal(passed.effective_weight_kg, 450);
});

test('pre-race ballast can never compensate an effective weight above the maximum', () => {
    const narrowRace = raceFor({
        schema_version: 1,
        type: 'horse_weight_range',
        min_kg: 450,
        max_kg: 451,
        ballast_allowed: true
    });

    const result = evaluatePreRaceEligibility(narrowRace, activeHorse({ weight: 449 }), {
        weight: 449,
        ballast_added_kg: 3,
        ballast_confirmed: true
    });

    assert.equal(result.status, ELIGIBILITY_STATUS.INELIGIBLE);
    assert.equal(result.reasons[0].code, REASON_CODES.BALLAST_EFFECTIVE_WEIGHT_ABOVE_MAX);
    assert.equal(result.effective_weight_kg, 452);
});
