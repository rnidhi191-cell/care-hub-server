const SelfReview = require('../models/SelfReview');
const ReviewerAssessment = require('../models/ReviewerAssessment');
const DevelopmentPlan = require('../models/DevelopmentPlan');
const AuditLog = require('../models/AuditLog');


const deny = (res) => {
  return res.status(403).json({ success: false, message: 'Access denied' });
};

const missing = (res, name) => {
  return res.status(404).json({ success: false, message: `${name} not found` });
};

// --- Self Reviews ---

const listSelfReviews = async (req, res, next) => {
  try {
    const filter = req.user.role === 'Employee' ? { employee: req.user._id } : {};
    
    // Optional filters for HR / Reviewer
    if (req.query.cycle) filter.cycle = req.query.cycle;
    if (req.query.year) filter.year = Number(req.query.year);
    if (req.query.employee && req.user.role !== 'Employee') filter.employee = req.query.employee;

    const selfReviews = await SelfReview.find(filter)
      .populate('employee', 'name email role')
      .sort({ year: -1, createdAt: -1 });

    // Attach assessment status for convenience
    const reviewIds = selfReviews.map((r) => r._id);
    const assessments = await ReviewerAssessment.find({ selfReview: { $in: reviewIds } })
      .select('selfReview reviewer createdAt')
      .populate('reviewer', 'name email');

    const assessmentMap = new Map();
    assessments.forEach((a) => assessmentMap.set(a.selfReview.toString(), a));

    const enriched = selfReviews.map((sr) => {
      const obj = sr.toObject();
      obj.assessment = assessmentMap.get(sr._id.toString()) || null;
      return obj;
    });

    res.json({ success: true, data: enriched });
  } catch (error) {
    next(error);
  }
};

