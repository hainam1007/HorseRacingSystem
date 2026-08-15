function errorHandler(err, req, res, next) {
  // All JSON API namespaces must return JSON errors. The spectator live-state
  // endpoint is mounted under /users (not /api), so letting it fall through
  // to Express' HTML error page makes the frontend report only "Invalid API
  // response" and hides the real backend exception.
  const isJsonApiRequest = req.originalUrl.startsWith('/api')
    || req.originalUrl.startsWith('/users');

  if (!isJsonApiRequest) {
    return next(err);
  }

  const statusCode = err.statusCode || err.status || 500;
  const response = {
    success: false,
    message: err.message || 'Internal server error'
  };

  if (err.details) {
    response.details = err.details;
  }

  if (req.app.get('env') === 'development' && statusCode >= 500) {
    response.stack = err.stack;
  }

  return res.status(statusCode).json(response);
}

module.exports = errorHandler;
