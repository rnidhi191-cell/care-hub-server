const ReviewCycle = require('../models/ReviewCycle');
const SelfReview = require('../models/SelfReview');
const ReviewerAssessment = require('../models/ReviewerAssessment');
const User = require('../models/User');

const DATE_FIELDS = [
  'startDate', 'endDate', 'selfReviewDeadline', 'reviewerDeadline', 'hrValidationDeadline',
  'calibrationStartDate', 'calibrationEndDate', 'discussionStartDate', 'discussionEndDate',
  'finalizationDate', 'acknowledgementDeadline',
];
const REQUIRED_DATE_FIELDS = DATE_FIELDS.slice(0, 5);

const toDate = (value) => (value ? new Date(value) : null);
const isValidDate = (value) => value instanceof Date && !Number.isNaN(value.getTime());

const cyclePayload = (body, { partial = false } = {}) => {
  const payload = {};
  ['title', 'cycleName', 'year'].forEach((field) => {
    if (body[field] !== undefined) payload[field] = field === 'year' ? Number(body[field]) : body[field];
  });
  DATE_FIELDS.forEach((field) => {
    if (body[field] !== undefined) payload[field] = toDate(body[field]);
  });

  if (!partial) {
    if (!payload.title?.trim() || !['April', 'September'].includes(payload.cycleName) || !Number.isInteger(payload.year)) {
      return { error: 'title, cycleName (April or September), and year are required' };
    }
    if (REQUIRED_DATE_FIELDS.some((field) => !isValidDate(payload[field]))) {
      return { error: 'Review period, self-review, reviewer, and HR validation dates are required' };
    }
  }

  for (const field of DATE_FIELDS) {
    if (payload[field] !== undefined && payload[field] !== null && !isValidDate(payload[field])) {
      return { error: `${field} must be a valid date` };
    }
  }
  return { payload };
};

const validateDates = (cycle) => {
  if (REQUIRED_DATE_FIELDS.some((field) => !isValidDate(cycle[field]))) return 'Review period, self-review, reviewer, and HR validation dates are required';
  if (cycle.startDate > cycle.endDate) return 'Review period end date must be after the start date';
  if (cycle.selfReviewDeadline > cycle.reviewerDeadline) return 'Reviewer deadline must be on or after the self-review deadline';
  if (cycle.reviewerDeadline > cycle.hrValidationDeadline) return 'HR validation deadline must be on or after the reviewer deadline';
  if (cycle.calibrationStartDate && cycle.calibrationEndDate && cycle.calibrationStartDate > cycle.calibrationEndDate) return 'Calibration end date must be after its start date';
  if (cycle.discussionStartDate && cycle.discussionEndDate && cycle.discussionStartDate > cycle.discussionEndDate) return 'Discussion end date must be after its start date';
  return null;
};

const withMonitoring = async (cycle, managerId = null) => {
  const visibleAssignments = cycle.assignments.filter((assignment) =>
    !managerId || assignment.reviewer?._id?.toString() === managerId.toString());
  const assignmentIds = visibleAssignments.map((assignment) => assignment.employee?._id?.toString() || assignment.employee.toString());
  const reviews = assignmentIds.length
    ? await SelfReview.find({ employee: { $in: assignmentIds }, cycle: cycle.cycleName, year: cycle.year }).select('_id employee status acknowledged')
    : [];
  const assessments = reviews.length
    ? await ReviewerAssessment.find({ selfReview: { $in: reviews.map((review) => review._id) } }).select('selfReview isFinalized')
    : [];
  const assessmentByReview = new Map(assessments.map((assessment) => [assessment.selfReview.toString(), assessment]));
  const finalized = reviews.filter((review) => assessmentByReview.get(review._id.toString())?.isFinalized).length;
  const reviewByEmployee = new Map(reviews.map((review) => [review.employee.toString(), review]));

  const assignmentProgress = visibleAssignments.map((assignment) => {
    const review = reviewByEmployee.get((assignment.employee?._id || assignment.employee).toString());
    const assessment = review && assessmentByReview.get(review._id.toString());
    return {
      employee: assignment.employee,
      reviewer: assignment.reviewer,
      selfReviewStatus: review?.status || 'NOT_STARTED',
      selfReviewCompleted: Boolean(review),
      reviewerAssessmentCompleted: Boolean(assessment),
      finalized: Boolean(assessment?.isFinalized),
      acknowledged: Boolean(review?.acknowledged),
    };
  });

  return {
    ...cycle.toObject(),
    assignments: visibleAssignments,
    monitoring: {
      assignedEmployees: assignmentIds.length,
      selfReviewsCompleted: reviews.length,
      reviewerAssessmentsCompleted: assessments.length,
      finalizedRatings: finalized,
      acknowledgementsCompleted: reviews.filter((review) => review.acknowledged).length,
      pendingSelfReviews: Math.max(assignmentIds.length - reviews.length, 0),
      assignmentProgress,
    },
  };
};

const listCycles = async (req, res, next) => {
  try {
    const managerId = req.user.role === 'MANAGER' ? req.user._id : null;
    const filter = managerId ? { 'assignments.reviewer': managerId } : {};
    const cycles = await ReviewCycle.find(filter)
      .populate('assignments.employee', 'name email role')
      .populate('assignments.reviewer', 'name email role')
      .sort({ year: -1, createdAt: -1 });
    res.json({ success: true, data: await Promise.all(cycles.map((cycle) => withMonitoring(cycle, managerId))) });
  } catch (error) { next(error); }
};

