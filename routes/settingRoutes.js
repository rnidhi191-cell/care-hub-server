const router = require('express').Router();
const auth = require('../middleware/auth');
const { allowRoles } = require('../middleware/auth');
const setting = require('../controllers/settingController');

router.use(auth);

router
  .route('/')
  .get(setting.getReviewSetting)
  .put(allowRoles('HR', 'ADMIN'), setting.updateReviewSetting);

module.exports = router;

