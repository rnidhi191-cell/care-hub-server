const ProgressCheck = require('../models/ProgressCheck');
const DevelopmentPlan = require('../models/DevelopmentPlan');
const SelfReview = require('../models/SelfReview');
const ReviewerAssessment = require('../models/ReviewerAssessment');
const { notifyUsers } = require('../services/notificationService');

const populateCheck = (query) => query
  .populate('employee', 'name email role')
  .populate('manager', 'name email role')
  .populate('developmentPlan', 'cycle year priorities goals followUpDate followUpStatus')
  .populate('selfReview', 'cycle year goals')
  .populate('reviewerAssessment', 'calibratedRating finalRating overallScore isFinalized');

const setOverdue = async (check) => {
  if (check.status === 'PENDING' && check.dueDate < new Date()) {
    check.status = 'OVERDUE';
    await check.save();
  }
  return check;
};

const enrich = (check) => {
  const item = check.toObject();
  const assessment = item.reviewerAssessment;
  item.previousRating = assessment ? {
    score: assessment.calibratedRating ?? assessment.overallScore ?? null,
    label: assessment.finalRating || 'Not finalized',
  } : null;
  item.previousGoals = item.selfReview?.goals || [];
  return item;
};

const listProgressChecks = async (req, res, next) => {
  try {
    const filter = ['HR', 'ADMIN'].includes(req.user.role) ? {} : { employee: req.user._id };
    const checks = await populateCheck(ProgressCheck.find(filter).sort({ dueDate: 1 }));
    await Promise.all(checks.map(setOverdue));
    res.json({ success: true, data: checks.map(enrich) });
  } catch (error) { next(error); }
};

const createProgressCheck = async (req, res, next) => {
  try {
    const { employee, developmentPlan, dueDate, goalProgress, ...fields } = req.body;
    if (!employee || !dueDate) return res.status(400).json({ success: false, message: 'Employee and progress-check due date are required' });
    const plan = developmentPlan ? await DevelopmentPlan.findOne({ _id: developmentPlan, employee }) : await DevelopmentPlan.findOne({ employee }).sort({ createdAt: -1 });
    const review = await SelfReview.findOne({ employee }).sort({ year: -1, createdAt: -1 });
    const assessment = review ? await ReviewerAssessment.findOne({ selfReview: review._id, isFinalized: true }).sort({ createdAt: -1 }) : null;
    const manager = assessment?.reviewer || null;
    const goals = Array.isArray(goalProgress) && goalProgress.length
      ? goalProgress
      : (plan?.goals || review?.goals?.map((goal) => goal.title) || []).map((goal) => ({ goal }));
    const check = await ProgressCheck.create({
      employee, manager, developmentPlan: plan?._id || null, selfReview: review?._id || null,
      reviewerAssessment: assessment?._id || null, dueDate, goalProgress: goals, createdBy: req.user._id, ...fields,
    });
    const populated = await populateCheck(ProgressCheck.findById(check._id));
    notifyUsers([employee, manager], {
      type: 'PROGRESS_CHECK', title: '3–6 month progress check scheduled',
      message: `A progress check is due on ${new Date(dueDate).toLocaleDateString('en-GB')}.`,
      link: '/progress-checks', entityType: 'ProgressCheck', entityId: check._id, dedupeKey: `progress-check:${check._id}`,
    }).catch(() => {});
    res.status(201).json({ success: true, data: enrich(populated) });
  } catch (error) { next(error); }
};

const updateProgressCheck = async (req, res, next) => {
  try {
    const check = await ProgressCheck.findById(req.params.id);
    if (!check) return res.status(404).json({ success: false, message: 'Progress check not found' });
    const allowed = ['dueDate', 'goalProgress', 'developmentProgress', 'achievements', 'challenges', 'supportRequired', 'newGoals', 'employeeComments', 'managerComments', 'status', 'checkInDate'];
    allowed.forEach((key) => { if (req.body[key] !== undefined) check[key] = req.body[key]; });
    if (check.status === 'COMPLETED' && !check.completedAt) check.completedAt = new Date();
    if (check.status !== 'COMPLETED') check.completedAt = null;
    await check.save();
    const populated = await populateCheck(ProgressCheck.findById(check._id));
    res.json({ success: true, data: enrich(populated) });
  } catch (error) { next(error); }
};

module.exports = { listProgressChecks, createProgressCheck, updateProgressCheck };
