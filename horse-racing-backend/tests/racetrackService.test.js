'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const racetrackRepository = require('../repositories/racetrackRepository');
const racetrackService = require('../services/racetrackService');

const original = {
    findAll: racetrackRepository.findAll,
    findById: racetrackRepository.findById,
    findByCode: racetrackRepository.findByCode,
    create: racetrackRepository.create,
    updateById: racetrackRepository.updateById,
    countRaces: racetrackRepository.countRaces
};

const initialRule = {
    schema_version: 1,
    type: 'horse_weight_range',
    min_kg: 450,
    max_kg: 500,
    ballast_allowed: true
};

test.afterEach(() => {
    Object.assign(racetrackRepository, original);
});

test('racetrack service defaults public list reads to active tracks', async () => {
    let capturedFilter;
    racetrackRepository.findAll = async function(filter) {
        capturedFilter = filter;
        return [{ _id: 'track-1', status: 'active' }];
    };

    const result = await racetrackService.listRacetracks({});
    assert.deepEqual(capturedFilter, { status: 'active' });
    assert.equal(result.racetracks.length, 1);
});

test('racetrack service increments rule_version only when the eligibility rule changes', async () => {
    let capturedUpdate;
    racetrackRepository.findById = async function() {
        return { _id: 'track-1', code: 'PHU_THO', rule_version: 3, eligibility_rule: initialRule };
    };
    racetrackRepository.updateById = async function(id, update) {
        capturedUpdate = update;
        return { _id: id, ...update };
    };

    const changedRule = { ...initialRule, max_kg: 510 };
    const result = await racetrackService.updateRacetrack(
        'track-1',
        { eligibility_rule: changedRule },
        { _id: 'admin-1' }
    );

    assert.equal(capturedUpdate.rule_version, 4);
    assert.equal(capturedUpdate.updated_by, 'admin-1');
    assert.equal(result.racetrack.rule_version, 4);
});

test('racetrack service blocks a code change once any race references the track', async () => {
    racetrackRepository.findById = async function() {
        return { _id: 'track-1', code: 'PHU_THO', rule_version: 1, eligibility_rule: initialRule };
    };
    racetrackRepository.countRaces = async function() { return 1; };

    await assert.rejects(
        racetrackService.updateRacetrack('track-1', { code: 'PHU_THO_NEW' }, { _id: 'admin-1' }),
        { statusCode: 409, message: 'Racetrack code cannot be changed after it has been used by a race' }
    );
});

test('racetrack archive only switches the status to inactive', async () => {
    let capturedUpdate;
    racetrackRepository.findById = async function() {
        return { _id: 'track-1', status: 'active' };
    };
    racetrackRepository.updateById = async function(id, update) {
        capturedUpdate = update;
        return { _id: id, ...update };
    };

    const result = await racetrackService.archiveRacetrack('track-1', { _id: 'admin-1' });
    assert.deepEqual(capturedUpdate, { status: 'inactive', updated_by: 'admin-1' });
    assert.equal(result.racetrack.status, 'inactive');
});
