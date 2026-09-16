const Employee = require('../models/Employee');
const User = require('../models/User');
const Department = require('../models/Department');
const JobTitle = require('../models/JobTitle');
const Location = require('../models/Location');
const Organization = require('../models/Organization');
const AuditLog = require('../models/AuditLog');


// Helper to find or create employee profile for an authenticated user
const getOrCreateEmployeeForUser = async (user) => {
  let employee = await Employee.findOne({ user: user._id || user.id })
    .populate('user', 'name email role status')
    .populate('department', 'name code')
    .populate('jobTitle', 'title level')
    .populate('location', 'name city country')
    .populate({
      path: 'manager',
      populate: { path: 'user', select: 'name email' },
    });

  if (!employee) {
    const codeNumber = Math.floor(1000 + Math.random() * 9000);
    const code = `EMP-${codeNumber}`;

    const defaultOrg = await Organization.findOne();
    const defaultDept = await Department.findOne();

    employee = await Employee.create({
      user: user._id || user.id,
      employeeCode: code,
      organization: defaultOrg?._id,
      department: defaultDept?._id,
      employmentStatus: 'FULL_TIME',
    });

    employee = await Employee.findById(employee._id)
      .populate('user', 'name email role status')
      .populate('department', 'name code')
      .populate('jobTitle', 'title level')
      .populate('location', 'name city country')
      .populate({
        path: 'manager',
        populate: { path: 'user', select: 'name email' },
      });
  }

  return employee;
};

