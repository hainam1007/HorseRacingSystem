const { Op, literal } = require('sequelize');
const { loadSequelizeModels } = require('../models/sequelize/index.js');

function getModels() { return loadSequelizeModels().models; }

async function findActiveItem(itemId) {
  const { RewardItem } = getModels();
  return RewardItem.findOne({ where: { id: itemId, is_active: true }, raw: true });
}

async function findAllActiveItems() {
  const { RewardItem } = getModels();
  return RewardItem.findAll({ where: { is_active: true }, order: [['token_price', 'ASC']], raw: true });
}

async function deductStock(itemId) {
  const { RewardItem } = getModels();
  const [affected] = await RewardItem.update(
    { stock: literal('stock - 1') },
    { where: { id: itemId, is_active: true, stock: { [Op.gt]: 0 } } }
  );
  if (affected === 0) return null;
  return RewardItem.findByPk(itemId);
}

async function createRedemption(data) {
  const { RedemptionHistory } = getModels();
  return RedemptionHistory.create(data);
}

async function findRedemptionsByUserId(userId, { skip = 0, limit = 20 } = {}) {
  const { RedemptionHistory, RewardItem } = getModels();
  return RedemptionHistory.findAll({
    where: { user_id: userId },
    order: [['created_at', 'DESC']],
    offset: skip,
    limit,
    include: [{ model: RewardItem, as: 'item', attributes: ['name', 'description', 'token_price', 'image_url'] }]
  });
}

async function countRedemptionsByUserId(userId) {
  const { RedemptionHistory } = getModels();
  return RedemptionHistory.count({ where: { user_id: userId } });
}

async function createItem(data) {
  const { RewardItem } = getModels();
  return RewardItem.create(data);
}

async function updateItem(id, data) {
  const { RewardItem } = getModels();
  const instance = await RewardItem.findByPk(id);
  if (!instance) return null;
  await instance.update(data);
  return instance;
}

async function findItemById(id) {
  const { RewardItem } = getModels();
  return RewardItem.findByPk(id, { raw: true });
}

async function findItemByName(name) {
  const { RewardItem, sequelize } = getModels();
  return RewardItem.findOne({
    where: { name: { [Op.iLike]: name } },
    raw: true
  });
}

async function findAllItemsAdmin(filter = {}, sort = [['created_at', 'DESC']], skip = 0, limit = 20) {
  const { RewardItem } = getModels();
  return RewardItem.findAll({ where: filter, order: sort, offset: skip, limit, raw: true });
}

async function countAllItemsAdmin(filter = {}) {
  const { RewardItem } = getModels();
  return RewardItem.count({ where: filter });
}

async function updateStockAdmin(id, operation, value) {
  const { RewardItem } = getModels();
  if (operation === 'increase') {
    const [affected] = await RewardItem.update({ stock: literal('stock + ' + Number(value)) }, { where: { id } });
    if (affected === 0) return null;
    return RewardItem.findByPk(id);
  }
  if (operation === 'decrease') {
    const [affected] = await RewardItem.update({ stock: literal('stock - ' + Number(value)) }, { where: { id, stock: { [Op.gte]: value } } });
    if (affected === 0) return null;
    return RewardItem.findByPk(id);
  }
  if (operation === 'set') {
    const [affected] = await RewardItem.update({ stock: value }, { where: { id } });
    if (affected === 0) return null;
    return RewardItem.findByPk(id);
  }
  return null;
}

async function countRedemptionsByItemId(itemId) {
  const { RedemptionHistory } = getModels();
  return RedemptionHistory.count({ where: { item_id: itemId } });
}

async function countRedemptionsByItemIdAndStatus(itemId, statuses) {
  const { RedemptionHistory } = getModels();
  return RedemptionHistory.count({ where: { item_id: itemId, status: { [Op.in]: statuses } } });
}

async function findRedemptionsForAdmin(filter = {}, skip = 0, limit = 20) {
  const { RedemptionHistory, User, RewardItem } = getModels();
  return RedemptionHistory.findAll({
    where: filter,
    order: [['created_at', 'DESC']],
    offset: skip,
    limit,
    include: [
      { model: User, as: 'user', attributes: ['full_name', 'email'] },
      { model: RewardItem, as: 'item', attributes: ['name', 'token_price', 'image_url'] }
    ]
  });
}

async function countRedemptionsForAdmin(filter = {}) {
  const { RedemptionHistory } = getModels();
  return RedemptionHistory.count({ where: filter });
}

async function findRedemptionById(id) {
  const { RedemptionHistory, RewardItem } = getModels();
  return RedemptionHistory.findByPk(id, {
    include: [{ model: RewardItem, as: 'item', attributes: ['name', 'token_price', 'image_url'] }]
  });
}

async function updateRedemptionStatus(id, status) {
  const { RedemptionHistory } = getModels();
  const instance = await RedemptionHistory.findByPk(id);
  if (!instance) return null;
  await instance.update({ status });
  return instance;
}

module.exports = {
  findActiveItem,
  findAllActiveItems,
  deductStock,
  createRedemption,
  findRedemptionsByUserId,
  countRedemptionsByUserId,
  createItem,
  updateItem,
  findItemById,
  findItemByName,
  findAllItemsAdmin,
  countAllItemsAdmin,
  updateStockAdmin,
  countRedemptionsByItemId,
  countRedemptionsByItemIdAndStatus,
  findRedemptionsForAdmin,
  countRedemptionsForAdmin,
  findRedemptionById,
  updateRedemptionStatus
};
