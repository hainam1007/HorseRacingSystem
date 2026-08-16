const { loadSequelizeModels } = require('../models/sequelize/index.js');

function getModels() { return loadSequelizeModels().models; }

function baseInclude() {
  const { Registration, Tournament, Race, Horse, User } = getModels();
  return [
    { model: Registration, as: 'registration' },
    { model: Tournament, as: 'tournament', attributes: ['id', 'name', 'start_date', 'end_date', 'status'] },
    { model: Race, as: 'race', attributes: ['id', 'name', 'race_date', 'status', 'entry_fee', 'entry_fee_currency'] },
    { model: Horse, as: 'horse', attributes: ['id', 'name', 'registration_number', 'image_url'] },
    { model: User, as: 'reviewer', attributes: ['id', 'full_name', 'email'] },
    { model: User, as: 'refund_sender', attributes: ['id', 'full_name', 'email'] }
  ];
}

async function create(data) {
  const { RegistrationCancellationTicket } = getModels();
  return RegistrationCancellationTicket.create(data);
}

async function find(filter = {}) {
  const { RegistrationCancellationTicket } = getModels();
  return RegistrationCancellationTicket.findAll({ where: filter, include: baseInclude(), order: [['created_at', 'DESC']] });
}

async function findById(id) {
  const { RegistrationCancellationTicket } = getModels();
  return RegistrationCancellationTicket.findByPk(id, { include: baseInclude() });
}

async function updateById(id, data) {
  const { RegistrationCancellationTicket } = getModels();
  const instance = await RegistrationCancellationTicket.findByPk(id);
  if (!instance) return null;
  await instance.update(data);
  return instance;
}

module.exports = {
  create,
  find,
  findById,
  updateById
};
