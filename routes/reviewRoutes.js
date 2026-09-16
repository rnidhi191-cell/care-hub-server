const router = require('express').Router();
const auth = require('../middleware/auth');
const { allowRoles } = require('../middleware/auth');
const review = require('../controllers/reviewController');

// All review routes require authentication
router.use(auth);

// Self Reviews
router
  .route('/self-reviews')
  .get(review.listSelfReviews)
  .post(allowRoles('Employee', 'EMPLOYEE', 'HR', 'HR_ADMIN', 'SUPER_ADMIN'), review.createSelfReview);

router
  .route('/self-reviews/:id')
  .get(review.getSelfReview)
  .put(allowRoles('Employee', 'EMPLOYEE', 'HR', 'HR_ADMIN', 'SUPER_ADMIN'), review.updateSelfReview)
  .delete(allowRoles('Employee', 'EMPLOYEE', 'HR', 'HR_ADMIN', 'SUPER_ADMIN'), review.deleteSelfReview);

router
  .route('/self-reviews/:selfReviewId/assessment')
  .get(review.getAssessmentBySelfReview);

// Reviewer Assessments
router
  .route('/assessments')
  .get(review.listAssessments)
  .post(allowRoles('Reviewer', 'MANAGER', 'HR', 'HR_ADMIN', 'SUPER_ADMIN'), review.createAssessment);

router
  .route('/assessments/:id')
  .put(allowRoles('Reviewer', 'MANAGER', 'HR', 'HR_ADMIN', 'SUPER_ADMIN'), review.updateAssessment)
  .delete(allowRoles('Reviewer', 'MANAGER', 'HR', 'HR_ADMIN', 'SUPER_ADMIN'), review.deleteAssessment);

// HR Validation — only HR/SUPER_ADMIN can approve or return
router
  .route('/assessments/:id/validate')
  .put(allowRoles('HR', 'HR_ADMIN', 'HR_HRBP', 'SUPER_ADMIN'), review.hrValidateAssessment);

// HR Calibration
router
  .route('/assessments/:id/calibrate')
  .put(allowRoles('HR', 'HR_ADMIN', 'HR_HRBP', 'SUPER_ADMIN'), review.calibrateAssessment);

// Development Plans
router
  .route('/development-plans')
  .get(review.listPlans)
  .post(allowRoles('HR', 'HR_ADMIN', 'SUPER_ADMIN'), review.createPlan);

router
  .route('/development-plans/:id')
  .put(allowRoles('HR', 'HR_ADMIN', 'SUPER_ADMIN'), review.updatePlan)
  .delete(allowRoles('HR', 'HR_ADMIN', 'SUPER_ADMIN'), review.deletePlan);

module.exports = router;