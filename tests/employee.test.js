const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../index');
const User = require('../models/User');
const Employee = require('../models/Employee');
const Department = require('../models/Department');

let adminToken = '';
let managerToken = '';
let employeeToken = '';

let managerEmployeeId = '';
let directReportEmployeeId = '';
let otherEmployeeId = '';

const ADMIN_EMAIL = `admin_${Date.now()}@demo.com`;
const MGR_EMAIL = `mgr_${Date.now()}@demo.com`;
const EMP_EMAIL = `emp_${Date.now()}@demo.com`;
const OTHER_EMP_EMAIL = `other_${Date.now()}@demo.com`;

beforeAll(async () => {
  process.env.NODE_ENV = 'test';
  if (mongoose.connection.readyState === 0 && process.env.MONGO_URI) {
    await mongoose.connect(process.env.MONGO_URI);
  }

  // 1. Create Admin
  const adminRes = await request(app).post('/api/v1/auth/register').send({
    name: 'Admin User',
    email: ADMIN_EMAIL,
    password: 'Password123',
    role: 'SUPER_ADMIN',
  });
  adminToken = adminRes.body.data.accessToken;

  // 2. Create Manager
  const mgrRes = await request(app).post('/api/v1/auth/register').send({
    name: 'Manager User',
    email: MGR_EMAIL,
    password: 'Password123',
    role: 'MANAGER',
  });
  managerToken = mgrRes.body.data.accessToken;

  // 3. Create Direct Report Employee
  const empRes = await request(app).post('/api/v1/auth/register').send({
    name: 'Direct Report User',
    email: EMP_EMAIL,
    password: 'Password123',
    role: 'EMPLOYEE',
  });
  employeeToken = empRes.body.data.accessToken;

  // 4. Create Other Employee
  const otherRes = await request(app).post('/api/v1/auth/register').send({
    name: 'Other Dept User',
    email: OTHER_EMP_EMAIL,
    password: 'Password123',
    role: 'EMPLOYEE',
  });
}, 60000);

afterAll(async () => {
  if (mongoose.connection.readyState !== 0) {
    await User.deleteMany({ email: { $in: [ADMIN_EMAIL, MGR_EMAIL, EMP_EMAIL, OTHER_EMP_EMAIL] } });
    await Employee.deleteMany({ employeeCode: { $regex: /^TEST-/ } });
    await mongoose.disconnect();
  }
}, 60000);

describe('Phase 2: Organization & Employees Endpoints', () => {
  test('GET /api/v1/organization returns structure with departments', async () => {
    const res = await request(app)
      .get('/api/v1/organization')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.departments).toBeInstanceOf(Array);
    expect(res.body.data.jobTitles).toBeInstanceOf(Array);
    expect(res.body.data.locations).toBeInstanceOf(Array);
  });

  test('POST /api/v1/organization/departments creates a department', async () => {
    const res = await request(app)
      .post('/api/v1/organization/departments')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Cybersecurity',
        code: `SEC_${Date.now()}`,
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.name).toBe('Cybersecurity');
  });

  test('GET /api/v1/employees/me initializes and returns employee profile', async () => {
    const res = await request(app)
      .get('/api/v1/employees/me')
      .set('Authorization', `Bearer ${managerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.employee.employeeCode).toBeDefined();
    managerEmployeeId = res.body.data.employee._id;
  });

  test('POST /api/v1/employees assigns manager to an employee', async () => {
    const user = await User.findOne({ email: EMP_EMAIL });
    const res = await request(app)
      .post('/api/v1/employees')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        userId: user._id,
        employeeCode: `TEST-REP-${Date.now()}`,
        managerId: managerEmployeeId,
        employmentStatus: 'FULL_TIME',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.manager).toBeDefined();
    directReportEmployeeId = res.body.data._id;
  });

  test('POST /api/v1/employees creates other employee without manager', async () => {
    const user = await User.findOne({ email: OTHER_EMP_EMAIL });
    const res = await request(app)
      .post('/api/v1/employees')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        userId: user._id,
        employeeCode: `TEST-OTH-${Date.now()}`,
        employmentStatus: 'FULL_TIME',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    otherEmployeeId = res.body.data._id;
  });

  test('GET /api/v1/employees/direct-reports returns manager direct reports', async () => {
    const res = await request(app)
      .get('/api/v1/employees/direct-reports')
      .set('Authorization', `Bearer ${managerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0]._id).toBe(directReportEmployeeId);
  });

  test('GET /api/v1/employees scopes manager visibility to direct reports only', async () => {
    const res = await request(app)
      .get('/api/v1/employees')
      .set('Authorization', `Bearer ${managerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    // Manager only sees their 1 direct report, NOT otherEmployeeId
    const returnedIds = res.body.data.employees.map((e) => e._id);
    expect(returnedIds).toContain(directReportEmployeeId);
    expect(returnedIds).not.toContain(otherEmployeeId);
  });

  test('GET /api/v1/employees/:id blocks manager from accessing non-direct report', async () => {
    const res = await request(app)
      .get(`/api/v1/employees/${otherEmployeeId}`)
      .set('Authorization', `Bearer ${managerToken}`);

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  test('PUT /api/v1/employees/:id updates employee status', async () => {
    const res = await request(app)
      .put(`/api/v1/employees/${directReportEmployeeId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        employmentStatus: 'CONTRACT',
        phoneNumber: '+1-555-0199',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.employmentStatus).toBe('CONTRACT');
    expect(res.body.data.phoneNumber).toBe('+1-555-0199');
  });
});

