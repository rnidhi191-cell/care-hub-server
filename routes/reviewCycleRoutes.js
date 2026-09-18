const router = require('express').Router();
const auth = require('../middleware/auth');
const { allowRoles } = require('../middleware/auth');
const cycles = require('../controllers/reviewCycleController');

router.use(auth);
router.get('/', allowRoles('ADMIN', 'HR', 'MANAGER', 'EMPLOYEE'), cycles.listCycles);
router.get('/:id', allowRoles('ADMIN', 'HR', 'MANAGER', 'EMPLOYEE'), cycles.getCycle);
router.post('/', allowRoles('ADMIN', 'HR'), cycles.createCycle);
router.put('/:id', allowRoles('ADMIN', 'HR'), cycles.updateCycle);
router.put('/:id/assignments', allowRoles('ADMIN', 'HR'), cycles.assignPeople);
router.delete('/:id', allowRoles('ADMIN', 'HR'), cycles.deleteCycle);
router.put('/:id/launch', allowRoles('ADMIN', 'HR'), cycles.launchCycle);
router.put('/:id/close', allowRoles('ADMIN', 'HR'), cycles.closeCycle);

module.exports = router;
