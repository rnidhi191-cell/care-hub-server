const SelfReview = require('../models/SelfReview');
const ReviewerAssessment = require('../models/ReviewerAssessment');
const DevelopmentPlan = require('../models/DevelopmentPlan');
const AuditLog = require('../models/AuditLog');
const ReviewCycle = require('../models/ReviewCycle');
const ManagerReview = require('../models/ManagerReview');
const Employee = require('../models/Employee');
const User = require('../models/User');
const { notifyUsers, hrAdminIds } = require('../services/notificationService');


const deny = (res) => {
  return res.status(403).json({ success: false, message: 'Access denied' });
};

const missing = (res, name) => {
  return res.status(404).json({ success: false, message: `${name} not found` });
};

const managerIsAssigned = async (managerId, review) => {
  const employeeId = review.employee?._id || review.employee;
  return Boolean(await ReviewCycle.exists({
    cycleName: review.cycle,
    year: review.year,
    assignments: { $elemMatch: { employee: employeeId, reviewer: managerId } },
  }));
};

const assignedReviewerId = async (review) => {
  const cycle = await ReviewCycle.findOne({
    cycleName: review.cycle,
    year: review.year,
    'assignments.employee': review.employee,
  }).select('assignments');
  const assignment = cycle?.assignments.find((item) => item.employee.equals(review.employee));
  return assignment?.reviewer || null;
};

const sendNotification = (recipients, payload) => notifyUsers(recipients, payload).catch((error) => {
  console.error('NOTIFICATION ERROR:', error.message);
});

const managerFor = async (employeeUserId) => {
  const employee = await Employee.findOne({ user: employeeUserId }).populate({ path: 'manager', populate: { path: 'user', select: '_id status role' } });
  const managerUser = employee?.manager?.user;
  return managerUser?.status === 'active' && managerUser.role === 'MANAGER' ? managerUser._id : null;
};

const isPrivileged = (user) => ['HR', 'ADMIN'].includes(user.role);

const canViewReview = async (user, review) => {
  if (isPrivileged(user) || review.employee.equals(user._id)) return true;
  if (review.selectedReviewer?.equals(user._id)) return review.workflowStatus === 'COLLEAGUE_REVIEW';
  return user.role === 'MANAGER' && (await managerIsAssigned(user._id, review) || String(await managerFor(review.employee)) === String(user._id));
};

const eligibleReviewers = async (req, res, next) => {
  try {
    const users = await User.find({ _id: { $ne: req.user._id }, role: 'EMPLOYEE', status: 'active' })
      .select('name email role').sort({ name: 1 });
    res.json({ success: true, data: users });
  } catch (error) { next(error); }
};

// --- Self Reviews ---

const listSelfReviews = async (req, res, next) => {
  try {
    const isEmployee = req.user.role === 'EMPLOYEE';
    const filter = isEmployee
      ? (req.query.assignedOnly === 'true'
        ? { selectedReviewer: req.user._id, workflowStatus: 'COLLEAGUE_REVIEW' }
        : { $or: [{ employee: req.user._id }, { selectedReviewer: req.user._id, workflowStatus: 'COLLEAGUE_REVIEW' }] })
      : {};

    if (req.user.role === 'MANAGER') {
      const managerEmployee = await Employee.findOne({ user: req.user._id }).select('_id');
      const directReports = managerEmployee ? await Employee.find({ manager: managerEmployee._id }).select('user') : [];
      const directReportIds = directReports.map((employee) => employee.user);
      const cycles = await ReviewCycle.find({ 'assignments.reviewer': req.user._id }).select('cycleName year assignments');
      const assignedReviews = cycles.flatMap((cycle) => cycle.assignments
        .filter((assignment) => assignment.reviewer?.equals(req.user._id))
        .map((assignment) => ({ employee: assignment.employee, cycle: cycle.cycleName, year: cycle.year })));
      const managerStages = directReportIds.map((employee) => ({ employee, workflowStatus: 'MANAGER_REVIEW' }));
      const scopes = [...assignedReviews, ...managerStages];
      if (!scopes.length) return res.json({ success: true, data: [] });
      filter.$or = scopes;
    }

    // Optional filters for HR / Reviewer
    if (req.query.cycle) filter.cycle = req.query.cycle;
    if (req.query.year) filter.year = Number(req.query.year);
    if (req.query.employee && !isEmployee) filter.employee = req.query.employee;

    const selfReviews = await SelfReview.find(filter)
      .populate('employee', 'name email role')
      .populate('selectedReviewer', 'name email role')
      .sort({ year: -1, createdAt: -1 });

    // Attach assessment status for convenience
    const reviewIds = selfReviews.map((r) => r._id);
    const assessments = await ReviewerAssessment.find({ selfReview: { $in: reviewIds } })
      .populate('reviewer', 'name email');

    const assessmentMap = new Map();
    assessments.forEach((a) => assessmentMap.set(a.selfReview.toString(), a));

    const managerReviews = await ManagerReview.find({ selfReview: { $in: reviewIds } }).populate('manager', 'name email');
    const managerReviewMap = new Map(managerReviews.map((item) => [item.selfReview.toString(), item]));
    const enriched = selfReviews.map((sr) => {
      const obj = sr.toObject();
      obj.assessment = assessmentMap.get(sr._id.toString()) || null;
      obj.managerReview = managerReviewMap.get(sr._id.toString()) || null;
      return obj;
    });

    res.json({ success: true, data: enriched });
  } catch (error) {
    next(error);
  }
};

