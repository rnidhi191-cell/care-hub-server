const mongoose = require('mongoose');

const goalAssessmentSchema = new mongoose.Schema(
  {
    goal: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    goalTitle: {
      type: String,
      trim: true,
      default: '',
    },
    reviewerAssessment: {
      type: String,
      trim: true,
      default: '',
    },
    evidence: {
      type: String,
      trim: true,
      default: '',
    },
    rating: {
      type: Number,
      min: 1,
      max: 5,
      default: null,
    },
    recommendedOutcome: {
      type: String,
      enum: ['', 'Meets Expectations', 'Exceeds Expectations', 'Outstanding', 'Needs Improvement', 'Needs Significant Improvement'],
      default: '',
    },
  },
  { _id: false }
);

const performanceRatingSchema = new mongoose.Schema(
  {
    area: {
      type: String,
      required: true,
      trim: true,
    },
    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
    },
    comments: {
      type: String,
      trim: true,
      default: '',
    },
  },
  { _id: false }
);

// HR Validation sub-document
const hrValidationSchema = new mongoose.Schema(
  {
    status: {
      type: String,
      enum: ['pending', 'approved', 'returned'],
      default: 'pending',
    },
    hrUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    comments: {
      type: String,
      trim: true,
      default: '',
    },
    validatedAt: {
      type: Date,
      default: null,
    },
  },
  { _id: false }
);

const reviewerAssessmentSchema = new mongoose.Schema(
  {
    selfReview: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SelfReview',
      required: true,
      unique: true,
    },
    reviewer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    // --- Overall narrative fields ---
    overallComments: {
      type: String,
      trim: true,
      default: '',
    },
    strengths: {
      type: String,
      trim: true,
      default: '',
    },
    areasForImprovement: {
      type: String,
      trim: true,
      default: '',
    },
    overallAssessment: {
      type: String,
      trim: true,
      default: '',
    },
    recommendation: {
      type: String,
      enum: ['', 'Meets Expectations', 'Exceeds Expectations', 'Outstanding', 'Needs Improvement', 'Needs Significant Improvement'],
      default: '',
    },
    // --- Goal-by-goal assessments ---
    goalAssessments: {
      type: [goalAssessmentSchema],
      default: [],
    },
    // --- 10 competency area ratings ---
    performanceRatings: {
      type: [performanceRatingSchema],
      default: [],
    },
    // --- HR Validation step ---
    hrValidation: {
      type: hrValidationSchema,
      default: () => ({ status: 'pending' }),
    },
    // --- Computed scores (stored for reports, recalculated on save) ---
    competencyAverage: {
      type: Number,
      default: null,
    },
    goalScore: {
      type: Number,
      default: null,
    },
    overallScore: {
      type: Number,
      default: null,
    },
    // --- Lock: prevents edits after HR finalizes ---
    isFinalized: {
      type: Boolean,
      default: false,
    },
    // --- Calibration & Final Rating ---
    calibratedRating: {
      type: Number,
      default: null,
    },
    calibrationReason: {
      type: String,
      trim: true,
      default: '',
    },
    calibrationComments: {
      type: String,
      trim: true,
      default: '',
    },
    finalRating: {
      type: String,
      trim: true,
      default: '',
    },
  },
  { timestamps: true }
);

// Auto-calculate scores before saving
reviewerAssessmentSchema.pre('save', async function computeScores() {
  if (this.performanceRatings && this.performanceRatings.length > 0) {
    const total = this.performanceRatings.reduce((sum, r) => sum + r.rating, 0);
    this.competencyAverage = parseFloat((total / this.performanceRatings.length).toFixed(2));
  }

  const ratedGoals = (this.goalAssessments || []).filter((g) => g.rating != null);
  if (ratedGoals.length > 0) {
    const total = ratedGoals.reduce((sum, g) => sum + g.rating, 0);
    this.goalScore = parseFloat((total / ratedGoals.length).toFixed(2));
  }

  if (this.competencyAverage != null || this.goalScore != null) {
    try {
      const ReviewSetting = mongoose.model('ReviewSetting');
      let setting = await ReviewSetting.findOne();
      
      let goalW = 0.6;
      let compW = 0.4;
      if (setting) {
        goalW = setting.goalWeight / 100;
        compW = setting.competencyWeight / 100;
      }

      const gScore = this.goalScore || 0;
      const cScore = this.competencyAverage || 0;

      // If one is missing, calculate proportional or just fallback
      if (this.competencyAverage != null && this.goalScore != null) {
        this.overallScore = parseFloat((gScore * goalW + cScore * compW).toFixed(2));
      } else if (this.competencyAverage != null) {
        this.overallScore = this.competencyAverage;
      } else if (this.goalScore != null) {
        this.overallScore = this.goalScore;
      }
    } catch (e) {
      console.error('Error fetching ReviewSetting in hook:', e);
      // Fallback
      if (this.competencyAverage != null && this.goalScore != null) {
        this.overallScore = parseFloat(((this.competencyAverage + this.goalScore) / 2).toFixed(2));
      } else if (this.competencyAverage != null) {
        this.overallScore = this.competencyAverage;
      } else if (this.goalScore != null) {
        this.overallScore = this.goalScore;
      }
    }
  }

  
});

module.exports = mongoose.model('ReviewerAssessment', reviewerAssessmentSchema);
