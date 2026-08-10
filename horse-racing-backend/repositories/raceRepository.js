const { Race } = require('../models');
const { SOFT_DELETE_STATUS } = require('../constants/statuses');

function basePopulate(query) {
  return query
    .populate('tournament_id')
    .populate('round_id')
    .populate({
      path: 'referee_id',
      populate: {
        path: 'user_id',
        select: 'full_name email'
      }
    });
}

async function create(data) {
  return Race.create(data);
}

async function find(filter) {
  return basePopulate(Race.find(filter || {}).sort({ created_at: -1, race_date: -1 }));
}

async function count(filter) {
  return Race.countDocuments(filter || {});
}

async function findByTournamentIds(tournamentIds) {
  if (!tournamentIds || !tournamentIds.length) {
    return [];
  }

  return Race.find({
    tournament_id: { $in: tournamentIds },
    status: { $ne: SOFT_DELETE_STATUS }
  })
    .select('tournament_id prize_pool prize_currency status')
    .lean();
}

async function findById(id) {
  return basePopulate(Race.findById(id));
}

async function updateById(id, data) {
  return Race.findByIdAndUpdate(id, data, {
    returnDocument: 'after',
    runValidators: true
  });
}

async function updateOne(filter, data, session) {
  return basePopulate(Race.findOneAndUpdate(filter || {}, data, {
    returnDocument: 'after',
    runValidators: true,
    session: session || null
  }));
}

async function updateMany(filter, data) {
  return Race.updateMany(filter || {}, data, {
    runValidators: true
  });
}

async function softDeleteById(id) {
  return updateById(id, { status: SOFT_DELETE_STATUS });
}

module.exports = {
  create,
  find,
  findByTournamentIds,
  count,
  findById,
  updateById,
  updateOne,
  updateMany,
  softDeleteById
};
