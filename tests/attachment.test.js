const request = require('supertest');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const fs = require('fs/promises');
const path = require('path');

process.env.NODE_ENV = 'test';
const app = require('../index');
const User = require('../models/User');
const SelfReview = require('../models/SelfReview');
const DevelopmentPlan = require('../models/DevelopmentPlan');
const FileAttachment = require('../models/FileAttachment');

const suffix = Date.now();
let employee; let otherEmployee; let admin; let review; let plan;
const tokenFor = (user) => jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET || 'care_hub_jwt_default_secret_key', { expiresIn: '10m' });

beforeAll(async () => {
  if (mongoose.connection.readyState === 0 && process.env.MONGO_URI) await mongoose.connect(process.env.MONGO_URI);
  [employee, otherEmployee, admin] = await Promise.all([
    User.create({ name: 'Attachment Owner', email: `attachment-owner-${suffix}@demo.com`, password: 'Password123', role: 'EMPLOYEE' }),
    User.create({ name: 'Attachment Outsider', email: `attachment-outsider-${suffix}@demo.com`, password: 'Password123', role: 'EMPLOYEE' }),
    User.create({ name: 'Attachment Admin', email: `attachment-admin-${suffix}@demo.com`, password: 'Password123', role: 'ADMIN' }),
  ]);
  review = await SelfReview.create({ employee: employee._id, cycle: 'April', year: 2098, contribute: 'c', goals: [{ title: 'Ship evidence' }] });
  plan = await DevelopmentPlan.create({ employee: employee._id, cycle: 'April', year: 2098 });
});

afterAll(async () => {
  const attachments = await FileAttachment.find({ uploadedBy: { $in: [employee?._id, otherEmployee?._id, admin?._id] } });
  await Promise.all(attachments.map((item) => fs.unlink(path.join(__dirname, '..', 'uploads', 'private', item.storedName)).catch(() => {})));
  await FileAttachment.deleteMany({ uploadedBy: { $in: [employee?._id, otherEmployee?._id, admin?._id] } });
  await SelfReview.deleteMany({ employee: employee?._id });
  await DevelopmentPlan.deleteMany({ employee: employee?._id });
  await User.deleteMany({ _id: { $in: [employee?._id, otherEmployee?._id, admin?._id] } });
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
});

describe('private CARE attachments', () => {
  test('owner can upload, list, and download review evidence while another employee is denied', async () => {
    const ownerToken = tokenFor(employee);
    const outsiderToken = tokenFor(otherEmployee);
    const endpoint = `/api/reviews/self-reviews/${review._id}/attachments`;
    const uploaded = await request(app).post(endpoint).set('Authorization', `Bearer ${ownerToken}`)
      .attach('file', Buffer.from('confidential evidence'), { filename: 'evidence.txt', contentType: 'text/plain' });
    expect(uploaded.status).toBe(201);
    expect(uploaded.body.data.originalName).toBe('evidence.txt');
    const attachmentId = uploaded.body.data._id;
    expect((await request(app).get(endpoint).set('Authorization', `Bearer ${ownerToken}`)).body.data).toHaveLength(1);
    expect((await request(app).get(endpoint).set('Authorization', `Bearer ${outsiderToken}`)).status).toBe(403);
    expect((await request(app).get(`/api/reviews/attachments/${attachmentId}/download`).set('Authorization', `Bearer ${outsiderToken}`)).status).toBe(403);
    const download = await request(app).get(`/api/reviews/attachments/${attachmentId}/download`).set('Authorization', `Bearer ${ownerToken}`);
    expect(download.status).toBe(200);
    expect(download.headers['content-disposition']).toContain('evidence.txt');
  });

  test('goal and development-plan attachments enforce the same authorization', async () => {
    const ownerToken = tokenFor(employee); const outsiderToken = tokenFor(otherEmployee); const adminToken = tokenFor(admin);
    const goal = review.goals[0];
    const goalUpload = await request(app).post(`/api/reviews/self-reviews/${review._id}/goals/${goal._id}/attachments`).set('Authorization', `Bearer ${ownerToken}`)
      .attach('file', Buffer.from('goal proof'), { filename: 'goal.csv', contentType: 'text/csv' });
    expect(goalUpload.status).toBe(201);
    const deniedPlan = await request(app).post(`/api/reviews/development-plans/${plan._id}/attachments`).set('Authorization', `Bearer ${outsiderToken}`)
      .attach('file', Buffer.from('private'), { filename: 'plan.txt', contentType: 'text/plain' });
    expect(deniedPlan.status).toBe(403);
    const adminPlan = await request(app).post(`/api/reviews/development-plans/${plan._id}/attachments`).set('Authorization', `Bearer ${adminToken}`)
      .attach('file', Buffer.from('approved'), { filename: 'plan.txt', contentType: 'text/plain' });
    expect(adminPlan.status).toBe(201);
    expect((await request(app).delete(`/api/reviews/attachments/${adminPlan.body.data._id}`).set('Authorization', `Bearer ${ownerToken}`)).status).toBe(403);
    expect((await request(app).delete(`/api/reviews/attachments/${adminPlan.body.data._id}`).set('Authorization', `Bearer ${adminToken}`)).status).toBe(200);
  });
});
