const { Horse, HorseRatingHistory } = require('../models');

async function findHorseById(id, options) {
  const query = Horse.findById(id);
  if (options && options.session) query.session(options.session);
  return query;
}

async function updateHorseRating(id, data, options) {
  return Horse.findByIdAndUpdate(id, { $set: data }, {
    returnDocument: 'after',
    runValidators: true,
    session: options && options.session
  });
}

async function createHistory(data, options) {
  const documents = await HorseRatingHistory.create([data], { session: options && options.session });
  return documents[0];
}

async function findHistory(filter) {
  return HorseRatingHistory.find(filter || {})
    .populate('horse_id', 'name registration_number current_rating')
    .populate('race_id', 'name race_date race_class')
    .populate('calculated_by', 'full_name email')
    .sort({ calculated_at: -1 });
}

async function countHistory(filter, options) {
  const query = HorseRatingHistory.countDocuments(filter || {});
  if (options && options.session) query.session(options.session);
  return query;
}

module.exports = { countHistory, createHistory, findHistory, findHorseById, updateHorseRating };
