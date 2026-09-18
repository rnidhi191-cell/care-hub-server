const router = require('express').Router();
const auth = require('../middleware/auth');
const { allowRoles } = require('../middleware/auth');
const checks = require('../controllers/progressCheckController');

router.use(auth);
router.get('/', checks.listProgressChecks);
router.post('/', allowRoles('HR', 'ADMIN'), checks.createProgressCheck);
router.put('/:id', allowRoles('HR', 'ADMIN'), checks.updateProgressCheck);

module.exports = router;
