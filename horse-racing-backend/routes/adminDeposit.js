const express = require('express');

const adminDepositPackageController = require('../controllers/adminDepositPackageController');
const authenticate = require('../middlewares/authenticate');
const authorizeRoles = require('../middlewares/authorizeRoles');
const { ROLE_NAMES } = require('../constants/roles');
const asyncHandler = require('../utils/asyncHandler');
const { validateObjectIdParam } = require('../validators/commonValidator');
const {
  validateCreateDepositPackage,
  validateUpdateDepositPackage
} = require('../validators/adminDepositPackageValidator');

const router = express.Router();

router.use(authenticate);
router.use(authorizeRoles(ROLE_NAMES.ADMIN));
router.get(
  '/deposit-packages',
  asyncHandler(adminDepositPackageController.listAllPackages)
);
router.post(
  '/deposit-packages',
  validateCreateDepositPackage,
  asyncHandler(adminDepositPackageController.createPackage)
);
router.put(
  '/deposit-packages/:id',
  validateObjectIdParam('id'),
  validateUpdateDepositPackage,
  asyncHandler(adminDepositPackageController.updatePackage)
);
router.delete(
  '/deposit-packages/:id',
  validateObjectIdParam('id'),
  asyncHandler(adminDepositPackageController.deletePackage)
);

module.exports = router;
