const { loadSequelizeModels } = require('../models/sequelize/index.js');

function getModels() { return loadSequelizeModels().models; }

function baseInclude() {
  const { Race, Tournament, Round, Horse, Jockey, RaceReferee, HorseCheck, User } = getModels();
  return [
    {
      model: Race,
      as: 'race',
      include: [{ model: Tournament, as: 'tournament' }, { model: Round, as: 'round' }]
    },
    { model: Horse, as: 'horse' },
    {
      model: Jockey,
      as: 'jockey',
      include: [{ model: User, as: 'user', attributes: ['full_name', 'email'] }]
    },
    {
      model: RaceReferee,
      as: 'referee',
      include: [{ model: User, as: 'user', attributes: ['full_name', 'email'] }]
    },
    { model: HorseCheck, as: 'horse_check' },
    { model: User, as: 'decider', attributes: ['full_name', 'email'] },
    { model: User, as: 'proposer', attributes: ['full_name', 'email'] }
  ];
}

async function create(data) {
  const { Violation } = getModels();
  return Violation.create(data);
}

async function find(filter = {}) {
  const { Violation } = getModels();
  return Violation.findAll({ where: filter, include: baseInclude(), order: [['created_at', 'DESC']] });
}

async function findById(id) {
  const { Violation } = getModels();
  return Violation.findByPk(id, { include: baseInclude() });
}

async function updateById(id, data) {
  const { Violation } = getModels();
  const instance = await Violation.findByPk(id);
  if (!instance) return null;
  await instance.update(data);
  return Violation.findByPk(id, { include: baseInclude() });
}

module.exports = {
  create,
  find,
  findById,
  updateById
};
