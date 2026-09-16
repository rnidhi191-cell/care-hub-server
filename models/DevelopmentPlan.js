const mongoose = require('mongoose');

const developmentPlanSchema = new mongoose.Schema(
  {
    employee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    cycle: {
      type: String,
      enum: ['April', 'September'],
      required: true,
    },
    year: {
      type: Number,
      default: () => new Date().getFullYear(),
    },
    priorities: {
      type: String,
      trim: true,
      default: '',
    },
    goals: {
      type: [String],
      default: [],
    },
    followUpDate: {
      type: Date,
    },
    followUpStatus: {
      type: String,
      enum: ['Not Started', 'In Progress', 'Completed'],
      default: 'Not Started',
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('DevelopmentPlan', developmentPlanSchema);
