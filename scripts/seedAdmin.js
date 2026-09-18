require('dotenv').config();

const mongoose = require('mongoose');
const User = require('../models/User');
const connectDB = require('../config/db');

const name = process.env.ADMIN_NAME || 'Admin';
const email = (process.env.ADMIN_EMAIL || 'admin@carehub.com').trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD;

const seedAdmin = async () => {
  if (!process.env.MONGO_URI) throw new Error('MONGO_URI must be set in server/.env');
  if (!password || password.length < 6) {
    throw new Error('Set ADMIN_PASSWORD to a password of at least 6 characters before running this script');
  }

  await connectDB();
  const existing = await User.findOne({ email });
  if (existing) {
    console.log(`User ${email} already exists; no changes made.`);
    return;
  }

  // User's pre-save hook hashes this plaintext password. Do not hash it here.
  await User.create({ name, email, password, role: 'ADMIN', status: 'active' });
  console.log(`Admin created: ${email}`);
};

seedAdmin()
  .catch((error) => { console.error(`Unable to seed admin: ${error.message}`); process.exitCode = 1; })
  .finally(async () => { await mongoose.disconnect(); });
