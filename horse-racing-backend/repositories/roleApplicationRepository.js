const { RoleApplication } = require('../models');

function basePopulate(query) {
  return query
    .populate('user_id', 'full_name email phone_number date_of_birth avatar_url status email_verified')
    .populate('reviewed_by', 'full_name email');
}

async function create(data) {
  return RoleApplication.create(data);
}

async function find(filter) {
  return basePopulate(RoleApplication.find(filter || {}).sort({ created_at: -1 }));
}

async function findById(id) {
  return basePopulate(RoleApplication.findById(id));
}

async function findOne(filter) {
  return RoleApplication.findOne(filter || {});
}

async function updateById(id, data) {
  return RoleApplication.findByIdAndUpdate(id, data, {
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
