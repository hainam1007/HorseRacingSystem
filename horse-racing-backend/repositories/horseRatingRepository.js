const { loadSequelizeModels } = require('../models/sequelize/index.js');

function getModels() { return loadSequelizeModels().models; }

async function findHorseById(id) {
  const { Horse } = getModels();
  return Horse.findByPk(id);
}

async function updateHorseRating(id, data) {
  const { Horse } = getModels();
  const instance = await Horse.findByPk(id);
  if (!instance) return null;
  await instance.update(data);
  return instance;
}

async function createHistory(data) {
  const { HorseRatingHistory } = getModels();
  return HorseRatingHistory.create(data);
}

async function findHistory(filter = {}) {
  const { HorseRatingHistory, Horse, Race, User } = getModels();
  return HorseRatingHistory.findAll({
    where: filter,
    include: [
      { model: Horse, as: 'horse', attributes: ['name', 'registration_number', 'current_rating'] },
      { model: Race, as: 'race', attributes: ['name', 'race_date', 'race_class'] },
      { model: User, as: 'calculated_by_user', attributes: ['full_name', 'email'] }
    ],
    order: [['calculated_at', 'DESC']]
  });
}

async function countHistory(filter = {}) {
  const { HorseRatingHistory } = getModels();
  return HorseRatingHistory.count({ where: filter });
}

module.exports = { countHistory, createHistory, findHistory, findHorseById, updateHorseRating };
