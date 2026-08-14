const { loadSequelizeModels } = require('../models/sequelize/index.js');

function getModels() { return loadSequelizeModels().models; }

function defaultInclude() {
  const { Race, Horse, HorseOwner, Jockey, RaceReferee, User } = getModels();
  return [
    { model: Race, as: 'race' },
    {
      model: Horse,
      as: 'horse',
      include: [{ model: HorseOwner, as: 'owner', include: [{ model: User, as: 'user', attributes: ['full_name', 'email'] }] }]
    },
    {
      model: Jockey,
      as: 'jockey',
      include: [{ model: User, as: 'user', attributes: ['full_name', 'email'] }]
    },
    {
      model: RaceReferee,
      as: 'referee',
      include: [{ model: User, as: 'user', attributes: ['full_name', 'email'] }]
    }
  ];
}

async function create(data) {
  const { HorseCheck } = getModels();
  return HorseCheck.create(data);
}

async function find(filter = {}) {
  const { HorseCheck } = getModels();
  return HorseCheck.findAll({ where: filter, include: defaultInclude(), order: [['checked_at', 'DESC']] });
}

async function findById(id) {
  const { HorseCheck } = getModels();
  return HorseCheck.findByPk(id, { include: defaultInclude() });
}

async function findByRaceAndHorse(raceId, horseId) {
  const { HorseCheck } = getModels();
  return HorseCheck.findOne({ where: { race_id: raceId, horse_id: horseId } });
}

async function findOne(filter = {}) {
  const { HorseCheck } = getModels();
  return HorseCheck.findOne({ where: filter, include: defaultInclude() });
}

async function updateById(id, data) {
  const { HorseCheck } = getModels();
  const instance = await HorseCheck.findByPk(id);
  if (!instance) return null;
  await instance.update(data);
  return instance;
}

module.exports = {
  create,
  find,
  findById,
  findByRaceAndHorse,
  findOne,
  updateById
};
