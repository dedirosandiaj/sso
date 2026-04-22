require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const pool = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';
const USERS_TABLE = process.env.DB_TABLE || 'Users';
const CORS_ORIGIN = process.env.CORS_ORIGIN;

// Trust proxy (required for rate limiting behind Coolify / reverse proxy)
app.set('trust proxy', 1);

// Security headers
app.use(helmet());

// CORS configuration
const corsOptions = {};
if (CORS_ORIGIN) {
  corsOptions.origin = CORS_ORIGIN.split(',').map((o) => o.trim());
} else {
  corsOptions.origin = true; // Allow all if not configured
}
app.use(cors(corsOptions));

app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// General rate limiter for all routes
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests, please try again later.' },
});
app.use(generalLimiter);

// Strict rate limiter for login attempts
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // limit each IP to 10 login attempts per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many login attempts, please try again after 15 minutes.' },
});

// Middleware to verify JWT token
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ success: false, message: 'Access token is required' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ success: false, message: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
};

// Helper to handle validation errors
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation error',
      errors: errors.array().map((e) => ({ field: e.path, message: e.msg })),
    });
  }
  next();
};

// ===========================
// LOGIN API
// ===========================
app.post(
  '/api/auth/login',
  loginLimiter,
  [
    body('email').optional().isEmail().normalizeEmail().withMessage('Invalid email format'),
    body('username').optional().trim().escape(),
    body('password').notEmpty().withMessage('Password is required').isLength({ max: 128 }).withMessage('Password too long'),
    handleValidationErrors,
  ],
  async (req, res) => {
    try {
      const { email, username, password } = req.body;

      if (!email && !username) {
        return res.status(400).json({ success: false, message: 'Email or username is required' });
      }

      // Build query based on provided identifier
      let query;
      let queryParams;

      if (email) {
        query = `SELECT * FROM "${USERS_TABLE}" WHERE email = $1 LIMIT 1`;
        queryParams = [email];
      } else {
        query = `SELECT * FROM "${USERS_TABLE}" WHERE name = $1 LIMIT 1`;
        queryParams = [username];
      }

      const result = await pool.query(query, queryParams);

      if (result.rows.length === 0) {
        return res.status(401).json({ success: false, message: 'Invalid credentials' });
      }

      const user = result.rows[0];
      const storedPassword = user.password;

      if (!storedPassword) {
        return res.status(500).json({ success: false, message: 'Password field not found in user record' });
      }

      // Only accept bcrypt hashed passwords
      if (!storedPassword.startsWith('$2')) {
        console.error('Password is not bcrypt hashed for user:', user.email || user.name);
        return res.status(500).json({ success: false, message: 'Invalid password format' });
      }

      const isMatch = await bcrypt.compare(password, storedPassword);

      if (!isMatch) {
        return res.status(401).json({ success: false, message: 'Invalid credentials' });
      }

      // Generate JWT token
      const tokenPayload = {
        user_id: user.id || user.user_id || user.uuid,
        email: user.email,
        name: user.name,
      };

      const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

      // Remove sensitive data before returning
      const { password: _, ...userWithoutPassword } = user;

      return res.json({
        success: true,
        message: 'Login successful',
        data: {
          token,
          token_type: 'Bearer',
          expires_in: JWT_EXPIRES_IN,
          user: userWithoutPassword,
        },
      });
    } catch (error) {
      console.error('Login error:', error.message);
      return res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }
);

// ===========================
// GET CURRENT USER (Protected)
// ===========================
app.get('/api/auth/me', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.user_id;

    const query = `SELECT * FROM "${USERS_TABLE}" WHERE id = $1 LIMIT 1`;
    const result = await pool.query(query, [userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const user = result.rows[0];
    const { password: _, ...userWithoutPassword } = user;

    return res.json({
      success: true,
      data: userWithoutPassword,
    });
  } catch (error) {
    console.error('Get user error:', error.message);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// ===========================
// VERIFY TOKEN
// ===========================
app.post('/api/auth/verify', async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ success: false, message: 'Token is required' });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    return res.json({ success: true, data: decoded });
  } catch (error) {
    return res.status(403).json({ success: false, message: 'Invalid or expired token' });
  }
});

// ===========================
// HEALTH CHECK
// ===========================
app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT NOW()');
    return res.json({ success: true, message: 'API is running', database: 'connected', timestamp: new Date().toISOString() });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Database connection failed', error: error.message });
  }
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'SSO Login API',
    endpoints: {
      login: 'POST /api/auth/login',
      me: 'GET /api/auth/me (Header: Authorization: Bearer <token>)',
      verify: 'POST /api/auth/verify',
      health: 'GET /api/health',
    },
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ success: false, message: 'Something went wrong!' });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`API endpoints:`);
  console.log(`  POST http://localhost:${PORT}/api/auth/login`);
  console.log(`  GET  http://localhost:${PORT}/api/auth/me`);
  console.log(`  POST http://localhost:${PORT}/api/auth/verify`);
  console.log(`  GET  http://localhost:${PORT}/api/health`);
});
