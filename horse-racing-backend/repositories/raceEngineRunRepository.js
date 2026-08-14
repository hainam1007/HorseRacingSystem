const { loadSequelizeModels } = require('../models/sequelize/index.js');

function getModels() { return loadSequelizeModels().models; }

async function create(data) {
  const { RaceEngineRun } = getModels();
  return RaceEngineRun.create(data);
}

async function findOne(filter = {}) {
  const { RaceEngineRun } = getModels();
  return RaceEngineRun.findOne({ where: filter });
}

async function updateById(id, data) {
  const { RaceEngineRun } = getModels();
  const instance = await RaceEngineRun.findByPk(id);
  if (!instance) return null;
  await instance.update(data);
  return instance;
}

module.exports = {
  create,
  findOne,
  updateById
};
