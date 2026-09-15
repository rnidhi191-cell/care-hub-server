const jwt = require('jsonwebtoken');
const User = require('../models/User');
// Keep the token key aligned with middleware/auth.js (decoded.id).
const createToken = (user) => jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '7d' });
const userResponse = (user) => ({ id: user._id, name: user.name, email: user.email, role: user.role, status: user.status });
const validEmail = (email) => typeof email === 'string' && /^\S+@\S+\.\S+$/.test(email.trim());

const register = async (req, res, next) => {
  try {
    const { name, email, password } = req.body;

    if (!name?.trim() || !validEmail(email) || typeof password !== 'string' || password.length < 6)
       return res.status(400).json({ success: false, message: 'Provide a name, valid email, and a password of at least 6 characters' });
    if (await User.findOne({ email: email.toLowerCase().trim() }))
       return res.status(409).json({ success: false, message: 'Email already registered' });
   
    const user = await User.create({ name: name.trim(), email: email.toLowerCase().trim(), password });
    res.status(201).json({ success: true, message: 'Registration successful', data: { token: createToken(user), user: userResponse(user) } });
  } catch (error) { next(error); }
};

const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const user = validEmail(email) && await User.findOne({ email: email.toLowerCase().trim() }).select('+password');
    if (!user || !(await user.matchPassword(password || ''))) return res.status(401).json({ success: false, message: 'Invalid email or password' });
    if (user.status !== 'Active') return res.status(403).json({ success: false, message: 'Your account is inactive' });
    res.json({ success: true, message: 'Login successful', data: { token: createToken(user), user: userResponse(user) } });
  } catch (error) { next(error); }
};
const logout = (_req, res) => res.json({ success: true, message: 'Logout successful' });
const getProfile = (req, res) => res.json({ success: true, message: 'Profile retrieved successfully', data: { user: userResponse(req.user) } });
module.exports = { register, login, logout, getProfile };