const getSelfReview = async (req, res, next) => {
  try {
    const item = await SelfReview.findById(req.params.id).populate('employee', 'name email role').populate('selectedReviewer', 'name email role');
    if (!item) return missing(res, 'Self-review');

    if (!(await canViewReview(req.user, item))) return deny(res);

    const assessment = await ReviewerAssessment.findOne({ selfReview: item._id })
      .populate('reviewer', 'name email');
    const managerReview = await ManagerReview.findOne({ selfReview: item._id }).populate('manager', 'name email');

    const result = item.toObject();
    result.assessment = assessment || null;
    result.managerReview = managerReview || null;

    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};

const createSelfReview = async (req, res, next) => {
  try {
    const employee = req.user.role === 'HR' && req.body.employee ? req.body.employee : req.user._id;
    const { cycle, year, contribute, achieve, reflect, evolve, goals, status, selectedReviewer } = req.body;

    if (!cycle || !year) {
      return res.status(400).json({ success: false, message: 'Cycle and Year are required' });
    }
    if (!selectedReviewer || String(selectedReviewer) === String(employee)) {
      return res.status(400).json({ success: false, message: 'Select one eligible colleague reviewer other than yourself.' });
    }
    const colleague = await User.findOne({ _id: selectedReviewer, role: 'EMPLOYEE', status: 'active' });
    if (!colleague) return res.status(400).json({ success: false, message: 'Selected reviewer is not an eligible active colleague.' });

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
      selectedReviewer,
      workflowStatus: 'COLLEAGUE_REVIEW',
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
    sendNotification([selectedReviewer], {
      type: 'REVIEW_SUBMITTED', title: 'Self-review submitted',
      message: `${populated.employee.name} submitted their ${newReview.cycle} ${newReview.year} CARE self-review.`,
      link: `/reviewer/assessment?id=${newReview._id}`, entityType: 'SelfReview', entityId: newReview._id, dedupeKey: `self-review-submitted:${newReview._id}`,
    });
    res.status(201).json({ success: true, message: 'Self-review created successfully', data: populated });
  } catch (error) {
    next(error);
  }
};

const updateSelfReview = async (req, res, next) => {
  try {
    const item = await SelfReview.findById(req.params.id);
    if (!item) return missing(res, 'Self-review');

    if (req.user.role === 'EMPLOYEE' && !item.employee.equals(req.user._id)) {
      return deny(res);
    }

    if (req.user.role === 'EMPLOYEE' && item.workflowStatus !== 'COLLEAGUE_REVIEW' && req.body.acknowledged !== true) {
      return res.status(409).json({ success: false, message: 'Self-review can no longer be changed after colleague review begins.' });
    }
    if (req.body.selectedReviewer !== undefined) delete req.body.selectedReviewer;
    if (req.body.workflowStatus !== undefined) delete req.body.workflowStatus;
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
      }).catch(() => { });
    }

    if (item.acknowledged && !oldAcknowledged) {
      AuditLog.create({
        user: req.user._id,
        action: 'REVIEW_ACKNOWLEDGED',
        entity: 'SelfReview',
        entityId: item._id,
        newValue: { comment: item.acknowledgementComment, raisedConcern: item.raisedConcern },
      }).catch(() => { });
      const [reviewer, hrUsers] = await Promise.all([assignedReviewerId(item), hrAdminIds()]);
      sendNotification([reviewer, ...hrUsers], {
        type: 'ACKNOWLEDGEMENT', title: 'Review acknowledged',
        message: `The employee acknowledged their ${item.cycle} ${item.year} final review.`,
        link: '/hr', entityType: 'SelfReview', entityId: item._id, dedupeKey: `acknowledged:${item._id}`,
      });
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

    if (req.user.role === 'EMPLOYEE' && !item.employee.equals(req.user._id)) {
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
    const filter = req.user.role === 'MANAGER' ? { reviewer: req.user._id } : {};

    let items = await ReviewerAssessment.find(filter)
      .populate({
        path: 'selfReview',
        populate: { path: 'employee', select: 'name email role' },
      })
      .populate('reviewer', 'name email role')
      .sort({ createdAt: -1 });

    if (req.user.role === 'EMPLOYEE') {
      items = items.filter((x) => x.selfReview?.employee?._id?.equals(req.user._id));
    }
    if (req.user.role === 'MANAGER') {
      const visibility = await Promise.all(items.map(async (item) => managerIsAssigned(req.user._id, item.selfReview)));
      items = items.filter((_item, index) => visibility[index]);
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

    if (req.user.role === 'EMPLOYEE' && !assessment.selfReview?.employee?._id?.equals(req.user._id)) {
      return deny(res);
    }
    if (req.user.role === 'MANAGER' && !(await managerIsAssigned(req.user._id, assessment.selfReview))) return deny(res);

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

    // Keep the existing assessment form usable for managers while storing its
    // submission in the separate manager-review stage.
    if (req.user.role === 'MANAGER' && review.workflowStatus === 'MANAGER_REVIEW') {
      if (String(await managerFor(review.employee)) !== String(req.user._id)) return deny(res);
      const scores = (Array.isArray(performanceRatings) ? performanceRatings : []).map((entry) => Number(entry.rating)).filter((score) => score >= 1 && score <= 5);
      const rating = scores.length ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length) : 3;
      const managerReview = await ManagerReview.findOneAndUpdate(
        { selfReview: review._id },
        { selfReview: review._id, manager: req.user._id, comments: overallComments || overallAssessment || '', rating, recommendation: recommendation || '' },
        { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
      );
      review.workflowStatus = 'HR_FINAL_REVIEW';
      await review.save();
      AuditLog.create({ user: req.user._id, action: 'MANAGER_REVIEW_SUBMITTED', entity: 'ManagerReview', entityId: managerReview._id }).catch(() => {});
      sendNotification(await hrAdminIds(), { type: 'REVIEW_SUBMITTED', title: 'Manager review submitted', message: `${review.cycle} ${review.year} review is ready for HR final review.`, link: `/hr?review=${review._id}`, entityType: 'ManagerReview', entityId: managerReview._id, dedupeKey: `hr-final-request:${review._id}` });
      return res.status(201).json({ success: true, message: 'Manager review submitted successfully', data: managerReview });
    }

    const isSelectedColleague = req.user.role === 'EMPLOYEE' && review.selectedReviewer?.equals(req.user._id);
    if (!isSelectedColleague && !(req.user.role === 'MANAGER' && (await managerIsAssigned(req.user._id, review) || String(await managerFor(review.employee)) === String(req.user._id)))) return deny(res);
    if (review.workflowStatus !== 'COLLEAGUE_REVIEW') return res.status(409).json({ success: false, message: 'This review is not awaiting a colleague review.' });

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
    }).catch(() => { });

    const populated = await assessment.populate([
      { path: 'selfReview', populate: { path: 'employee', select: 'name email role' } },
      { path: 'reviewer', select: 'name email role' },
    ]);

    review.workflowStatus = 'MANAGER_REVIEW';
    await review.save();
    const manager = await managerFor(review.employee);
    sendNotification([manager], {
      type: 'REVIEW_SUBMITTED', title: 'Colleague review submitted',
      message: `${populated.selfReview.employee.name}'s self and colleague reviews are ready for your manager review.`,
      link: `/reviewer?review=${review._id}`, entityType: 'SelfReview', entityId: review._id, dedupeKey: `manager-review-request:${review._id}`,
    });

    res.status(201).json({
      success: true,
      message: 'Assessment submitted successfully',
      data: populated,
    });
  } catch (error) {
    console.error('CREATE ASSESSMENT ERROR:', error);
  console.error('ERROR MESSAGE:', error.message);
  console.error('ERROR NAME:', error.name);
  console.error('ERROR DETAILS:', error.errors);
    next(error);
  }
};

