const { loadSequelizeModels } = require('../models/sequelize/index.js');
const { col } = require('sequelize');

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

async function captureOpeningOdds(raceId) {
  const { RaceOddsMarket, RaceOddsMarketOdd } = getModels();
  const market = await RaceOddsMarket.findOne({ where: { race_id: raceId, status: 'generated' } });
  if (!market) return null;

  await RaceOddsMarketOdd.update(
    { opening_game_odds: col('game_odds') },
    { where: { odds_market_id: market.id } }
  );
  return market;
}

module.exports = {
  findByRaceId,
  captureOpeningOdds,
  upsertByRaceId,
  updateGeneratedByRaceId,
  updateByRaceId
};
