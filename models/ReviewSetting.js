const mongoose = require('mongoose');

const reviewSettingSchema = new mongoose.Schema(
  {
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      default: null,
    },
    goalWeight: {
      type: Number,
      required: true,
      default: 60,
      min: 0,
      max: 100,
    },
    competencyWeight: {
      type: Number,
      required: true,
      default: 40,
      min: 0,
      max: 100,
    },
    cycleStartDate: {
      type: Date,
      default: () => new Date('2023-09-15'),
    },
    cycleEndDate: {
      type: Date,
      default: () => new Date('2023-09-30'),
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model('ReviewSetting', reviewSettingSchema);

