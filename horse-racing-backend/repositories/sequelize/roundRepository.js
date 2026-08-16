'use strict';

/**
 * Sequelize-backed round repository.
 */

const path = require('path');
process.env.NODE_PATH = path.resolve(__dirname, '..', '..', 'node_modules');
require('module').Module._initPaths();

const { Op } = require('sequelize');
const { loadSequelizeModels } = require('../../models/sequelize/index.js');
const { toPlain } = require('./adapter');
const { SOFT_DELETE_STATUS } = require('../../constants/statuses');

let _bundle = null;
function bundle() { if (!_bundle) _bundle = loadSequelizeModels(); return _bundle; }
function models() { return bundle().models; }

async function create(data) {
    const M = models();
    const row = await M.Round.create(data);
    return toPlain(row);
}

async function find(filter = {}) {
    const M = models();
    const where = {};
    if (filter.status && filter.status !== SOFT_DELETE_STATUS) {
        where.status = filter.status;
    } else if (!filter.status) {
        where.status = { [Op.ne]: SOFT_DELETE_STATUS };
    }
    if (filter._id || filter.id) where.id = filter._id || filter.id;
    if (filter.tournament_id) where.tournament_id = filter.tournament_id;
    const rows = await M.Round.findAll({ where, order: [['round_order', 'ASC']] });
    return rows.map(toPlain);
}

async function findById(id) {
    const M = models();
    const row = await M.Round.findByPk(id);
    return toPlain(row);
}

async function updateById(id, data) {
    const M = models();
    const fields = require('./adapter').projectUpdate(data);
    const [affected] = await M.Round.update(fields, { where: { id } });
    if (affected === 0) return null;
    return findById(id);
}

async function softDeleteById(id) {
    return updateById(id, { $set: { deleted_at: new Date().toISOString() } });
}

module.exports = {
    create,
    find,
    findById,
    updateById,
    softDeleteById
};