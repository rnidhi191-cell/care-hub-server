const SelfReview = require('../models/SelfReview');
const ReviewerAssessment = require('../models/ReviewerAssessment');
const DevelopmentPlan = require('../models/DevelopmentPlan');

const deny = (res) => res.status(403).json({ success: false, message: 'Access denied' });
const missing = (res, name) => res.status(404).json({ success: false, message: `${name} not found` });

const listSelfReviews = async (req, res, next) => {
  try {
    const filter = req.user.role === 'Employee' ? { employee: req.user._id } : {};
    res.json({ success: true, data: await SelfReview.find(filter).populate('employee', 'name email').sort({ year: -1 }) });
  } catch (error) { next(error); }
};
const getSelfReview = async (req, res, next) => {
  try {
    const item = await SelfReview.findById(req.params.id).populate('employee', 'name email');
    if (!item) return missing(res, 'Self-review');
    if (req.user.role === 'Employee' && !item.employee._id.equals(req.user._id)) return deny(res);
    res.json({ success: true, data: item });
  } catch (error) { next(error); }
};
const createSelfReview = async (req, res, next) => {
  try {
    const employee = req.user.role === 'HR' && req.body.employee ? req.body.employee : req.user._id;
    res.status(201).json({ success: true, data: await SelfReview.create({ ...req.body, employee }) });
  } catch (error) { next(error); }
};
const updateSelfReview = async (req, res, next) => {
  try {
    const item = await SelfReview.findById(req.params.id); if (!item) return missing(res, 'Self-review');
    if (req.user.role === 'Employee' && !item.employee.equals(req.user._id)) return deny(res);
    delete req.body.employee; Object.assign(item, req.body); await item.save(); res.json({ success: true, data: item });
  } catch (error) { next(error); }
};
const deleteSelfReview = async (req, res, next) => {
  try {
    const item = await SelfReview.findById(req.params.id); if (!item) return missing(res, 'Self-review');
    if (req.user.role === 'Employee' && !item.employee.equals(req.user._id)) return deny(res);
    await ReviewerAssessment.deleteOne({ selfReview: item._id }); await item.deleteOne(); res.json({ success: true, message: 'Self-review deleted' });
  } catch (error) { next(error); }
};

const listAssessments = async (req, res, next) => {
  try {
    const filter = req.user.role === 'Reviewer' ? { reviewer: req.user._id } : {};
    let items = await ReviewerAssessment.find(filter).populate({ path: 'selfReview', populate: { path: 'employee', select: 'name email' } }).populate('reviewer', 'name email');
    if (req.user.role === 'Employee') items = items.filter((x) => x.selfReview?.employee?._id.equals(req.user._id));
    res.json({ success: true, data: items });
  } catch (error) { next(error); }
};
const createAssessment = async (req, res, next) => {
  try {
    res.status(201).json({ success: true, data: await ReviewerAssessment.create({ ...req.body, reviewer: req.user._id }) });
  } catch (error) { next(error); }
};
const updateAssessment = async (req, res, next) => {
  try {
    const item = await ReviewerAssessment.findById(req.params.id); if (!item) return missing(res, 'Reviewer assessment');
    if (req.user.role === 'Reviewer' && !item.reviewer.equals(req.user._id)) return deny(res);
    delete req.body.reviewer; delete req.body.selfReview; Object.assign(item, req.body); await item.save(); res.json({ success: true, data: item });
  } catch (error) { next(error); }
};
const deleteAssessment = async (req, res, next) => {
  try {
    const item = await ReviewerAssessment.findById(req.params.id); if (!item) return missing(res, 'Reviewer assessment');
    if (req.user.role === 'Reviewer' && !item.reviewer.equals(req.user._id)) return deny(res);
    await item.deleteOne(); res.json({ success: true, message: 'Reviewer assessment deleted' });
  } catch (error) { next(error); }
};

const listPlans = async (req, res, next) => {
  try {
    const filter = req.user.role === 'Employee' ? { employee: req.user._id } : {};
    res.json({ success: true, data: await DevelopmentPlan.find(filter).populate('employee', 'name email') });
  } catch (error) { next(error); }
};
const createPlan = async (req, res, next) => { try { res.status(201).json({ success: true, data: await DevelopmentPlan.create(req.body) }); } catch (error) { next(error); } };
const updatePlan = async (req, res, next) => { try { const item = await DevelopmentPlan.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true }); if (!item) return missing(res, 'Development plan'); res.json({ success: true, data: item }); } catch (error) { next(error); } };
const deletePlan = async (req, res, next) => { try { const item = await DevelopmentPlan.findByIdAndDelete(req.params.id); if (!item) return missing(res, 'Development plan'); res.json({ success: true, message: 'Development plan deleted' }); } catch (error) { next(error); } };

module.exports = { listSelfReviews, getSelfReview, createSelfReview, updateSelfReview, deleteSelfReview, listAssessments, createAssessment, updateAssessment, deleteAssessment, listPlans, createPlan, updatePlan, deletePlan };