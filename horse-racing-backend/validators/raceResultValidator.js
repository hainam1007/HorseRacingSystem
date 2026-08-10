const ApiError = require('../utils/ApiError');

function validateRequestCorrection(req, res, next) {
  const body = req.body || {};
  const note = typeof body.correction_note === 'string'
    ? body.correction_note.trim()
    : '';

  if (!note) {
    return next(new ApiError(400, 'Validation failed', [
      { field: 'correction_note', message: 'correction_note is required' }
    ]));
  }

  if (note.length > 1000) {
    return next(new ApiError(400, 'Validation failed', [
      { field: 'correction_note', message: 'correction_note must be at most 1000 characters' }
    ]));
  }

  req.validatedBody = {
    correction_note: note
  };

  return next();
}

module.exports = {
  validateRequestCorrection
};
