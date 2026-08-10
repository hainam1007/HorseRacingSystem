const horseRatingService = require('../services/horseRatingService');
const { sendSuccess } = require('../utils/apiResponse');

async function updateRating(req, res) {
  return sendSuccess(res, 200, 'Horse rating updated successfully', await horseRatingService.updateRatingManually(req.user._id, req.params.id, req.validatedBody));
}

async function getRatingHistory(req, res) {
  return sendSuccess(res, 200, 'Horse rating history retrieved successfully', await horseRatingService.getRatingHistory(req.params.id));
}

module.exports = { getRatingHistory, updateRating };
