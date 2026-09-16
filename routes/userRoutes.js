const router = require('express').Router();
const { register, login, logout, getProfile, listUsers } = require('../controllers/authController');
const auth = require('../middleware/auth');
const { allowRoles } = require('../middleware/auth');

router.post('/register', register);
router.post('/login', login);
router.post('/logout', auth, logout);
router.get('/profile', auth, getProfile);
router.get('/users', auth, allowRoles('Reviewer', 'HR'), listUsers);

module.exports = router;