const mongoose = require('mongoose');

const goalAssessmentSchema = new mongoose.Schema({
  goal: { type: mongoose.Schema.Types.ObjectId, required: true },
  reviewerAssessment: { type: String, trim: true, default: '' },
  evidence: { type: String, trim: true, default: '' },
}, { _id: false });
const performanceRatingSchema = new mongoose.Schema({
  area: { type: String, required: true, trim: true },
  rating: { type: Number, required: true, min: 1, max: 5 },
  comments: { type: String, trim: true, default: '' },
}, { _id: false });

const reviewerAssessmentSchema = new mongoose.Schema({
  selfReview: { type: mongoose.Schema.Types.ObjectId, ref: 'SelfReview', required: true, unique: true },
  reviewer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  goalAssessments: { type: [goalAssessmentSchema], default: [] },
  performanceRatings: { type: [performanceRatingSchema], default: [] },
}, { timestamps: true });

module.exports = mongoose.model('ReviewerAssessment', reviewerAssessmentSchema);
