const Organization = require('../models/Organization');
const Department = require('../models/Department');
const Team = require('../models/Team');
const JobTitle = require('../models/JobTitle');
const Location = require('../models/Location');

// Helper to ensure base demo organization and departments exist
const ensureDefaultOrg = async () => {
  let org = await Organization.findOne({ code: 'CARE_DEMO' });
  if (!org) {
    org = await Organization.create({
      name: 'CARE Demo Corporation',
      code: 'CARE_DEMO',
      description: 'Global Enterprise Organization for CARE System',
    });
  }

  const defaultDepts = [
    { name: 'Engineering', code: 'ENG' },
    { name: 'Human Resources', code: 'HR' },
    { name: 'Finance', code: 'FIN' },
    { name: 'Sales', code: 'SALES' },
    { name: 'Operations', code: 'OPS' },
    { name: 'Marketing', code: 'MKTG' },
  ];

  for (const d of defaultDepts) {
    const existing = await Department.findOne({ organization: org._id, code: d.code });
    if (!existing) {
      await Department.create({ organization: org._id, name: d.name, code: d.code });
    }
  }

  const defaultTitles = [
    { title: 'Software Engineer', level: 'Mid' },
    { title: 'Senior Software Engineer', level: 'Senior' },
    { title: 'Engineering Manager', level: 'Manager' },
    { title: 'HR Business Partner', level: 'Mid' },
    { title: 'HR Director', level: 'Director' },
    { title: 'Financial Analyst', level: 'Mid' },
  ];

  for (const t of defaultTitles) {
    const existing = await JobTitle.findOne({ title: t.title });
    if (!existing) {
      await JobTitle.create(t);
    }
  }

  const defaultLocations = [
    { name: 'Headquarters', city: 'New York', country: 'United States' },
    { name: 'European Branch', city: 'London', country: 'United Kingdom' },
    { name: 'Asia Hub', city: 'Singapore', country: 'Singapore' },
  ];

  for (const l of defaultLocations) {
    const existing = await Location.findOne({ organization: org._id, name: l.name });
    if (!existing) {
      await Location.create({ organization: org._id, ...l });
    }
  }

  return org;
};

const getOrganization = async (_req, res, next) => {
  try {
    const org = await ensureDefaultOrg();

    const [departments, teams, jobTitles, locations] = await Promise.all([
      Department.find({ organization: org._id }).sort({ name: 1 }),
      Team.find().populate('department', 'name code').sort({ name: 1 }),
      JobTitle.find().sort({ title: 1 }),
      Location.find({ organization: org._id }).sort({ name: 1 }),
    ]);

    res.json({
      success: true,
      data: {
        organization: org,
        departments,
        teams,
        jobTitles,
        locations,
      },
    });
  } catch (error) {
    next(error);
  }
};

const createDepartment = async (req, res, next) => {
  try {
    const { name, code } = req.body;
    if (!name?.trim() || !code?.trim()) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Name and Code are required' },
      });
    }

    const org = await ensureDefaultOrg();
    const dept = await Department.create({
      organization: org._id,
      name: name.trim(),
      code: code.trim().toUpperCase(),
    });

    res.status(201).json({
      success: true,
      message: 'Department created successfully',
      data: dept,
    });
  } catch (error) {
    next(error);
  }
};

const createTeam = async (req, res, next) => {
  try {
    const { departmentId, name } = req.body;
    if (!departmentId || !name?.trim()) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Department and Team name are required' },
      });
    }

    const team = await Team.create({
      department: departmentId,
      name: name.trim(),
    });

    res.status(201).json({
      success: true,
      message: 'Team created successfully',
      data: team,
    });
  } catch (error) {
    next(error);
  }
};

const createJobTitle = async (req, res, next) => {
  try {
    const { title, level, description } = req.body;
    if (!title?.trim()) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Job title is required' },
      });
    }

    const jobTitle = await JobTitle.create({
      title: title.trim(),
      level: level?.trim() || '',
      description: description?.trim() || '',
    });

    res.status(201).json({
      success: true,
      message: 'Job title created successfully',
      data: jobTitle,
    });
  } catch (error) {
    next(error);
  }
};

const createLocation = async (req, res, next) => {
  try {
    const { name, city, country } = req.body;
    if (!name?.trim() || !city?.trim() || !country?.trim()) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Name, City, and Country are required' },
      });
    }

    const org = await ensureDefaultOrg();
    const location = await Location.create({
      organization: org._id,
      name: name.trim(),
      city: city.trim(),
      country: country.trim(),
    });

    res.status(201).json({
      success: true,
      message: 'Location created successfully',
      data: location,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getOrganization,
  createDepartment,
  createTeam,
  createJobTitle,
  createLocation,
};

