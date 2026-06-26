const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'super-secure-secret-key-change-in-production';

// Security Middleware
app.use(helmet());
app.use(cors({
  origin: 'http://localhost:5173', // Vite default port
  credentials: true
}));
app.use(express.json());
app.use(cookieParser());

// Rate Limiting
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // limit each IP to 20 requests per windowMs for auth routes
  message: { error: 'Too many requests from this IP, please try again later.' }
});

// Validation Helper
const validateEmail = (email) => {
  return String(email)
    .toLowerCase()
    .match(
      /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|.(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/
    );
};

const validatePassword = (password) => {
  // Minimum 8 characters, at least 1 uppercase, 1 lowercase, 1 number, 1 special character
  const regex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
  return regex.test(password);
};

// ==========================================
// AUTHENTICATION ROUTES
// ==========================================

// Register
app.post('/api/auth/register', authLimiter, async (req, res) => {
  const { fullName, username, email, phone, password, confirmPassword, termsAccepted } = req.body;

  // 1. Validate Input
  if (!fullName || !username || !email || !password || !confirmPassword) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  if (!termsAccepted) {
    return res.status(400).json({ error: 'You must accept the Terms and Conditions' });
  }

  if (password !== confirmPassword) {
    return res.status(400).json({ error: 'Passwords do not match' });
  }

  if (!validateEmail(email)) {
    return res.status(400).json({ error: 'Invalid email format' });
  }

  // Username validation: 4-20 chars, letters, numbers, underscore
  if (!/^[a-zA-Z0-9_]{4,20}$/.test(username)) {
    return res.status(400).json({ error: 'Username must be 4-20 characters long and contain only letters, numbers, and underscores' });
  }

  if (!validatePassword(password)) {
    return res.status(400).json({ error: 'Password must be at least 8 characters long, contain 1 uppercase letter, 1 lowercase letter, 1 number, and 1 special character' });
  }

  try {
    // 2. Check if user already exists
    const existingUser = db.prepare('SELECT * FROM users WHERE email = ? OR username = ?').get(email, username);
    if (existingUser) {
      if (existingUser.email === email) {
        return res.status(400).json({ error: 'Email already registered' });
      }
      return res.status(400).json({ error: 'Username already taken' });
    }

    // 3. Hash Password (bcryptjs cost 12)
    const salt = await bcrypt.genSalt(12);
    const passwordHash = await bcrypt.hash(password, salt);

    // 4. Insert User
    const insertStmt = db.prepare(`
      INSERT INTO users (full_name, username, email, password_hash, phone)
      VALUES (?, ?, ?, ?, ?)
    `);
    
    const result = insertStmt.run(fullName, username, email, passwordHash, phone || null);

    // 5. Generate Session Token
    const token = jwt.sign({ userId: result.lastInsertRowid, username }, JWT_SECRET, { expiresIn: '1d' });

    // 6. Set Secure Cookie
    res.cookie('session_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production', // Use secure cookies in production (HTTPS)
      sameSite: 'strict',
      maxAge: 24 * 60 * 60 * 1000 // 1 day
    });

    res.status(201).json({ message: 'Registration successful', userId: result.lastInsertRowid });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Login
app.post('/api/auth/login', authLimiter, async (req, res) => {
  const { usernameOrEmail, password, rememberMe } = req.body;

  if (!usernameOrEmail || !password) {
    return res.status(400).json({ error: 'Username/Email and password are required' });
  }

  try {
    // 1. Retrieve user
    const user = db.prepare('SELECT * FROM users WHERE email = ? OR username = ?').get(usernameOrEmail, usernameOrEmail);
    
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    if (!user.is_active) {
      return res.status(403).json({ error: 'Account is locked. Please contact support or reset password.' });
    }

    // 2. Verify password
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      const attempts = (user.failed_login_attempts || 0) + 1;
      db.prepare('UPDATE users SET failed_login_attempts = ? WHERE id = ?').run(attempts, user.id);
      
      if (attempts >= 5) {
        db.prepare('UPDATE users SET is_active = ? WHERE id = ?').run(false, user.id);
        return res.status(403).json({ error: 'Account locked due to too many failed attempts.' });
      }
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // 3. Reset failed attempts & Update Last Login
    if (user.failed_login_attempts > 0) {
      db.prepare('UPDATE users SET failed_login_attempts = ? WHERE id = ?').run(0, user.id);
    }
    db.prepare('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?').run(user.id);

    // 4. Generate Session Token
    const tokenExp = rememberMe ? '30d' : '1d';
    const cookieAge = rememberMe ? 30 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
    const token = jwt.sign({ userId: user.id, username: user.username }, JWT_SECRET, { expiresIn: tokenExp });

    // 5. Set Secure Cookie
    res.cookie('session_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: cookieAge
    });

    res.json({ message: 'Login successful', user: { id: user.id, username: user.username, fullName: user.full_name } });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Logout
app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('session_token');
  res.json({ message: 'Logged out successfully' });
});

// Forgot Password
app.post('/api/auth/forgot-password', authLimiter, (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email is required' });
  
  const user = db.prepare('SELECT * FROM users WHERE email = ? OR username = ?').get(email, email);
  if (user) {
    // Simulate sending email by printing to console
    const resetToken = require('crypto').randomBytes(32).toString('hex');
    console.log(`\n=================================================`);
    console.log(`[SIMULATED EMAIL] Password reset for: ${user.email}`);
    console.log(`Reset Link: http://localhost:5173/#reset-password?token=${resetToken}`);
    console.log(`=================================================\n`);
  }
  // Always return success to prevent email enumeration
  res.json({ message: 'If an account exists with that email, a password reset link has been sent.' });
});

// ==========================================
// PROTECTED ROUTES
// ==========================================

// Auth Middleware
const requireAuth = (req, res, next) => {
  const token = req.cookies.session_token;
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized: No session token provided' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Unauthorized: Invalid session token' });
  }
};

// Get current user profile
app.get('/api/user/profile', requireAuth, (req, res) => {
  try {
    const user = db.prepare('SELECT id, full_name, username, email, created_at, last_login, role, status FROM users WHERE id = ?').get(req.user.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({ user });
  } catch (error) {
    console.error('Profile error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Save analysis
app.post('/api/analysis', requireAuth, (req, res) => {
  try {
    const { filename, verdictLevel, aiProbability } = req.body;
    
    const insertStmt = db.prepare(`
      INSERT INTO analyses (user_id, filename, verdict_level, ai_probability)
      VALUES (?, ?, ?, ?)
    `);
    
    const result = insertStmt.run(req.user.userId, filename, verdictLevel, aiProbability);
    res.status(201).json({ message: 'Analysis saved', id: result.lastInsertRowid });
  } catch (error) {
    console.error('Save analysis error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get user stats
app.get('/api/user/stats', requireAuth, (req, res) => {
  try {
    const stats = db.prepare('SELECT count, sum(ai), sum(real) FROM analyses WHERE user_id = ?').get(req.user.userId);
    res.json(stats);
  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.listen(PORT, () => {
  console.log(`Backend server running on http://localhost:${PORT}`);
});
