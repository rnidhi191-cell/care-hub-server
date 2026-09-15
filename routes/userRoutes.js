const router = require('express').Router();
const { register, login, logout, getProfile } = require('../controllers/authController');
const auth = require('../middleware/auth');
router.post('/register', register);
router.post('/login', login);
router.post('/logout', auth, logout);
router.get('/profile', auth, getProfile);
module.exports = router;