const { JockeyAssignment } = require('../models');

function basePopulate(query) {
  return query
    .populate({
      path: 'race_id',
      populate: [
        { path: 'tournament_id' },
        { path: 'round_id' },
        {
          path: 'referee_id',
          populate: {
            path: 'user_id',
            select: 'full_name email'
          }
        }
      ]
    })
    .populate('horse_id')
    .populate({
      path: 'owner_id',
      populate: {
        path: 'user_id',
        select: 'full_name email'
      }
    })
    .populate({
      path: 'jockey_id',
      populate: {
        path: 'user_id',
        select: 'full_name email'
      }
    });
}

async function create(data, session) {
  if (session) {
    const documents = await JockeyAssignment.create([data], { session: session });
    return documents[0];
  }

  return JockeyAssignment.create(data);
}

async function find(filter) {
  return basePopulate(JockeyAssignment.find(filter || {}).sort({ invited_at: -1 }));
}

async function findOne(filter, session) {
  const query = JockeyAssignment.findOne(filter || {});
  return session ? query.session(session) : query;
}

async function count(filter) {
  return JockeyAssignment.countDocuments(filter || {});
}

async function findById(id) {
  return basePopulate(JockeyAssignment.findById(id));
}

async function updateById(id, data, session) {
  return JockeyAssignment.findByIdAndUpdate(id, data, {
    returnDocument: 'after',
    runValidators: true,
    session: session || null
  });
}

async function updateOne(filter, data, session) {
  return basePopulate(JockeyAssignment.findOneAndUpdate(filter, data, {
    returnDocument: 'after',
    runValidators: true,
    session: session || null
  }));
}

module.exports = {
  count,
  create,
  find,
  findOne,
  findById,
  updateById,
  updateOne
};