const getCycle = async (req, res, next) => {
  try {
    const cycle = await ReviewCycle.findById(req.params.id)
      .populate('assignments.employee', 'name email role')
      .populate('assignments.reviewer', 'name email role');
    if (!cycle) return res.status(404).json({ success: false, message: 'Review cycle not found' });

    const managerId = req.user.role === 'MANAGER' ? req.user._id : null;
    if (managerId && !cycle.assignments.some((assignment) => assignment.reviewer?._id?.equals(managerId))) {
      return res.status(403).json({ success: false, message: 'You are not assigned to this review cycle' });
    }
    res.json({ success: true, data: await withMonitoring(cycle, managerId) });
  } catch (error) { next(error); }
};

const createCycle = async (req, res, next) => {
  try {
    const { payload, error } = cyclePayload(req.body);
    if (error) return res.status(400).json({ success: false, message: error });
    const invalidDates = validateDates(payload);
    if (invalidDates) return res.status(400).json({ success: false, message: invalidDates });
    const cycle = await ReviewCycle.create({ ...payload, createdBy: req.user._id });
    res.status(201).json({ success: true, message: 'Review cycle created', data: cycle });
  } catch (error) { next(error); }
};

const updateCycle = async (req, res, next) => {
  try {
    const cycle = await ReviewCycle.findById(req.params.id);
    if (!cycle) return res.status(404).json({ success: false, message: 'Review cycle not found' });
    if (cycle.status !== 'DRAFT') return res.status(400).json({ success: false, message: 'Only draft cycles can be edited' });
    const { payload, error } = cyclePayload(req.body, { partial: true });
    if (error) return res.status(400).json({ success: false, message: error });
    Object.assign(cycle, payload);
    const invalidDates = validateDates(cycle);
    if (invalidDates) return res.status(400).json({ success: false, message: invalidDates });
    await cycle.save();
    res.json({ success: true, message: 'Review cycle updated', data: cycle });
  } catch (error) { next(error); }
};

const assignPeople = async (req, res, next) => {
  try {
    const { assignments } = req.body;
    if (!Array.isArray(assignments) || assignments.length === 0) return res.status(400).json({ success: false, message: 'At least one employee assignment is required' });
    const cycle = await ReviewCycle.findById(req.params.id);
    if (!cycle) return res.status(404).json({ success: false, message: 'Review cycle not found' });
    if (cycle.status !== 'DRAFT') return res.status(400).json({ success: false, message: 'Assignments can only be changed while the cycle is a draft' });
    if (assignments.some((item) => !item || !item.employee || !item.reviewer)) return res.status(400).json({ success: false, message: 'Every assignment needs an employee and a manager' });
    const employeeIds = [...new Set(assignments.map((item) => item.employee.toString()))];
    if (employeeIds.length !== assignments.length) return res.status(400).json({ success: false, message: 'Each employee can only be assigned once per cycle' });
    const reviewerIds = assignments.map((item) => item.reviewer.toString());
    const people = await User.find({ _id: { $in: [...employeeIds, ...reviewerIds] } }).select('_id role');
    const peopleById = new Map(people.map((person) => [person._id.toString(), person]));
    if (employeeIds.some((id) => peopleById.get(id)?.role !== 'EMPLOYEE')) return res.status(400).json({ success: false, message: 'Assignments must reference employee users' });
    if (reviewerIds.some((id) => peopleById.get(id)?.role !== 'MANAGER')) return res.status(400).json({ success: false, message: 'Reviewers must be manager users' });
    cycle.assignments = assignments.map((item) => ({ employee: item.employee, reviewer: item.reviewer || null, assignedAt: new Date() }));
    await cycle.save();
    await cycle.populate([{ path: 'assignments.employee', select: 'name email role' }, { path: 'assignments.reviewer', select: 'name email role' }]);
    res.json({ success: true, message: 'Cycle assignments saved', data: await withMonitoring(cycle) });
  } catch (error) { next(error); }
};

const transitionCycle = (status) => async (req, res, next) => {
  try {
    const cycle = await ReviewCycle.findById(req.params.id);
    if (!cycle) return res.status(404).json({ success: false, message: 'Review cycle not found' });
    if (status === 'ACTIVE') {
      if (cycle.status !== 'DRAFT') return res.status(400).json({ success: false, message: 'Only draft cycles can be launched' });
      if (!cycle.assignments.length) return res.status(400).json({ success: false, message: 'Assign at least one employee before launching the cycle' });
      cycle.launchedAt = new Date();
    } else {
      if (cycle.status !== 'ACTIVE') return res.status(400).json({ success: false, message: 'Only active cycles can be closed' });
      cycle.closedAt = new Date();
    }
    cycle.status = status;
    await cycle.save();
    res.json({ success: true, message: `Review cycle ${status === 'ACTIVE' ? 'launched' : 'closed'}`, data: cycle });
  } catch (error) { next(error); }
};

module.exports = { listCycles, getCycle, createCycle, updateCycle, assignPeople, launchCycle: transitionCycle('ACTIVE'), closeCycle: transitionCycle('CLOSED') };
