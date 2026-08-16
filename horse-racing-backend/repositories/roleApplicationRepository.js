const { loadSequelizeModels } = require('../models/sequelize/index.js');

function getModels() { return loadSequelizeModels().models; }

function baseInclude() {
  const { User } = getModels();
  return [
    { model: User, as: 'applicant', attributes: ['full_name', 'email', 'phone_number', 'date_of_birth', 'avatar_url', 'status', 'email_verified'] },
    { model: User, as: 'reviewer', attributes: ['full_name', 'email'] }
  ];
}

async function create(data) {
  const { RoleApplication } = getModels();
  return RoleApplication.create(data);
}

async function find(filter = {}) {
  const { RoleApplication } = getModels();
  return RoleApplication.findAll({ where: filter, include: baseInclude(), order: [['created_at', 'DESC']] });
}

async function findById(id) {
  const { RoleApplication } = getModels();
  return RoleApplication.findByPk(id, { include: baseInclude() });
}

async function findOne(filter = {}) {
  const { RoleApplication } = getModels();
  return RoleApplication.findOne({ where: filter });
}

async function updateById(id, data) {
  const { RoleApplication } = getModels();
  const instance = await RoleApplication.findByPk(id);
  if (!instance) return null;
  await instance.update(data);
  return instance;
}

module.exports = {
  create,
  find,
  findById,
  findOne,
  updateById
};
