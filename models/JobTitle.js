const mongoose = require('mongoose');

const jobTitleSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Job title is required'],
      unique: true,
      trim: true,
    },
    level: {
      type: String,
      trim: true,
      default: '', // e.g. "Junior", "Mid", "Senior", "Lead", "Director"
    },
    description: {
      type: String,
      trim: true,
      default: '',
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('JobTitle', jobTitleSchema);

