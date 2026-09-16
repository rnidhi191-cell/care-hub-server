const router = require('express').Router();
const org = require('../../controllers/organizationController');
const { authenticate, requireRole } = require('../../middleware/rbac');

router.use(authenticate);

// View organization structure
router.get('/', org.getOrganization);

// Admin-only creation endpoints
router.post('/departments', requireRole('SUPER_ADMIN', 'HR_ADMIN'), org.createDepartment);
router.post('/teams', requireRole('SUPER_ADMIN', 'HR_ADMIN'), org.createTeam);
router.post('/job-titles', requireRole('SUPER_ADMIN', 'HR_ADMIN'), org.createJobTitle);
router.post('/locations', requireRole('SUPER_ADMIN', 'HR_ADMIN'), org.createLocation);

module.exports = router;