const updateAssessment = async (req, res, next) => {
  try {
    const item = await ReviewerAssessment.findById(req.params.id);
    if (!item) return missing(res, 'Reviewer assessment');

    const review = await SelfReview.findById(item.selfReview);
    if (!review) return missing(res, 'Self-review');
    if (req.user.role === 'EMPLOYEE' && !item.reviewer.equals(req.user._id)) return deny(res);
    if (req.user.role === 'EMPLOYEE' && review.workflowStatus !== 'COLLEAGUE_REVIEW') return deny(res);
    if (req.user.role === 'MANAGER') {
      if (!review || !(await managerIsAssigned(req.user._id, review))) return deny(res);
    }

    if (req.user.role === 'MANAGER' && !item.reviewer.equals(req.user._id)) {
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
    }).catch(() => { });

    const populated = await item.populate([
      { path: 'selfReview', populate: { path: 'employee', select: 'name email role' } },
      { path: 'reviewer', select: 'name email role' },
    ]);

    sendNotification([populated.selfReview.employee], {
      type: 'CALIBRATION', title: 'Review calibration completed',
      message: `Your ${populated.selfReview.cycle} ${populated.selfReview.year} review has been calibrated and finalized.`,
      link: '/employee', entityType: 'ReviewerAssessment', entityId: item._id, dedupeKey: `calibrated-employee:${item._id}`,
    });
    sendNotification([populated.reviewer], {
      type: 'CALIBRATION', title: 'Review calibration completed',
      message: `${populated.selfReview.employee.name}'s ${populated.selfReview.cycle} ${populated.selfReview.year} review has been calibrated and finalized.`,
      link: '/reviewer', entityType: 'ReviewerAssessment', entityId: item._id, dedupeKey: `calibrated-reviewer:${item._id}`,
    });

    res.json({ success: true, message: 'Assessment updated successfully', data: populated });
  } catch (error) {
    next(error);
  }
};

