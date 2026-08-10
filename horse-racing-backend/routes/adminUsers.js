const express = require('express');

const adminUserController = require('../controllers/adminUserController');
const authenticate = require('../middlewares/authenticate');
const authorizeRoles = require('../middlewares/authorizeRoles');
const { ROLE_NAMES } = require('../constants/roles');
const asyncHandler = require('../utils/asyncHandler');
const { validateObjectIdParam } = require('../validators/commonValidator');
const {
  validateListUsers,
  validateRoleNameBody,
  validateRoleNameParam,
  validateUpdateUserStatus
} = require('../validators/adminUserValidator');

const router = express.Router();
const adminOnly = authorizeRoles(ROLE_NAMES.ADMIN);

router.use(authenticate);
router.use(adminOnly);

router.get('/users', validateListUsers, asyncHandler(adminUserController.listUsers));
router.get('/users/:id', validateObjectIdParam('id'), asyncHandler(adminUserController.getUserDetail));
router.patch(
  '/users/:id/status',
  validateObjectIdParam('id'),
  validateUpdateUserStatus,
  asyncHandler(adminUserController.updateUserStatus)
);
router.post(
  '/users/:id/roles',
  validateObjectIdParam('id'),
  validateRoleNameBody,
  asyncHandler(adminUserController.assignRole)
);
router.delete(
  '/users/:id/roles/:roleName',
  validateObjectIdParam('id'),
  validateRoleNameParam,
  asyncHandler(adminUserController.removeRole)
);

module.exports = router;
