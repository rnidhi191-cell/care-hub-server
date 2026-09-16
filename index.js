require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const swaggerUi = require('swagger-ui-express');

const connectDB = require('./config/db');
const swaggerSpec = require('./config/swagger');
const v1AuthRoutes = require('./routes/v1/authRoutes');
const legacyAuthRoutes = require('./routes/authRoutes');
const v1OrganizationRoutes = require('./routes/v1/organizationRoutes');
const v1EmployeeRoutes = require('./routes/v1/employeeRoutes');
const reviewRoutes = require('./routes/reviewRoutes');
const errorHandler = require('./middleware/errorHandler');

const app = express();

// Security Headers with Helmet
app.use(
  helmet({
    contentSecurityPolicy: false, // Allows Swagger UI to render assets cleanly
  })
);

// HTTP Request Logging
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('dev'));
}

// Rate Limiting (100 requests per 15 min window per IP for standard API routes)
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'test' ? 1000 : 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests from this IP, please try again later.',
    },
  },
});

app.use('/api', apiLimiter);

// CORS configuration
const allowedOrigins = [
  process.env.CLIENT_URL,
  'http://localhost:5173',
  'http://localhost:3000',
  'http://127.0.0.1:5173',
].filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(null, true); // Dev fallback
    },
    credentials: true,
  })
);

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// Health check endpoint
app.get('/api/health', (_req, res) => {
  res.json({
    success: true,
    data: {
      status: 'UP',
      service: 'CARE Hub API',
      environment: process.env.NODE_ENV || 'development',
      timestamp: new Date().toISOString(),
    },
  });
});

// Swagger / OpenAPI UI documentation
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customSiteTitle: 'CARE API Documentation',
}));

// Route Mounts (v1 and backward-compatible legacy)
app.use('/api/v1/auth', v1AuthRoutes);
app.use('/api/auth', legacyAuthRoutes);

app.use('/api/v1/organization', v1OrganizationRoutes);
app.use('/api/v1/employees', v1EmployeeRoutes);
app.use('/api/employees', v1EmployeeRoutes);

const settingRoutes = require('./routes/settingRoutes');

app.use('/api/v1/reviews', reviewRoutes);
app.use('/api/reviews', reviewRoutes);

app.use('/api/v1/settings', settingRoutes);
app.use('/api/settings', settingRoutes);

// 404 handler
app.use((_req, res) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'ROUTE_NOT_FOUND',
      message: 'The requested API route does not exist',
    },
  });
});

// Global error handler
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  if (!process.env.MONGO_URI || !process.env.JWT_SECRET) {
    throw new Error('MONGO_URI and JWT_SECRET must be set in server/.env');
  }

  await connectDB();
  return app.listen(PORT, () => {
    console.log(`CARE Hub server running on port: ${PORT}`);
    console.log(`Swagger documentation available at http://localhost:${PORT}/api/docs`);
  });
};

if (process.env.NODE_ENV !== 'test') {
  startServer().catch((error) => {
    console.error(`Unable to start server: ${error.message}`);
    process.exit(1);
  });
}

module.exports = app;
