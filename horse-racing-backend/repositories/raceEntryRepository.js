const { Op } = require('sequelize');
const { loadSequelizeModels } = require('../models/sequelize/index.js');

function getModels() { return loadSequelizeModels().models; }

function regInclude() {
  const { Race, Horse, HorseOwner, User } = getModels();
  return [
    { model: Race, as: 'race' },
    { model: Horse, as: 'horse' },
    { model: HorseOwner, as: 'owner', include: [{ model: User, as: 'user', attributes: ['full_name', 'email'] }] },
    // Registration has two User associations (entry finalizer and approver),
    // so Sequelize requires the exact association alias here.
    { model: User, as: 'entry_finalizer', attributes: ['full_name', 'email'] }
  ];
}

async function findByRaceId(raceId, filter = {}) {
  const { Registration } = getModels();
  return Registration.findAll({
    where: { race_id: raceId, ...filter },
    include: regInclude(),
    order: [['registered_at', 'ASC'], ['id', 'ASC']]
  });
}

async function findById(id) {
  const { Registration } = getModels();
  return Registration.findByPk(id, { include: regInclude() });
}

async function findAcceptedPrimaryAssignments(raceId, horseIds) {
  const { JockeyAssignment, Jockey, User } = getModels();
  return JockeyAssignment.findAll({
    where: {
      race_id: raceId,
      horse_id: { [Op.in]: horseIds },
      assignment_type: 'primary',
      status: 'accepted'
    },
    include: [{ model: Jockey, as: 'jockey', include: [{ model: User, as: 'user', attributes: ['full_name', 'email'] }] }]
  });
}

async function bulkWrite(operations) {
  const { Registration } = getModels();
  // Apply each operation sequentially; callers still operate at the
  // Repository abstraction level.
  for (const op of operations) {
    if (op.updateOne && op.updateOne.filter && op.updateOne.update) {
      await Registration.update(op.updateOne.update, { where: op.updateOne.filter });
    } else if (op.updateMany && op.updateMany.filter && op.updateMany.update) {
      await Registration.update(op.updateMany.update, { where: op.updateMany.filter });
    }
  }
}

async function updateById(id, update) {
  const { Registration } = getModels();
  const instance = await Registration.findByPk(id);
  if (!instance) return null;
  await instance.update(update);
  return Registration.findByPk(id, { include: regInclude() });
}

async function findDuplicate(raceId, registrationId, field, value) {
  const { Registration } = getModels();
  return Registration.findOne({
    where: { race_id: raceId, id: { [Op.ne]: registrationId }, [field]: value }
  });
}

module.exports = {
  bulkWrite,
  findAcceptedPrimaryAssignments,
  findById,
  findByRaceId,
  findDuplicate,
  updateById
};
