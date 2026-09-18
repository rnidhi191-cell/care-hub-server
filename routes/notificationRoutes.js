const router = require('express').Router();
const auth = require('../middleware/auth');
const notifications = require('../controllers/notificationController');

router.use(auth);
router.get('/', notifications.listNotifications);
router.post('/read-all', notifications.markAllRead);
router.post('/:id/read', notifications.markRead);

module.exports = router;
