const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  type: {
    type: String,
    enum: ['DEADLINE', 'REVIEW_SUBMITTED', 'REVIEW_RETURNED', 'VALIDATION', 'CALIBRATION', 'ACKNOWLEDGEMENT', 'PROGRESS_CHECK'],
    required: true,
  },
  title: { type: String, required: true, trim: true, maxlength: 140 },
  message: { type: String, required: true, trim: true, maxlength: 500 },
  link: { type: String, default: '', trim: true },
  entityType: { type: String, default: '', trim: true },
  entityId: { type: mongoose.Schema.Types.ObjectId, default: null },
  dedupeKey: { type: String, required: true, trim: true },
  readAt: { type: Date, default: null },
}, { timestamps: true });

notificationSchema.index({ recipient: 1, dedupeKey: 1 }, { unique: true });
notificationSchema.index({ recipient: 1, readAt: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);
