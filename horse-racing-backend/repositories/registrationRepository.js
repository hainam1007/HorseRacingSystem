const { Registration } = require('../models');

function basePopulate(query) {
  return query
    .populate('tournament_id')
    .populate('race_id')
    .populate('horse_id')
    .populate({
      path: 'owner_id',
      populate: {
        path: 'user_id',
        select: 'full_name email'
      }
    })
    .populate('approved_by', 'full_name email');
}

async function create(data) {
  return Registration.create(data);
}

async function find(filter) {
  return basePopulate(Registration.find(filter || {}).sort({ registered_at: -1 }));
}

async function findById(id) {
  return basePopulate(Registration.findById(id));
}

async function findByPaymentOrderId(orderId) {
  return basePopulate(Registration.findOne({ payment_order_id: orderId }));
}

async function count(filter) {
  return Registration.countDocuments(filter || {});
}

async function updateById(id, data) {
  return Registration.findByIdAndUpdate(id, data, {
    returnDocument: 'after',
    runValidators: true
  });
}

module.exports = {
  create,
  count,
  find,
  findById,
  findByPaymentOrderId,
  updateById
};
