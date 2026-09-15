const mongoose = require('mongoose');

const developmentPlanSchema = new mongoose.Schema({
  employee: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  cycle: { type: String, enum: ['April', 'September'], required: true },
  priorities: { type: String, trim: true, default: '' },
  goals: { type: [String], default: [] },
  followUpDate: Date,
  followUpStatus: { type: String, trim: true, default: 'Not Started' },
}, { timestamps: true });

module.exports = mongoose.model('DevelopmentPlan', developmentPlanSchema);
