'use strict';

const path = require('path');
process.env.NODE_PATH = path.resolve(__dirname, '..', '..', 'node_modules');
require('module').Module._initPaths();

const { Op } = require('sequelize');
const { loadSequelizeModels } = require('../../models/sequelize/index.js');
const { toPlain } = require('./adapter');

let _models = null;
function models() {
    if (!_models) _models = loadSequelizeModels().models;
    return _models;
}

async function getAllRoles() {
    const M = models();
    const rows = await M.Role.findAll();
    return rows.map(toPlain);
}

async function findByNames(names) {
    const M = models();
    const rows = await M.Role.findAll({ where: { role_name: { [Op.in]: names } } });
    return rows.map(toPlain);
}

async function findByName(name) {
    const M = models();
    const row = await M.Role.findOne({ where: { role_name: name } });
    return toPlain(row);
}

async function findById(id) {
    const M = models();
    const row = await M.Role.findByPk(id);
    return toPlain(row);
}

module.exports = {
    getAllRoles,
    findByNames,
    findByName,
    findById
};