const deleteAssessment = async (req, res, next) => {
  try {
    const item = await ReviewerAssessment.findById(req.params.id);
    if (!item) return missing(res, 'Reviewer assessment');

    if (req.user.role === 'EMPLOYEE' && !item.reviewer.equals(req.user._id)) return deny(res);
    if (req.user.role === 'MANAGER') {
      const review = await SelfReview.findById(item.selfReview);
      if (!review || !(await managerIsAssigned(req.user._id, review))) return deny(res);
    }

    if (req.user.role === 'MANAGER' && !item.reviewer.equals(req.user._id)) {
      return deny(res);
    }

    await item.deleteOne();
    res.json({ success: true, message: 'Reviewer assessment deleted successfully' });
  } catch (error) {
    next(error);
  }
};

const createManagerReview = async (req, res, next) => {
  try {
    const { selfReview: selfReviewId, comments, rating, recommendation } = req.body;
    const review = await SelfReview.findById(selfReviewId);
    if (!review) return missing(res, 'Self-review');
    if (!(await managerIsAssigned(req.user._id, review)) && String(await managerFor(review.employee)) !== String(req.user._id)) return deny(res);
    if (review.workflowStatus !== 'MANAGER_REVIEW') return res.status(409).json({ success: false, message: 'This review is not awaiting a manager review.' });
    if (!Number.isInteger(Number(rating)) || Number(rating) < 1 || Number(rating) > 5) return res.status(400).json({ success: false, message: 'Manager rating must be between 1 and 5.' });
    const colleagueReview = await ReviewerAssessment.findOne({ selfReview: review._id });
    if (!colleagueReview) return res.status(409).json({ success: false, message: 'A colleague review is required before manager review.' });
    const item = await ManagerReview.findOneAndUpdate(
      { selfReview: review._id },
      { selfReview: review._id, manager: req.user._id, comments: comments || '', rating: Number(rating), recommendation: recommendation || '' },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
    );
    review.workflowStatus = 'HR_FINAL_REVIEW';
    await review.save();
    AuditLog.create({ user: req.user._id, action: 'MANAGER_REVIEW_SUBMITTED', entity: 'ManagerReview', entityId: item._id }).catch(() => {});
    sendNotification(await hrAdminIds(), { type: 'REVIEW_SUBMITTED', title: 'Manager review submitted', message: `${review.cycle} ${review.year} review is ready for HR final review.`, link: `/hr?review=${review._id}`, entityType: 'ManagerReview', entityId: item._id, dedupeKey: `hr-final-request:${review._id}` });
    res.status(201).json({ success: true, data: item });
  } catch (error) { next(error); }
};

