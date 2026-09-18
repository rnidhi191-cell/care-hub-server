const router = require('express').Router();
const auth = require('../middleware/auth');
const { allowRoles } = require('../middleware/auth');
const review = require('../controllers/reviewController');
const attachment = require('../controllers/attachmentController');
const { upload } = require('../middleware/attachmentUpload');

const attachmentType = (type) => (req, _res, next) => { req.attachmentType = type; next(); };

// All review routes require authentication
router.use(auth);

router.get('/eligible-reviewers', allowRoles('EMPLOYEE'), review.eligibleReviewers);

// Self Reviews
router
  .route('/self-reviews')
  .get(review.listSelfReviews)
  .post(allowRoles('EMPLOYEE', 'HR', 'ADMIN'), review.createSelfReview);

router
  .route('/self-reviews/:id')
  .get(review.getSelfReview)
  .put(allowRoles('EMPLOYEE', 'HR', 'ADMIN'), review.updateSelfReview)
  .delete(allowRoles('EMPLOYEE', 'HR', 'ADMIN'), review.deleteSelfReview);

router.route('/self-reviews/:id/attachments')
  .get(attachmentType('SELF_REVIEW'), attachment.listFor)
  .post(attachmentType('SELF_REVIEW'), upload.single('file'), attachment.uploadFor);

router.route('/self-reviews/:reviewId/goals/:entityId/attachments')
  .get(attachmentType('GOAL'), attachment.listFor)
  .post(attachmentType('GOAL'), upload.single('file'), attachment.uploadFor);

router
  .route('/self-reviews/:selfReviewId/assessment')
  .get(review.getAssessmentBySelfReview);

// Reviewer Assessments
router
  .route('/assessments')
  .get(review.listAssessments)
  .post(allowRoles('EMPLOYEE', 'MANAGER', 'HR', 'ADMIN'), review.createAssessment);

router
  .route('/assessments/:id')
  .put(allowRoles('EMPLOYEE', 'MANAGER', 'HR', 'ADMIN'), review.updateAssessment)
  .delete(allowRoles('EMPLOYEE', 'MANAGER', 'HR', 'ADMIN'), review.deleteAssessment);

router.post('/manager-reviews', allowRoles('MANAGER'), review.createManagerReview);
router.put('/manager-reviews/:id/finalize', allowRoles('HR', 'ADMIN'), review.finalizeManagerReview);

// HR Validation — only HR/ADMIN can approve or return
router
  .route('/assessments/:id/validate')
  .put(allowRoles('HR', 'ADMIN'), review.hrValidateAssessment);

// HR Calibration
router
  .route('/assessments/:id/calibrate')
  .put(allowRoles('HR', 'ADMIN'), review.calibrateAssessment);

// Development Plans
router
  .route('/development-plans')
  .get(review.listPlans)
  .post(allowRoles('HR', 'ADMIN'), review.createPlan);

router
  .route('/development-plans/:id')
  .put(allowRoles('HR', 'ADMIN'), review.updatePlan)
  .delete(allowRoles('HR', 'ADMIN'), review.deletePlan);

router.route('/development-plans/:id/attachments')
  .get(attachmentType('DEVELOPMENT_PLAN'), attachment.listFor)
  .post(attachmentType('DEVELOPMENT_PLAN'), upload.single('file'), attachment.uploadFor);

router.get('/attachments/:id/download', attachment.download);
router.delete('/attachments/:id', attachment.remove);

module.exports = router;
