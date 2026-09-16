const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

const PERMISSIONS = [
  // Reviews
  { name: 'review:create', category: 'review', description: 'Create review cycles and self-reviews' },
  { name: 'review:view', category: 'review', description: 'View assigned or accessible reviews' },
  { name: 'review:update', category: 'review', description: 'Update review details' },
  { name: 'review:submit', category: 'review', description: 'Submit self-review or manager review' },
  { name: 'review:validate', category: 'review', description: 'Validate reviews as HR' },
  { name: 'review:calibrate', category: 'review', description: 'Calibrate ratings' },
  { name: 'review:finalize', category: 'review', description: 'Finalize ratings and score breakdown' },

  // Employees
  { name: 'employee:view', category: 'employee', description: 'View employee profiles' },
  { name: 'employee:create', category: 'employee', description: 'Add new employee' },
  { name: 'employee:update', category: 'employee', description: 'Update employee details' },
  { name: 'employee:delete', category: 'employee', description: 'Deactivate or delete employee' },

  // Goals
  { name: 'goal:view', category: 'goal', description: 'View performance and development goals' },
  { name: 'goal:create', category: 'goal', description: 'Create new goals' },
  { name: 'goal:update', category: 'goal', description: 'Update or assess goals' },
  { name: 'goal:delete', category: 'goal', description: 'Delete goals' },

  // Development Plans
  { name: 'development:view', category: 'development', description: 'View development plans' },
  { name: 'development:create', category: 'development', description: 'Create development plan' },
  { name: 'development:update', category: 'development', description: 'Update development plan progress' },

  // Reports & Audit
  { name: 'report:view', category: 'report', description: 'View analytics and reports' },
  { name: 'report:export', category: 'report', description: 'Export reports to CSV/PDF' },
  { name: 'audit:view', category: 'audit', description: 'View audit activity logs' },
];

const ROLES = {
  SUPER_ADMIN: {
    description: 'Full platform administrative access',
    permissions: PERMISSIONS.map((p) => p.name),
  },
  HR_ADMIN: {
    description: 'Human Resources executive administrator',
    permissions: [
      'review:create', 'review:view', 'review:update', 'review:validate', 'review:calibrate', 'review:finalize',
      'employee:view', 'employee:create', 'employee:update', 'employee:delete',
      'goal:view', 'goal:create', 'goal:update', 'goal:delete',
      'development:view', 'development:create', 'development:update',
      'report:view', 'report:export', 'audit:view'
    ],
  },
  HR_HRBP: {
    description: 'HR Business Partner with division validation access',
    permissions: [
      'review:view', 'review:update', 'review:validate', 'review:calibrate',
      'employee:view', 'employee:update',
      'goal:view', 'goal:update',
      'development:view', 'development:create', 'development:update',
      'report:view', 'report:export'
    ],
  },
  MANAGER: {
    description: 'Team lead / manager assessing direct reports',
    permissions: [
      'review:view', 'review:submit', 'review:update',
      'employee:view',
      'goal:view', 'goal:create', 'goal:update',
      'development:view', 'development:update',
      'report:view'
    ],
  },
  EMPLOYEE: {
    description: 'Individual contributor participating in CARE review',
    permissions: [
      'review:view', 'review:create', 'review:submit',
      'goal:view', 'goal:create', 'goal:update',
      'development:view', 'development:update'
    ],
  },
  VIEWER: {
    description: 'Read-only stakeholder access',
    permissions: ['review:view', 'employee:view', 'goal:view', 'report:view'],
  },
};

async function main() {
  console.log('Seeding CARE Enterprise database...');

  // 1. Seed Permissions
  console.log('1. Seeding permissions...');
  for (const perm of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { name: perm.name },
      update: { description: perm.description, category: perm.category },
      create: perm,
    });
  }

  // 2. Seed Roles and map permissions
  console.log('2. Seeding roles...');
  for (const [roleName, roleData] of Object.entries(ROLES)) {
    const role = await prisma.role.upsert({
      where: { name: roleName },
      update: { description: roleData.description, isSystem: true },
      create: { name: roleName, description: roleData.description, isSystem: true },
    });

    for (const permName of roleData.permissions) {
      const permission = await prisma.permission.findUnique({ where: { name: permName } });
      if (permission) {
        await prisma.rolePermission.upsert({
          where: {
            roleId_permissionId: {
              roleId: role.id,
              permissionId: permission.id,
            },
          },
          update: {},
          create: {
            roleId: role.id,
            permissionId: permission.id,
          },
        });
      }
    }
  }

  // 3. Seed Organization & Departments
  console.log('3. Seeding organization & departments...');
  const org = await prisma.organization.upsert({
    where: { code: 'CARE_DEMO' },
    update: {},
    create: {
      name: 'CARE Demo Corporation',
      code: 'CARE_DEMO',
      description: 'Global Demo Workspace for CARE Framework',
    },
  });

  const depts = [
    { name: 'Engineering', code: 'ENG' },
    { name: 'Human Resources', code: 'HR' },
    { name: 'Finance', code: 'FIN' },
    { name: 'Sales', code: 'SALES' },
    { name: 'Operations', code: 'OPS' },
    { name: 'Marketing', code: 'MKTG' },
  ];

  for (const d of depts) {
    await prisma.department.upsert({
      where: { organizationId_code: { organizationId: org.id, code: d.code } },
      update: {},
      create: { organizationId: org.id, name: d.name, code: d.code },
    });
  }

  // 4. Seed Demo Users
  console.log('4. Seeding demo users...');
  const defaultPasswordHash = await bcrypt.hash('Demo123456', 10);

  const demoUsers = [
    { email: 'admin@demo.com', name: 'Alice Admin', role: 'SUPER_ADMIN', code: 'EMP-001' },
    { email: 'hr@demo.com', name: 'Hannah HR', role: 'HR_ADMIN', code: 'EMP-002' },
    { email: 'manager@demo.com', name: 'Mark Manager', role: 'MANAGER', code: 'EMP-003' },
    { email: 'employee@demo.com', name: 'Eric Employee', role: 'EMPLOYEE', code: 'EMP-004' },
  ];

  for (const u of demoUsers) {
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: { name: u.name, status: 'ACTIVE' },
      create: {
        email: u.email,
        name: u.name,
        passwordHash: defaultPasswordHash,
        status: 'ACTIVE',
      },
    });

    const role = await prisma.role.findUnique({ where: { name: u.role } });
    if (role) {
      await prisma.userRole.upsert({
        where: { userId_roleId: { userId: user.id, roleId: role.id } },
        update: {},
        create: { userId: user.id, roleId: role.id },
      });
    }

    await prisma.employee.upsert({
      where: { userId: user.id },
      update: {},
      create: {
        userId: user.id,
        organizationId: org.id,
        employeeCode: u.code,
        joiningDate: new Date('2024-01-15'),
      },
    });
  }

  console.log('Seeding completed successfully!');
}

main()
  .catch((e) => {
    console.error('Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

