const { loadSequelizeModels } = require('../models/sequelize/index.js');
const { toPlain } = require('./sequelize/adapter');

function getModels() { return loadSequelizeModels().models; }

const PENALTY_SLOT_FIELDS = {
  suggested_penalty: 'suggested',
  proposed_penalty: 'proposed',
  penalty: 'final'
};

const PENALTY_FIELDS = [
  'type',
  'score_deduction',
  'position_delta',
  'time_penalty_seconds',
  'suspension_days',
  'fine_amount',
  'disqualified',
  'note'
];

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object || {}, key);
}

function toPenaltyRow(value) {
  if (!value) return null;

  return PENALTY_FIELDS.reduce(function(row, field) {
    if (value[field] !== undefined) {
      row[field] = value[field];
    }
    return row;
  }, {});
}

function splitPenaltyData(data) {
  const row = Object.assign({}, data);
  const penalties = {};

  Object.entries(PENALTY_SLOT_FIELDS).forEach(function([field, slot]) {
    if (hasOwn(row, field)) {
      penalties[slot] = row[field];
      delete row[field];
    }
  });

  return { row, penalties };
}

async function syncPenaltySlots(violationId, penalties) {
  const { ViolationPenalty } = getModels();

  for (const [slot, penalty] of Object.entries(penalties)) {
    const existing = await ViolationPenalty.findOne({
      where: { violation_id: violationId, slot: slot }
    });

    if (!penalty) {
      if (existing) await existing.destroy();
      continue;
    }

    const data = Object.assign({ violation_id: violationId, slot: slot }, toPenaltyRow(penalty));
    if (existing) await existing.update(data);
    else await ViolationPenalty.create(data);
  }
}

function withPenaltySlots(value) {
  const violation = toPlain(value);
  if (!violation) return violation;

  const penalties = violation.penalties || [];
  Object.entries(PENALTY_SLOT_FIELDS).forEach(function([field, slot]) {
    const penalty = penalties.find(function(item) {
      return item.slot === slot;
    });
    violation[field] = penalty ? toPenaltyRow(penalty) : null;
  });

  return violation;
}

function baseInclude() {
  const { Race, Tournament, Round, Horse, Jockey, RaceReferee, HorseCheck, User, ViolationPenalty } = getModels();
  return [
    {
      model: Race,
      as: 'race',
      include: [{ model: Tournament, as: 'tournament' }, { model: Round, as: 'round' }]
    },
    { model: Horse, as: 'horse' },
    {
      model: Jockey,
      as: 'jockey',
      include: [{ model: User, as: 'user', attributes: ['full_name', 'email'] }]
    },
    {
      model: RaceReferee,
      as: 'referee',
      include: [{ model: User, as: 'user', attributes: ['full_name', 'email'] }]
    },
    { model: HorseCheck, as: 'horse_check' },
    { model: User, as: 'decider', attributes: ['full_name', 'email'] },
    { model: User, as: 'proposer', attributes: ['full_name', 'email'] },
    { model: ViolationPenalty, as: 'penalties', required: false }
  ];
}

async function create(data) {
  const { Violation } = getModels();
  const { row, penalties } = splitPenaltyData(data);
  const violation = await Violation.create(row);
  await syncPenaltySlots(violation.id, penalties);
  return findById(violation.id);
}

async function find(filter = {}) {
  const { Violation } = getModels();
  const rows = await Violation.findAll({ where: filter, include: baseInclude(), order: [['created_at', 'DESC']] });
  return rows.map(withPenaltySlots);
}

async function findById(id) {
  const { Violation } = getModels();
  return withPenaltySlots(await Violation.findByPk(id, { include: baseInclude() }));
}

async function updateById(id, data) {
  const { Violation } = getModels();
  const instance = await Violation.findByPk(id);
  if (!instance) return null;
  const { row, penalties } = splitPenaltyData(data);
  await instance.update(row);
  await syncPenaltySlots(instance.id, penalties);
  return findById(instance.id);
}

module.exports = {
  create,
  find,
  findById,
  updateById
};
