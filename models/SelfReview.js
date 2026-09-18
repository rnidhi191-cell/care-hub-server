const mongoose = require('mongoose');

const goalSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true,
  },
  employeeAssessment: {
    type: String,
    trim: true,
    default: '',
  },
});

// Each employee has one review per cycle and year.
const selfReviewSchema = new mongoose.Schema(
  {
    employee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    selectedReviewer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    workflowStatus: {
      type: String,
      enum: ['SELF_REVIEW', 'COLLEAGUE_REVIEW', 'MANAGER_REVIEW', 'HR_FINAL_REVIEW', 'COMPLETED'],
      default: 'SELF_REVIEW',
    },
    cycle: {
      type: String,
      enum: ['April', 'September'],
      required: true,
    },
    year: {
      type: Number,
      required: true,
      min: 2000,
    },
    contribute: {
      type: String,
      trim: true,
      default: '',
    },
    achieve: {
      type: String,
      trim: true,
      default: '',
    },
    reflect: {
      type: String,
      trim: true,
      default: '',
    },
    evolve: {
      type: String,
      trim: true,
      default: '',
    },
    goals: {
      type: [goalSchema],
      default: [],
    },
    status: {
      type: String,
      enum: ['Completed', 'Not Completed', 'HR Assisted'],
      default: 'Not Completed',
    },
    // Employee Acknowledgement
    acknowledged: {
      type: Boolean,
      default: false,
    },
    acknowledgementComment: {
      type: String,
      trim: true,
      default: '',
    },
    acknowledgedAt: {
      type: Date,
      default: null,
    },
    acknowledgedIp: {
      type: String,
      default: null,
    },
    raisedConcern: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

selfReviewSchema.index({ employee: 1, cycle: 1, year: 1 }, { unique: true });

module.exports = mongoose.model('SelfReview', selfReviewSchema);
