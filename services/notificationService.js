const Notification = require('../models/Notification');
const ReviewCycle = require('../models/ReviewCycle');
const User = require('../models/User');

const dateText = (date) => new Date(date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

const createNotification = async ({ recipient, type, title, message, link = '', entityType = '', entityId = null, dedupeKey }) => {
  if (!recipient || !dedupeKey) return null;
  await Notification.updateOne(
    { recipient, dedupeKey },
    { $setOnInsert: { recipient, type, title, message, link, entityType, entityId, dedupeKey } },
    { upsert: true },
  );
  return Notification.findOne({ recipient, dedupeKey });
};

const notifyUsers = async (recipients, payload) => {
  const uniqueRecipients = [...new Set(recipients.filter(Boolean).map(String))];
  return Promise.all(uniqueRecipients.map((recipient) => createNotification({
    ...payload,
    recipient,
    dedupeKey: `${payload.dedupeKey}:${recipient}`,
  })));
};

const ensureDeadlineNotifications = async (user) => {
  const role = user.role;
  const isHr = ['ADMIN', 'HR'].includes(role);
  const filter = isHr ? { status: 'ACTIVE' } : role === 'MANAGER'
    ? { status: 'ACTIVE', 'assignments.reviewer': user._id }
    : { status: 'ACTIVE', 'assignments.employee': user._id };
  const cycles = await ReviewCycle.find(filter).select('title cycleName year assignments selfReviewDeadline reviewerDeadline hrValidationDeadline calibrationStartDate calibrationEndDate acknowledgementDeadline');

  for (const cycle of cycles) {
    const base = `${cycle._id}:${cycle.updatedAt?.getTime() || ''}`;
    if (role === 'EMPLOYEE') {
      await createNotification({
        recipient: user._id, type: 'DEADLINE', title: 'Self-review deadline',
        message: `${cycle.title}: submit your CARE self-review by ${dateText(cycle.selfReviewDeadline)}.`,
        link: '/self-review', entityType: 'ReviewCycle', entityId: cycle._id, dedupeKey: `deadline:self:${base}`,
      });
      if (cycle.acknowledgementDeadline) await createNotification({
        recipient: user._id, type: 'DEADLINE', title: 'Acknowledgement deadline',
        message: `${cycle.title}: acknowledge your final review by ${dateText(cycle.acknowledgementDeadline)}.`,
        link: '/employee', entityType: 'ReviewCycle', entityId: cycle._id, dedupeKey: `deadline:ack:${base}`,
      });
    }
    if (role === 'MANAGER') await createNotification({
      recipient: user._id, type: 'DEADLINE', title: 'Reviewer deadline',
      message: `${cycle.title}: complete assigned reviewer assessments by ${dateText(cycle.reviewerDeadline)}.`,
      link: '/reviewer', entityType: 'ReviewCycle', entityId: cycle._id, dedupeKey: `deadline:reviewer:${base}`,
    });
    if (isHr) {
      await createNotification({
        recipient: user._id, type: 'DEADLINE', title: 'HR validation deadline',
        message: `${cycle.title}: complete HR validation by ${dateText(cycle.hrValidationDeadline)}.`,
        link: '/hr', entityType: 'ReviewCycle', entityId: cycle._id, dedupeKey: `deadline:validation:${base}`,
      });
      if (cycle.calibrationStartDate) await createNotification({
        recipient: user._id, type: 'CALIBRATION', title: 'Calibration window scheduled',
        message: `${cycle.title}: calibration starts ${dateText(cycle.calibrationStartDate)}${cycle.calibrationEndDate ? ` and ends ${dateText(cycle.calibrationEndDate)}` : ''}.`,
        link: '/hr', entityType: 'ReviewCycle', entityId: cycle._id, dedupeKey: `deadline:calibration:${base}`,
      });
    }
  }
};

const hrAdminIds = async () => (await User.find({ role: { $in: ['ADMIN', 'HR'] }, status: 'active' }).select('_id')).map((user) => user._id);

module.exports = { createNotification, notifyUsers, ensureDeadlineNotifications, hrAdminIds };
