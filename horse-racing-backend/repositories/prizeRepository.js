const { Prize, PrizeAward } = require('../models');

function populateAward(query) {
  return query
    .populate({
      path: 'prize_id',
      populate: [
        { path: 'race_id' },
        { path: 'tournament_id' }
      ]
    })
    .populate({
      path: 'race_result_id',
      populate: [
        {
          path: 'race_id',
          populate: [
            { path: 'tournament_id' },
            { path: 'round_id' }
          ]
        },
        { path: 'horse_id' },
        {
          path: 'jockey_id',
          populate: { path: 'user_id', select: 'full_name email' }
        },
        { path: 'applied_violation_ids' }
      ]
    })
    .populate('horse_id')
    .populate({
      path: 'owner_id',
      populate: { path: 'user_id', select: 'full_name email' }
    })
    .populate({
      path: 'jockey_id',
      populate: { path: 'user_id', select: 'full_name email' }
    })
    .populate('approved_by', 'full_name email')
    .populate('paid_by', 'full_name email');
}

async function findPrizes(filter) {
  return Prize.find(filter || {}).sort({ position: 1, created_at: 1 });
}

async function findPrize(filter, session) {
  const query = Prize.findOne(filter || {});

  if (session) {
    query.session(session);
  }

  return query;
}

async function upsertPrize(filter, data, session) {
  return Prize.findOneAndUpdate(filter, data, {
    new: true,
    upsert: true,
    runValidators: true,
    session: session
  });
}

async function findAwards(filter) {
  return populateAward(PrizeAward.find(filter || {}).sort({ position: 1, created_at: 1 }));
}

async function findAwardById(id) {
  return populateAward(PrizeAward.findById(id));
}

async function findAward(filter, session) {
  const query = PrizeAward.findOne(filter || {});

  if (session) {
    query.session(session);
  }

  return query;
}

async function createAward(data, session) {
  const award = new PrizeAward(data);

  return award.save({ session: session });
}

async function updateAwards(filter, data, session) {
  return PrizeAward.updateMany(filter || {}, data, {
    runValidators: true,
    session: session
  });
}

async function updateAwardById(id, data) {
  return populateAward(PrizeAward.findByIdAndUpdate(id, data, {
    returnDocument: 'after',
    runValidators: true
  }));
}

module.exports = {
  createAward,
  findAward,
  findAwardById,
  findAwards,
  findPrize,
  findPrizes,
  updateAwardById,
  updateAwards,
  upsertPrize
};
