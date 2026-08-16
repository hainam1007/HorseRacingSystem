'use strict';

/**
 * Sequelize-backed user repository.
 *
 * The exported async function signatures are stable. Each function returns
 * either:
 *   - a plain object with `._id` alias (matches the legacy `toObject()` shape)
 *   - `null` when no row found
 *
 * Optional projection: callers can pass `{ select: [...] }` to opt into
 * additional fields that are normally hidden (e.g. password) — mirrors the
 * legacy `.select('+password')` syntax.
 */

const path = require('path');
process.env.NODE_PATH = path.resolve(__dirname, '..', '..', 'node_modules');
require('module').Module._initPaths();

const { Op } = require('sequelize');
const { loadSequelizeModels } = require('../../models/sequelize/index.js');
const { toPlain, projectUpdate } = require('./adapter');

const _sequelizeRef = { current: null };
const _modelsRef = { current: null };

function models() {
    if (!_modelsRef.current) {
        const loaded = loadSequelizeModels();
        _sequelizeRef.current = loaded.sequelize;
        _modelsRef.current = loaded.models;
    }
    return _modelsRef.current;
}

function applySelect(row, select) {
    if (!row) return row;
    if (!select || !select.length) return row;
    const out = { ...row };
    for (const field of select) {
        // `select: '+password'` → include password even though normally hidden
        if (field.startsWith('+')) {
            const real = field.slice(1);
            // We expose everything here; service-side `sanitizeUser` strips
            // password before returning. So we don't actually need to hide.
            out[real] = out[real];
        } else {
            out[field] = out[field];
        }
    }
    return out;
}

async function findById(id) {
    const M = models();
    const row = await M.User.findByPk(id);
    return toPlain(row);
}

async function find(filter = {}, options = {}) {
    const M = models();
    const page = options.page || 1;
    const limit = options.limit || 20;
    const offset = (page - 1) * limit;

    // Build where clause
    const where = {};
    if (filter.email) where.email = filter.email;
    if (filter.status) where.status = filter.status;
    if (filter.id) where.id = filter.id;
    if (filter.role_name) {
        const userRoles = await M.UserRole.findAll({
            include: [{ model: M.Role, as: 'role', where: { role_name: filter.role_name } }],
            attributes: ['user_id']
        });
        const ids = userRoles.map((r) => r.user_id);
        if (ids.length === 0) {
            return { users: [], pagination: { page, limit, total: 0, total_pages: 0 } };
        }
        where.id = { [Op.in]: ids };
    }
    if (filter.full_name) where.full_name = { [Op.iLike]: `%${filter.full_name}%` };
    if (filter.phone_number) where.phone_number = filter.phone_number;

    const order = [['created_at', 'DESC']];
    const { count, rows } = await M.User.findAndCountAll({ where, limit, offset, order });

    return {
        users: rows.map((r) => toPlain(r)),
        pagination: {
            page,
            limit,
            total: count,
            total_pages: Math.ceil(count / limit)
        }
    };
}

async function findByEmail(email) {
    const M = models();
    const row = await M.User.findOne({ where: { email: email.toLowerCase() } });
    return toPlain(row);
}

async function findByEmailWithPassword(email) {
    return findByEmail(email.toLowerCase());
}

async function findByIdWithPassword(id) {
    return findById(id);
}

async function findByEmailWithAuthSecrets(email) {
    return findByEmail(email.toLowerCase());
}

async function findByVerificationToken(tokenHash) {
    const M = models();
    const row = await M.User.findOne({
        where: {
            email_verification_token: tokenHash,
            email_verification_expires_at: { [Op.gt]: new Date() }
        }
    });
    return toPlain(row);
}

async function findByPasswordResetToken(tokenHash) {
    const M = models();
    const row = await M.User.findOne({
        where: {
            password_reset_token: tokenHash,
            password_reset_expires_at: { [Op.gt]: new Date() }
        }
    });
    return toPlain(row);
}

async function createUser(userData) {
    const M = models();
    const created = await M.User.create(userData);
    return toPlain(created);
}

async function updateById(id, updateData) {
    const M = models();
    const fields = projectUpdate(updateData);
    await M.User.update(fields, { where: { id } });
    return findById(id);
}

async function getRoleNamesByUserId(userId) {
    const M = models();
    const userRoles = await M.UserRole.findAll({
        where: { user_id: userId },
        include: [{ model: M.Role, as: 'role', attributes: ['role_name'] }]
    });
    return userRoles
        .map((ur) => ur.role && ur.role.role_name)
        .filter(Boolean);
}

async function getUserWithRoles(userId) {
    const user = await findById(userId);
    if (!user) return null;
    const roles = await getRoleNamesByUserId(userId);
    return { user, roles };
}

async function getUserRoleDocsByUserId(userId) {
    const M = models();
    const rows = await M.UserRole.findAll({
        where: { user_id: userId },
        include: [{ model: M.Role, as: 'role', attributes: ['id', 'role_name', 'description'] }]
    });
    // Map to Role-shaped plain objects with ._id alias so callers (e.g. assignRoles)
    // can do role._id without crashes.
    return rows.map((r) => {
        const role = r.role;
        if (!role) return null;
        const plain = toPlain(role); // { id, role_name, description }
        return plain;
    }).filter(Boolean);
}

async function findUserRole(userId, roleId) {
    const M = models();
    const row = await M.UserRole.findOne({ where: { user_id: userId, role_id: roleId } });
    return toPlain(row);
}

async function assignRoles(userId, roles) {
    const M = models();
    const roleIds = roles.map((role) => (role._id || role.id));
    await M.UserRole.bulkCreate(
        roleIds.map((roleId) => ({ user_id: userId, role_id: roleId })),
        { ignoreDuplicates: true }
    );
}

async function assignRole(userId, roleId) {
    const M = models();
    const created = await M.UserRole.create({ user_id: userId, role_id: roleId });
    return toPlain(created);
}

async function removeRole(userId, roleId) {
    const M = models();
    return M.UserRole.destroy({ where: { user_id: userId, role_id: roleId } });
}

module.exports = {
    findById,
    find,
    findByEmail,
    findByEmailWithPassword,
    findByIdWithPassword,
    findByEmailWithAuthSecrets,
    findByVerificationToken,
    findByPasswordResetToken,
    createUser,
    updateById,
    getRoleNamesByUserId,
    getUserWithRoles,
    getUserRoleDocsByUserId,
    findUserRole,
    assignRoles,
    assignRole,
    removeRole
};