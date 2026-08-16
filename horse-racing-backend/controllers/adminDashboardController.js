const adminDashboardService = require('../services/adminDashboardService');
const { sendSuccess } = require('../utils/apiResponse');

class AdminDashboardController {
  
  async getDashboardSummary(req, res, next) {
    try {
      const summary = await adminDashboardService.getDashboardSummary(req.query.from, req.query.to);
      return sendSuccess(res, 200, 'Dashboard summary retrieved successfully', summary);
    } catch (error) {
      next(error);
    }
  }

  async getBettingSummary(req, res, next) {
    try {
      const { from, to } = req.query;
      const summary = await adminDashboardService.getBettingSummary(from, to);
      return sendSuccess(res, 200, 'Betting summary retrieved successfully', summary);
    } catch (error) {
      next(error);
    }
  }

  async getDepositRequests(req, res, next) {
    try {
      const { from, to, status, page, limit } = req.query;
      const result = await adminDashboardService.getDepositRequests(
        from,
        to,
        status,
        parseInt(page) || 1,
        parseInt(limit) || 20
      );
      return sendSuccess(res, 200, 'Deposit requests retrieved successfully', result);
    } catch (error) {
      next(error);
    }
  }

  async getPrizeAwardsSummary(req, res, next) {
    try {
      const { from, to } = req.query;
      const summary = await adminDashboardService.getPrizeAwardsSummary(from, to);
      return sendSuccess(res, 200, 'Prize awards summary retrieved successfully', summary);
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new AdminDashboardController();
