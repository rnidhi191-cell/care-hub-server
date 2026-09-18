const request = require('supertest');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

process.env.NODE_ENV = 'test';

const app = require('../index');
const User = require('../models/User');
const ProgressCheck = require('../models/ProgressCheck');
const Notification = require('../models/Notification');

const suffix = Date.now();
let hr;
let employee;

const tokenFor = (user) => jwt.sign(
  { id: user._id, role: user.role, email: user.email },
  process.env.JWT_SECRET || 'care_hub_jwt_default_secret_key',
  { expiresIn: '10m' },
);

beforeAll(async () => {
  if (mongoose.connection.readyState === 0 && process.env.MONGO_URI) await mongoose.connect(process.env.MONGO_URI);
  [hr, employee] = await Promise.all([
    User.create({ name: 'Progress HR', email: `progress-hr-${suffix}@demo.com`, password: 'Password123', role: 'HR' }),
    User.create({ name: 'Progress Employee', email: `progress-employee-${suffix}@demo.com`, password: 'Password123', role: 'EMPLOYEE' }),
  ]);
});

afterAll(async () => {
  await ProgressCheck.deleteMany({ createdBy: hr?._id });
  await Notification.deleteMany({ recipient: employee?._id });
  await User.deleteMany({ _id: { $in: [hr?._id, employee?._id] } });
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
});

describe('Progress checks', () => {
  test('HR can schedule and complete a progress check with CARE follow-up information', async () => {
    const token = tokenFor(hr);
    const created = await request(app).post('/api/progress-checks').set('Authorization', `Bearer ${token}`).send({
      employee: employee._id.toString(), dueDate: '2099-08-01',
    });
    expect(created.status).toBe(201);
    expect(created.body.data.status).toBe('PENDING');
    expect(created.body.data.previousGoals).toEqual([]);

    const updated = await request(app).put(`/api/progress-checks/${created.body.data._id}`).set('Authorization', `Bearer ${token}`).send({
      status: 'COMPLETED', developmentProgress: 'Leading technical reviews independently.', achievements: 'Completed a certification.',
      challenges: 'Balancing delivery work.', supportRequired: 'Monthly mentoring.', newGoals: ['Mentor a new team member'],
      employeeComments: 'I am making steady progress.', managerComments: 'Progress is on track.',
      goalProgress: [{ goal: 'Certification', progress: 100, status: 'Completed' }],
    });
    expect(updated.status).toBe(200);
    expect(updated.body.data.status).toBe('COMPLETED');
    expect(updated.body.data.completedAt).toBeTruthy();
    expect(updated.body.data.goalProgress[0].progress).toBe(100);

    const listed = await request(app).get('/api/progress-checks').set('Authorization', `Bearer ${token}`);
    expect(listed.status).toBe(200);
    expect(listed.body.data).toHaveLength(1);
  });
});
