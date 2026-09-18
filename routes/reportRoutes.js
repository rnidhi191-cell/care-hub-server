const router = require('express').Router();
const { authenticate, requirePermission } = require('../middleware/rbac');
const reports = require('../controllers/reportController');
router.use(authenticate);
router.get('/', requirePermission('report:view'), reports.getReports);
module.exports = router;
