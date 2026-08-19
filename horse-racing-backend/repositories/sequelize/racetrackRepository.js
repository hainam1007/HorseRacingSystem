'use strict';

/**
 * Sequelize-backed racetrack repository.
 */

const path = require('path');
process.env.NODE_PATH = path.resolve(__dirname, '..', '..', 'node_modules');
require('module').Module._initPaths();

const { Op } = require('sequelize');
const { loadSequelizeModels } = require('../../models/sequelize/index.js');
const { toPlain } = require('./adapter');

let _bundle = null;
function bundle() { if (!_bundle) _bundle = loadSequelizeModels(); return _bundle; }
function models() { return bundle().models; }

async function create(data) {
    const M = models();
    const row = await M.Racetrack.create(data);
    return toPlain(row);
}

async function find(filter = {}) {
    const M = models();
    const where = buildWhere(filter);
    const rows = await M.Racetrack.findAll({
        where,
        order: [['created_at', 'DESC']]
    });
    return rows.map(toPlain);
}

function buildWhere(filter) {
    const where = {};
    if (filter.status) {
        where.status = filter.status;
    }
    if (filter.code) {
        where.code = filter.code.toUpperCase();
    }
    if (filter._id || filter.id) where.id = filter._id || filter.id;
    if (filter.name) where.name = { [Op.iLike]: `%${filter.name}%` };
    return where;
}

async function findById(id) {
    const M = models();
    const row = await M.Racetrack.findByPk(id);
    return toPlain(row);
}

async function findByCode(code) {
    if (!code) return null;
    const M = models();
    const row = await M.Racetrack.findOne({ where: { code: String(code).toUpperCase() } });
    return toPlain(row);
}

async function updateById(id, data) {
    const M = models();
    const fields = require('./adapter').projectUpdate(data);
    const [affected] = await M.Racetrack.update(fields, { where: { id } });
    if (affected === 0) return null;
    return findById(id);
}

async function softDeleteById(id) {
    return updateById(id, { status: 'inactive' });
}

module.exports = {
    create,
    find,
    findById,
    findByCode,
    updateById,
    softDeleteById
};
