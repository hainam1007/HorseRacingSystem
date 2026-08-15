const { loadSequelizeModels } = require('../models/sequelize/index.js');

function getModels() { return loadSequelizeModels().models; }

function baseInclude() {
  const { Race, Tournament, Round, User, RaceOddsMarketOdd } = getModels();
  return [
    {
      model: Race,
      as: 'race',
      include: [{ model: Tournament, as: 'tournament' }, { model: Round, as: 'round' }]
    },
    { model: User, as: 'generator', attributes: ['full_name', 'email'] },
    { model: User, as: 'adjuster', attributes: ['full_name', 'email'] },
    { model: RaceOddsMarketOdd, as: 'odds', order: [['probability_rank', 'ASC']] }
  ];
}

async function findByRaceId(raceId) {
  const { RaceOddsMarket } = getModels();
  return RaceOddsMarket.findOne({ where: { race_id: raceId }, include: baseInclude() });
}

async function upsertByRaceId(raceId, data) {
  const { RaceOddsMarket } = getModels();
  let instance = await RaceOddsMarket.findOne({ where: { race_id: raceId } });
  if (instance) {
    await instance.update(data);
  } else {
    instance = await RaceOddsMarket.create({ ...data, race_id: raceId });
  }
  return RaceOddsMarket.findOne({ where: { race_id: raceId }, include: baseInclude() });
}

async function updateByRaceId(raceId, data) {
  const { RaceOddsMarket } = getModels();
  const instance = await RaceOddsMarket.findOne({ where: { race_id: raceId } });
  if (!instance) return null;
  await instance.update(data);
  return RaceOddsMarket.findOne({ where: { race_id: raceId }, include: baseInclude() });
}

async function updateGeneratedByRaceId(raceId, data) {
  const { RaceOddsMarket } = getModels();
  const instance = await RaceOddsMarket.findOne({ where: { race_id: raceId, status: 'generated' } });
  if (!instance) return null;
  await instance.update(data);
  return RaceOddsMarket.findOne({ where: { race_id: raceId }, include: baseInclude() });
}

module.exports = {
  findByRaceId,
  upsertByRaceId,
  updateGeneratedByRaceId,
  updateByRaceId
};
