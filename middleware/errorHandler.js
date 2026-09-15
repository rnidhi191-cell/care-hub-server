// Keep error responses consistent and avoid exposing stack traces to API users.
module.exports = (error, _req, res, _next) => {
  console.error(error.message);
  const status = error.name === 'ValidationError' || error.name === 'CastError' ? 400 : error.code === 11000 ? 400 : error.statusCode || 500;
  res.status(status).json({ success: false, message: status === 500 ? 'Internal server error' : error.message });
};
