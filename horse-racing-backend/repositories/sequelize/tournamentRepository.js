'use strict';

/**
 * Sequelize-backed tournament repository.
 *
 * Mirrors the legacy repository API including `populate('tournament_id')`
 * which we skip here (callers can use a Sequelize `include` if they want it).
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
    const row = await M.Tournament.create(data);
    return toPlain(row);
}

async function find(filter = {}) {
    const M = models();
    const where = buildWhere(filter);
    const rows = await M.Tournament.findAll({
        where,
        order: [['created_at', 'DESC'], ['start_date', 'DESC']]
    });
    return rows.map(toPlain);
}

function buildWhere(filter) {
    const where = {};
    if (filter.status && filter.status !== SOFT_DELETE_STATUS) {
        where.status = filter.status;
    } else if (!filter.status) {
        where.status = { [Op.ne]: SOFT_DELETE_STATUS };
    }
    if (filter._id || filter.id) where.id = filter._id || filter.id;
    if (filter.name) where.name = { [Op.iLike]: `%${filter.name}%` };
    return where;
}

async function findById(id) {
    const M = models();
    const row = await M.Tournament.findByPk(id);
    return toPlain(row);
}

async function updateById(id, data) {
    const M = models();
    const fields = require('./adapter').projectUpdate(data);
    const [affected] = await M.Tournament.update(fields, { where: { id } });
    if (affected === 0) return null;
    return findById(id);
}

async function softDeleteById(id) {
    const M = models();
    return require('./adapter').softDeleteById(M.Tournament, id);
}

module.exports = {
    create,
    find,
    findById,
    updateById,
    softDeleteById
};