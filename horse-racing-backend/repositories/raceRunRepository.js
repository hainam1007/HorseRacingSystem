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
        { model: Horse, as: 'horse', include: [{ model: HorseOwner, as: 'owner' }] },
        { model: Jockey, as: 'jockey', include: [{ model: User, as: 'user', attributes: ['full_name', 'email'] }] }
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
    { model: User, as: 'generator', attributes: ['full_name', 'email'] }
  ];
}

async function create(data) {
  const { RaceRun, RaceRunParticipant, RaceRunFinishOrder } = getModels();
  const sequelize = RaceRun.sequelize;

  return sequelize.transaction(async (transaction) => {
    const { participants = [], finish_order: finishOrder = [], ...runData } = data;
    const raceRun = await RaceRun.create(runData, { transaction });

    if (participants.length) {
      await RaceRunParticipant.bulkCreate(participants.map((item) => ({
        ...item,
        race_run_id: raceRun.id,
      })), { transaction });
    }
    if (finishOrder.length) {
      await RaceRunFinishOrder.bulkCreate(finishOrder.map((item) => ({
        horse_id: item.horse_id,
        jockey_id: item.jockey_id,
        position: item.position,
        finish_time: item.finish_time,
        score: item.score,
        race_run_id: raceRun.id,
      })), { transaction });
    }

    return raceRun;
  });
}

async function populateDetails(id, data) {
  const { RaceRun, RaceRunParticipant, RaceRunFinishOrder } = getModels();
  const sequelize = RaceRun.sequelize;

  await sequelize.transaction(async (transaction) => {
    const raceRun = await RaceRun.findByPk(id, { transaction });
    if (!raceRun) return;

    await raceRun.update({
      status: data.status,
      generated_by: data.generated_by,
      generated_at: data.generated_at,
      seed: data.seed,
    }, { transaction });

    const [existingParticipants, existingFinishOrder] = await Promise.all([
      RaceRunParticipant.findAll({ where: { race_run_id: id }, transaction }),
      RaceRunFinishOrder.findAll({ where: { race_run_id: id }, transaction }),
    ]);
    const participantHorseIds = new Set(existingParticipants.map((item) => String(item.horse_id)));
    const finishHorseIds = new Set(existingFinishOrder.map((item) => String(item.horse_id)));
    const missingParticipants = (data.participants || []).filter((item) => !participantHorseIds.has(String(item.horse_id)));
    const missingFinishOrder = (data.finish_order || []).filter((item) => !finishHorseIds.has(String(item.horse_id)));

    if (missingParticipants.length) {
      await RaceRunParticipant.bulkCreate(missingParticipants.map((item) => ({
        ...item,
        race_run_id: id,
      })), { transaction });
    }
    if (missingFinishOrder.length) {
      await RaceRunFinishOrder.bulkCreate(missingFinishOrder.map((item) => ({
        horse_id: item.horse_id,
        jockey_id: item.jockey_id,
        position: item.position,
        finish_time: item.finish_time,
        score: item.score,
        race_run_id: id,
      })), { transaction });
    }
  });

  return RaceRun.findByPk(id, { include: baseInclude() });
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
  populateDetails,
  updateById
};