// 1. List Employees (with Manager Direct-Report Scoping)
const listEmployees = async (req, res, next) => {
  try {
    const { search, department, status, page = 1, limit = 20 } = req.query;
    const query = {};

    const role = req.user.role?.toUpperCase();
    const isHRorAdmin = role === 'SUPER_ADMIN' || role === 'HR_ADMIN' || role === 'HR_HRBP';

    // Manager Scope: Managers can only view their direct reports
    if (!isHRorAdmin && role === 'MANAGER') {
      const managerEmployee = await Employee.findOne({ user: req.user._id || req.user.id });
      if (!managerEmployee) {
        return res.json({ success: true, data: { employees: [], total: 0 } });
      }
      query.manager = managerEmployee._id;
    }

    if (department) {
      query.department = department;
    }

    if (status) {
      query.employmentStatus = status;
    }

    let userIdsMatchingSearch = [];
    if (search?.trim()) {
      const searchRegex = new RegExp(search.trim(), 'i');
      const matchedUsers = await User.find({
        $or: [{ name: searchRegex }, { email: searchRegex }],
      }).select('_id');
      userIdsMatchingSearch = matchedUsers.map((u) => u._id);

      query.$or = [
        { employeeCode: searchRegex },
        { user: { $in: userIdsMatchingSearch } },
      ];
    }

    const skip = (Number(page) - 1) * Number(limit);

    const [employees, total] = await Promise.all([
      Employee.find(query)
        .populate('user', 'name email role status')
        .populate('department', 'name code')
        .populate('jobTitle', 'title level')
        .populate('location', 'name city country')
        .populate({
          path: 'manager',
          populate: { path: 'user', select: 'name email' },
        })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
      Employee.countDocuments(query),
    ]);

    res.json({
      success: true,
      data: {
        employees,
        pagination: {
          total,
          page: Number(page),
          pages: Math.ceil(total / Number(limit)) || 1,
          limit: Number(limit),
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

// 2. Get Employee By ID (with Manager Scoping)
const getEmployeeById = async (req, res, next) => {
  try {
    const employee = await Employee.findById(req.params.id)
      .populate('user', 'name email role status')
      .populate('department', 'name code')
      .populate('team', 'name')
      .populate('jobTitle', 'title level description')
      .populate('location', 'name city country')
      .populate({
        path: 'manager',
        populate: { path: 'user', select: 'name email' },
      });

    if (!employee) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Employee profile not found' },
      });
    }

    const role = req.user.role?.toUpperCase();
    const isHRorAdmin = role === 'SUPER_ADMIN' || role === 'HR_ADMIN' || role === 'HR_HRBP';

    // Verify Manager Authorization
    if (!isHRorAdmin && role === 'MANAGER') {
      const currentManager = await Employee.findOne({ user: req.user._id || req.user.id });
      const isDirectReport = employee.manager && currentManager && employee.manager._id.equals(currentManager._id);
      const isSelf = employee.user._id.equals(req.user._id);

      if (!isDirectReport && !isSelf) {
        return res.status(403).json({
          success: false,
          error: {
            code: 'FORBIDDEN',
            message: 'You are only authorized to access direct reports assigned to you',
          },
        });
      }
    }

    // Direct reports under this employee
    const directReports = await Employee.find({ manager: employee._id })
      .populate('user', 'name email')
      .populate('jobTitle', 'title level');

    res.json({
      success: true,
      data: {
        employee,
        directReports,
      },
    });
  } catch (error) {
    next(error);
  }
};

// 3. Get Authenticated Employee Profile
const getMyProfile = async (req, res, next) => {
  try {
    const employee = await getOrCreateEmployeeForUser(req.user);
    const directReports = await Employee.find({ manager: employee._id })
      .populate('user', 'name email role')
      .populate('jobTitle', 'title level');

    res.json({
      success: true,
      data: {
        employee,
        directReports,
      },
    });
  } catch (error) {
    next(error);
  }
};

// 4. Get Direct Reports for a Manager
const getDirectReports = async (req, res, next) => {
  try {
    const manager = await Employee.findOne({ user: req.user._id || req.user.id });
    if (!manager) {
      return res.json({ success: true, data: [] });
    }

    const directReports = await Employee.find({ manager: manager._id })
      .populate('user', 'name email role status')
      .populate('department', 'name code')
      .populate('jobTitle', 'title level')
      .populate('location', 'name city country');

    res.json({
      success: true,
      data: directReports,
    });
  } catch (error) {
    next(error);
  }
};

// 5. Create Employee Record (HR / Admin)
const createEmployee = async (req, res, next) => {
  try {
    const {
      userId,
      employeeCode,
      departmentId,
      teamId,
      jobTitleId,
      locationId,
      managerId,
      joiningDate,
      employmentStatus,
      phoneNumber,
      emergencyContact,
    } = req.body;

    if (!userId || !employeeCode?.trim()) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'userId and employeeCode are required' },
      });
    }

    const existingUser = await User.findById(userId);
    if (!existingUser) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Target user account not found' },
      });
    }

    const code = employeeCode.trim().toUpperCase();
    const existingCode = await Employee.findOne({ employeeCode: code });
    if (existingCode) {
      return res.status(409).json({
        success: false,
        error: { code: 'CODE_EXISTS', message: 'An employee with this code already exists' },
      });
    }

    const employee = await Employee.create({
      user: userId,
      employeeCode: code,
      department: departmentId || null,
      team: teamId || null,
      jobTitle: jobTitleId || null,
      location: locationId || null,
      manager: managerId || null,
      joiningDate: joiningDate ? new Date(joiningDate) : new Date(),
      employmentStatus: employmentStatus || 'FULL_TIME',
      phoneNumber: phoneNumber?.trim() || '',
      emergencyContact: emergencyContact?.trim() || '',
    });

    const populated = await Employee.findById(employee._id)
      .populate('user', 'name email role status')
      .populate('department', 'name code')
      .populate('jobTitle', 'title level')
      .populate({ path: 'manager', populate: { path: 'user', select: 'name email' } });

    res.status(201).json({
      success: true,
      message: 'Employee record created successfully',
      data: populated,
    });
  } catch (error) {
    next(error);
  }
};

// 6. Update Employee Record
const updateEmployee = async (req, res, next) => {
  try {
    const employee = await Employee.findById(req.params.id);
    if (!employee) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Employee not found' },
      });
    }

    const {
      departmentId,
      teamId,
      jobTitleId,
      locationId,
      managerId,
      employmentStatus,
      phoneNumber,
      emergencyContact,
      joiningDate,
    } = req.body;

    if (departmentId !== undefined) employee.department = departmentId || null;
    if (teamId !== undefined) employee.team = teamId || null;
    if (jobTitleId !== undefined) employee.jobTitle = jobTitleId || null;
    if (locationId !== undefined) employee.location = locationId || null;
    if (managerId !== undefined) employee.manager = managerId || null;
    if (employmentStatus) employee.employmentStatus = employmentStatus;
    if (phoneNumber !== undefined) employee.phoneNumber = phoneNumber;
    if (emergencyContact !== undefined) employee.emergencyContact = emergencyContact;
    if (joiningDate) employee.joiningDate = new Date(joiningDate);

    await employee.save();

    const updated = await Employee.findById(employee._id)
      .populate('user', 'name email role status')
      .populate('department', 'name code')
      .populate('jobTitle', 'title level')
      .populate({ path: 'manager', populate: { path: 'user', select: 'name email' } });

    res.json({
      success: true,
      message: 'Employee record updated successfully',
      data: updated,
    });
  } catch (error) {
    next(error);
  }
};

