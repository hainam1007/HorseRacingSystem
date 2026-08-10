const mongoose = require('mongoose');

const ApiError = require('../utils/ApiError');

function isObjectId(value) {
  return mongoose.Types.ObjectId.isValid(value);
}

function validateObjectIdParam(paramName) {
  return function(req, res, next) {
    const value = req.params[paramName];

    if (!isObjectId(value)) {
      return next(new ApiError(400, paramName + ' is invalid'));
    }

    return next();
  };
}

function validateRequiredFields(fields) {
  return function(req, res, next) {
    const body = req.body || {};
    const errors = fields
      .filter(function(field) {
        return body[field] === undefined || body[field] === null || body[field] === '';
      })
      .map(function(field) {
        return {
          field: field,
          message: field + ' is required'
        };
      });

    if (errors.length) {
      return next(new ApiError(400, 'Validation failed', errors));
    }

    return next();
  };
}

module.exports = {
  isObjectId,
  validateObjectIdParam,
  validateRequiredFields
};
