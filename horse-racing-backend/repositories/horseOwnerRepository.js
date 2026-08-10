const {
  HorseOwner,
  Horse,
  HorseCheck,
  Jockey,
  JockeyAssignment,
  Race,
  Registration,
  Round,
  Tournament
} = require('../models');
const { REGISTRATION_STATUS } = require('../constants/statuses');

async function findProfileByUserId(userId) {
  return HorseOwner.findOne({ user_id: userId });
}

async function updateProfileById(profileId, updateData) {
  return HorseOwner.findByIdAndUpdate(profileId, updateData, {
    returnDocument: 'after',
    runValidators: true
  });
}

async function findHorsesByOwnerId(ownerId) {
  return Horse.find({ owner_id: ownerId }).sort({ created_at: -1 }).lean();
}

async function createHorse(horseData) {
  return Horse.create(horseData);
}

async function findHorseById(horseId) {
  return Horse.findById(horseId).lean();
}

async function updateHorseById(horseId, updateData) {
  return Horse.findByIdAndUpdate(horseId, updateData, {
    returnDocument: 'after',
    runValidators: true
  });
}

async function findHorseChecksByHorseId(horseId) {
  return HorseCheck.find({ horse_id: horseId })
    .populate('race_id', 'name race_date status')
    .sort({ checked_at: -1 })
    .lean();
}

async function findRegistrationsByHorseId(horseId) {
  return Registration.find({ horse_id: horseId })
    .populate('tournament_id', 'name status start_date end_date')
    .populate('race_id', 'name race_date status')
    .sort({ registered_at: -1 })
    .lean();
}

async function findAvailableJockeys() {
  return Jockey.find({ status: 'active' })
    .populate('user_id', 'full_name email phone_number avatar_url')
    .sort({ total_wins: -1, total_races: -1 })
    .lean();
}

async function findJockeyById(jockeyId) {
  return Jockey.findById(jockeyId)
    .populate('user_id', 'full_name email phone_number avatar_url')
    .lean();
}

async function findTournamentById(tournamentId) {
  return Tournament.findById(tournamentId).lean();
}

async function findTournaments() {
  return Tournament.find({}).sort({ start_date: 1, created_at: -1 }).lean();
}

async function findRacesByTournamentIds(tournamentIds) {
  return Race.find({ tournament_id: { $in: tournamentIds } })
    .select('tournament_id prize_pool prize_currency max_participants status')
    .lean();
}

async function findRaceById(raceId) {
  return Race.findById(raceId).lean();
}

async function findRacesByTournamentId(tournamentId) {
  return Race.find({ tournament_id: tournamentId })
    .populate('round_id', 'name round_order status')
    .sort({ race_date: 1, created_at: -1 })
    .lean();
}

async function countApprovedRegistrationsByRaceIds(raceIds) {
  if (!raceIds || !raceIds.length) {
    return [];
  }

  return Registration.aggregate([
    {
      $match: {
        race_id: { $in: raceIds },
        $or: [
          { status: REGISTRATION_STATUS.APPROVED },
          {
            status: REGISTRATION_STATUS.PENDING,
            payment_status: 'pending',
            payment_expires_at: { $gt: new Date() }
          }
        ]
      }
    },
    {
      $group: {
        _id: '$race_id',
        count: { $sum: 1 }
      }
    }
  ]);
}

async function findRoundById(roundId) {
  return Round.findById(roundId).lean();
}

async function findRegistrationByRaceAndHorse(raceId, horseId) {
  return Registration.findOne({ race_id: raceId, horse_id: horseId }).lean();
}

async function findRegistrationByPaymentOrderId(orderId) {
  return Registration.findOne({ payment_order_id: orderId })
    .populate('tournament_id')
    .populate('race_id')
    .populate('horse_id')
    .populate({
      path: 'owner_id',
      populate: {
        path: 'user_id',
        select: 'full_name email'
      }
    });
}

async function createRegistration(registrationData) {
  return Registration.create(registrationData);
}

async function updateRegistrationById(registrationId, updateData) {
  return Registration.findByIdAndUpdate(registrationId, updateData, {
    returnDocument: 'after',
    runValidators: true
  });
}

async function findBoundJockeyIdsForRace(raceId) {
  return JockeyAssignment.find({
    race_id: raceId,
    status: { $in: ['accepted', 'standby_confirmed'] }
  }).select('jockey_id horse_id assignment_type').lean();
}

async function findRegistrationById(registrationId) {
  return Registration.findById(registrationId).lean();
}

async function updateRegistrationByPaymentOrderId(orderId, updateData) {
  return Registration.findOneAndUpdate(
    {
      payment_order_id: orderId,
      payment_status: 'pending'
    },
    updateData,
    {
      returnDocument: 'after',
      runValidators: true
    }
  );
}

module.exports = {
  findProfileByUserId,
  updateProfileById,
  findHorsesByOwnerId,
  createHorse,
  findHorseById,
  updateHorseById,
  findHorseChecksByHorseId,
  findRegistrationsByHorseId,
  findAvailableJockeys,
  findJockeyById,
  findBoundJockeyIdsForRace,
  findTournamentById,
  findTournaments,
  findRacesByTournamentIds,
  findRaceById,
  findRacesByTournamentId,
  countApprovedRegistrationsByRaceIds,
  findRoundById,
  findRegistrationByRaceAndHorse,
  findRegistrationById,
  findRegistrationByPaymentOrderId,
  createRegistration,
  updateRegistrationById,
  updateRegistrationByPaymentOrderId
};
