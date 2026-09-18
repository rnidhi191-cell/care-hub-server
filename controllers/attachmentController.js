const fs = require('fs/promises');
const path = require('path');
const FileAttachment = require('../models/FileAttachment');
const SelfReview = require('../models/SelfReview');
const DevelopmentPlan = require('../models/DevelopmentPlan');
const ReviewCycle = require('../models/ReviewCycle');
const AuditLog = require('../models/AuditLog');
const { uploadDirectory } = require('../middleware/attachmentUpload');

const deny = (res) => res.status(403).json({ success: false, message: 'Access denied' });
const missing = (res, name) => res.status(404).json({ success: false, message: `${name} not found` });
const isPrivileged = (user) => ['HR', 'ADMIN'].includes(user.role);
const unlinkUploaded = (file) => file?.path && fs.unlink(file.path).catch(() => {});

const canAccessReview = async (user, review) => {
  if (isPrivileged(user) || review.employee.equals(user._id)) return true;
  if (user.role !== 'MANAGER') return false;
  return Boolean(await ReviewCycle.exists({
    cycleName: review.cycle, year: review.year,
    assignments: { $elemMatch: { employee: review.employee, reviewer: user._id } },
  }));
};

const canAccessPlan = async (user, plan) => {
  if (isPrivileged(user) || plan.employee.equals(user._id)) return true;
  if (user.role !== 'MANAGER') return false;
  return Boolean(await ReviewCycle.exists({
    cycleName: plan.cycle, year: plan.year,
    assignments: { $elemMatch: { employee: plan.employee, reviewer: user._id } },
  }));
};

const reviewForAttachment = async (attachment) => {
  if (attachment.selfReview) return SelfReview.findById(attachment.selfReview);
  return attachment.entityType === 'GOAL' ? SelfReview.findOne({ 'goals._id': attachment.entityId }) : null;
};

const listFor = async (req, res, next) => {
  try {
    const entityType = req.attachmentType || req.params.entityType;
    const entityId = req.params.entityId || req.params.id;
    let permitted = false;
    if (entityType === 'SELF_REVIEW' || entityType === 'GOAL') {
      const review = entityType === 'GOAL'
        ? await SelfReview.findOne({ _id: req.params.reviewId, 'goals._id': entityId })
        : await SelfReview.findById(entityId);
      if (!review) return missing(res, entityType === 'GOAL' ? 'Goal' : 'Self-review');
      permitted = await canAccessReview(req.user, review);
    } else if (entityType === 'DEVELOPMENT_PLAN') {
      const plan = await DevelopmentPlan.findById(entityId);
      if (!plan) return missing(res, 'Development plan');
      permitted = await canAccessPlan(req.user, plan);
    } else return res.status(400).json({ success: false, message: 'Unsupported attachment type' });
    if (!permitted) return deny(res);
    const data = await FileAttachment.find({ entityType, entityId }).populate('uploadedBy', 'name email').sort({ createdAt: -1 });
    res.json({ success: true, data });
  } catch (error) { next(error); }
};

const uploadFor = async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'One supported file is required (maximum 10 MB)' });
    const entityType = req.attachmentType || req.params.entityType;
    const entityId = req.params.entityId || req.params.id;
    let selfReview = null; let developmentPlan = null;
    if (entityType === 'SELF_REVIEW' || entityType === 'GOAL') {
      selfReview = entityType === 'GOAL'
        ? await SelfReview.findOne({ _id: req.params.reviewId, 'goals._id': entityId })
        : await SelfReview.findById(entityId);
      if (!selfReview) { await unlinkUploaded(req.file); return missing(res, entityType === 'GOAL' ? 'Goal' : 'Self-review'); }
      if (!(await canAccessReview(req.user, selfReview))) { await unlinkUploaded(req.file); return deny(res); }
    } else if (entityType === 'DEVELOPMENT_PLAN') {
      developmentPlan = await DevelopmentPlan.findById(entityId);
      if (!developmentPlan) { await unlinkUploaded(req.file); return missing(res, 'Development plan'); }
      if (!(await canAccessPlan(req.user, developmentPlan))) { await unlinkUploaded(req.file); return deny(res); }
    } else { await unlinkUploaded(req.file); return res.status(400).json({ success: false, message: 'Unsupported attachment type' }); }

    const attachment = await FileAttachment.create({
      entityType, entityId, selfReview: selfReview?._id || null, developmentPlan: developmentPlan?._id || null,
      originalName: path.basename(req.file.originalname), storedName: req.file.filename,
      mimeType: req.file.mimetype, size: req.file.size, uploadedBy: req.user._id,
    });
    AuditLog.create({ user: req.user._id, action: 'ATTACHMENT_UPLOADED', entity: entityType, entityId: selfReview?._id || developmentPlan?._id, newValue: { attachmentId: attachment._id, name: attachment.originalName } }).catch(() => {});
    res.status(201).json({ success: true, data: attachment });
  } catch (error) { await unlinkUploaded(req.file); next(error); }
};

const download = async (req, res, next) => {
  try {
    const attachment = await FileAttachment.findById(req.params.id);
    if (!attachment) return missing(res, 'Attachment');
    const owner = attachment.developmentPlan ? await DevelopmentPlan.findById(attachment.developmentPlan) : await reviewForAttachment(attachment);
    if (!owner) return missing(res, 'Attachment owner');
    const permitted = attachment.developmentPlan ? await canAccessPlan(req.user, owner) : await canAccessReview(req.user, owner);
    if (!permitted) return deny(res);
    const filePath = path.resolve(uploadDirectory, attachment.storedName);
    if (path.dirname(filePath) !== uploadDirectory) return missing(res, 'Attachment');
    res.download(filePath, attachment.originalName, (error) => { if (error && !res.headersSent) next(error); });
  } catch (error) { next(error); }
};

const remove = async (req, res, next) => {
  try {
    const attachment = await FileAttachment.findById(req.params.id);
    if (!attachment) return missing(res, 'Attachment');
    const owner = attachment.developmentPlan ? await DevelopmentPlan.findById(attachment.developmentPlan) : await reviewForAttachment(attachment);
    if (!owner) return missing(res, 'Attachment owner');
    const canAccess = attachment.developmentPlan ? await canAccessPlan(req.user, owner) : await canAccessReview(req.user, owner);
    if (!canAccess || (!isPrivileged(req.user) && !attachment.uploadedBy.equals(req.user._id))) return deny(res);
    await attachment.deleteOne();
    await fs.unlink(path.resolve(uploadDirectory, attachment.storedName)).catch((error) => { if (error.code !== 'ENOENT') throw error; });
    AuditLog.create({ user: req.user._id, action: 'ATTACHMENT_DELETED', entity: attachment.entityType, entityId: owner._id, oldValue: { attachmentId: attachment._id, name: attachment.originalName } }).catch(() => {});
    res.json({ success: true, message: 'Attachment deleted' });
  } catch (error) { next(error); }
};

module.exports = { listFor, uploadFor, download, remove };
