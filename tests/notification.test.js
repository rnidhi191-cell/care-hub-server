const request = require('supertest');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

process.env.NODE_ENV = 'test';

const app = require('../index');
const User = require('../models/User');
const Notification = require('../models/Notification');

const email = `notification-${Date.now()}@demo.com`;
let user;

const tokenFor = (account) => jwt.sign(
  { id: account._id, role: account.role, email: account.email },
  process.env.JWT_SECRET || 'care_hub_jwt_default_secret_key',
  { expiresIn: '10m' },
);

beforeAll(async () => {
  if (mongoose.connection.readyState === 0 && process.env.MONGO_URI) await mongoose.connect(process.env.MONGO_URI);
  user = await User.create({ name: 'Notification User', email, password: 'Password123', role: 'EMPLOYEE' });
});

afterAll(async () => {
  await Notification.deleteMany({ recipient: user?._id });
  await User.deleteOne({ email });
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
});

describe('In-app notifications', () => {
  test('lists recipient notifications and supports individual and bulk read actions', async () => {
    const token = tokenFor(user);
    const first = await Notification.create({
      recipient: user._id, type: 'DEADLINE', title: 'Self-review deadline', message: 'Submit your review.',
      link: '/self-review', dedupeKey: `test-first-${user._id}`,
    });
    await Notification.create({
      recipient: user._id, type: 'PROGRESS_CHECK', title: 'Progress check', message: 'Update your plan.',
      link: '/employee', dedupeKey: `test-second-${user._id}`,
    });

    const listed = await request(app).get('/api/notifications').set('Authorization', `Bearer ${token}`);
    expect(listed.status).toBe(200);
    expect(listed.body.unreadCount).toBe(2);
    expect(listed.body.data).toHaveLength(2);

    const read = await request(app).post(`/api/notifications/${first._id}/read`).set('Authorization', `Bearer ${token}`);
    expect(read.status).toBe(200);
    expect(read.body.data.readAt).toBeTruthy();

    const allRead = await request(app).post('/api/notifications/read-all').set('Authorization', `Bearer ${token}`);
    expect(allRead.status).toBe(200);
    const remaining = await Notification.countDocuments({ recipient: user._id, readAt: null });
    expect(remaining).toBe(0);
  });
});
