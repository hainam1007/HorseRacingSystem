const { RaceOddsMarket } = require('../models');

function basePopulate(query) {
  return query
    .populate({
      path: 'race_id',
      populate: [
        { path: 'tournament_id' },
        { path: 'round_id' }
      ]
    })
    .populate('odds.horse_id')
    .populate({
      path: 'odds.jockey_id',
      populate: {
        path: 'user_id',
        select: 'full_name email'
      }
    })
    .populate('generated_by', 'full_name email')
    .populate('manually_adjusted_by', 'full_name email');
}

async function findByRaceId(raceId) {
  return basePopulate(RaceOddsMarket.findOne({ race_id: raceId }));
}

async function upsertByRaceId(raceId, data) {
  return basePopulate(RaceOddsMarket.findOneAndUpdate(
    { race_id: raceId },
    data,
    {
      returnDocument: 'after',
      upsert: true,
      runValidators: true
    }
  ));
}

async function updateByRaceId(raceId, data) {
  return basePopulate(RaceOddsMarket.findOneAndUpdate(
    { race_id: raceId },
    data,
    {
      returnDocument: 'after',
      runValidators: true
    }
  ));
}

async function updateGeneratedByRaceId(raceId, data) {
  return basePopulate(RaceOddsMarket.findOneAndUpdate(
    { race_id: raceId, status: 'generated' },
    data,
    {
      returnDocument: 'after',
      runValidators: true
    }
  ));
}

module.exports = {
  findByRaceId,
  upsertByRaceId,
  updateGeneratedByRaceId,
  updateByRaceId
};
