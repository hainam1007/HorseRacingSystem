const { loadSequelizeModels } = require('../models/sequelize/index.js');
const { toPlain } = require('./sequelize/adapter');

function getModels() { return loadSequelizeModels().models; }

async function create(data) {
  const { Bet } = getModels();
  return Bet.create(data);
}

async function find(filter = {}) {
  const { Bet, Race, Horse, Tournament, Round, User, UserRole: _UR, RaceOddsMarket, RaceResult } = getModels();
  return Bet.findAll({
    where: filter,
    include: [
      { model: User, as: 'spectator', attributes: ['full_name', 'email'] },
      { model: Race, as: 'race', include: [{ model: Tournament, as: 'tournament' }, { model: Round, as: 'round' }] },
      { model: Horse, as: 'predicted_horse' },
      { model: RaceOddsMarket, as: 'odds_market' },
      { model: RaceResult, as: 'settled_result' }
    ],
    order: [['submitted_at', 'DESC']]
  });
}

async function findById(id) {
  return find({ id }).then(rows => rows[0] || null);
}

async function findPendingByRaceId(raceId) {
  const { Bet } = getModels();
  const rows = await Bet.findAll({
    where: { race_id: raceId, status: 'pending' },
    order: [['submitted_at', 'ASC']]
  });

  // Settlement still accepts legacy-shaped records, so expose `_id` alongside
  // the Sequelize primary key instead of returning raw model instances.
  return rows.map(toPlain);
}

async function updateById(id, data) {
  const { Bet } = getModels();
  const instance = await Bet.findByPk(id);
  if (!instance) return null;
  await instance.update(data);
  return instance;
}

async function count(filter = {}) {
  const { Bet } = getModels();
  return Bet.count({ where: filter });
}

module.exports = {
  create,
  count,
  find,
  findById,
  findPendingByRaceId,
  updateById
};
