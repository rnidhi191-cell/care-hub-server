const router = require('express').Router();
const auth = require('../middleware/auth');
const { allowRoles } = require('../middleware/auth');
const review = require('../controllers/reviewController');

router.use(auth);
router.route('/self-reviews').get(review.listSelfReviews).post(allowRoles('Employee', 'HR'), review.createSelfReview);
router.route('/self-reviews/:id').get(review.getSelfReview).put(allowRoles('Employee', 'HR'), review.updateSelfReview).delete(allowRoles('Employee', 'HR'), review.deleteSelfReview);
router.route('/assessments').get(review.listAssessments).post(allowRoles('Reviewer', 'HR'), review.createAssessment);
router.route('/assessments/:id').put(allowRoles('Reviewer', 'HR'), review.updateAssessment).delete(allowRoles('Reviewer', 'HR'), review.deleteAssessment);
router.route('/development-plans').get(review.listPlans).post(allowRoles('HR'), review.createPlan);
router.route('/development-plans/:id').put(allowRoles('HR'), review.updatePlan).delete(allowRoles('HR'), review.deletePlan);
module.exports = router;