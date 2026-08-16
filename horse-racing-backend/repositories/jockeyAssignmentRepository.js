const { loadSequelizeModels } = require('../models/sequelize/index.js');

function getModels() { return loadSequelizeModels().models; }

function defaultInclude() {
  const { Race, Tournament, Round, RaceReferee, User, Horse, HorseOwner, Jockey } = getModels();
  return [
    {
      model: Race,
      as: 'race',
      include: [
        { model: Tournament, as: 'tournament' },
        { model: Round, as: 'round' },
        { model: RaceReferee, as: 'referee', include: [{ model: User, as: 'user', attributes: ['full_name', 'email'] }] }
      ]
    },
    { model: Horse, as: 'horse' },
    {
      model: HorseOwner,
      as: 'owner',
      include: [{ model: User, as: 'user', attributes: ['full_name', 'email'] }]
    },
    {
      model: Jockey,
      as: 'jockey',
      include: [{ model: User, as: 'user', attributes: ['full_name', 'email'] }]
    }
  ];
}

async function create(data) {
  const { JockeyAssignment } = getModels();
  return JockeyAssignment.create(data);
}

async function find(filter = {}) {
  const { JockeyAssignment } = getModels();
  return JockeyAssignment.findAll({ where: filter, include: defaultInclude(), order: [['invited_at', 'DESC']] });
}

async function findOne(filter = {}) {
  const { JockeyAssignment } = getModels();
  return JockeyAssignment.findOne({ where: filter, include: defaultInclude() });
}

async function count(filter = {}) {
  const { JockeyAssignment } = getModels();
  return JockeyAssignment.count({ where: filter });
}

async function findById(id) {
  const { JockeyAssignment } = getModels();
  return JockeyAssignment.findByPk(id, { include: defaultInclude() });
}

async function updateById(id, data) {
  const { JockeyAssignment } = getModels();
  const instance = await JockeyAssignment.findByPk(id);
  if (!instance) return null;
  await instance.update(data);
  return instance;
}

async function updateOne(filter, data) {
  const { JockeyAssignment } = getModels();
  let instance = await JockeyAssignment.findOne({ where: filter });
  if (!instance) return null;
  await instance.update(data);
  return instance;
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
