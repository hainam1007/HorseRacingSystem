require('dotenv').config();
const { getSequelize } = require('../config/sequelize');

async function check() {
  const db = getSequelize();
  
  console.log('=== USERS (all columns) ===');
  const [users] = await db.query('SELECT * FROM users WHERE deleted_at IS NULL LIMIT 10');
  if (users.length > 0) {
    console.log('Columns:', Object.keys(users[0]).join(', '));
    console.table(users.map(u => ({ id: u.id, email: u.email, full_name: u.full_name, status: u.status, created_at: u.created_at })));
  } else {
    console.log('No users found');
  }
  
  console.log('\n=== ROLES (all columns) ===');
  const [roles] = await db.query('SELECT * FROM roles WHERE deleted_at IS NULL');
  if (roles.length > 0) {
    console.log('Columns:', Object.keys(roles[0]).join(', '));
    console.table(roles);
  } else {
    console.log('No roles found');
  }
  
  console.log('\n=== USER_ROLES (all columns) ===');
  const [userRoles] = await db.query(`
    SELECT ur.*, r.role_name, u.email
    FROM user_roles ur
    JOIN roles r ON r.id = ur.role_id
    JOIN users u ON u.id = ur.user_id
    WHERE ur.deleted_at IS NULL
  `);
  if (userRoles.length > 0) {
    console.log('Columns:', Object.keys(userRoles[0]).join(', '));
    console.table(userRoles.map(ur => ({ id: ur.id, user_id: ur.user_id, role_id: ur.role_id, role_name: ur.role_name, email: ur.email })));
  } else {
    console.log('No user_roles found');
  }
  
  console.log('\n=== ADMINS (role=admin) ===');
  const [admins] = await db.query(`
    SELECT u.id, u.email, u.full_name, r.role_name
    FROM users u
    JOIN user_roles ur ON ur.user_id = u.id
    JOIN roles r ON r.id = ur.role_id
    WHERE r.role_name = 'admin' AND u.deleted_at IS NULL AND ur.deleted_at IS NULL
  `);
  console.table(admins);
  
  console.log('\n=== SPECTATORS (role=spectator) ===');
  const [spectators] = await db.query(`
    SELECT u.id, u.email, u.full_name, r.role_name
    FROM users u
    JOIN user_roles ur ON ur.user_id = u.id
    JOIN roles r ON r.id = ur.role_id
    WHERE r.role_name = 'spectator' AND u.deleted_at IS NULL AND ur.deleted_at IS NULL
  `);
  console.table(spectators);
  
  await db.close();
}

check().catch(console.error);
