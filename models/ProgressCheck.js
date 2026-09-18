const mongoose = require('mongoose');

const goalProgressSchema = new mongoose.Schema({
  goal: { type: String, required: true, trim: true },
  progress: { type: Number, min: 0, max: 100, default: 0 },
  status: { type: String, enum: ['Not Started', 'In Progress', 'Completed', 'Blocked'], default: 'Not Started' },
  comments: { type: String, trim: true, default: '' },
}, { _id: false });

const progressCheckSchema = new mongoose.Schema({
  employee: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  manager: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  developmentPlan: { type: mongoose.Schema.Types.ObjectId, ref: 'DevelopmentPlan', default: null },
  selfReview: { type: mongoose.Schema.Types.ObjectId, ref: 'SelfReview', default: null },
  reviewerAssessment: { type: mongoose.Schema.Types.ObjectId, ref: 'ReviewerAssessment', default: null },
  dueDate: { type: Date, required: true },
  checkInDate: { type: Date, default: null },
  status: { type: String, enum: ['PENDING', 'COMPLETED', 'OVERDUE'], default: 'PENDING', index: true },
  goalProgress: { type: [goalProgressSchema], default: [] },
  developmentProgress: { type: String, trim: true, default: '' },
  achievements: { type: String, trim: true, default: '' },
  challenges: { type: String, trim: true, default: '' },
  supportRequired: { type: String, trim: true, default: '' },
  newGoals: { type: [String], default: [] },
  employeeComments: { type: String, trim: true, default: '' },
  managerComments: { type: String, trim: true, default: '' },
  completedAt: { type: Date, default: null },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true });

progressCheckSchema.index({ employee: 1, dueDate: -1 });

module.exports = mongoose.model('ProgressCheck', progressCheckSchema);
