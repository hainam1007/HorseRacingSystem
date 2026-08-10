const { Round } = require('../models');
const { SOFT_DELETE_STATUS } = require('../constants/statuses');

async function create(data) {
  return Round.create(data);
}

async function find(filter) {
  return Round.find(filter || {}).populate('tournament_id').sort({ round_order: 1 });
}

async function findById(id) {
  return Round.findById(id).populate('tournament_id');
}

async function updateById(id, data) {
  return Round.findByIdAndUpdate(id, data, {
    returnDocument: 'after',
    runValidators: true
  });
}

async function softDeleteById(id) {
  return updateById(id, { status: SOFT_DELETE_STATUS });
}

module.exports = {
  create,
  find,
  findById,
  updateById,
  softDeleteById
};
