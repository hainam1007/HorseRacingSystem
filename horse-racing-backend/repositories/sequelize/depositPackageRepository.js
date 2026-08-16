'use strict';

/**
 * Sequelize-backed depositPackage repository.
 * Reads, writes, and the `hasSuccessfulOrders` cross-table check.
 */

const path = require('path');
process.env.NODE_PATH = path.resolve(__dirname, '..', '..', 'node_modules');
require('module').Module._initPaths();

const { Op } = require('sequelize');
const { loadSequelizeModels } = require('../../models/sequelize/index.js');
const { toPlain } = require('./adapter');
const { DEPOSIT_REQUEST_STATUS } = require('../../constants/depositStatuses');

let _models = null;
function models() {
    if (!_models) _models = loadSequelizeModels().models;
    return _models;
}

async function findAllActivePackages() {
    const M = models();
    const rows = await M.DepositPackage.findAll({
        where: { is_active: true },
        order: [['vnd_price', 'ASC']]
    });
    return rows.map(toPlain);
}

async function findActivePackageById(packageId) {
    const M = models();
    const row = await M.DepositPackage.findOne({
        where: { package_id: packageId.toUpperCase(), is_active: true }
    });
    return toPlain(row);
}

async function findAll() {
    const M = models();
    const rows = await M.DepositPackage.findAll({
        order: [['created_at', 'DESC'], ['vnd_price', 'ASC']]
    });
    return rows.map(toPlain);
}

async function findById(id) {
    const M = models();
    const row = await M.DepositPackage.findByPk(id);
    return toPlain(row);
}

async function findByPackageId(packageId) {
    const M = models();
    const row = await M.DepositPackage.findOne({
        where: { package_id: packageId.toUpperCase() }
    });
    return toPlain(row);
}

async function createPackage(data) {
    const M = models();
    const created = await M.DepositPackage.create(data);
    return toPlain(created);
}

async function updateById(id, updateData) {
    const M = models();
    const [affected] = await M.DepositPackage.update(updateData, { where: { id } });
    if (affected === 0) return null;
    return findById(id);
}

async function softDeleteById(id) {
    const M = models();
    const [affected] = await M.DepositPackage.update(
        { is_active: false },
        { where: { id } }
    );
    if (affected === 0) return null;
    return findById(id);
}

async function hasSuccessfulOrders(packageId) {
    const M = models();
    const count = await M.DepositRequest.count({
        where: { package_id: packageId, status: DEPOSIT_REQUEST_STATUS.SUCCESS }
    });
    return count > 0;
}

module.exports = {
    findAllActivePackages,
    findActivePackageById,
    findAll,
    findById,
    findByPackageId,
    createPackage,
    updateById,
    softDeleteById,
    hasSuccessfulOrders
};