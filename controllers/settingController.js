const ReviewSetting = require('../models/ReviewSetting');
const Organization = require('../models/Organization');

const ensureSettingExists = async () => {
  let setting = await ReviewSetting.findOne();
  if (!setting) {
    const org = await Organization.findOne();
    setting = await ReviewSetting.create({
      organization: org ? org._id : null,
      goalWeight: 60,
      competencyWeight: 40,
    });
  }
  return setting;
};

const getReviewSetting = async (req, res, next) => {
  try {
    const setting = await ensureSettingExists();
    res.json({ success: true, data: setting });
  } catch (error) {
    next(error);
  }
};

const updateReviewSetting = async (req, res, next) => {
  try {
    const { goalWeight, competencyWeight, cycleStartDate, cycleEndDate } = req.body;
    
    if (goalWeight === undefined || competencyWeight === undefined) {
      return res.status(400).json({ success: false, message: 'goalWeight and competencyWeight are required' });
    }

    if (goalWeight + competencyWeight !== 100) {
      return res.status(400).json({ success: false, message: 'Weights must add up to 100' });
    }

    let setting = await ensureSettingExists();
    setting.goalWeight = goalWeight;
    setting.competencyWeight = competencyWeight;
    if (cycleStartDate) setting.cycleStartDate = cycleStartDate;
    if (cycleEndDate) setting.cycleEndDate = cycleEndDate;
    setting.updatedBy = req.user._id;
    await setting.save();

    res.json({ success: true, message: 'Review settings updated', data: setting });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getReviewSetting,
  updateReviewSetting,
  ensureSettingExists,
};

