const express = require('express');
const router = express.Router();

const adminDashboardController = require('../controllers/adminDashboardController');
const authenticate = require('../middlewares/authenticate');
const authorizeRoles = require('../middlewares/authorizeRoles');
const { ROLE_NAMES } = require('../constants/roles');

router.use(authenticate);
router.use(authorizeRoles(ROLE_NAMES.ADMIN));

router.get('/dashboard', adminDashboardController.getDashboardSummary);
router.get('/dashboard/entities', adminDashboardController.getEntityAnalytics);
router.get('/betting-summary', adminDashboardController.getBettingSummary);
router.get('/deposit-requests', adminDashboardController.getDepositRequests);
router.get('/prize-awards/summary', adminDashboardController.getPrizeAwardsSummary);

module.exports = router;
