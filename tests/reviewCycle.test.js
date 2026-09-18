const request = require('supertest');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

process.env.NODE_ENV = 'test';

const app = require('../index');
const User = require('../models/User');
const ReviewCycle = require('../models/ReviewCycle');

const suffix = Date.now();
const emails = {
  admin: `cycle-admin-${suffix}@demo.com`,
  manager: `cycle-manager-${suffix}@demo.com`,
  employee: `cycle-employee-${suffix}@demo.com`,
};

let admin;
let manager;
let employee;
let cycleId;

const tokenFor = (user) => jwt.sign(
  { id: user._id, role: user.role, email: user.email },
  process.env.JWT_SECRET || 'care_hub_jwt_default_secret_key',
  { expiresIn: '10m' },
);

const dates = {
  startDate: '2099-04-01',
  endDate: '2099-04-30',
  selfReviewDeadline: '2099-04-10',
  reviewerDeadline: '2099-04-17',
  hrValidationDeadline: '2099-04-24',
  calibrationStartDate: '2099-04-25',
  calibrationEndDate: '2099-04-26',
  discussionStartDate: '2099-04-27',
  discussionEndDate: '2099-04-28',
  finalizationDate: '2099-04-29',
  acknowledgementDeadline: '2099-04-30',
};

beforeAll(async () => {
  if (mongoose.connection.readyState === 0 && process.env.MONGO_URI) await mongoose.connect(process.env.MONGO_URI);
  [admin, manager, employee] = await Promise.all([
    User.create({ name: 'Cycle Admin', email: emails.admin, password: 'Password123', role: 'ADMIN' }),
    User.create({ name: 'Cycle Manager', email: emails.manager, password: 'Password123', role: 'MANAGER' }),
    User.create({ name: 'Cycle Employee', email: emails.employee, password: 'Password123', role: 'EMPLOYEE' }),
  ]);
});

afterAll(async () => {
  await ReviewCycle.deleteMany({ createdBy: admin?._id });
  await User.deleteMany({ email: { $in: Object.values(emails) } });
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
});

describe('Review cycle management', () => {
  test('only HR/admin can create, assign, launch, close, and monitor a cycle', async () => {
    const managerToken = tokenFor(manager);
    const adminToken = tokenFor(admin);

    const denied = await request(app).post('/api/review-cycles').set('Authorization', `Bearer ${managerToken}`).send({
      title: 'April 2099', cycleName: 'April', year: 2099, ...dates,
    });
    expect(denied.status).toBe(403);

    const created = await request(app).post('/api/review-cycles').set('Authorization', `Bearer ${adminToken}`).send({
      title: 'April 2099', cycleName: 'April', year: 2099, ...dates,
    });
    expect(created.status).toBe(201);
    expect(created.body.data.status).toBe('DRAFT');
    cycleId = created.body.data._id;

    const assigned = await request(app).put(`/api/review-cycles/${cycleId}/assignments`).set('Authorization', `Bearer ${adminToken}`).send({
      assignments: [{ employee: employee._id.toString(), reviewer: manager._id.toString() }],
    });
    expect(assigned.status).toBe(200);
    expect(assigned.body.data.monitoring.assignedEmployees).toBe(1);

    const launched = await request(app).put(`/api/review-cycles/${cycleId}/launch`).set('Authorization', `Bearer ${adminToken}`);
    expect(launched.status).toBe(200);
    expect(launched.body.data.status).toBe('ACTIVE');

    const managerView = await request(app).get(`/api/review-cycles/${cycleId}`).set('Authorization', `Bearer ${managerToken}`);
    expect(managerView.status).toBe(200);
    expect(managerView.body.data.assignments).toHaveLength(1);
    expect(managerView.body.data.monitoring.assignmentProgress[0].selfReviewCompleted).toBe(false);

    const closed = await request(app).put(`/api/review-cycles/${cycleId}/close`).set('Authorization', `Bearer ${adminToken}`);
    expect(closed.status).toBe(200);
    expect(closed.body.data.status).toBe('CLOSED');
  });
});
