// Standardized Centralized Error Handler
module.exports = (err, _req, res, _next) => {
  console.error('[CARE Error]', err.name || 'Error', ':', err.message || err);

  let status = err.statusCode || 500;
  let code = err.code || 'INTERNAL_SERVER_ERROR';
  let message = err.message || 'An unexpected internal server error occurred';
  let details = err.details || null;

  if (err.name === 'ValidationError') {
    status = 400;
    code = 'VALIDATION_ERROR';
  } else if (err.name === 'CastError') {
    status = 400;
    code = 'INVALID_IDENTIFIER';
    message = `Invalid format for resource ID: ${err.value}`;
  } else if (err.code === 11000) {
    status = 409;
    code = 'DUPLICATE_ENTRY';
    const field = Object.keys(err.keyValue || {})[0] || 'Field';
    message = `A record with this ${field} already exists.`;
  } else if (err.name === 'JsonWebTokenError') {
    status = 401;
    code = 'INVALID_TOKEN';
    message = 'Invalid authentication token';
  } else if (err.name === 'TokenExpiredError') {
    status = 401;
    code = 'TOKEN_EXPIRED';
    message = 'Authentication token has expired';
  }

  res.status(status).json({
    success: false,
    error: {
      code,
      message: status === 500 && process.env.NODE_ENV === 'production' ? 'Internal server error' : message,
      ...(details ? { details } : {}),
    },
  });
};
