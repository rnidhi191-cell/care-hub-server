const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Reads Bearer token and verifies the signed-in user
const authMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization || '';
    const [scheme, token] = authHeader.split(' ');

    if (scheme !== 'Bearer' || !token) {
      return res.status(401).json({
        success: false,
        message: 'Authorization token is required',
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decoded.userId || decoded.id;
    const user = await User.findById(userId);

    if (!user || user.status?.toLowerCase() !== 'active') {
      return res.status(401).json({
        success: false,
        message: 'User account is unavailable or inactive',
      });
    }

    req.user = user;
    next();
  } catch (_err) {
    return res.status(401).json({
      success: false,
      message: 'Invalid or expired token',
    });
  }
};

const allowRoles = (...roles) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to perform this action',
      });
    }
    next();
  };
};

module.exports = authMiddleware;
module.exports.allowRoles = allowRoles;
