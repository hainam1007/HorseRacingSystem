const { HorseCheck } = require('../models');

function basePopulate(query) {
  return query
    .populate('race_id')
    .populate({
      path: 'horse_id',
      populate: {
        path: 'owner_id',
        populate: {
          path: 'user_id',
          select: 'full_name email'
        }
      }
    })
    .populate({
      path: 'jockey_id',
      populate: {
        path: 'user_id',
        select: 'full_name email'
      }
    })
    .populate({
      path: 'referee_id',
      populate: {
        path: 'user_id',
        select: 'full_name email'
      }
    });
}

async function create(data) {
  return HorseCheck.create(data);
}

async function find(filter) {
  return basePopulate(HorseCheck.find(filter || {}).sort({ checked_at: -1 }));
}

async function findById(id) {
  return basePopulate(HorseCheck.findById(id));
}

async function findByRaceAndHorse(raceId, horseId) {
  return HorseCheck.findOne({ race_id: raceId, horse_id: horseId });
}

async function findOne(filter) {
  return basePopulate(HorseCheck.findOne(filter || {}));
}

async function updateById(id, data) {
  return HorseCheck.findByIdAndUpdate(id, data, {
    returnDocument: 'after',
    runValidators: true
  });
}

module.exports = {
  create,
  find,
  findById,
  findByRaceAndHorse,
  findOne,
  updateById
};
