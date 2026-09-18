const request = require('supertest');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
process.env.NODE_ENV = 'test';
const app = require('../index');
const User = require('../models/User');
const SelfReview = require('../models/SelfReview');

const email = `report-hr-${Date.now()}@demo.com`;
let hr;
const token = () => jwt.sign({ id: hr._id, role: hr.role, email }, process.env.JWT_SECRET || 'care_hub_jwt_default_secret_key', { expiresIn: '10m' });
beforeAll(async () => { if (mongoose.connection.readyState === 0 && process.env.MONGO_URI) await mongoose.connect(process.env.MONGO_URI); hr = await User.create({ name: 'Report HR', email, password: 'Password123', role: 'HR' }); });
afterAll(async () => { await User.deleteOne({ email }); if (mongoose.connection.readyState !== 0) await mongoose.disconnect(); });
test('authorized users can retrieve derived CARE reports without creating report data', async () => {
  const response = await request(app).get('/api/reports?report=rating-distribution').set('Authorization', `Bearer ${token()}`);
  expect(response.status).toBe(200);
  expect(response.body.data).toHaveLength(5);
  expect(response.body.data[0]).toHaveProperty('rating', 1);
});