const getSelfReview = async (req, res, next) => {
  try {
    const item = await SelfReview.findById(req.params.id).populate('employee', 'name email role');
    if (!item) return missing(res, 'Self-review');

    if (req.user.role === 'Employee' && !item.employee._id.equals(req.user._id)) {
      return deny(res);
    }

    const assessment = await ReviewerAssessment.findOne({ selfReview: item._id })
      .populate('reviewer', 'name email');

    const result = item.toObject();
    result.assessment = assessment || null;

    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};

const createSelfReview = async (req, res, next) => {
  try {
    const employee = req.user.role === 'HR' && req.body.employee ? req.body.employee : req.user._id;
    const { cycle, year, contribute, achieve, reflect, evolve, goals, status } = req.body;

    if (!cycle || !year) {
      return res.status(400).json({ success: false, message: 'Cycle and Year are required' });
    }

    // Check if review already exists for this cycle & year
    const existing = await SelfReview.findOne({ employee, cycle, year: Number(year) });
    if (existing) {
      return res.status(409).json({
        success: false,
        message: `A self-review for ${cycle} ${year} already exists. You can update the existing review.`,
        existingId: existing._id,
      });
    }

    const newReview = await SelfReview.create({
      employee,
      cycle,
      year: Number(year),
      contribute: contribute || '',
      achieve: achieve || '',
      reflect: reflect || '',
      evolve: evolve || '',
      goals: Array.isArray(goals) ? goals : [],
      status: status || 'Completed',
    });

    const populated = await newReview.populate('employee', 'name email role');
    res.status(201).json({ success: true, message: 'Self-review created successfully', data: populated });
  } catch (error) {
    next(error);
  }
};

const updateSelfReview = async (req, res, next) => {
  try {
    const item = await SelfReview.findById(req.params.id);
    if (!item) return missing(res, 'Self-review');

    if (req.user.role === 'Employee' && !item.employee.equals(req.user._id)) {
      return deny(res);
    }

    const oldStatus = item.status;
    const oldAcknowledged = item.acknowledged;

    delete req.body.employee; // Prevent changing review ownership

    // Check if acknowledging
    if (req.body.acknowledged === true && !oldAcknowledged) {
      req.body.acknowledgedAt = new Date();
      req.body.acknowledgedIp = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    }

    Object.assign(item, req.body);
    await item.save();

    if (req.body.status && oldStatus !== req.body.status) {
      AuditLog.create({
        user: req.user._id,
        action: 'WORKFLOW_STATUS_CHANGED',
        entity: 'SelfReview',
        entityId: item._id,
        oldValue: { status: oldStatus },
        newValue: { status: req.body.status },
      }).catch(() => {});
    }

    if (item.acknowledged && !oldAcknowledged) {
      AuditLog.create({
        user: req.user._id,
        action: 'REVIEW_ACKNOWLEDGED',
        entity: 'SelfReview',
        entityId: item._id,
        newValue: { comment: item.acknowledgementComment, raisedConcern: item.raisedConcern },
      }).catch(() => {});
    }

    const populated = await item.populate('employee', 'name email role');
    res.json({ success: true, message: 'Self-review updated successfully', data: populated });
  } catch (error) {
    next(error);
  }
};

const deleteSelfReview = async (req, res, next) => {
  try {
    const item = await SelfReview.findById(req.params.id);
    if (!item) return missing(res, 'Self-review');

    if (req.user.role === 'Employee' && !item.employee.equals(req.user._id)) {
      return deny(res);
    }

    await ReviewerAssessment.deleteOne({ selfReview: item._id });
    await item.deleteOne();

    res.json({ success: true, message: 'Self-review deleted successfully' });
  } catch (error) {
    next(error);
  }
};

// --- Reviewer Assessments ---

const listAssessments = async (req, res, next) => {
  try {
    const filter = req.user.role === 'Reviewer' ? { reviewer: req.user._id } : {};

    let items = await ReviewerAssessment.find(filter)
      .populate({
        path: 'selfReview',
        populate: { path: 'employee', select: 'name email role' },
      })
      .populate('reviewer', 'name email role')
      .sort({ createdAt: -1 });

    if (req.user.role === 'Employee') {
      items = items.filter((x) => x.selfReview?.employee?._id?.equals(req.user._id));
    }

    res.json({ success: true, data: items });
  } catch (error) {
    next(error);
  }
};

const getAssessmentBySelfReview = async (req, res, next) => {
  try {
    const assessment = await ReviewerAssessment.findOne({ selfReview: req.params.selfReviewId })
      .populate({
        path: 'selfReview',
        populate: { path: 'employee', select: 'name email role' },
      })
      .populate('reviewer', 'name email role');

    if (!assessment) return missing(res, 'Assessment');

    if (req.user.role === 'Employee' && !assessment.selfReview?.employee?._id?.equals(req.user._id)) {
      return deny(res);
    }

    res.json({ success: true, data: assessment });
  } catch (error) {
    next(error);
  }
};

const createAssessment = async (req, res, next) => {
  try {
    const { selfReview: selfReviewId, goalAssessments, performanceRatings, overallComments, strengths, areasForImprovement, overallAssessment, recommendation } = req.body;

    if (!selfReviewId) {
      return res.status(400).json({ success: false, message: 'selfReview ID is required' });
    }

    const review = await SelfReview.findById(selfReviewId);
    if (!review) return missing(res, 'Self-review');

    // Prevent reviewer from assessing themselves
    if (review.employee.equals(req.user._id)) {
      return res.status(400).json({ success: false, message: 'You cannot assess your own self-review' });
    }

    const existing = await ReviewerAssessment.findOne({ selfReview: selfReviewId });
    if (existing) {
      return res.status(409).json({
        success: false,
        message: 'An assessment for this self-review already exists. You can update it instead.',
        existingId: existing._id,
      });
    }

    const assessment = await ReviewerAssessment.create({
      selfReview: selfReviewId,
      reviewer: req.user._id,
      overallComments: overallComments || '',
      strengths: strengths || '',
      areasForImprovement: areasForImprovement || '',
      overallAssessment: overallAssessment || '',
      recommendation: recommendation || '',
      goalAssessments: Array.isArray(goalAssessments) ? goalAssessments : [],
      performanceRatings: Array.isArray(performanceRatings) ? performanceRatings : [],
    });

    // Audit trail
    AuditLog.create({
      user: req.user._id,
      action: 'ASSESSMENT_SUBMITTED',
      entity: 'ReviewerAssessment',
      entityId: assessment._id,
    }).catch(() => {});

    const populated = await assessment.populate([
      { path: 'selfReview', populate: { path: 'employee', select: 'name email role' } },
      { path: 'reviewer', select: 'name email role' },
    ]);

    res.status(201).json({
      success: true,
      message: 'Assessment submitted successfully',
      data: populated,
    });
  } catch (error) {
    next(error);
  }
};

const updateAssessment = async (req, res, next) => {
  try {
    const item = await ReviewerAssessment.findById(req.params.id);
    if (!item) return missing(res, 'Reviewer assessment');

    if (req.user.role === 'Reviewer' && !item.reviewer.equals(req.user._id)) {
      return deny(res);
    }

    if (item.isFinalized) {
      return res.status(400).json({ success: false, message: 'This assessment is finalized and cannot be modified' });
    }

    delete req.body.reviewer;
    delete req.body.selfReview;

    Object.assign(item, req.body);
    await item.save();

    // Audit trail
    AuditLog.create({
      user: req.user._id,
      action: 'ASSESSMENT_MODIFIED',
      entity: 'ReviewerAssessment',
      entityId: item._id,
    }).catch(() => {});

    const populated = await item.populate([
      { path: 'selfReview', populate: { path: 'employee', select: 'name email role' } },
      { path: 'reviewer', select: 'name email role' },
    ]);

    res.json({ success: true, message: 'Assessment updated successfully', data: populated });
  } catch (error) {
    next(error);
  }
};

const deleteAssessment = async (req, res, next) => {
  try {
    const item = await ReviewerAssessment.findById(req.params.id);
    if (!item) return missing(res, 'Reviewer assessment');

    if (req.user.role === 'Reviewer' && !item.reviewer.equals(req.user._id)) {
      return deny(res);
    }

    await item.deleteOne();
    res.json({ success: true, message: 'Reviewer assessment deleted successfully' });
  } catch (error) {
    next(error);
  }
};

const calibrateAssessment = async (req, res, next) => {
  try {
    const { calibratedRating, calibrationReason, calibrationComments, finalRating } = req.body;

    const item = await ReviewerAssessment.findById(req.params.id);
    if (!item) return res.status(404).json({ success: false, message: 'Assessment not found' });

    const oldCalibratedRating = item.calibratedRating;

    item.calibratedRating = calibratedRating;
    item.calibrationReason = calibrationReason || '';
    item.calibrationComments = calibrationComments || '';
    item.finalRating = finalRating || '';
    
    // Also mark as finalized if calibrated
    if (calibratedRating !== undefined) {
      item.isFinalized = true;
      if (!item.hrValidation) item.hrValidation = {};
      item.hrValidation.status = 'approved';
      item.hrValidation.hrUser = req.user._id;
      item.hrValidation.validatedAt = new Date();
    }

    await item.save();

    // Audit trail
    AuditLog.create({
      user: req.user._id,
      action: 'CALIBRATION_UPDATED',
      entity: 'ReviewerAssessment',
      entityId: item._id,
      oldValue: { calibratedRating: oldCalibratedRating },
      newValue: { calibratedRating, calibrationReason, finalRating },
    }).catch(() => {});

    const populated = await item.populate([
      { path: 'selfReview', populate: { path: 'employee', select: 'name email role' } },
      { path: 'reviewer', select: 'name email role' },
      { path: 'hrValidation.hrUser', select: 'name email' },
    ]);

    res.json({ success: true, message: 'Calibration updated successfully', data: populated });
  } catch (error) {
    next(error);
  }
};

// --- Development Plans ---

const listPlans = async (req, res, next) => {
  try {
    const filter = req.user.role === 'Employee' ? { employee: req.user._id } : {};
    if (req.query.employee && req.user.role !== 'Employee') filter.employee = req.query.employee;

    const plans = await DevelopmentPlan.find(filter)
      .populate('employee', 'name email role')
      .sort({ createdAt: -1 });

    res.json({ success: true, data: plans });
  } catch (error) {
    next(error);
  }
};

const createPlan = async (req, res, next) => {
  try {
    const { employee, cycle, priorities, goals, followUpDate, followUpStatus } = req.body;
    if (!employee || !cycle) {
      return res.status(400).json({ success: false, message: 'Employee and Cycle are required' });
    }

    const plan = await DevelopmentPlan.create({
      employee,
      cycle,
      priorities: priorities || '',
      goals: Array.isArray(goals) ? goals : [],
      followUpDate: followUpDate || null,
      followUpStatus: followUpStatus || 'Not Started',
    });

    const populated = await plan.populate('employee', 'name email role');
    res.status(201).json({ success: true, message: 'Development plan created', data: populated });
  } catch (error) {
    next(error);
  }
};

const updatePlan = async (req, res, next) => {
  try {
    const item = await DevelopmentPlan.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    }).populate('employee', 'name email role');

    if (!item) return missing(res, 'Development plan');
    res.json({ success: true, message: 'Development plan updated', data: item });
  } catch (error) {
    next(error);
  }
};

