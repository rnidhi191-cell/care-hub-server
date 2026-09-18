// CARE Granular Permissions Matrix

const PERMISSIONS = {
  // Review permissions
  REVIEW_CREATE: 'review:create',
  REVIEW_VIEW: 'review:view',
  REVIEW_UPDATE: 'review:update',
  REVIEW_SUBMIT: 'review:submit',
  REVIEW_VALIDATE: 'review:validate',
  REVIEW_CALIBRATE: 'review:calibrate',
  REVIEW_FINALIZE: 'review:finalize',

  // Employee permissions
  EMPLOYEE_VIEW: 'employee:view',
  EMPLOYEE_CREATE: 'employee:create',
  EMPLOYEE_UPDATE: 'employee:update',
  EMPLOYEE_DELETE: 'employee:delete',

  // Goal permissions
  GOAL_VIEW: 'goal:view',
  GOAL_CREATE: 'goal:create',
  GOAL_UPDATE: 'goal:update',
  GOAL_DELETE: 'goal:delete',

  // Development plan permissions
  DEVELOPMENT_VIEW: 'development:view',
  DEVELOPMENT_CREATE: 'development:create',
  DEVELOPMENT_UPDATE: 'development:update',

  // Analytics & Audit
  REPORT_VIEW: 'report:view',
  REPORT_EXPORT: 'report:export',
  AUDIT_VIEW: 'audit:view',
};

const ROLE_PERMISSIONS = {
  ADMIN: Object.values(PERMISSIONS),

  HR: [
    PERMISSIONS.REVIEW_CREATE,
    PERMISSIONS.REVIEW_VIEW,
    PERMISSIONS.REVIEW_UPDATE,
    PERMISSIONS.REVIEW_VALIDATE,
    PERMISSIONS.REVIEW_CALIBRATE,
    PERMISSIONS.REVIEW_FINALIZE,
    PERMISSIONS.EMPLOYEE_VIEW,
    PERMISSIONS.EMPLOYEE_CREATE,
    PERMISSIONS.EMPLOYEE_UPDATE,
    PERMISSIONS.EMPLOYEE_DELETE,
    PERMISSIONS.GOAL_VIEW,
    PERMISSIONS.GOAL_CREATE,
    PERMISSIONS.GOAL_UPDATE,
    PERMISSIONS.GOAL_DELETE,
    PERMISSIONS.DEVELOPMENT_VIEW,
    PERMISSIONS.DEVELOPMENT_CREATE,
    PERMISSIONS.DEVELOPMENT_UPDATE,
    PERMISSIONS.REPORT_VIEW,
    PERMISSIONS.REPORT_EXPORT,
    PERMISSIONS.AUDIT_VIEW,
  ],

  MANAGER: [
    PERMISSIONS.REVIEW_VIEW,
    PERMISSIONS.REVIEW_SUBMIT,
    PERMISSIONS.REVIEW_UPDATE,
    PERMISSIONS.EMPLOYEE_VIEW,
    PERMISSIONS.GOAL_VIEW,
    PERMISSIONS.GOAL_CREATE,
    PERMISSIONS.GOAL_UPDATE,
    PERMISSIONS.DEVELOPMENT_VIEW,
    PERMISSIONS.DEVELOPMENT_UPDATE,
    PERMISSIONS.REPORT_VIEW,
  ],

  EMPLOYEE: [
    PERMISSIONS.REVIEW_VIEW,
    PERMISSIONS.REVIEW_CREATE,
    PERMISSIONS.REVIEW_SUBMIT,
    PERMISSIONS.GOAL_VIEW,
    PERMISSIONS.GOAL_CREATE,
    PERMISSIONS.GOAL_UPDATE,
    PERMISSIONS.DEVELOPMENT_VIEW,
    PERMISSIONS.DEVELOPMENT_UPDATE,
  ],
};

const normalizeRole = (role) => {
  if (!role) return null;
  const upper = role.toUpperCase();
  if (upper === 'ADMIN') return 'ADMIN';
  if (upper === 'HR') return 'HR';
  if (upper === 'MANAGER') return 'MANAGER';
  if (upper === 'EMPLOYEE') return 'EMPLOYEE';
  return null;
};

const getPermissionsForRole = (role) => {
  const norm = normalizeRole(role);
  return ROLE_PERMISSIONS[norm] || [];
};

module.exports = {
  PERMISSIONS,
  ROLE_PERMISSIONS,
  normalizeRole,
  getPermissionsForRole,
};
