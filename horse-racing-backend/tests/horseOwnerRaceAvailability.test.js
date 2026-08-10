const assert = require('node:assert/strict');
const test = require('node:test');
const mongoose = require('mongoose');

const { ROLE_NAMES } = require('../constants/roles');
const horseOwnerRepository = require('../repositories/horseOwnerRepository');
const horseOwnerService = require('../services/horseOwnerService');

const originals = {
  findProfileByUserId: horseOwnerRepository.findProfileByUserId,
  findTournamentById: horseOwnerRepository.findTournamentById,
  findRacesByTournamentId: horseOwnerRepository.findRacesByTournamentId,
  countApprovedRegistrationsByRaceIds: horseOwnerRepository.countApprovedRegistrationsByRaceIds
};

test.afterEach(() => {
  Object.assign(horseOwnerRepository, originals);
});

test('owner tournament race list exposes remaining capacity and unavailable reason', async () => {
  const userId = new mongoose.Types.ObjectId();
  const ownerId = new mongoose.Types.ObjectId();
  const tournamentId = new mongoose.Types.ObjectId();
  const openRaceId = new mongoose.Types.ObjectId();
  const fullRaceId = new mongoose.Types.ObjectId();

  horseOwnerRepository.findProfileByUserId = async () => ({ _id: ownerId, user_id: userId });
  horseOwnerRepository.findTournamentById = async () => ({
    _id: tournamentId,
    name: 'Demo Meeting'
  });
  horseOwnerRepository.findRacesByTournamentId = async () => [
    { _id: openRaceId, status: 'scheduled', max_participants: 6, prize_pool: 1000000, entry_fee: 50000, entry_fee_currency: 'VND' },
    { _id: fullRaceId, status: 'scheduled', max_participants: 5, prize_pool: 1000000, entry_fee: 50000, entry_fee_currency: 'VND' }
  ];
  horseOwnerRepository.countApprovedRegistrationsByRaceIds = async () => [
    { _id: openRaceId, count: 4 },
    { _id: fullRaceId, count: 5 }
  ];

  const result = await horseOwnerService.getRacesByTournamentId(
    { _id: userId, roles: [ROLE_NAMES.HORSE_OWNER] },
    tournamentId
  );

  assert.equal(result.races[0].participant_count, 4);
  assert.equal(result.races[0].remaining_slots, 2);
  assert.equal(result.races[0].registration_available, true);
  assert.equal(result.races[0].entry_fee_vnd, 50000);
  assert.equal(result.races[1].remaining_slots, 0);
  assert.equal(result.races[1].registration_available, false);
  assert.equal(result.races[1].registration_unavailable_reason, 'race_full');
});
