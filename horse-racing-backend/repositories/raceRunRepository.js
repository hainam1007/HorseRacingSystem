const { RaceRun } = require('../models');

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
    .populate('participants.horse_id')
    .populate({
      path: 'participants.jockey_id',
      populate: {
        path: 'user_id',
        select: 'full_name email'
      }
    })
    .populate('participants.assignment_id')
    .populate('finish_order.horse_id')
    .populate({
      path: 'finish_order.jockey_id',
      populate: {
        path: 'user_id',
        select: 'full_name email'
      }
    })
    .populate('generated_by', 'full_name email');
}

async function create(data, options) {
  const docs = await RaceRun.create([data], options || {});

  return docs[0];
}

async function findOne(filter, options) {
  const query = basePopulate(RaceRun.findOne(filter || {}));

  if (options && options.session) {
    query.session(options.session);
  }

  return query;
}

async function updateById(id, data, options) {
  const updateOptions = {
    returnDocument: 'after',
    runValidators: true
  };

  if (options && options.session) {
    updateOptions.session = options.session;
  }

  return basePopulate(RaceRun.findByIdAndUpdate(id, data, updateOptions));
}

module.exports = {
  create,
  findOne,
  updateById
};
