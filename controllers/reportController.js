const SelfReview = require('../models/SelfReview');
const ReviewerAssessment = require('../models/ReviewerAssessment');
const DevelopmentPlan = require('../models/DevelopmentPlan');
const ProgressCheck = require('../models/ProgressCheck');
const ReviewCycle = require('../models/ReviewCycle');
const Employee = require('../models/Employee');

const reportNames = ['completion', 'department-performance', 'rating-distribution', 'goal-achievement', 'development-plan', 'manager-completion', 'review-history', 'calibration', 'overdue-review', 'progress-check'];

const reportData = async (req) => {
  const { cycle, year, department } = req.query;
  const role = req.user.role;
  let employeeIds = null;
  if (role === 'EMPLOYEE') employeeIds = [req.user._id.toString()];
  if (role === 'MANAGER') {
    const cycles = await ReviewCycle.find({ 'assignments.reviewer': req.user._id }).select('assignments');
    employeeIds = [...new Set(cycles.flatMap((item) => item.assignments.filter((a) => a.reviewer?.equals(req.user._id)).map((a) => a.employee.toString())))];
  }
  const profiles = await Employee.find(employeeIds ? { user: { $in: employeeIds } } : {}).populate('department', 'name');
  const profileByUser = new Map(profiles.filter((profile) => profile.user).map((profile) => [profile.user.toString(), profile]));
  const reviewFilter = employeeIds ? { employee: { $in: employeeIds } } : {};
  if (cycle) reviewFilter.cycle = cycle;
  if (year) reviewFilter.year = Number(year);
  let reviews = await SelfReview.find(reviewFilter).populate('employee', 'name email').sort({ year: -1, createdAt: -1 });
  if (department) reviews = reviews.filter((review) => profileByUser.get(review.employee?._id?.toString())?.department?._id?.toString() === department);
  const assessments = await ReviewerAssessment.find({ selfReview: { $in: reviews.map((review) => review._id) } }).populate('reviewer', 'name email');
  const assessmentByReview = new Map(assessments.map((item) => [item.selfReview.toString(), item]));
  const plans = await DevelopmentPlan.find(employeeIds ? { employee: { $in: employeeIds } } : {}).populate('employee', 'name email');
  const checks = await ProgressCheck.find(employeeIds ? { employee: { $in: employeeIds } } : {}).populate('employee', 'name email').populate('manager', 'name');
  const cycles = await ReviewCycle.find(role === 'MANAGER' ? { 'assignments.reviewer': req.user._id } : {}).populate('assignments.employee', 'name').populate('assignments.reviewer', 'name');
  const rating = (assessment) => assessment?.calibratedRating ?? assessment?.overallScore ?? null;
  const completion = cycles.map((item) => { const assigned = role === 'MANAGER' ? item.assignments.filter((a) => a.reviewer?._id?.equals(req.user._id)) : item.assignments; const matched = reviews.filter((r) => r.cycle === item.cycleName && r.year === item.year && assigned.some((a) => a.employee?._id?.equals(r.employee?._id))); return { cycle: `${item.cycleName} ${item.year}`, status: item.status, assigned: assigned.length, selfReviews: matched.length, assessments: matched.filter((r) => assessmentByReview.has(r._id.toString())).length, finalized: matched.filter((r) => assessmentByReview.get(r._id.toString())?.isFinalized).length }; });
  const departments = {};
  reviews.forEach((review) => { const name = profileByUser.get(review.employee?._id?.toString())?.department?.name || 'Unassigned'; const score = rating(assessmentByReview.get(review._id.toString())); if (!departments[name]) departments[name] = { department: name, reviews: 0, totalRating: 0, rated: 0 }; departments[name].reviews++; if (score != null) { departments[name].totalRating += Number(score); departments[name].rated++; } });
  const distribution = [1, 2, 3, 4, 5].map((score) => ({ rating: score, count: assessments.filter((item) => Number(rating(item)) === score).length }));
  const goals = reviews.map((review) => ({ employee: review.employee?.name, cycle: `${review.cycle} ${review.year}`, goals: review.goals.length, assessed: review.goals.filter((goal) => Boolean(goal.employeeAssessment)).length }));
  const managerCompletion = Object.values(assessments.reduce((result, item) => { const name = item.reviewer?.name || 'Unassigned'; if (!result[name]) result[name] = { manager: name, assessments: 0, finalized: 0 }; result[name].assessments++; if (item.isFinalized) result[name].finalized++; return result; }, {}));
  const history = reviews.map((review) => { const assessment = assessmentByReview.get(review._id.toString()); return { employee: review.employee?.name, cycle: `${review.cycle} ${review.year}`, selfReviewStatus: review.status, rating: rating(assessment), finalRating: assessment?.finalRating || '', finalized: Boolean(assessment?.isFinalized), acknowledged: review.acknowledged }; });
  const calibration = assessments.map((item) => ({ employee: reviews.find((review) => review._id.equals(item.selfReview))?.employee?.name, reviewer: item.reviewer?.name, proposedRating: item.overallScore, calibratedRating: item.calibratedRating, finalRating: item.finalRating, finalized: item.isFinalized }));
  const overdue = completion.filter((item) => item.status === 'ACTIVE' && item.selfReviews < item.assigned).map((item) => ({ ...item, pending: item.assigned - item.selfReviews }));
  return { completion, 'department-performance': Object.values(departments).map((item) => ({ ...item, averageRating: item.rated ? Number((item.totalRating / item.rated).toFixed(2)) : null })), 'rating-distribution': distribution, 'goal-achievement': goals, 'development-plan': plans.map((plan) => ({ employee: plan.employee?.name, cycle: `${plan.cycle} ${plan.year}`, priorities: plan.priorities, goals: plan.goals.length, status: plan.followUpStatus, followUpDate: plan.followUpDate })), 'manager-completion': managerCompletion, 'review-history': history, calibration, 'overdue-review': overdue, 'progress-check': checks.map((check) => ({ employee: check.employee?.name, manager: check.manager?.name || '', dueDate: check.dueDate, status: check.status, achievements: check.achievements, developmentProgress: check.developmentProgress })) };
};

const getReports = async (req, res, next) => { try { const data = await reportData(req); const requested = req.query.report; if (requested && !reportNames.includes(requested)) return res.status(400).json({ success: false, message: 'Unknown report type' }); res.json({ success: true, data: requested ? data[requested] : data, availableReports: reportNames }); } catch (error) { next(error); } };
module.exports = { getReports };
