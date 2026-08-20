'use strict';

const ApiError = require('../utils/ApiError');

const ELIGIBILITY_STATUS = Object.freeze({
    ELIGIBLE: 'eligible',
    CONDITIONAL_BALLAST: 'conditional_ballast',
    INELIGIBLE: 'ineligible'
});

const REASON_CODES = Object.freeze({
    HORSE_NOT_ACTIVE: 'HORSE_NOT_ACTIVE',
    HORSE_WEIGHT_MISSING: 'HORSE_WEIGHT_MISSING',
    HORSE_WEIGHT_BELOW_MIN: 'HORSE_WEIGHT_BELOW_MIN',
    HORSE_WEIGHT_ABOVE_MAX: 'HORSE_WEIGHT_ABOVE_MAX',
    HORSE_DOB_MISSING: 'HORSE_DOB_MISSING',
    HORSE_AGE_BELOW_MIN: 'HORSE_AGE_BELOW_MIN',
    HORSE_AGE_ABOVE_MAX: 'HORSE_AGE_ABOVE_MAX',
    HORSE_BREED_MISSING: 'HORSE_BREED_MISSING',
    HORSE_BREED_NOT_ALLOWED: 'HORSE_BREED_NOT_ALLOWED',
    BALLAST_CONFIRMATION_REQUIRED: 'BALLAST_CONFIRMATION_REQUIRED',
    BALLAST_AMOUNT_INSUFFICIENT: 'BALLAST_AMOUNT_INSUFFICIENT',
    BALLAST_EFFECTIVE_WEIGHT_ABOVE_MAX: 'BALLAST_EFFECTIVE_WEIGHT_ABOVE_MAX'
});

function own(value, key) {
    return value !== null && value !== undefined && Object.prototype.hasOwnProperty.call(value, key);
}

function getId(document) {
    return document && (document._id || document.id);
}

function toFiniteNumber(value) {
    if (value === undefined || value === null || value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
}

function normalizeText(value) {
    return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
}

function isActiveHorse(horse) {
    return normalizeText(horse && horse.status).toLowerCase() === 'active';
}

function asValidDate(value) {
    if (value === undefined || value === null || value === '') return null;
    const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
}

function serializeDate(value) {
    const date = asValidDate(value);
    return date ? date.toISOString() : null;
}

function calculateAgeAtRaceDate(dateOfBirth, raceDate) {
    const dob = asValidDate(dateOfBirth);
    const date = asValidDate(raceDate);
    if (!dob || !date) return null;

    let age = date.getUTCFullYear() - dob.getUTCFullYear();
    const birthdayHasPassed = date.getUTCMonth() > dob.getUTCMonth()
        || (date.getUTCMonth() === dob.getUTCMonth() && date.getUTCDate() >= dob.getUTCDate());
    if (!birthdayHasPassed) age -= 1;
    return age;
}

function readRuleSnapshot(race) {
    if (!race) throw new ApiError(422, 'Race is required for eligibility evaluation');

    let snapshot = race.eligibility_rule_snapshot;
    if (typeof snapshot === 'string') {
        try {
            snapshot = JSON.parse(snapshot);
        } catch (_) {
            throw new ApiError(500, 'Race eligibility rule snapshot is invalid');
        }
    }

    if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
        throw new ApiError(422, 'Race eligibility rule snapshot is required');
    }

    const rule = snapshot.rule;
    if (!rule || typeof rule !== 'object' || Array.isArray(rule) || typeof rule.type !== 'string') {
        throw new ApiError(500, 'Race eligibility rule snapshot is invalid');
    }

    return { snapshot, rule };
}

function compact(object) {
    return Object.fromEntries(Object.entries(object).filter(function(entry) {
        return entry[1] !== undefined;
    }));
}

function buildEligibilityReason(code, context = {}) {
    const reason = { code };

    switch (code) {
    case REASON_CODES.HORSE_NOT_ACTIVE:
        return compact({ ...reason, actual: context.actual, required_status: 'active' });
    case REASON_CODES.HORSE_WEIGHT_BELOW_MIN:
    case REASON_CODES.HORSE_AGE_BELOW_MIN:
    case REASON_CODES.BALLAST_AMOUNT_INSUFFICIENT:
        return compact({ ...reason, actual: context.actual, required_min: context.required_min });
    case REASON_CODES.HORSE_WEIGHT_ABOVE_MAX:
    case REASON_CODES.HORSE_AGE_ABOVE_MAX:
    case REASON_CODES.BALLAST_EFFECTIVE_WEIGHT_ABOVE_MAX:
        return compact({ ...reason, actual: context.actual, required_max: context.required_max });
    case REASON_CODES.HORSE_BREED_NOT_ALLOWED:
        return compact({ ...reason, actual: context.actual, allowed_values: context.allowed_values });
    case REASON_CODES.BALLAST_CONFIRMATION_REQUIRED:
        return compact({ ...reason, required_ballast_kg: context.required_ballast_kg });
    default:
        return reason;
    }
}

