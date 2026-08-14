const { Op, literal } = require('sequelize');
const { loadSequelizeModels } = require('../models/sequelize/index.js');

function getModels() { return loadSequelizeModels().models; }

function awardInclude() {
  const { Prize, Race, Tournament, Round, RaceResult, RaceResultAppliedViolation, Horse, Jockey, HorseOwner, User } = getModels();
  return [
    {
      model: Prize,
      as: 'prize',
      include: [{ model: Race, as: 'race' }, { model: Tournament, as: 'tournament' }]
    },
    {
      model: RaceResult,
      as: 'race_result',
      include: [
        { model: Race, as: 'race', include: [{ model: Tournament, as: 'tournament' }, { model: Round, as: 'round' }] },
        { model: Horse, as: 'horse' },
        { model: Jockey, as: 'jockey', include: [{ model: User, as: 'user', attributes: ['full_name', 'email'] }] },
        { model: RaceResultAppliedViolation, as: 'applied_violations' }
      ]
    },
    { model: Horse, as: 'horse' },
    { model: HorseOwner, as: 'owner', include: [{ model: User, as: 'user', attributes: ['full_name', 'email'] }] },
    { model: Jockey, as: 'jockey', include: [{ model: User, as: 'user', attributes: ['full_name', 'email'] }] }
  ];
}

async function findPrizes(filter = {}) {
  const { Prize } = getModels();
  return Prize.findAll({ where: filter, order: [['position', 'ASC'], ['created_at', 'ASC']] });
}

async function findPrize(filter = {}) {
  const { Prize } = getModels();
  return Prize.findOne({ where: filter });
}

async function upsertPrize(filter, data) {
  const { Prize } = getModels();
  let instance = await Prize.findOne({ where: filter });
  if (instance) {
    await instance.update(data);
    return instance;
  }
  return Prize.create({ ...filter, ...data });
}

async function findAwards(filter = {}) {
  const { PrizeAward } = getModels();
  return PrizeAward.findAll({ where: filter, include: awardInclude(), order: [['position', 'ASC'], ['created_at', 'ASC']] });
}

async function findAwardById(id) {
  const { PrizeAward } = getModels();
  return PrizeAward.findByPk(id, { include: awardInclude() });
}

async function findAward(filter = {}) {
  const { PrizeAward } = getModels();
  return PrizeAward.findOne({ where: filter });
}

async function createAward(data) {
  const { PrizeAward } = getModels();
  return PrizeAward.create(data);
}

async function updateAwards(filter, data) {
  const { PrizeAward } = getModels();
  return PrizeAward.update(data, { where: filter });
}

async function updateAwardById(id, data) {
  const { PrizeAward } = getModels();
  const instance = await PrizeAward.findByPk(id);
  if (!instance) return null;
  await instance.update(data);
  return PrizeAward.findByPk(id, { include: awardInclude() });
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
