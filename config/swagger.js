const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'CARE Employee Performance & Growth Management API',
      version: '1.0.0',
      description: `
The CARE API implements an end-to-end performance and growth management system based on the **CARE** framework:
- **C**ontribute: Direct organizational impact
- **A**chieve: Milestone attainment & goals
- **R**eflect: Roadblocks, lessons, and challenges
- **E**volve: Forward-looking personal development

Includes role-based access control (RBAC), multi-stage workflow, and audit logging.
      `,
      contact: {
        name: 'CARE Hub Engineering',
        email: 'engineering@carehub.internal',
      },
    },
    servers: [
      {
        url: 'http://localhost:5000/api/v1',
        description: 'Development Server (v1)',
      },
      {
        url: 'http://localhost:5000/api',
        description: 'Legacy Base URL',
      },
    ],
    components: {
      securitySchemes: {
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Provide JWT Access Token in standard format: Bearer <token>',
        },
      },
      schemas: {
        ApiResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' },
            data: { type: 'object' },
          },
        },
        ApiError: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            error: {
              type: 'object',
              properties: {
                code: { type: 'string', example: 'VALIDATION_ERROR' },
                message: { type: 'string', example: 'Invalid request' },
                details: { type: 'object' },
              },
            },
          },
        },
        User: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            email: { type: 'string' },
            role: {
              type: 'string',
              enum: ['SUPER_ADMIN', 'HR_ADMIN', 'HR_HRBP', 'MANAGER', 'EMPLOYEE', 'VIEWER'],
            },
            status: { type: 'string', enum: ['active', 'inactive', 'suspended'] },
            permissions: {
              type: 'array',
              items: { type: 'string' },
            },
          },
        },
      },
    },
    paths: {
      '/auth/login': {
        post: {
          summary: 'User Login',
          tags: ['Authentication'],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['email', 'password'],
                  properties: {
                    email: { type: 'string', example: 'admin@demo.com' },
                    password: { type: 'string', example: 'Demo123456' },
                  },
                },
              },
            },
          },
          responses: {
            200: {
              description: 'Successful authentication returning access & refresh tokens',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ApiResponse' },
                },
              },
            },
            401: {
              description: 'Invalid credentials or inactive account',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ApiError' },
                },
              },
            },
          },
        },
      },
      '/auth/register': {
        post: {
          summary: 'Register New Employee Account',
          tags: ['Authentication'],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['name', 'email', 'password'],
                  properties: {
                    name: { type: 'string', example: 'Jane Doe' },
                    email: { type: 'string', example: 'jane@demo.com' },
                    password: { type: 'string', example: 'Demo123456' },
                    role: { type: 'string', example: 'EMPLOYEE' },
                  },
                },
              },
            },
          },
          responses: {
            201: {
              description: 'Account created successfully',
            },
          },
        },
      },
      '/auth/refresh': {
        post: {
          summary: 'Rotate Refresh Token',
          tags: ['Authentication'],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['refreshToken'],
                  properties: {
                    refreshToken: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: 'New token pair issued' },
            401: { description: 'Expired or invalid refresh token' },
            403: { description: 'Token reuse detected' },
          },
        },
      },
      '/auth/me': {
        get: {
          summary: 'Get Current User Profile & Permissions',
          tags: ['Authentication'],
          security: [{ BearerAuth: [] }],
          responses: {
            200: {
              description: 'Current user profile with role and permission array',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ApiResponse' },
                },
              },
            },
          },
        },
      },
      '/auth/change-password': {
        post: {
          summary: 'Change User Password',
          tags: ['Authentication'],
          security: [{ BearerAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['currentPassword', 'newPassword'],
                  properties: {
                    currentPassword: { type: 'string' },
                    newPassword: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: 'Password changed successfully' },
            401: { description: 'Current password incorrect' },
          },
        },
      },
      '/auth/forgot-password': {
        post: {
          summary: 'Request Password Reset Link',
          tags: ['Authentication'],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['email'],
                  properties: {
                    email: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: 'Reset instructions dispatched' },
          },
        },
      },
      '/auth/reset-password': {
        post: {
          summary: 'Complete Password Reset with Token',
          tags: ['Authentication'],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['token', 'newPassword'],
                  properties: {
                    token: { type: 'string' },
                    newPassword: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: 'Password reset completed' },
            400: { description: 'Token expired or invalid' },
          },
        },
      },
    },
  },
  apis: [],
};

const swaggerSpec = swaggerJsdoc(options);

module.exports = swaggerSpec;