function buildHorseFacts(horse) {
    const weight = toFiniteNumber(horse && horse.weight);
    return {
        weight_kg: weight,
        breed: normalizeText(horse && horse.breed) || null,
        date_of_birth: serializeDate(horse && horse.date_of_birth)
    };
}

function buildResult({ status, race, snapshot, rule, horse, reasons = [], requiredBallastKg = 0, extra = {} }) {
    return {
        status,
        race_id: getId(race) || null,
        racetrack_id: snapshot.racetrack_id || null,
        rule_version: snapshot.rule_version || null,
        rule,
        horse_facts: buildHorseFacts(horse),
        required_ballast_kg: requiredBallastKg,
        reasons,
        evaluated_at: new Date().toISOString(),
        ...extra
    };
}

function invalidResult(input, code, context, extra) {
    return buildResult({
        ...input,
        status: ELIGIBILITY_STATUS.INELIGIBLE,
        reasons: [buildEligibilityReason(code, context)],
        extra
    });
}

function assertRuleFields(rule, fields) {
    const invalid = fields.some(function(field) {
        const value = rule[field];
        return !Number.isFinite(Number(value)) || Number(value) < 0;
    });
    if (invalid) throw new ApiError(500, 'Race eligibility rule snapshot is invalid');
}

function evaluateHorseForRace(race, horse) {
    const { snapshot, rule } = readRuleSnapshot(race);
    const input = { race, snapshot, rule, horse };

    if (!isActiveHorse(horse)) {
        return invalidResult(input, REASON_CODES.HORSE_NOT_ACTIVE, { actual: horse && horse.status });
    }

    if (rule.type === 'horse_weight_range') {
        assertRuleFields(rule, ['min_kg', 'max_kg']);
        const minKg = Number(rule.min_kg);
        const maxKg = Number(rule.max_kg);
        if (minKg > maxKg || typeof rule.ballast_allowed !== 'boolean') {
            throw new ApiError(500, 'Race eligibility rule snapshot is invalid');
        }

        const weight = toFiniteNumber(horse && horse.weight);
        if (weight === null || weight < 0) {
            return invalidResult(input, REASON_CODES.HORSE_WEIGHT_MISSING);
        }
        if (weight > maxKg) {
            return invalidResult(input, REASON_CODES.HORSE_WEIGHT_ABOVE_MAX, { actual: weight, required_max: maxKg });
        }
        if (weight < minKg) {
            const requiredBallastKg = minKg - weight;
            const reason = buildEligibilityReason(REASON_CODES.HORSE_WEIGHT_BELOW_MIN, {
                actual: weight,
                required_min: minKg
            });
            return buildResult({
                ...input,
                status: rule.ballast_allowed ? ELIGIBILITY_STATUS.CONDITIONAL_BALLAST : ELIGIBILITY_STATUS.INELIGIBLE,
                requiredBallastKg: rule.ballast_allowed ? requiredBallastKg : 0,
                reasons: [reason]
            });
        }
        return buildResult({ ...input, status: ELIGIBILITY_STATUS.ELIGIBLE });
    }

    if (rule.type === 'horse_age_range') {
        assertRuleFields(rule, ['min_years', 'max_years']);
        const minYears = Number(rule.min_years);
        const maxYears = Number(rule.max_years);
        if (!Number.isInteger(minYears) || !Number.isInteger(maxYears) || minYears > maxYears) {
            throw new ApiError(500, 'Race eligibility rule snapshot is invalid');
        }

        const dob = asValidDate(horse && horse.date_of_birth);
        if (!dob) return invalidResult(input, REASON_CODES.HORSE_DOB_MISSING);
        const raceDate = asValidDate(race.race_date);
        if (!raceDate) throw new ApiError(422, 'Race date is required for age eligibility evaluation');

        const age = calculateAgeAtRaceDate(dob, raceDate);
        if (age < minYears) {
            return invalidResult(input, REASON_CODES.HORSE_AGE_BELOW_MIN, { actual: age, required_min: minYears });
        }
        if (age > maxYears) {
            return invalidResult(input, REASON_CODES.HORSE_AGE_ABOVE_MAX, { actual: age, required_max: maxYears });
        }
        return buildResult({ ...input, status: ELIGIBILITY_STATUS.ELIGIBLE, extra: { horse_age_years: age } });
    }

    if (rule.type === 'horse_breed') {
        if (!Array.isArray(rule.allowed_values) || rule.allowed_values.length === 0) {
            throw new ApiError(500, 'Race eligibility rule snapshot is invalid');
        }
        const breed = normalizeText(horse && horse.breed);
        if (!breed) return invalidResult(input, REASON_CODES.HORSE_BREED_MISSING);

        const allowedValues = rule.allowed_values
            .map(normalizeText)
            .filter(Boolean);
        if (!allowedValues.length) throw new ApiError(500, 'Race eligibility rule snapshot is invalid');
        if (!allowedValues.some(function(value) { return value.toLowerCase() === breed.toLowerCase(); })) {
            return invalidResult(input, REASON_CODES.HORSE_BREED_NOT_ALLOWED, {
                actual: breed,
                allowed_values: allowedValues
            });
        }
        return buildResult({ ...input, status: ELIGIBILITY_STATUS.ELIGIBLE });
    }

    throw new ApiError(500, 'Race eligibility rule snapshot is invalid');
}

