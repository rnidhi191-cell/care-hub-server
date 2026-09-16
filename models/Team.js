const mongoose = require('mongoose');

const teamSchema = new mongoose.Schema(
  {
    department: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Department',
      required: true,
    },
    name: {
      type: String,
      required: [true, 'Team name is required'],
      trim: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Team', teamSchema);

