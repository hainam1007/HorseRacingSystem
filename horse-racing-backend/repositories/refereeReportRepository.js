const { RefereeReport } = require('../models');

function basePopulate(query) {
  return query
    .populate('race_id')
    .populate({
      path: 'referee_id',
      populate: {
        path: 'user_id',
        select: 'full_name email'
      }
    });
}

async function create(data) {
  return RefereeReport.create(data);
}

async function find(filter) {
  return basePopulate(RefereeReport.find(filter || {}).sort({ created_at: -1 }));
}

async function findById(id) {
  return basePopulate(RefereeReport.findById(id));
}

async function findOne(filter) {
  return basePopulate(RefereeReport.findOne(filter || {}).sort({ created_at: -1 }));
}

async function updateById(id, data) {
  return RefereeReport.findByIdAndUpdate(id, data, {
    returnDocument: 'after',
    runValidators: true
  });
}

module.exports = {
  create,
  find,
  findById,
  findOne,
  updateById
};
