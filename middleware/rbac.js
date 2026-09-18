const jwt = require('jsonwebtoken');
const { getPermissionsForRole, normalizeRole } = require('../config/permissions');
const User = require('../models/User');

// Authenticate JWT Token (Access Token)
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization || '';
    const [scheme, token] = authHeader.split(' ');

    if (scheme !== 'Bearer' || !token) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authorization Bearer token is required',
        },
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'care_hub_jwt_default_secret_key');
    const userId = decoded.id || decoded.userId;

    let user = null;
    if (userId) {
      user = await User.findById(userId);
    }

    if (!user || user.status?.toLowerCase() !== 'active') {
      return res.status(401).json({
        success: false,
        error: {
          code: 'ACCOUNT_UNAVAILABLE',
          message: 'User account is inactive or no longer available',
        },
      });
    }

    // Attach normalized role and permissions to req.user
    const role = normalizeRole(user.role);
    const permissions = getPermissionsForRole(role);

    req.user = {
      id: user._id.toString(),
      _id: user._id,
      name: user.name,
      email: user.email,
      role,
      rawRole: user.role,
      permissions,
      status: user.status,
    };

    next();
  } catch (err) {
    const isExpired = err.name === 'TokenExpiredError';
    return res.status(401).json({
      success: false,
      error: {
        code: isExpired ? 'TOKEN_EXPIRED' : 'INVALID_TOKEN',
        message: isExpired ? 'Access token has expired' : 'Invalid authorization token',
      },
    });
  }
};

// Permission check middleware
const requirePermission = (...requiredPermissions) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
      });
    }

    if (req.user.role === 'ADMIN') {
      return next();
    }

    const userPermissions = new Set(req.user.permissions || []);
    const hasAll = requiredPermissions.every((p) => userPermissions.has(p));

    if (!hasAll) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'You do not have the required permissions for this action',
          details: { missingPermissions: requiredPermissions.filter((p) => !userPermissions.has(p)) },
        },
      });
    }

    next();
  };
};

// Role check middleware
const requireRole = (...allowedRoles) => {
  const normalizedAllowed = allowedRoles.map(normalizeRole);

  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
      });
    }

    if (req.user.role === 'ADMIN') {
      return next();
    }

    if (!normalizedAllowed.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Your role does not permit this action',
          details: { currentRole: req.user.role, allowedRoles: normalizedAllowed },
        },
      });
    }

    next();
  };
};

// Workflow State Transitions
const ALLOWED_TRANSITIONS = {
  DRAFT: ['SELF_REVIEW', 'CANCELLED'],
  SELF_REVIEW: ['REVIEWER_ASSESSMENT', 'OVERDUE', 'CANCELLED'],
  REVIEWER_ASSESSMENT: ['HR_VALIDATION', 'RETURNED', 'OVERDUE'],
  HR_VALIDATION: ['CALIBRATION', 'RETURNED', 'REOPENED'],
  CALIBRATION: ['PERFORMANCE_DISCUSSION', 'FINALIZED', 'RETURNED'],
  PERFORMANCE_DISCUSSION: ['FINALIZED', 'REOPENED'],
  FINALIZED: ['ACKNOWLEDGEMENT'],
  ACKNOWLEDGEMENT: ['COMPLETED'],
  COMPLETED: ['PROGRESS_CHECK', 'REOPENED'],
  PROGRESS_CHECK: ['COMPLETED'],
  RETURNED: ['SELF_REVIEW', 'REVIEWER_ASSESSMENT'],
  OVERDUE: ['SELF_REVIEW', 'REVIEWER_ASSESSMENT', 'HR_VALIDATION'],
  REOPENED: ['SELF_REVIEW', 'REVIEWER_ASSESSMENT'],
  CANCELLED: [],
};

const validateWorkflowTransition = (currentState, nextState) => {
  const allowed = ALLOWED_TRANSITIONS[currentState] || [];
  return allowed.includes(nextState);
};

module.exports = {
  authenticate,
  requirePermission,
  requireRole,
  validateWorkflowTransition,
};

