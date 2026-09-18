const mongoose = require('mongoose');

// Files remain private on disk.  This document is the authoritative link between
// a file and the CARE item it supports (a review, embedded review goal, or plan).
const fileAttachmentSchema = new mongoose.Schema({
  entityType: { type: String, enum: ['SELF_REVIEW', 'GOAL', 'DEVELOPMENT_PLAN'], required: true },
  entityId: { type: String, required: true, index: true },
  selfReview: { type: mongoose.Schema.Types.ObjectId, ref: 'SelfReview', default: null },
  developmentPlan: { type: mongoose.Schema.Types.ObjectId, ref: 'DevelopmentPlan', default: null },
  originalName: { type: String, required: true, trim: true },
  storedName: { type: String, required: true, unique: true },
  mimeType: { type: String, required: true },
  size: { type: Number, required: true, min: 0 },
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true });

fileAttachmentSchema.index({ entityType: 1, entityId: 1, createdAt: -1 });

module.exports = mongoose.model('FileAttachment', fileAttachmentSchema);
