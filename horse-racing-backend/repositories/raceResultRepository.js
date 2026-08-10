const { RaceResult } = require('../models');

function basePopulate(query) {
  return query
    .populate({
      path: 'race_id',
      populate: [
        { path: 'tournament_id' },
        { path: 'round_id' }
      ]
    })
    .populate('horse_id')
    .populate({
      path: 'jockey_id',
      populate: {
        path: 'user_id',
        select: 'full_name email'
      }
    })
    .populate({
      path: 'recorded_by',
      populate: {
        path: 'user_id',
        select: 'full_name email'
      }
    })
    .populate('confirmed_by', 'full_name email')
    .populate('published_by', 'full_name email')
    .populate('penalties_applied_by', 'full_name email')
    .populate('submitted_to_admin_by', 'full_name email')
    .populate('correction_requested_by', 'full_name email')
    .populate('correction_resolved_by', 'full_name email')
    .populate('applied_violation_ids')
    .populate('penalty_snapshot_violation_ids');
}

async function create(data) {
  return RaceResult.create(data);
}

async function find(filter) {
  return basePopulate(RaceResult.find(filter || {}).sort({ published_at: -1, recorded_at: -1 }));
}

async function findById(id) {
  return basePopulate(RaceResult.findById(id));
}

async function count(filter) {
  return RaceResult.countDocuments(filter || {});
}

async function updateById(id, data) {
  return RaceResult.findByIdAndUpdate(id, data, {
    returnDocument: 'after',
    runValidators: true
  });
}

async function updateMany(filter, data) {
  return RaceResult.updateMany(filter || {}, data, {
    runValidators: true
  });
}

module.exports = {
  create,
  count,
  find,
  findById,
  updateById,
  updateMany
};
