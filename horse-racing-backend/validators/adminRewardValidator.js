const ApiError = require('../utils/ApiError');

const VALID_REDEMPTION_STATUSES = ['pending', 'processing', 'completed', 'cancelled'];

function getString(value) {
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim();
}

function validateCreateReward(req, res, next) {
  const errors = [];
  const body = req.body || {};
  const name = getString(body.name);
  const description = getString(body.description);
  const token_price = Number(body.token_price);
  const stock = Number(body.stock);

  if (!name) {
    errors.push({ field: 'name', message: 'name is required' });
  } else if (name.length < 3 || name.length > 100) {
    errors.push({ field: 'name', message: 'name must be between 3 and 100 characters' });
  }

  if (isNaN(token_price) || token_price < 1 || !Number.isInteger(token_price)) {
    errors.push({ field: 'token_price', message: 'token_price must be an integer >= 1' });
  }

  if (isNaN(stock) || stock < 0 || !Number.isInteger(stock)) {
    errors.push({ field: 'stock', message: 'stock must be an integer >= 0' });
  }

  if (body.image_file_data !== undefined) {
    if (typeof body.image_file_data !== 'string' || !body.image_file_data.startsWith('data:image/')) {
      errors.push({ field: 'image_file_data', message: 'image_file_data must be a valid base64 image data URI' });
    }
  }

  if (body.image_url !== undefined) {
    if (typeof body.image_url !== 'string' || !/^https?:\/\//.test(body.image_url)) {
      errors.push({ field: 'image_url', message: 'image_url must be a valid HTTP/HTTPS URL' });
    }
  }

  if (errors.length) {
    return next(new ApiError(400, 'Validation failed', errors));
  }

  req.validatedBody = {
    name,
    description,
    token_price,
    stock,
    is_active: body.is_active === undefined ? true : String(body.is_active) === 'true',
    image_file_data: body.image_file_data,
    image_url: body.image_url
  };

  return next();
}

function validateUpdateReward(req, res, next) {
  const errors = [];
  const body = req.body || {};
  const name = getString(body.name);
  const description = getString(body.description);

  const validatedBody = {};

  if (body.name !== undefined) {
    if (!name || name.length < 3 || name.length > 100) {
      errors.push({ field: 'name', message: 'name must be between 3 and 100 characters' });
    } else {
      validatedBody.name = name;
    }
  }

  if (body.description !== undefined) {
    validatedBody.description = description;
  }

  if (body.token_price !== undefined) {
    const token_price = Number(body.token_price);
    if (isNaN(token_price) || token_price < 1 || !Number.isInteger(token_price)) {
      errors.push({ field: 'token_price', message: 'token_price must be an integer >= 1' });
    } else {
      validatedBody.token_price = token_price;
    }
  }

  // stock is NOT allowed here
  if (body.stock !== undefined) {
    errors.push({ field: 'stock', message: 'stock cannot be updated via this endpoint' });
  }

  if (body.image_file_data !== undefined) {
    if (typeof body.image_file_data !== 'string' || !body.image_file_data.startsWith('data:image/')) {
      errors.push({ field: 'image_file_data', message: 'image_file_data must be a valid base64 image data URI' });
    } else {
      validatedBody.image_file_data = body.image_file_data;
    }
  }

  if (body.image_url !== undefined) {
    if (typeof body.image_url !== 'string' || !/^https?:\/\//.test(body.image_url)) {
      errors.push({ field: 'image_url', message: 'image_url must be a valid HTTP/HTTPS URL' });
    } else {
      validatedBody.image_url = body.image_url;
    }
  }

  if (errors.length) {
    return next(new ApiError(400, 'Validation failed', errors));
  }

  req.validatedBody = validatedBody;
  return next();
}

function validateUpdateStock(req, res, next) {
  const errors = [];
  const body = req.body || {};
  const operation = getString(body.operation).toLowerCase();
  const value = Number(body.value);

  if (!['increase', 'decrease', 'set'].includes(operation)) {
    errors.push({ field: 'operation', message: 'operation must be increase, decrease, or set' });
  }

  if (isNaN(value) || value < 0 || !Number.isInteger(value)) {
    errors.push({ field: 'value', message: 'value must be a positive integer' });
  }

  if (errors.length) {
    return next(new ApiError(400, 'Validation failed', errors));
  }

  req.validatedBody = { operation, value };
  return next();
}

function validateUpdateStatus(req, res, next) {
  const errors = [];
  const body = req.body || {};

  if (body.is_active === undefined) {
    errors.push({ field: 'is_active', message: 'is_active is required' });
  } else if (String(body.is_active) !== 'true' && String(body.is_active) !== 'false' && typeof body.is_active !== 'boolean') {
    errors.push({ field: 'is_active', message: 'is_active must be a boolean' });
  }

  if (errors.length) {
    return next(new ApiError(400, 'Validation failed', errors));
  }

  req.validatedBody = { is_active: String(body.is_active) === 'true' };
  return next();
}

function validateUpdateRedemptionStatus(req, res, next) {
  const errors = [];
  const body = req.body || {};
  const status = getString(body.status).toLowerCase();

  if (!VALID_REDEMPTION_STATUSES.includes(status)) {
    errors.push({ field: 'status', message: `status must be one of: ${VALID_REDEMPTION_STATUSES.join(', ')}` });
  }

  if (errors.length) {
    return next(new ApiError(400, 'Validation failed', errors));
  }

  req.validatedBody = { status };
  return next();
}

module.exports = {
  validateCreateReward,
  validateUpdateReward,
  validateUpdateStock,
  validateUpdateStatus,
  validateUpdateRedemptionStatus
};
