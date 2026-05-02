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
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '15m';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;
const JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || '7d';
const USERS_TABLE = 'users';
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
const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ success: false, message: 'Access token is required' });
  }

  try {
    // Check if token is blacklisted
    const blacklistQuery = `SELECT id FROM token_blacklist WHERE token = $1 LIMIT 1`;
    const blacklistResult = await pool.query(blacklistQuery, [token]);

    if (blacklistResult.rows.length > 0) {
      return res.status(401).json({ success: false, message: 'Token has been revoked (logged out)' });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
      if (err) {
        return res.status(403).json({ success: false, message: 'Invalid or expired token' });
      }
      req.user = user;
      req.token = token; // Save token for logout route
      next();
    });
  } catch (error) {
    console.error('Auth middleware error:', error.message);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// Middleware to authorize roles
const authorizeRole = (roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Access denied: Insufficient permissions' });
    }
    next();
  };
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
// CREATE USER (Protected: Admin Only)
// ===========================
app.post(
  '/api/users',
  authenticateToken,
  authorizeRole(['admin', 'superadmin']),
  [
    body('name').notEmpty().withMessage('Name is required').trim().escape(),
    body('username').notEmpty().withMessage('Username is required').trim().escape(),
    body('email').notEmpty().withMessage('Email is required').isEmail().withMessage('Invalid email format').normalizeEmail(),
    body('password')
      .isStrongPassword({
        minLength: 8,
        minLowercase: 1,
        minUppercase: 1,
        minNumbers: 1,
        minSymbols: 1,
      })
      .withMessage('Password must be at least 8 characters long and contain at least one uppercase letter, one number, and one symbol'),
    body('role').optional().trim().escape(),
    handleValidationErrors,
  ],
  async (req, res) => {
    try {
      const { name, username, email, password, role } = req.body;
      const userRole = role || 'user'; // default role

      // Hierarchical Role Check: Only superadmin can create other superadmins
      if (userRole === 'superadmin' && req.user.role !== 'superadmin') {
        return res.status(403).json({ success: false, message: 'Only superadmin can create superadmin accounts' });
      }

      // Check if user already exists
      const checkUserQuery = `SELECT id FROM "${USERS_TABLE}" WHERE username = $1 LIMIT 1`;
      const checkResult = await pool.query(checkUserQuery, [username]);

      if (checkResult.rows.length > 0) {
        return res.status(400).json({ success: false, message: 'Username already in use' });
      }

      // Hash password
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(password, salt);

      // Insert new user with default status = false
      const insertQuery = `
        INSERT INTO "${USERS_TABLE}" (name, username, email, password, role, status)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id, name, username, email, role, status, created_at
      `;
      const insertResult = await pool.query(insertQuery, [name, username, email, hashedPassword, userRole, false]);
      const newUser = insertResult.rows[0];

      return res.status(201).json({
        success: true,
        message: 'User created successfully',
        data: newUser,
      });
    } catch (error) {
      console.error('Registration error:', error.message);
      return res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }
);

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
        query = `SELECT * FROM "${USERS_TABLE}" WHERE username = $1 LIMIT 1`;
        queryParams = [username];
      }

      const result = await pool.query(query, queryParams);

      if (result.rows.length === 0) {
        return res.status(401).json({ success: false, message: 'Invalid credentials' });
      }

      const user = result.rows[0];

      // --- Account Status Check ---
      if (user.status !== true) {
        return res.status(403).json({ success: false, message: 'Your account is inactive. Please contact administrator.' });
      }

      // --- Account Lockout Check ---
      if (user.locked_until && new Date(user.locked_until) > new Date()) {
        return res.status(403).json({ success: false, message: 'Account is temporarily locked. Try again later.' });
      }

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
        // --- Handle Failed Attempt ---
        let failedAttempts = (user.failed_login_attempts || 0) + 1;
        let lockedUntilQuery = '';
        let queryParams = [failedAttempts, user.id];
        
        if (failedAttempts >= 5) {
          lockedUntilQuery = `, locked_until = NOW() + INTERVAL '15 minutes'`;
        }

        await pool.query(`UPDATE "${USERS_TABLE}" SET failed_login_attempts = $1 ${lockedUntilQuery} WHERE id = $2`, queryParams);

        return res.status(401).json({ success: false, message: 'Invalid credentials' });
      }

      // --- Reset Failed Attempts ---
      if (user.failed_login_attempts > 0 || user.locked_until) {
        await pool.query(`UPDATE "${USERS_TABLE}" SET failed_login_attempts = 0, locked_until = NULL WHERE id = $1`, [user.id]);
      }

      // Generate JWT Access token
      const tokenPayload = {
        user_id: user.id || user.user_id || user.uuid,
        email: user.email,
        name: user.name,
        role: user.role,
      };

      const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
      
      // Generate Refresh Token
      const refreshToken = jwt.sign(tokenPayload, JWT_REFRESH_SECRET, { expiresIn: JWT_REFRESH_EXPIRES_IN });
      
      // Save refresh token to DB
      const decodedRefresh = jwt.decode(refreshToken);
      const refreshExpiresAt = new Date(decodedRefresh.exp * 1000);
      await pool.query(
        `INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)`,
        [user.id, refreshToken, refreshExpiresAt]
      );

      // Remove sensitive data before returning
      const { password: _, failed_login_attempts, locked_until, ...userWithoutPassword } = user;

      return res.json({
        success: true,
        message: 'Login successful',
        data: {
          token,
          refreshToken,
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
// LIST USERS (Protected: Admin Only)
// ===========================
app.get('/api/users', authenticateToken, authorizeRole(['admin', 'superadmin']), async (req, res) => {
  try {
    const query = `SELECT id, name, username, email, role, status, image, created_at FROM "${USERS_TABLE}" ORDER BY created_at DESC`;
    const result = await pool.query(query);

    return res.json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    console.error('List users error:', error.message);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// ===========================
// EDIT USER (Protected: Admin Only)
// ===========================
app.put(
  '/api/users/:id',
  authenticateToken,
  authorizeRole(['admin', 'superadmin']),
  [
    body('name').optional().trim().escape(),
    body('username').optional().trim().escape(),
    body('email').optional().isEmail().normalizeEmail().withMessage('Invalid email format'),
    body('role').optional().trim().escape(),
    body('status').optional().isBoolean().withMessage('Status must be a boolean'),
    body('image').optional().trim(),
    handleValidationErrors,
  ],
  async (req, res) => {
    try {
      const { id } = req.params;
      const { name, username, email, role, status, image } = req.body;

      // Check if user exists
      const checkUser = await pool.query(`SELECT id, role FROM "${USERS_TABLE}" WHERE id = $1`, [id]);
      if (checkUser.rows.length === 0) {
        return res.status(404).json({ success: false, message: 'User not found' });
      }

      const targetUser = checkUser.rows[0];

      // Hierarchical Role Check: Non-superadmin cannot edit a superadmin or promote someone to superadmin
      if (req.user.role !== 'superadmin') {
        if (targetUser.role === 'superadmin') {
          return res.status(403).json({ success: false, message: 'Insufficient permissions to edit a superadmin' });
        }
        if (role === 'superadmin') {
          return res.status(403).json({ success: false, message: 'Only superadmin can promote users to superadmin role' });
        }
      }

      // Build update query dynamically
      const updates = [];
      const values = [];
      let paramIdx = 1;

      if (name !== undefined) { updates.push(`name = $${paramIdx++}`); values.push(name); }
      if (username !== undefined) { updates.push(`username = $${paramIdx++}`); values.push(username); }
      if (email !== undefined) { updates.push(`email = $${paramIdx++}`); values.push(email); }
      if (role !== undefined) { updates.push(`role = $${paramIdx++}`); values.push(role); }
      if (status !== undefined) { updates.push(`status = $${paramIdx++}`); values.push(status); }
      if (image !== undefined) { updates.push(`image = $${paramIdx++}`); values.push(image); }

      if (updates.length === 0) {
        return res.status(400).json({ success: false, message: 'No fields to update' });
      }

      values.push(id);
      const query = `
        UPDATE "${USERS_TABLE}" 
        SET ${updates.join(', ')} 
        WHERE id = $${paramIdx} 
        RETURNING id, name, username, email, role, status, image, created_at
      `;

      const result = await pool.query(query, values);

      return res.json({
        success: true,
        message: 'User updated successfully',
        data: result.rows[0],
      });
    } catch (error) {
      if (error.code === '23505') {
        return res.status(400).json({ success: false, message: 'Username or email already in use' });
      }
      console.error('Edit user error:', error.message);
      return res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }
);

// ===========================
// DELETE USER (Protected: Admin Only)
// ===========================
app.delete('/api/users/:id', authenticateToken, authorizeRole(['admin', 'superadmin']), async (req, res) => {
  try {
    const { id } = req.params;

    // Prevent user from deleting themselves (optional safety check)
    if (req.user.user_id === id) {
      return res.status(400).json({ success: false, message: 'You cannot delete your own account' });
    }

    // Check target user role for hierarchy protection
    const checkQuery = `SELECT role FROM "${USERS_TABLE}" WHERE id = $1`;
    const checkRes = await pool.query(checkQuery, [id]);
    
    if (checkRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const targetUser = checkRes.rows[0];
    if (targetUser.role === 'superadmin' && req.user.role !== 'superadmin') {
      return res.status(403).json({ success: false, message: 'Insufficient permissions to delete a superadmin' });
    }

    const deleteQuery = `DELETE FROM "${USERS_TABLE}" WHERE id = $1 RETURNING id, username`;
    const result = await pool.query(deleteQuery, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    return res.json({
      success: true,
      message: 'User deleted successfully',
      data: result.rows[0],
    });
  } catch (error) {
    console.error('Delete user error:', error.message);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// ===========================
// LOGOUT API
// ===========================
app.post('/api/auth/logout', authenticateToken, async (req, res) => {
  try {
    const token = req.token;
    const { refreshToken } = req.body;
    
    // We can extract expiration from the token to know when it can be safely deleted from DB
    const decoded = jwt.decode(token);
    const expiresAt = new Date(decoded.exp * 1000);

    const insertQuery = `INSERT INTO token_blacklist (token, expires_at) VALUES ($1, $2)`;
    await pool.query(insertQuery, [token, expiresAt]);

    if (refreshToken) {
      await pool.query(`DELETE FROM refresh_tokens WHERE token = $1`, [refreshToken]);
    }

    return res.json({ success: true, message: 'Logged out successfully' });
  } catch (error) {
    // If token is already blacklisted (unique constraint), it's fine
    if (error.code === '23505') {
       return res.json({ success: true, message: 'Already logged out' });
    }
    console.error('Logout error:', error.message);
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
// REFRESH TOKEN API
// ===========================
app.post('/api/auth/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(400).json({ success: false, message: 'Refresh token is required' });
    }

    // Verify token
    jwt.verify(refreshToken, JWT_REFRESH_SECRET, async (err, decoded) => {
      if (err) {
        return res.status(403).json({ success: false, message: 'Invalid or expired refresh token' });
      }

      // Check if it exists in DB
      const result = await pool.query('SELECT * FROM refresh_tokens WHERE token = $1 LIMIT 1', [refreshToken]);
      if (result.rows.length === 0) {
        return res.status(403).json({ success: false, message: 'Refresh token not found or revoked' });
      }

      // Generate new access token
      const tokenPayload = {
        user_id: decoded.user_id,
        email: decoded.email,
        name: decoded.name,
        role: decoded.role,
      };

      const newToken = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

      return res.json({
        success: true,
        message: 'Token refreshed successfully',
        data: {
          token: newToken,
          token_type: 'Bearer',
          expires_in: JWT_EXPIRES_IN
        }
      });
    });
  } catch (error) {
    console.error('Refresh token error:', error.message);
    return res.status(500).json({ success: false, message: 'Internal server error' });
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
      user_create: 'POST /api/users (Header: Authorization: Bearer <token>)',
      login: 'POST /api/auth/login',
      refresh: 'POST /api/auth/refresh',
      logout: 'POST /api/auth/logout (Header: Authorization: Bearer <token>)',
      me: 'GET /api/auth/me (Header: Authorization: Bearer <token>)',
      users_list: 'GET /api/users (Header: Authorization: Bearer <token>)',
      users_edit: 'PUT /api/users/:id (Header: Authorization: Bearer <token>)',
      users_delete: 'DELETE /api/users/:id (Header: Authorization: Bearer <token>)',
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
  console.log(`  POST http://localhost:${PORT}/api/users`);
  console.log(`  POST http://localhost:${PORT}/api/auth/login`);
  console.log(`  POST http://localhost:${PORT}/api/auth/refresh`);
  console.log(`  POST http://localhost:${PORT}/api/auth/logout`);
  console.log(`  GET  http://localhost:${PORT}/api/auth/me`);
  console.log(`  GET  http://localhost:${PORT}/api/users`);
  console.log(`  PUT  http://localhost:${PORT}/api/users/:id`);
  console.log(`  DELETE http://localhost:${PORT}/api/users/:id`);
  console.log(`  POST http://localhost:${PORT}/api/auth/verify`);
  console.log(`  GET  http://localhost:${PORT}/api/health`);
});
