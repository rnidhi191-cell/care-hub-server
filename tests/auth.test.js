const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../index');
const User = require('../models/User');

const TEST_EMAIL = `test_${Date.now()}@demo.com`;
const TEST_PASS = 'TestPass123';
let accessToken = '';
let refreshToken = '';

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  if (mongoose.connection.readyState === 0 && process.env.MONGO_URI) {
    await mongoose.connect(process.env.MONGO_URI);
  }
});

afterAll(async () => {
  if (mongoose.connection.readyState !== 0) {
    await User.deleteMany({ email: TEST_EMAIL });
    await mongoose.disconnect();
  }
});

describe('Phase 1: Foundation & Authentication Endpoints', () => {
  test('GET /api/health returns 200 with service status', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('UP');
  });

  test('POST /api/v1/auth/register creates user and returns dual tokens', async () => {
    const res = await request(app).post('/api/v1/auth/register').send({
      name: 'Integration Tester',
      email: TEST_EMAIL,
      password: TEST_PASS,
      role: 'SUPER_ADMIN',
    });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.accessToken).toBeDefined();
    expect(res.body.data.refreshToken).toBeDefined();
    expect(res.body.data.user.email).toBe(TEST_EMAIL);
    expect(res.body.data.user.role).toBe('SUPER_ADMIN');
    expect(res.body.data.user.permissions).toBeInstanceOf(Array);
  });

  test('POST /api/v1/auth/login authenticates valid user', async () => {
    const res = await request(app).post('/api/v1/auth/login').send({
      email: TEST_EMAIL,
      password: TEST_PASS,
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    accessToken = res.body.data.accessToken;
    refreshToken = res.body.data.refreshToken;
    expect(accessToken).toBeDefined();
    expect(refreshToken).toBeDefined();
  });

  test('POST /api/v1/auth/refresh rotates refresh token', async () => {
    const res = await request(app).post('/api/v1/auth/refresh').send({
      refreshToken,
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.accessToken).toBeDefined();
    expect(res.body.data.refreshToken).toBeDefined();
    expect(res.body.data.refreshToken).not.toBe(refreshToken); // Token rotated

    // Update tokens for subsequent tests
    accessToken = res.body.data.accessToken;
    refreshToken = res.body.data.refreshToken;
  });

  test('GET /api/v1/auth/me returns authenticated profile with permissions', async () => {
    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.email).toBe(TEST_EMAIL);
    expect(res.body.data.user.permissions.length).toBeGreaterThan(0);
  });

  test('GET /api/v1/auth/me rejects request without Bearer token', async () => {
    const res = await request(app).get('/api/v1/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  test('POST /api/v1/auth/change-password updates password', async () => {
    const NEW_PASS = 'NewSecretPass123';
    const res = await request(app)
      .post('/api/v1/auth/change-password')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        currentPassword: TEST_PASS,
        newPassword: NEW_PASS,
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // Verify login with new password
    const loginRes = await request(app).post('/api/v1/auth/login').send({
      email: TEST_EMAIL,
      password: NEW_PASS,
    });
    expect(loginRes.status).toBe(200);
  });
});

