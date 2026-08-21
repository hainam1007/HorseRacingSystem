const { loadSequelizeModels } = require('../models/sequelize/index.js');
const { projectUpdate, toPlain } = require('./sequelize/adapter');

function getModels() { return loadSequelizeModels().models; }

function baseInclude() {
  const { Race, Tournament, Round, Horse, Jockey, User, Violation, RaceResultAppliedViolation, RaceResultPenaltySnapshotViolation } = getModels();
  return [
    {
      model: Race,
      as: 'race',
      include: [{ model: Tournament, as: 'tournament' }, { model: Round, as: 'round' }]
    },
    { model: Horse, as: 'horse' },
    { model: Jockey, as: 'jockey', include: [{ model: User, as: 'user', attributes: ['full_name'] }] },
    { model: User, as: 'penalties_applied_by_user', attributes: ['full_name', 'email'] },
    { model: User, as: 'submitted_to_admin_by_user', attributes: ['full_name', 'email'] },
    { model: User, as: 'correction_requested_by_user', attributes: ['full_name', 'email'] },
    { model: User, as: 'correction_resolved_by_user', attributes: ['full_name', 'email'] },
    { model: User, as: 'confirmed_by_user', attributes: ['full_name', 'email'] },
    { model: User, as: 'published_by_user', attributes: ['full_name', 'email'] },
    { model: RaceResultAppliedViolation, as: 'applied_violations' },
    { model: RaceResultPenaltySnapshotViolation, as: 'penalty_snapshot_violations' }
  ];
}

async function create(data) {
  const { RaceResult } = getModels();
  return toPlain(await RaceResult.create(data));
}

async function find(filter = {}) {
  const { RaceResult } = getModels();
  const rows = await RaceResult.findAll({
    where: filter,
    include: baseInclude(),
    order: [['published_at', 'DESC'], ['recorded_at', 'DESC']]
  });
  return toPlain(rows);
}

async function findById(id) {
  const { RaceResult } = getModels();
  return toPlain(await RaceResult.findByPk(id, { include: baseInclude() }));
}

async function count(filter = {}) {
  const { RaceResult } = getModels();
  return RaceResult.count({ where: filter });
}

async function updateById(id, data) {
  const { RaceResult } = getModels();
  const instance = await RaceResult.findByPk(id);
  if (!instance) return null;
  await instance.update(projectUpdate(data));
  return instance;
}

async function updateMany(filter, data) {
  const { RaceResult } = getModels();
  return RaceResult.update(projectUpdate(data), { where: filter });
}

module.exports = {
  create,
  count,
  find,
  findById,
  updateById,
  updateMany
};
