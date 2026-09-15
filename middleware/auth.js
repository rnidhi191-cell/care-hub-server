const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Reads a Bearer token and makes the signed-in user available as req.user.
const authMiddleware = async (req, res, next) => {
  try {
    const [scheme, token] = (req.headers.authorization || '').split(' ');
    if (scheme !== 'Bearer' || !token) return res.status(401).json({ success: false, message: 'Authorization token is required' });
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId || decoded.id);
    if (!user || user.status !== 'active') return res.status(401).json({ success: false, message: 'User account is unavailable' });
    req.user = user;
    next();
  } catch (_) { res.status(401).json({ success: false, message: 'Invalid or expired token' }); }
};

const allowRoles = (...roles) => (req, res, next) => roles.includes(req.user.role)
  ? next()
  : res.status(403).json({ success: false, message: 'You do not have permission for this action' });

module.exports = authMiddleware;
module.exports.allowRoles = allowRoles;
