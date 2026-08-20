'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const raceService = require('../services/raceService');
const raceRepository = require('../repositories/raceRepository');
const racetrackRepository = require('../repositories/racetrackRepository');
const registrationRepository = require('../repositories/registrationRepository');
const raceOddsMarketRepository = require('../repositories/raceOddsMarketRepository');
const tournamentRepository = require('../repositories/tournamentRepository');
const roundRepository = require('../repositories/roundRepository');

const original = {
    raceFindById: raceRepository.findById,
    raceCreate: raceRepository.create,
    raceUpdateById: raceRepository.updateById,
    racetrackFindById: racetrackRepository.findById,
    hasUncancelledRegistrationForRace: registrationRepository.hasUncancelledRegistrationForRace,
    hasPendingOrPaidPaymentForRace: registrationRepository.hasPendingOrPaidPaymentForRace,
    hasReservedSlotForRace: registrationRepository.hasReservedSlotForRace,
    findOddsMarketByRaceId: raceOddsMarketRepository.findByRaceId,
    findTournament: tournamentRepository.findById,
    findRound: roundRepository.findById
};

const activeRacetrack = {
    _id: 'track-new',
    code: 'SOC_SON',
    name: 'Trường đua Sóc Sơn',
    status: 'active',
    rule_version: 4,
    eligibility_rule: {
        schema_version: 1,
        type: 'horse_breed',
        allowed_values: ['Thoroughbred']
    }
};

function clearLifecycleBlockers() {
    registrationRepository.hasUncancelledRegistrationForRace = async () => false;
    registrationRepository.hasPendingOrPaidPaymentForRace = async () => false;
    registrationRepository.hasReservedSlotForRace = async () => false;
    raceOddsMarketRepository.findByRaceId = async () => null;
}

test.afterEach(() => {
    raceRepository.findById = original.raceFindById;
    raceRepository.create = original.raceCreate;
    raceRepository.updateById = original.raceUpdateById;
    racetrackRepository.findById = original.racetrackFindById;
    registrationRepository.hasUncancelledRegistrationForRace = original.hasUncancelledRegistrationForRace;
    registrationRepository.hasPendingOrPaidPaymentForRace = original.hasPendingOrPaidPaymentForRace;
    registrationRepository.hasReservedSlotForRace = original.hasReservedSlotForRace;
    raceOddsMarketRepository.findByRaceId = original.findOddsMarketByRaceId;
    tournamentRepository.findById = original.findTournament;
    roundRepository.findById = original.findRound;
});

test('createRace uses an active racetrack as the sole source for location, venue, and rule snapshot', async () => {
    let capturedPayload;
    tournamentRepository.findById = async () => ({ _id: 'tournament-1' });
    roundRepository.findById = async () => ({ _id: 'round-1' });
    racetrackRepository.findById = async () => activeRacetrack;
    raceRepository.create = async (payload) => {
        capturedPayload = payload;
        return { _id: 'race-1', ...payload };
    };

    const result = await raceService.createRace({
        tournament_id: 'tournament-1',
        round_id: 'round-1',
        name: 'SÓC SƠN CUP',
        racetrack_id: 'track-new'
    });

    assert.equal(capturedPayload.location, activeRacetrack.name);
    assert.equal(capturedPayload.venue_code, activeRacetrack.code);
    assert.deepEqual(capturedPayload.eligibility_rule_snapshot, {
        racetrack_id: 'track-new',
        racetrack_code: 'SOC_SON',
        rule_version: 4,
        rule: activeRacetrack.eligibility_rule
    });
    assert.equal(result.race.racetrack.code, 'SOC_SON');
});

test('createRace rejects an inactive racetrack', async () => {
    tournamentRepository.findById = async () => ({ _id: 'tournament-1' });
    roundRepository.findById = async () => ({ _id: 'round-1' });
    racetrackRepository.findById = async () => ({ ...activeRacetrack, status: 'inactive' });

    await assert.rejects(
        raceService.createRace({
            tournament_id: 'tournament-1',
            round_id: 'round-1',
            name: 'Inactive track race',
            racetrack_id: 'track-new'
        }),
        { statusCode: 422, message: 'Only active racetracks can be used for a race' }
    );
});

test('updateRace replaces the track-derived fields and snapshot before race activity begins', async () => {
    let capturedPayload;
    raceRepository.findById = async () => ({ _id: 'race-1', racetrack_id: 'track-old', status: 'scheduled' });
    racetrackRepository.findById = async () => activeRacetrack;
    raceRepository.updateById = async (id, payload) => {
        capturedPayload = payload;
        return { _id: id, ...payload };
    };
    clearLifecycleBlockers();

    const result = await raceService.updateRace('race-1', { racetrack_id: 'track-new' });

    assert.equal(capturedPayload.racetrack_id, 'track-new');
    assert.equal(capturedPayload.location, 'Trường đua Sóc Sơn');
    assert.equal(capturedPayload.venue_code, 'SOC_SON');
    assert.equal(capturedPayload.eligibility_rule_snapshot.rule_version, 4);
    assert.equal(result.race.racetrack._id, 'track-new');
});

test('updateRace blocks racetrack changes once a non-cancelled registration exists', async () => {
    raceRepository.findById = async () => ({ _id: 'race-1', racetrack_id: 'track-old', status: 'scheduled' });
    registrationRepository.hasUncancelledRegistrationForRace = async () => true;
    registrationRepository.hasPendingOrPaidPaymentForRace = async () => false;
    registrationRepository.hasReservedSlotForRace = async () => false;
    raceOddsMarketRepository.findByRaceId = async () => null;

    await assert.rejects(
        raceService.updateRace('race-1', { racetrack_id: 'track-new' }),
        function(error) {
            return error.statusCode === 409
                && error.details.blockers.includes('UNCANCELLED_REGISTRATION');
        }
    );
});

test('updateRace reports every lifecycle blocker that prevents a racetrack change', async () => {
    raceRepository.findById = async () => ({
        _id: 'race-1',
        racetrack_id: 'track-old',
        status: 'running',
        entries_finalized_at: '2026-08-20T08:00:00.000Z',
        betting_status: 'open',
        started_at: '2026-08-20T09:00:00.000Z'
    });
    registrationRepository.hasUncancelledRegistrationForRace = async () => true;
    registrationRepository.hasPendingOrPaidPaymentForRace = async () => true;
    registrationRepository.hasReservedSlotForRace = async () => true;
    raceOddsMarketRepository.findByRaceId = async () => ({ id: 'market-1' });

    await assert.rejects(
        raceService.updateRace('race-1', { racetrack_id: 'track-new' }),
        function(error) {
            return error.statusCode === 409
                && [
                    'ENTRIES_FINALIZED',
                    'BETTING_OPEN',
                    'RACE_ALREADY_STARTED_OR_COMPLETED',
                    'UNCANCELLED_REGISTRATION',
                    'PAYMENT_PENDING_OR_PAID',
                    'REGISTRATION_SLOT_RESERVED',
                    'ODDS_MARKET_CREATED'
                ].every(function(blocker) { return error.details.blockers.includes(blocker); });
        }
    );
});
