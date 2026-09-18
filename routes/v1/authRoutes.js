const router = require('express').Router();
const auth = require('../../controllers/authController');
const { authenticate, requireRole, requirePermission } = require('../../middleware/rbac');

// Public Authentication
router.post('/register', auth.register);
router.post('/login', auth.login);
router.post('/refresh', auth.refreshToken);
router.post('/forgot-password', auth.forgotPassword);
router.post('/reset-password', auth.resetPassword);

// Authenticated Routes
router.use(authenticate);
router.post('/logout', auth.logout);
router.get('/me', auth.getMe);
router.get('/profile', auth.getMe); // Alias
router.post('/change-password', auth.changePassword);

// Admin-only User Management
router.post('/hr', requireRole('ADMIN'), auth.createHR);
router.patch('/status', requireRole('ADMIN'), auth.updateAccountStatus);
router.get('/users', requirePermission('employee:view'), auth.listUsers);

module.exports = router;
