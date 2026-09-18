const mongoose = require('mongoose');

const assignmentSchema = new mongoose.Schema({
  employee: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  reviewer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  assignedAt: { type: Date, default: Date.now },
}, { _id: false });

const reviewCycleSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true, maxlength: 120 },
  cycleName: { type: String, required: true, enum: ['April', 'September'] },
  year: { type: Number, required: true, min: 2000, max: 2100 },
  status: { type: String, enum: ['DRAFT', 'ACTIVE', 'CLOSED'], default: 'DRAFT' },
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  selfReviewDeadline: { type: Date, required: true },
  reviewerDeadline: { type: Date, required: true },
  hrValidationDeadline: { type: Date, required: true },
  calibrationStartDate: { type: Date, default: null },
  calibrationEndDate: { type: Date, default: null },
  discussionStartDate: { type: Date, default: null },
  discussionEndDate: { type: Date, default: null },
  finalizationDate: { type: Date, default: null },
  acknowledgementDeadline: { type: Date, default: null },
  assignments: { type: [assignmentSchema], default: [] },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  launchedAt: { type: Date, default: null },
  closedAt: { type: Date, default: null },
}, { timestamps: true });

reviewCycleSchema.index({ cycleName: 1, year: 1 }, { unique: true });
reviewCycleSchema.index({ 'assignments.employee': 1 });
reviewCycleSchema.index({ 'assignments.reviewer': 1 });

module.exports = mongoose.model('ReviewCycle', reviewCycleSchema);
