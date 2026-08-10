const { RaceEngineRun } = require('../models');

async function create(data, options) {
  const docs = await RaceEngineRun.create([data], options || {});

  return docs[0];
}

async function findOne(filter, options) {
  const query = RaceEngineRun.findOne(filter || {});

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

  return RaceEngineRun.findByIdAndUpdate(id, data, updateOptions);
}

module.exports = {
  create,
  findOne,
  updateById
};
