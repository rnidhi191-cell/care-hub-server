const mongoose = require('mongoose');

const departmentSchema = new mongoose.Schema(
  {
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
    },
    name: {
      type: String,
      required: [true, 'Department name is required'],
      trim: true,
    },
    code: {
      type: String,
      required: [true, 'Department code is required'],
      uppercase: true,
      trim: true,
    },
  },
  { timestamps: true }
);

departmentSchema.index({ organization: 1, code: 1 }, { unique: true });

module.exports = mongoose.model('Department', departmentSchema);

