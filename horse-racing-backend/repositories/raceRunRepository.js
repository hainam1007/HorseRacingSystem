const { loadSequelizeModels } = require('../models/sequelize/index.js');

function getModels() { return loadSequelizeModels().models; }

function baseInclude() {
  const { Race, Tournament, Round, RaceReferee, User, RaceRunParticipant, RaceRunFinishOrder, Horse, Jockey, HorseOwner } = getModels();
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
    {
      model: RaceRunParticipant,
      as: 'participants',
      include: [
        { model: Horse, as: 'horse' },
        { model: Jockey, as: 'jockey', include: [{ model: User, as: 'user', attributes: ['full_name', 'email'] }] },
        { model: HorseOwner, as: 'owner' }
      ]
    },
    {
      model: RaceRunFinishOrder,
      as: 'finish_order',
      include: [
        { model: Horse, as: 'horse' },
        { model: Jockey, as: 'jockey', include: [{ model: User, as: 'user', attributes: ['full_name', 'email'] }] }
      ]
    },
    { model: User, as: 'generated_by_user', attributes: ['full_name', 'email'] }
  ];
}

async function create(data) {
  const { RaceRun } = getModels();
  return RaceRun.create(data);
}

async function findOne(filter = {}) {
  const { RaceRun } = getModels();
  return RaceRun.findOne({ where: filter, include: baseInclude() });
}

async function updateById(id, data) {
  const { RaceRun } = getModels();
  const instance = await RaceRun.findByPk(id);
  if (!instance) return null;
  await instance.update(data);
  return RaceRun.findByPk(id, { include: baseInclude() });
}

module.exports = {
  create,
  findOne,
  updateById
};
