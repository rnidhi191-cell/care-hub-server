const router = require('express').Router();
const emp = require('../../controllers/employeeController');
const { authenticate, requirePermission } = require('../../middleware/rbac');
const auth = require('../../middleware/auth');
const { allowRoles } = require('../../middleware/auth');

router.use(authenticate);

// Profile and Direct Reports
router.get('/me', emp.getMyProfile);
router.get('/direct-reports', emp.getDirectReports);

// HR: Create User + Employee in one step (POST /api/v1/employees/create-with-account)
router.post('/create-with-account', allowRoles('HR', 'ADMIN'), emp.createUserAndEmployee);

// Audit Logs (HR only)
router.get('/audit-logs', allowRoles('HR', 'ADMIN'), emp.getAuditLogs);

// Employee Management
router.get('/', requirePermission('employee:view'), emp.listEmployees);
router.get('/:id', requirePermission('employee:view'), emp.getEmployeeById);
router.post('/', requirePermission('employee:create'), emp.createEmployee);
router.put('/:id', requirePermission('employee:update'), emp.updateEmployee);
router.delete('/:id', requirePermission('employee:delete'), emp.deleteEmployee);

module.exports = router;

