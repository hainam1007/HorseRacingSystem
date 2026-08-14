'use strict';

/**
 * Sequelize-backed registration repository.
 *
 * Mirrors the legacy repository API. populate() calls are omitted here; the
 * service layer composes follow-up fetches via the helpers exposed in this
 * file.
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

function populateInclude() {
    const M = models();
    return [
        {
            model: M.Race,
            as: 'race',
        },
        {
            model: M.Tournament,
            as: 'tournament',
        },
        {
            model: M.Horse,
            as: 'horse',
        },
    ];
}

async function create(data) {
    const M = models();
    const row = await M.Registration.create(data);
    return toPlain(row);
}

function buildWhere(filter) {
    const where = {};
    if (filter._id || filter.id) where.id = filter._id || filter.id;
    if (filter.tournament_id) where.tournament_id = filter.tournament_id;
    if (filter.race_id) where.race_id = filter.race_id;
    if (filter.horse_id) where.horse_id = filter.horse_id;
    if (filter.owner_id) where.owner_id = filter.owner_id;
    if (filter.status) where.status = filter.status;
    if (filter.payment_order_id) where.payment_order_id = filter.payment_order_id;
    if (filter.payment_status) where.payment_status = filter.payment_status;
    if (filter.deleted_at === null) where.deleted_at = null;
    return where;
}

async function find(filter = {}) {
    const M = models();
    const where = buildWhere(filter);
    const rows = await M.Registration.findAll({
        where,
        include: populateInclude(),
        order: [['registered_at', 'DESC']]
    });
    return rows.map(toPlain);
}

async function findById(id) {
    const M = models();
    const row = await M.Registration.findByPk(id, { include: populateInclude() });
    return toPlain(row);
}

async function findByPaymentOrderId(orderId) {
    const M = models();
    const row = await M.Registration.findOne({ where: { payment_order_id: orderId }, include: populateInclude() });
    return toPlain(row);
}

async function count(filter = {}) {
    const M = models();
    return M.Registration.count({ where: buildWhere(filter) });
}

async function updateById(id, data) {
    const M = models();
    const fields = require('./adapter').projectUpdate(data);
    const [affected] = await M.Registration.update(fields, { where: { id } });
    if (affected === 0) return null;
    return findById(id);
}

module.exports = {
    create,
    count,
    find,
    findById,
    findByPaymentOrderId,
    updateById
};