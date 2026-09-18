const Notification = require('../models/Notification');
const { ensureDeadlineNotifications } = require('../services/notificationService');

const listNotifications = async (req, res, next) => {
  try {
    await ensureDeadlineNotifications(req.user);
    const limit = Math.min(Math.max(Number(req.query.limit) || 30, 1), 100);
    const notifications = await Notification.find({ recipient: req.user._id }).sort({ createdAt: -1 }).limit(limit);
    const unreadCount = await Notification.countDocuments({ recipient: req.user._id, readAt: null });
    res.json({ success: true, data: notifications, unreadCount });
  } catch (error) { next(error); }
};

const markRead = async (req, res, next) => {
  try {
    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, recipient: req.user._id, readAt: null },
      { readAt: new Date() }, { new: true },
    );
    if (!notification) return res.status(404).json({ success: false, message: 'Notification not found' });
    res.json({ success: true, data: notification });
  } catch (error) { next(error); }
};

const markAllRead = async (req, res, next) => {
  try {
    await Notification.updateMany({ recipient: req.user._id, readAt: null }, { readAt: new Date() });
    res.json({ success: true, message: 'All notifications marked as read' });
  } catch (error) { next(error); }
};

module.exports = { listNotifications, markRead, markAllRead };