// 7. Deactivate / Delete Employee
const deleteEmployee = async (req, res, next) => {
  try {
    const employee = await Employee.findById(req.params.id);
    if (!employee) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Employee not found' },
      });
    }

    employee.employmentStatus = 'TERMINATED';
    await employee.save();

    // Also deactivate user account
    await User.findByIdAndUpdate(employee.user, { status: 'inactive' });

    res.json({
      success: true,
      message: 'Employee marked as TERMINATED and user account deactivated',
    });
  } catch (error) {
    next(error);
  }
};

// Helper: write an audit log entry (fire-and-forget, never blocks response)
const writeAudit = (userId, action, entity, entityId, oldValue, newValue, note) => {
  AuditLog.create({
    user: userId,
    action,
    entity,
    entityId: entityId || null,
    oldValue: oldValue || null,
    newValue: newValue || null,
    note: note || '',
  }).catch((err) => console.error('AuditLog write failed:', err.message));
};

// 8. Create User + Employee in a single HR step
const createUserAndEmployee = async (req, res, next) => {
  try {
    const {
      name, email, password, role, employeeCode,
      departmentId, jobTitleId, locationId, managerId,
      joiningDate, employmentStatus, phoneNumber, status,
    } = req.body;

    if (!name?.trim()) return res.status(400).json({ success: false, message: 'Name is required' });
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ success: false, message: 'Valid email is required' });
    if (!password || password.length < 6) return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
    if (!employeeCode?.trim()) return res.status(400).json({ success: false, message: 'Employee Code is required' });

    const normalizedEmail = email.toLowerCase().trim();
    const emailExists = await User.findOne({ email: normalizedEmail });
    if (emailExists) return res.status(409).json({ success: false, message: 'An account with this email already exists' });

    const code = employeeCode.trim().toUpperCase();
    const codeExists = await Employee.findOne({ employeeCode: code });
    if (codeExists) return res.status(409).json({ success: false, message: 'An employee with this code already exists' });

    const user = await User.create({
      name: name.trim(), email: normalizedEmail, password,
      role: role || 'Employee', status: status || 'active',
    });

    const defaultOrg = await Organization.findOne();

    const employee = await Employee.create({
      user: user._id, employeeCode: code,
      organization: defaultOrg?._id || null,
      department: departmentId || null,
      jobTitle: jobTitleId || null,
      location: locationId || null,
      manager: managerId || null,
      joiningDate: joiningDate ? new Date(joiningDate) : new Date(),
      employmentStatus: employmentStatus || 'FULL_TIME',
      phoneNumber: phoneNumber?.trim() || '',
    });

    const populated = await Employee.findById(employee._id)
      .populate('user', 'name email role status')
      .populate('department', 'name code')
      .populate('jobTitle', 'title level')
      .populate({ path: 'manager', populate: { path: 'user', select: 'name email' } });

    writeAudit(req.user._id, 'EMPLOYEE_CREATED', 'Employee', employee._id, null, {
      name: user.name, email: user.email, employeeCode: code, role: user.role,
    });

    res.status(201).json({ success: true, message: 'Employee account and profile created successfully', data: populated });
  } catch (error) {
    next(error);
  }
};

// 9. Get Audit Logs (HR/Admin only)
const getAuditLogs = async (req, res, next) => {
  try {
    const { entity, entityId, page = 1, limit = 30 } = req.query;
    const filter = {};
    if (entity) filter.entity = entity;
    if (entityId) filter.entityId = entityId;

    const skip = (Number(page) - 1) * Number(limit);
    const [logs, total] = await Promise.all([
      AuditLog.find(filter)
        .populate('user', 'name email role')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
      AuditLog.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: { logs, pagination: { total, page: Number(page), pages: Math.ceil(total / Number(limit)) || 1 } },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  listEmployees, getEmployeeById, getMyProfile, getDirectReports,
  createEmployee, createUserAndEmployee, updateEmployee, deleteEmployee,
  getOrCreateEmployeeForUser, getAuditLogs, writeAudit,
};
