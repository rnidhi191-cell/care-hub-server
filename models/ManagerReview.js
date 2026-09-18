const mongoose = require('mongoose');

const managerReviewSchema = new mongoose.Schema({
  selfReview: { type: mongoose.Schema.Types.ObjectId, ref: 'SelfReview', required: true, unique: true },
  manager: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  comments: { type: String, trim: true, default: '' },
  rating: { type: Number, min: 1, max: 5, required: true },
  recommendation: { type: String, trim: true, default: '' },
  finalRating: { type: String, trim: true, default: '' },
  finalizedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  finalizedAt: { type: Date, default: null },
}, { timestamps: true });

module.exports = mongoose.model('ManagerReview', managerReviewSchema);
