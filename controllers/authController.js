const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User');
const { normalizeRole, getPermissionsForRole } = require('../config/permissions');

const JWT_SECRET = process.env.JWT_SECRET || 'care_hub_jwt_default_secret_key';
const REFRESH_SECRET = process.env.REFRESH_SECRET || `${JWT_SECRET}_refresh`;

// Tokens: Short-lived Access Token (15m) + Long-lived Refresh Token (7d)
const createAccessToken = (user) => {
  const role = normalizeRole(user.role);
  return jwt.sign(
    { id: user._id, role, email: user.email },
    JWT_SECRET,
    { expiresIn: '15m' }
  );
};

const createRefreshToken = (user) => {
  return jwt.sign(
    { id: user._id, nonce: crypto.randomBytes(16).toString('hex') },
    REFRESH_SECRET,
    { expiresIn: '7d' }
  );
};

const userResponse = (user) => {
  const role = normalizeRole(user.role);
  const permissions = getPermissionsForRole(role);
  return {
    id: user._id.toString(),
    _id: user._id,
    name: user.name,
    email: user.email,
    role,
    rawRole: user.role,
    permissions,
    status: user.status,
  };
};

const validEmail = (email) => {
  return typeof email === 'string' && /^\S+@\S+\.\S+$/.test(email.trim());
};

// -------------------------------------------------------------
// CONTROLLERS
// -------------------------------------------------------------

const register = async (req, res, next) => {
  try {
    const { name, email, password, role } = req.body;

    if (!name?.trim() || !validEmail(email) || typeof password !== 'string' || password.length < 6) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Please provide a name, valid email, and a password of at least 6 characters',
        },
      });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const existing = await User.findOne({ email: normalizedEmail });
    if (existing) {
      return res.status(409).json({
        success: false,
        error: {
          code: 'EMAIL_CONFLICT',
          message: 'An account with this email already exists',
        },
      });
    }

    const validRole = role ? role : 'Employee';
    const user = await User.create({
      name: name.trim(),
      email: normalizedEmail,
      password,
      role: validRole,
      status: 'active',
    });

    const accessToken = createAccessToken(user);
    const refreshToken = createRefreshToken(user);

    // Save refresh token
    user.refreshTokens = [refreshToken];
    await user.save();

    res.status(201).json({
      success: true,
      message: 'Registration successful',
      data: {
        token: accessToken, // Backward compatibility
        accessToken,
        refreshToken,
        user: userResponse(user),
      },
    });
  } catch (error) {
    next(error);
  }
};

const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!validEmail(email) || !password) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Please provide both email and password',
        },
      });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const user = await User.findOne({ email: normalizedEmail }).select('+password +refreshTokens');

    if (!user || !(await user.matchPassword(password))) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid email or password',
        },
      });
    }

    if (user.status?.toLowerCase() !== 'active') {
      return res.status(403).json({
        success: false,
        error: {
          code: 'ACCOUNT_INACTIVE',
          message: 'Your account is inactive or suspended. Please contact HR.',
        },
      });
    }

    const accessToken = createAccessToken(user);
    const refreshToken = createRefreshToken(user);

    // Keep up to 5 active refresh tokens per user
    user.refreshTokens = [...(user.refreshTokens || []).slice(-4), refreshToken];
    await user.save();

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        token: accessToken, // Backward compatibility
        accessToken,
        refreshToken,
        user: userResponse(user),
      },
    });
  } catch (error) {
    next(error);
  }
};

// Refresh Token Rotation
const refreshTokenHandler = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'REFRESH_TOKEN_REQUIRED',
          message: 'Refresh token is required',
        },
      });
    }

    let decoded;
    try {
      decoded = jwt.verify(refreshToken, REFRESH_SECRET);
    } catch {
      return res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_REFRESH_TOKEN',
          message: 'Refresh token is invalid or expired',
        },
      });
    }

    const user = await User.findById(decoded.id).select('+refreshTokens');
    if (!user || user.status?.toLowerCase() !== 'active') {
      return res.status(401).json({
        success: false,
        error: {
          code: 'ACCOUNT_UNAVAILABLE',
          message: 'User account not found or inactive',
        },
      });
    }

    // Verify token exists in user's saved tokens
    if (!user.refreshTokens?.includes(refreshToken)) {
      // Possible reuse attack: clear all tokens for security
      user.refreshTokens = [];
      await user.save();
      return res.status(403).json({
        success: false,
        error: {
          code: 'TOKEN_REUSE_DETECTED',
          message: 'Refresh token compromise detected. Please sign in again.',
        },
      });
    }

    // Token rotation: remove old token, issue new pair
    const newAccessToken = createAccessToken(user);
    const newRefreshToken = createRefreshToken(user);

    user.refreshTokens = user.refreshTokens.filter((t) => t !== refreshToken);
    user.refreshTokens.push(newRefreshToken);
    await user.save();

    res.json({
      success: true,
      message: 'Token refreshed successfully',
      data: {
        token: newAccessToken,
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
        user: userResponse(user),
      },
    });
  } catch (error) {
    next(error);
  }
};

