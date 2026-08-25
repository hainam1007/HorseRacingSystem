const { loadSequelizeModels } = require('../models/sequelize/index.js');
const { col } = require('sequelize');

function getModels() { return loadSequelizeModels().models; }
function getBundle() { return loadSequelizeModels(); }

function splitMarketPayload(data) {
  const market = { ...(data || {}) };
  const odds = Array.isArray(market.odds) ? market.odds : null;
  delete market.odds;
  return { market, odds };
}

async function replaceOdds(RaceOddsMarketOdd, marketId, odds, transaction) {
  if (odds === null) return;

  await RaceOddsMarketOdd.destroy({
    where: { odds_market_id: marketId },
    transaction
  });

  if (!odds.length) return;
  await RaceOddsMarketOdd.bulkCreate(odds.map(function(odd) {
    const value = { ...odd, odds_market_id: marketId };
    delete value._id;
    return value;
  }), { transaction });
}

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
  const { sequelize, models } = getBundle();
  const { RaceOddsMarket, RaceOddsMarketOdd } = models;
  const payload = splitMarketPayload(data);

  await sequelize.transaction(async function(transaction) {
    let instance = await RaceOddsMarket.findOne({ where: { race_id: raceId }, transaction });
    if (instance) {
      await instance.update(payload.market, { transaction });
    } else {
      instance = await RaceOddsMarket.create({ ...payload.market, race_id: raceId }, { transaction });
    }
    await replaceOdds(RaceOddsMarketOdd, instance.id, payload.odds, transaction);
  });

  return RaceOddsMarket.findOne({ where: { race_id: raceId }, include: baseInclude() });
}

async function updateByRaceId(raceId, data) {
  const { sequelize, models } = getBundle();
  const { RaceOddsMarket, RaceOddsMarketOdd } = models;
  const payload = splitMarketPayload(data);
  let found = false;

  await sequelize.transaction(async function(transaction) {
    const instance = await RaceOddsMarket.findOne({ where: { race_id: raceId }, transaction });
    if (!instance) return;
    found = true;
    await instance.update(payload.market, { transaction });
    await replaceOdds(RaceOddsMarketOdd, instance.id, payload.odds, transaction);
  });

  if (!found) return null;
  return RaceOddsMarket.findOne({ where: { race_id: raceId }, include: baseInclude() });
}

async function updateGeneratedByRaceId(raceId, data) {
  const { sequelize, models } = getBundle();
  const { RaceOddsMarket, RaceOddsMarketOdd } = models;
  const payload = splitMarketPayload(data);
  let found = false;

  await sequelize.transaction(async function(transaction) {
    const instance = await RaceOddsMarket.findOne({ where: { race_id: raceId, status: 'generated' }, transaction });
    if (!instance) return;
    found = true;
    await instance.update(payload.market, { transaction });
    await replaceOdds(RaceOddsMarketOdd, instance.id, payload.odds, transaction);
  });

  if (!found) return null;
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
  updateByRaceId,
  _private: { replaceOdds, splitMarketPayload }
};
