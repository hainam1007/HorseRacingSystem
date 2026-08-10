const { Tournament } = require('../models');
const { SOFT_DELETE_STATUS } = require('../constants/statuses');

async function create(data) {
  return Tournament.create(data);
}

async function find(filter) {
  return Tournament.find(filter || {}).sort({ created_at: -1, start_date: -1 });
}

async function findById(id) {
  return Tournament.findById(id);
}

async function updateById(id, data) {
  return Tournament.findByIdAndUpdate(id, data, {
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
