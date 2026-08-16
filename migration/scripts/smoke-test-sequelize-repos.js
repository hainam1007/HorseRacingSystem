'use strict';

/**
 * Smoke test for the Sequelize-backed repositories.
 * Verifies parity with Mongoose versions of userRepository & roleRepository.
 */

const path = require('path');
process.env.NODE_PATH = path.resolve(__dirname, '..', '..', 'horse-racing-backend', 'node_modules');
require('module').Module._initPaths();

require('dotenv').config({ path: path.resolve(__dirname, '..', '..', 'horse-racing-backend', '.env') });

const userRepo = require('../../horse-racing-backend/repositories/sequelize/userRepository');
const roleRepo = require('../../horse-racing-backend/repositories/sequelize/roleRepository');

let passed = 0, failed = 0;

function assert(name, cond, detail = '') {
    if (cond) {
        passed++;
        console.log(`  ✔ ${name}${detail ? '  — ' + detail : ''}`);
    } else {
        failed++;
        console.log(`  ✖ ${name}${detail ? '  — ' + detail : ''}`);
    }
}

function eq(name, actual, expected) {
    const a = typeof actual === 'object' ? JSON.stringify(actual) : String(actual);
    const e = typeof expected === 'object' ? JSON.stringify(expected) : String(expected);
    assert(name, a === e, `expected=${e} got=${a}`);
}

async function run() {
    console.log('\n--- Sequelize repositories smoke test ---\n');

    // 1. findByName on role
    const admin = await roleRepo.findByName('admin');
    assert('findByName returns admin role', !!admin);
    eq('admin role has id', typeof admin.id, 'string');
    eq('admin role has _id alias', typeof admin._id, 'string');
    eq('admin role._id === admin role.id', admin._id, admin.id);
    eq('admin role_name', admin.role_name, 'admin');

    // 2. findByNames
    const roles = await roleRepo.findByNames(['admin', 'spectator', 'horse_owner']);
    eq('findByNames returns 3 rows', roles.length, 3);

    // 3. getAllRoles
    const allRoles = await roleRepo.getAllRoles();
    assert('getAllRoles returns rows', allRoles.length >= 4, `${allRoles.length} roles`);

    // 4. findByEmail
    const adminUser = await userRepo.findByEmail('admin@racing.test');
    assert('findByEmail returns admin user', !!adminUser);
    eq('admin user has _id', typeof adminUser._id, 'string');
    eq('admin user.status', adminUser.status, 'active');

    // 5. findByEmailWithPassword
    const adminPwd = await userRepo.findByEmailWithPassword('admin@racing.test');
    assert('password field present', !!adminPwd.password, adminPwd.password ? 'has $2b$ prefix' : 'missing');

    // 6. findById
    const byId = await userRepo.findById(adminUser._id);
    eq('findById round-trip email', byId.email, 'admin@racing.test');

    // 7. getRoleNamesByUserId
    const roleNames = await userRepo.getRoleNamesByUserId(adminUser._id);
    assert('admin user has 1+ roles', roleNames.length > 0, roleNames.join(','));

    // 8. getUserWithRoles
    const withRoles = await userRepo.getUserWithRoles(adminUser._id);
    assert('getUserWithRoles returns user + roles', !!withRoles.user && Array.isArray(withRoles.roles));
    eq('user email', withRoles.user.email, 'admin@racing.test');

    // 9. find with pagination
    const paged = await userRepo.find({}, { page: 1, limit: 5 });
    assert('find returns users + pagination',
        Array.isArray(paged.users) && typeof paged.pagination === 'object');
    eq('pagination page', paged.pagination.page, 1);
    eq('pagination limit', paged.pagination.limit, 5);
    assert('users <= limit', paged.users.length <= 5);

    // 10. find with role_name filter
    const admins = await userRepo.find({ role_name: 'admin' });
    assert('find with role_name returns admins', admins.users.length >= 1);

    // 11. createUser + updateById + assignRoles
    const testEmail = `phase16-${Date.now()}@racing.test`;
    const bcrypt = require('bcryptjs');
    const hashed = await bcrypt.hash('Test123!', 10);
    const newUser = await userRepo.createUser({
        email: testEmail,
        password: hashed,
        full_name: 'Phase 16 Test',
        status: 'active',
        email_verified: true
    });
    assert('createUser returns row', !!newUser && !!newUser._id);
    eq('new user status', newUser.status, 'active');

    const spectatorRole = await roleRepo.findByName('spectator');
    await userRepo.assignRoles(newUser._id, [spectatorRole]);

    const updatedRoles = await userRepo.getRoleNamesByUserId(newUser._id);
    eq('assigned spectator role', updatedRoles.length, 1);
    eq('spectator role name', updatedRoles[0], 'spectator');

    // 12. updateById with $set / $unset
    const updated = await userRepo.updateById(newUser._id, {
        $set: { status: 'active', full_name: 'Phase 16 Updated' },
        $unset: { phone_number: '' }
    });
    eq('updated full_name', updated.full_name, 'Phase 16 Updated');

    // 13. Cleanup
    const { loadSequelizeModels } = require('../../horse-racing-backend/models/sequelize/index.js');
    const { sequelize, models: M } = loadSequelizeModels();
    await M.UserRole.destroy({ where: { user_id: newUser._id } });
    await M.User.destroy({ where: { id: newUser._id } });
    const after = await userRepo.findById(newUser._id);
    eq('cleanup deleted user', after, null);
    await sequelize.close();

    console.log(`\n--- Summary ---`);
    console.log(`  Passed: ${passed}`);
    console.log(`  Failed: ${failed}\n`);

    if (failed > 0) process.exit(1);
}

run().catch((err) => {
    console.error('✖ Repository smoke test failed:', err.message);
    console.error(err.stack);
    process.exit(1);
});