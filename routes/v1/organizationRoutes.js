const router = require('express').Router();
const org = require('../../controllers/organizationController');
const { authenticate, requireRole } = require('../../middleware/rbac');

router.use(authenticate);

// View organization structure
router.get('/', org.getOrganization);

// Admin-only creation endpoints
router.post('/departments', requireRole('ADMIN', 'HR'), org.createDepartment);
router.post('/teams', requireRole('ADMIN', 'HR'), org.createTeam);
router.post('/job-titles', requireRole('ADMIN', 'HR'), org.createJobTitle);
router.post('/locations', requireRole('ADMIN', 'HR'), org.createLocation);

module.exports = router;

