'use strict';

/**
 * Sequelize-backed race repository.
 *
 * Note: the legacy `populate()` translates to Sequelize `include:` with
 * `as:` aliases. Here we mirror the API used by raceService; callers can
 * request `findById` and get the bare row. For populated views the service
 * layer composes a follow-up fetch via the helpers below.
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
    const row = await M.Race.create(data);
    return toPlain(row);
}

function buildWhere(filter) {
    const where = {};
    if (filter.status) {
        if (filter.status.$ne) {
            where.status = { [Op.ne]: filter.status.$ne };
        } else {
            where.status = filter.status;
        }
    } else if (!filter.include_soft_deleted) {
        where.status = { [Op.ne]: SOFT_DELETE_STATUS };
    }
    if (filter._id || filter.id) where.id = filter._id || filter.id;
    if (filter.tournament_id) where.tournament_id = filter.tournament_id;
    if (filter.round_id) where.round_id = filter.round_id;
    if (filter.referee_id) where.referee_id = filter.referee_id;
    if (filter.status_single) where.status = filter.status_single;
    return where;
}

async function find(filter = {}) {
    const M = models();
    const where = buildWhere(filter);
    const rows = await M.Race.findAll({
        where,
        order: [['created_at', 'DESC'], ['race_date', 'DESC']]
    });
    return rows.map(toPlain);
}

async function count(filter = {}) {
    const M = models();
    const where = buildWhere(filter);
    return M.Race.count({ where });
}

async function findByTournamentIds(tournamentIds) {
    const M = models();
    if (!tournamentIds || !tournamentIds.length) return [];
    const rows = await M.Race.findAll({
        where: {
            tournament_id: { [Op.in]: tournamentIds },
            status: { [Op.ne]: SOFT_DELETE_STATUS }
        },
        attributes: ['id', 'tournament_id', 'prize_pool', 'prize_currency', 'status']
    });
    return rows.map(toPlain);
}

async function findById(id) {
    const M = models();
    const row = await M.Race.findByPk(id);
    return toPlain(row);
}

async function updateById(id, data) {
    const M = models();
    const fields = require('./adapter').projectUpdate(data);
    const [affected] = await M.Race.update(fields, { where: { id } });
    if (affected === 0) return null;
    return findById(id);
}

async function updateOne(filter, data, _session) {
    const M = models();
    const where = buildWhere(filter);
    const fields = require('./adapter').projectUpdate(data);
    const [affected] = await M.Race.update(fields, { where });
    if (affected === 0) return null;
    if (where.id) return findById(where.id);
    // No simple id filter; return first matching row
    const row = await M.Race.findOne({ where });
    return toPlain(row);
}

async function updateMany(filter, data) {
    const M = models();
    const where = buildWhere(filter);
    const fields = require('./adapter').projectUpdate(data);
    return M.Race.update(fields, { where });
}

async function softDeleteById(id) {
    const M = models();
    return require('./adapter').softDeleteById(M.Race, id);
}

module.exports = {
    create,
    find,
    count,
    findByTournamentIds,
    findById,
    updateById,
    updateOne,
    updateMany,
    softDeleteById
};