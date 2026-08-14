const { loadSequelizeModels } = require('../models/sequelize/index.js');

function getModels() { return loadSequelizeModels().models; }

function baseInclude() {
  const { Race, RaceReferee, User } = getModels();
  return [
    { model: Race, as: 'race' },
    {
      model: RaceReferee,
      as: 'referee',
      include: [{ model: User, as: 'user', attributes: ['full_name', 'email'] }]
    }
  ];
}

async function create(data) {
  const { RefereeReport } = getModels();
  return RefereeReport.create(data);
}

async function find(filter = {}) {
  const { RefereeReport } = getModels();
  return RefereeReport.findAll({ where: filter, include: baseInclude(), order: [['created_at', 'DESC']] });
}

async function findById(id) {
  const { RefereeReport } = getModels();
  return RefereeReport.findByPk(id, { include: baseInclude() });
}

async function findOne(filter = {}) {
  const { RefereeReport } = getModels();
  return RefereeReport.findOne({ where: filter, include: baseInclude(), order: [['created_at', 'DESC']] });
}

async function updateById(id, data) {
  const { RefereeReport } = getModels();
  const instance = await RefereeReport.findByPk(id);
  if (!instance) return null;
  await instance.update(data);
  return instance;
}

module.exports = {
  create,
  find,
  findById,
  findOne,
  updateById
};
