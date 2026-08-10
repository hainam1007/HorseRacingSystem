const { Bet } = require('../models');

function basePopulate(query) {
  return query
    .populate('spectator_id', 'full_name email')
    .populate({
      path: 'race_id',
      populate: [
        { path: 'tournament_id' },
        { path: 'round_id' }
      ]
    })
    .populate('predicted_horse_id')
    .populate('odds_market_id')
    .populate('settled_result_id');
}

async function create(data) {
  return Bet.create(data);
}

async function find(filter) {
  return basePopulate(Bet.find(filter || {}).sort({ submitted_at: -1 }));
}

async function findById(id) {
  return basePopulate(Bet.findById(id));
}

async function findPendingByRaceId(raceId) {
  return Bet.find({ race_id: raceId, status: 'pending' }).sort({ submitted_at: 1 });
}

async function updateById(id, data) {
  return basePopulate(Bet.findByIdAndUpdate(id, data, {
    returnDocument: 'after',
    runValidators: true
  }));
}

async function count(filter) {
  return Bet.countDocuments(filter || {});
}

module.exports = {
  create,
  count,
  find,
  findById,
  findPendingByRaceId,
  updateById
};
