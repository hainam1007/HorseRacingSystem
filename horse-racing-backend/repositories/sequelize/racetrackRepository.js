'use strict';

/**
 * Sequelize-backed racetrack repository.
 *
 * Racetracks are archived by changing their status, rather than deleted, so
 * historic races can always retain their original racetrack reference.
 */

const { loadSequelizeModels } = require('../../models/sequelize/index.js');
const { col, fn } = require('sequelize');
const { toPlain } = require('./adapter');

let _models = null;

function models() {
    if (!_models) _models = loadSequelizeModels().models;
    return _models;
}

function activeRecordWhere(filter) {
    const where = { deleted_at: null };
    if (filter && filter.status && filter.status !== 'all') {
        where.status = filter.status;
    }
    return where;
}

async function findAll(filter = {}) {
    const M = models();
    const rows = await M.Racetrack.findAll({
        where: activeRecordWhere(filter),
        attributes: {
            include: [[fn('COUNT', col('races.id')), 'race_count']]
        },
        include: [{
            model: M.Race,
            as: 'races',
            attributes: [],
            required: false
        }],
        group: ['racetracks.id'],
        order: [['name', 'ASC'], ['code', 'ASC']]
    });
    return rows.map(toPlain);
}

async function findById(id) {
    const row = await models().Racetrack.findOne({
        where: { id, deleted_at: null }
    });
    return toPlain(row);
}

async function findByCode(code) {
    const row = await models().Racetrack.findOne({
        where: { code, deleted_at: null }
    });
    return toPlain(row);
}

async function create(data) {
    const row = await models().Racetrack.create(data);
    return toPlain(row);
}

async function updateById(id, data) {
    const [affected] = await models().Racetrack.update(data, {
        where: { id, deleted_at: null }
    });
    if (!affected) return null;
    return findById(id);
}

async function countRaces(racetrackId) {
    return models().Race.count({ where: { racetrack_id: racetrackId } });
}

module.exports = {
    findAll,
    findById,
    findByCode,
    create,
    updateById,
    countRaces
};
