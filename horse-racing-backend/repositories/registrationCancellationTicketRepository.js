const { RegistrationCancellationTicket } = require('../models');

function populate(query) {
  return query
    .populate('registration_id')
    .populate('tournament_id', 'name start_date end_date status')
    .populate('race_id', 'name race_date status entry_fee entry_fee_currency')
    .populate('horse_id', 'name registration_number image_url')
    .populate({
      path: 'owner_id',
      populate: { path: 'user_id', select: 'full_name email phone_number' }
    })
    .populate('reviewed_by', 'full_name email')
    .populate('refund_sent_by', 'full_name email');
}

async function create(data) {
  return RegistrationCancellationTicket.create(data);
}

async function find(filter) {
  return populate(
    RegistrationCancellationTicket.find(filter || {}).sort({ created_at: -1 })
  );
}

async function findById(id, session) {
  return populate(
    RegistrationCancellationTicket.findById(id).session(session || null)
  );
}

async function updateById(id, data, session) {
  return RegistrationCancellationTicket.findByIdAndUpdate(id, data, {
    returnDocument: 'after',
    runValidators: true,
    session: session || null
  });
}

module.exports = {
  create,
  find,
  findById,
  updateById
};
