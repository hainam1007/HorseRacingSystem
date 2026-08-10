const { JockeyAssignment, Registration } = require('../models');

function populateEntries(query) {
  return query
    .populate('race_id')
    .populate('horse_id')
    .populate({
      path: 'owner_id',
      populate: { path: 'user_id', select: 'full_name email' }
    })
    .populate('entry_finalized_by', 'full_name email');
}

async function findByRaceId(raceId, filter) {
  return populateEntries(
    Registration.find(Object.assign({ race_id: raceId }, filter || {}))
      .sort({ registered_at: 1, _id: 1 })
  );
}

async function findById(id) {
  return populateEntries(Registration.findById(id));
}

async function findAcceptedPrimaryAssignments(raceId, horseIds) {
  return JockeyAssignment.find({
    race_id: raceId,
    horse_id: { $in: horseIds },
    assignment_type: 'primary',
    status: 'accepted'
  }).populate({
    path: 'jockey_id',
    populate: { path: 'user_id', select: 'full_name email' }
  });
}

async function bulkWrite(operations) {
  return Registration.bulkWrite(operations);
}

async function updateById(id, update) {
  return populateEntries(Registration.findByIdAndUpdate(id, update, {
    returnDocument: 'after',
    runValidators: true
  }));
}

async function findDuplicate(raceId, registrationId, field, value) {
  return Registration.findOne({ race_id: raceId, _id: { $ne: registrationId }, [field]: value });
}

module.exports = {
  bulkWrite,
  findAcceptedPrimaryAssignments,
  findById,
  findByRaceId,
  findDuplicate,
  updateById
};