const logout = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    if (refreshToken && req.user?.id) {
      const user = await User.findById(req.user.id).select('+refreshTokens');
      if (user) {
        user.refreshTokens = (user.refreshTokens || []).filter((t) => t !== refreshToken);
        await user.save();
      }
    }
    res.json({ success: true, message: 'Logout successful' });
  } catch (error) {
    next(error);
  }
};

const getMe = async (req, res) => {
  res.json({
    success: true,
    data: {
      user: req.user,
    },
  });
};

const changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword || newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'New password must be at least 6 characters',
        },
      });
    }

    const user = await User.findById(req.user.id).select('+password +refreshTokens');
    if (!user || !(await user.matchPassword(currentPassword))) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_PASSWORD',
          message: 'Current password is incorrect',
        },
      });
    }

    user.password = newPassword;
    user.refreshTokens = []; // Invalidate other sessions
    await user.save();

    res.json({
      success: true,
      message: 'Password changed successfully. Please sign in again if needed.',
    });
  } catch (error) {
    next(error);
  }
};

const forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;
    if (!validEmail(email)) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Valid email is required' },
      });
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) {
      // Return success to avoid email enumeration
      return res.json({
        success: true,
        message: 'If an account exists with that email, a password reset link has been dispatched.',
      });
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    user.passwordResetToken = crypto.createHash('sha256').update(resetToken).digest('hex');
    user.passwordResetExpires = new Date(Date.now() + 3600000); // 1 hour
    await user.save();

    // In dev / test environments, expose token in message for ease of testing
    const isDev = process.env.NODE_ENV !== 'production';

    res.json({
      success: true,
      message: 'Password reset link has been generated.',
      ...(isDev ? { resetToken } : {}),
    });
  } catch (error) {
    next(error);
  }
};

const resetPassword = async (req, res, next) => {
  try {
    const { token, newPassword } = req.body;
    if (!token || !newPassword || newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Token and a password of at least 6 characters are required',
        },
      });
    }

    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
    const user = await User.findOne({
      passwordResetToken: hashedToken,
      passwordResetExpires: { $gt: new Date() },
    }).select('+password +refreshTokens');

    if (!user) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_RESET_TOKEN',
          message: 'Password reset token is invalid or has expired',
        },
      });
    }

    user.password = newPassword;
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    user.refreshTokens = [];
    await user.save();

    res.json({
      success: true,
      message: 'Password has been reset successfully. You can now log in with your new password.',
    });
  } catch (error) {
    next(error);
  }
};

const updateAccountStatus = async (req, res, next) => {
  try {
    const { userId, status } = req.body;
    if (!userId || !['active', 'inactive', 'suspended'].includes(status)) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Valid userId and status are required' },
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'User not found' },
      });
    }

    user.status = status;
    if (status !== 'active') {
      user.refreshTokens = []; // Revoke active sessions
    }
    await user.save();

    res.json({
      success: true,
      message: `User status updated to ${status}`,
      data: userResponse(user),
    });
  } catch (error) {
    next(error);
  }
};

const listUsers = async (req, res, next) => {
  try {
    const role = req.query.role;
    const filter = role ? { role } : {};
    const users = await User.find(filter).select('-password').sort({ name: 1 });
    res.json({
      success: true,
      data: users.map(userResponse),
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  register,
  login,
  refreshToken: refreshTokenHandler,
  logout,
  getMe,
  getProfile: getMe, // Alias for backward compatibility
  changePassword,
  forgotPassword,
  resetPassword,
  updateAccountStatus,
  listUsers,
};