const finalizeManagerReview = async (req, res, next) => {
  try {
    const { finalRating, comments } = req.body;
    const item = await ManagerReview.findById(req.params.id).populate('selfReview');
    if (!item) return missing(res, 'Manager review');
    if (item.selfReview.workflowStatus !== 'HR_FINAL_REVIEW') return res.status(409).json({ success: false, message: 'This review is not awaiting HR final review.' });
    if (!finalRating?.trim()) return res.status(400).json({ success: false, message: 'Final rating is required.' });
    item.finalRating = finalRating.trim();
    if (comments !== undefined) item.comments = comments;
    item.finalizedBy = req.user._id;
    item.finalizedAt = new Date();
    await item.save();
    item.selfReview.workflowStatus = 'COMPLETED';
    await item.selfReview.save();
    AuditLog.create({ user: req.user._id, action: 'HR_FINAL_RATING_SET', entity: 'ManagerReview', entityId: item._id, newValue: { finalRating: item.finalRating } }).catch(() => {});
    sendNotification([item.selfReview.employee], { type: 'CALIBRATION', title: 'Final review completed', message: `Your final rating for ${item.selfReview.cycle} ${item.selfReview.year} is available.`, link: `/employee?review=${item.selfReview._id}`, entityType: 'ManagerReview', entityId: item._id, dedupeKey: `final-rating:${item._id}` });
    res.json({ success: true, data: item });
  } catch (error) { next(error); }
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
    }).catch(() => { });

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
    const filter = req.user.role === 'EMPLOYEE' ? { employee: req.user._id } : {};
    if (req.query.employee && req.user.role !== 'EMPLOYEE') filter.employee = req.query.employee;

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
    sendNotification([plan.employee], {
      type: 'PROGRESS_CHECK', title: 'Progress check assigned',
      message: `A development plan and progress check has been assigned for ${plan.cycle}.`,
      link: '/employee', entityType: 'DevelopmentPlan', entityId: plan._id, dedupeKey: `progress-check:${plan._id}`,
    });
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
    }).catch(() => { });

    const populated = await item.populate([
      { path: 'selfReview', populate: { path: 'employee', select: 'name email role' } },
      { path: 'reviewer', select: 'name email role' },
      { path: 'hrValidation.hrUser', select: 'name email' },
    ]);

    const notificationPayload = {
      type: status === 'returned' ? 'REVIEW_RETURNED' : 'VALIDATION',
      title: status === 'returned' ? 'Reviewer assessment returned' : 'Assessment validated',
      message: status === 'returned'
        ? `The ${populated.selfReview.cycle} ${populated.selfReview.year} assessment was returned for updates.`
        : `The ${populated.selfReview.cycle} ${populated.selfReview.year} assessment passed HR validation.`,
      entityType: 'ReviewerAssessment', entityId: item._id,
    };
    const validationKey = `validation:${status}:${item._id}:${item.hrValidation.validatedAt.getTime()}`;
    sendNotification([populated.reviewer], { ...notificationPayload, link: '/reviewer', dedupeKey: `${validationKey}:reviewer` });
    sendNotification([populated.selfReview.employee], { ...notificationPayload, link: '/employee', dedupeKey: `${validationKey}:employee` });

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
  eligibleReviewers,
  createManagerReview,
  finalizeManagerReview,
  hrValidateAssessment,
  calibrateAssessment,
  listPlans,
  createPlan,
  updatePlan,
  deletePlan,
};
