const adminDashboardService = require('../services/adminDashboardService');

class AdminDashboardController {
  
  async getDashboardSummary(req, res, next) {
    try {
      const summary = await adminDashboardService.getDashboardSummary(req.query.from, req.query.to);
      res.json(summary);
    } catch (error) {
      next(error);
    }
  }

  async getBettingSummary(req, res, next) {
    try {
      const { from, to } = req.query;
      const summary = await adminDashboardService.getBettingSummary(from, to);
      res.json(summary);
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
      res.json(result);
    } catch (error) {
      next(error);
    }
  }

  async getPrizeAwardsSummary(req, res, next) {
    try {
      const { from, to } = req.query;
      const summary = await adminDashboardService.getPrizeAwardsSummary(from, to);
      res.json(summary);
    } catch (error) {
      next(error);
    }
  }
}

module.exports = new AdminDashboardController();
