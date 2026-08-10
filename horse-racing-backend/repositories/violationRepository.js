const { Violation } = require('../models');

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
      path: 'referee_id',
      populate: {
        path: 'user_id',
        select: 'full_name email'
      }
    })
    .populate('horse_check_id')
    .populate('decided_by', 'full_name email');
}

async function create(data) {
  return Violation.create(data);
}

async function find(filter) {
  return basePopulate(Violation.find(filter || {}).sort({ created_at: -1 }));
}

async function findById(id) {
  return basePopulate(Violation.findById(id));
}

async function updateById(id, data) {
  return Violation.findByIdAndUpdate(id, data, {
    returnDocument: 'after',
    runValidators: true
  });
}

module.exports = {
  create,
  find,
  findById,
  updateById
};
