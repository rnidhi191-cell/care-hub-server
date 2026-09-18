const Role = require('../models/Role');
const User = require('../models/User');

const createRole = async (req, res, next) => {
  try {
    const { name, description, status } = req.body;
    if (!name) {
      return res.status(400).json({ success: false, message: 'Role name is required' });
    }
    const role = await Role.create({ name, description, status });
    res.status(201).json({ success: true, message: 'Role created successfully', data: role });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ success: false, message: 'Role already exists' });
    }
    next(error);
  }
};

const getRoles = async (req, res, next) => {
  try {
    const roles = await Role.find().sort({ createdAt: -1 });
    res.json({ success: true, data: roles });
  } catch (error) {
    next(error);
  }
};

const updateRole = async (req, res, next) => {
  try {
    const { name, description, status } = req.body;
    const role = await Role.findByIdAndUpdate(
      req.params.id,
      { name, description, status },
      { new: true, runValidators: true }
    );
    if (!role) {
      return res.status(404).json({ success: false, message: 'Role not found' });
    }
    res.json({ success: true, message: 'Role updated successfully', data: role });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ success: false, message: 'Role name already exists' });
    }
    next(error);
  }
};

const deleteRole = async (req, res, next) => {
  try {
    const role = await Role.findByIdAndDelete(req.params.id);
    if (!role) {
      return res.status(404).json({ success: false, message: 'Role not found' });
    }
    res.json({ success: true, message: 'Role deleted successfully' });
  } catch (error) {
    next(error);
  }
};

const assignRole = async (req, res, next) => {
  try {
    const { userId, roleName } = req.body;
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    
    // Validate that the role exists in the Role collection if enforcing strict roles
    const role = await Role.findOne({ name: roleName });
    if (!role && !['Admin', 'SUPER_ADMIN', 'HR', 'Manager', 'Employee'].includes(roleName)) {
      return res.status(400).json({ success: false, message: 'Invalid role' });
    }

    user.role = roleName;
    await user.save();
    res.json({ success: true, message: 'Role assigned successfully', data: { role: user.role } });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createRole,
  getRoles,
  updateRole,
  deleteRole,
  assignRole,
};

