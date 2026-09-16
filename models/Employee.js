const mongoose = require('mongoose');

const employeeSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
    },
    employeeCode: {
      type: String,
      required: [true, 'Employee code is required'],
      unique: true,
      uppercase: true,
      trim: true,
    },
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
    },
    department: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Department',
    },
    team: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Team',
    },
    jobTitle: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'JobTitle',
    },
    location: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Location',
    },
    manager: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Employee',
      default: null,
    },
    joiningDate: {
      type: Date,
      default: Date.now,
    },
    employmentStatus: {
      type: String,
      enum: ['FULL_TIME', 'PART_TIME', 'PROBATION', 'CONTRACT', 'TERMINATED'],
      default: 'FULL_TIME',
    },
    phoneNumber: {
      type: String,
      trim: true,
      default: '',
    },
    emergencyContact: {
      type: String,
      trim: true,
      default: '',
    },
  },
  { timestamps: true }
);

employeeSchema.index({ department: 1 });
employeeSchema.index({ manager: 1 });

module.exports = mongoose.model('Employee', employeeSchema);