function evaluatePreRaceEligibility(race, horse, horseCheck) {
    const { snapshot, rule } = readRuleSnapshot(race);
    if (rule.type !== 'horse_weight_range') {
        return evaluateHorseForRace(race, horse);
    }

    const input = { race, snapshot, rule, horse };
    if (!isActiveHorse(horse)) {
        return invalidResult(input, REASON_CODES.HORSE_NOT_ACTIVE, { actual: horse && horse.status });
    }

    assertRuleFields(rule, ['min_kg', 'max_kg']);
    const minKg = Number(rule.min_kg);
    const maxKg = Number(rule.max_kg);
    if (minKg > maxKg || typeof rule.ballast_allowed !== 'boolean') {
        throw new ApiError(500, 'Race eligibility rule snapshot is invalid');
    }

    const measuredWeight = toFiniteNumber(horseCheck && horseCheck.weight);
    const ballastAddedKg = toFiniteNumber(horseCheck && horseCheck.ballast_added_kg);
    const commonExtra = {
        measured_weight_kg: measuredWeight,
        ballast_added_kg: ballastAddedKg || 0,
        ballast_confirmed: Boolean(horseCheck && horseCheck.ballast_confirmed)
    };

    if (measuredWeight === null || measuredWeight < 0) {
        return invalidResult(input, REASON_CODES.HORSE_WEIGHT_MISSING, undefined, commonExtra);
    }
    if (measuredWeight > maxKg) {
        return invalidResult(input, REASON_CODES.HORSE_WEIGHT_ABOVE_MAX, {
            actual: measuredWeight,
            required_max: maxKg
        }, commonExtra);
    }
    if (measuredWeight >= minKg) {
        return buildResult({
            ...input,
            status: ELIGIBILITY_STATUS.ELIGIBLE,
            extra: { ...commonExtra, effective_weight_kg: measuredWeight }
        });
    }
    if (!rule.ballast_allowed) {
        return invalidResult(input, REASON_CODES.HORSE_WEIGHT_BELOW_MIN, {
            actual: measuredWeight,
            required_min: minKg
        }, commonExtra);
    }

    const requiredBallastKg = minKg - measuredWeight;
    if (!horseCheck || horseCheck.ballast_confirmed !== true) {
        return buildResult({
            ...input,
            status: ELIGIBILITY_STATUS.INELIGIBLE,
            requiredBallastKg,
            reasons: [buildEligibilityReason(REASON_CODES.BALLAST_CONFIRMATION_REQUIRED, { required_ballast_kg: requiredBallastKg })],
            extra: commonExtra
        });
    }
    if (ballastAddedKg === null || ballastAddedKg < requiredBallastKg) {
        return buildResult({
            ...input,
            status: ELIGIBILITY_STATUS.INELIGIBLE,
            requiredBallastKg,
            reasons: [buildEligibilityReason(REASON_CODES.BALLAST_AMOUNT_INSUFFICIENT, {
                actual: ballastAddedKg || 0,
                required_min: requiredBallastKg
            })],
            extra: commonExtra
        });
    }

    const effectiveWeight = measuredWeight + ballastAddedKg;
    if (effectiveWeight > maxKg) {
        return buildResult({
            ...input,
            status: ELIGIBILITY_STATUS.INELIGIBLE,
            requiredBallastKg,
            reasons: [buildEligibilityReason(REASON_CODES.BALLAST_EFFECTIVE_WEIGHT_ABOVE_MAX, {
                actual: effectiveWeight,
                required_max: maxKg
            })],
            extra: { ...commonExtra, effective_weight_kg: effectiveWeight }
        });
    }

    return buildResult({
        ...input,
        status: ELIGIBILITY_STATUS.ELIGIBLE,
        requiredBallastKg,
        extra: { ...commonExtra, effective_weight_kg: effectiveWeight }
    });
}

function assertHorseCanRegister(race, horse) {
    const eligibility = evaluateHorseForRace(race, horse);
    if (eligibility.status === ELIGIBILITY_STATUS.INELIGIBLE) {
        throw new ApiError(422, 'Horse is not eligible for this race', { eligibility });
    }
    return eligibility;
}

module.exports = {
    ELIGIBILITY_STATUS,
    REASON_CODES,
    calculateAgeAtRaceDate,
    buildEligibilityReason,
    evaluateHorseForRace,
    evaluatePreRaceEligibility,
    assertHorseCanRegister
};