const deletePlan = async (req, res, next) => {
  try {
    const item = await DevelopmentPlan.findByIdAndDelete(req.params.id);
    if (!item) return missing(res, 'Development plan');
    res.json({ success: true, message: 'Development plan deleted successfully' });
  } catch (error) {
    next(error);
  }
};

// --- HR Validation ---

const hrValidateAssessment = async (req, res, next) => {
  try {
    const { status, comments } = req.body;

    if (!['approved', 'returned'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'status must be "approved" or "returned"',
      });
    }

    const item = await ReviewerAssessment.findById(req.params.id);
    if (!item) return res.status(404).json({ success: false, message: 'Assessment not found' });

    if (item.isFinalized) {
      return res.status(400).json({ success: false, message: 'This assessment is already finalized and cannot be changed' });
    }

    const oldStatus = item.hrValidation?.status;

    item.hrValidation = {
      status,
      hrUser: req.user._id,
      comments: comments?.trim() || '',
      validatedAt: new Date(),
    };

    if (status === 'approved') {
      item.isFinalized = true;
    }

    await item.save();

    // Audit trail
    AuditLog.create({
      user: req.user._id,
      action: status === 'approved' ? 'ASSESSMENT_APPROVED' : 'ASSESSMENT_RETURNED',
      entity: 'ReviewerAssessment',
      entityId: item._id,
      oldValue: { hrValidationStatus: oldStatus },
      newValue: { hrValidationStatus: status, comments },
    }).catch(() => {});

    const populated = await item.populate([
      { path: 'selfReview', populate: { path: 'employee', select: 'name email role' } },
      { path: 'reviewer', select: 'name email role' },
      { path: 'hrValidation.hrUser', select: 'name email' },
    ]);

    res.json({ success: true, message: `Assessment ${status}`, data: populated });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  listSelfReviews,
  getSelfReview,
  createSelfReview,
  updateSelfReview,
  deleteSelfReview,
  listAssessments,
  getAssessmentBySelfReview,
  createAssessment,
  updateAssessment,
  deleteAssessment,
  hrValidateAssessment,
  calibrateAssessment,
  listPlans,
  createPlan,
  updatePlan,
  deletePlan,
};