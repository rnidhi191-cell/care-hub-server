const express = require('express');
const router = express.Router();
const roleController = require('../../controllers/roleController');
const authMiddleware = require('../../middleware/auth');
const { allowRoles } = authMiddleware;

router.use(authMiddleware);
router.use(allowRoles('ADMIN'));

router.post('/', roleController.createRole);
router.get('/', roleController.getRoles);
router.put('/:id', roleController.updateRole);
router.delete('/:id', roleController.deleteRole);
router.post('/assign', roleController.assignRole);

module.exports = router;
