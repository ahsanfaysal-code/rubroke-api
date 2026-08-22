const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { randomBytes } = require('crypto');
const prisma = require('../lib/prisma');
const { authenticateToken } = require('../middleware/auth');
const { verifyTurnstile } = require('../middleware/turnstile');
const { createRateLimiter } = require('../middleware/rateLimit');

// Minimum password length — matches the frontend's current requirement.
const MIN_PASSWORD_LENGTH = 6;

// Auth endpoints are throttled to blunt brute-force / credential-stuffing.
// 10 attempts per 15-minute window per IP is generous for normal users.
const authLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Too many attempts. Please wait a few minutes and try again.',
});

// POST /api/auth/register
router.post('/register', authLimiter, verifyTurnstile, async (req, res) => {
  try {
    const { email, password, name, turnstileToken } = req.body;

    if (!email || !password || !name) {
      return res.status(400).json({ success: false, message: 'All fields are required' });
    }

    if (String(password).length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({ success: false, message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` });
    }

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ success: false, message: 'User already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        name,
      },
    });

    const token = jwt.sign({ id: user.id, email: user.email, name: user.name, role: user.role }, process.env.JWT_SECRET, { expiresIn: '7d' });

    res.json({
      success: true,
      token,
      user: { id: user.id, email: user.email, name: user.name, role: user.role }
    });
  } catch (error) {
    console.error('Registration failed');
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// POST /api/auth/login
router.post('/login', authLimiter, verifyTurnstile, async (req, res) => {
  try {
    const { email, password, turnstileToken } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'All fields are required' });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(400).json({ success: false, message: 'Invalid credentials' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ success: false, message: 'Invalid credentials' });
    }

    const token = jwt.sign({ id: user.id, email: user.email, name: user.name, role: user.role }, process.env.JWT_SECRET, { expiresIn: '7d' });

    res.json({
      success: true,
      token,
      user: { id: user.id, email: user.email, name: user.name, role: user.role }
    });
  } catch (error) {
    console.error('Login failed');
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Google token verification (lazy — only required when GOOGLE_CLIENT_ID is configured).
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
let OAuth2Client = null;
if (GOOGLE_CLIENT_ID) {
  try {
    OAuth2Client = require('google-auth-library').OAuth2Client;
  } catch (e) {
    console.error('google-auth-library is unavailable; Google login is disabled.');
  }
}

// POST /api/auth/google-login
router.post('/google-login', authLimiter, async (req, res) => {
  try {
    const { credential } = req.body;
    if (!credential) return res.status(400).json({ success: false, message: 'Missing credential' });
    if (!GOOGLE_CLIENT_ID || !OAuth2Client) {
      return res.status(503).json({ success: false, message: 'Google login is not configured' });
    }

    // Verify signature and audience against the configured client ID.
    const client = new OAuth2Client(GOOGLE_CLIENT_ID);
    const ticket = await client.verifyIdToken({ idToken: credential, audience: GOOGLE_CLIENT_ID });
    const payload = ticket.getPayload();

    const email = payload.email;
    if (!email || payload.email_verified !== true) {
      return res.status(400).json({ success: false, message: 'Invalid token' });
    }
    const name = payload.name || email.split('@')[0];

    let user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      const randomPassword = randomBytes(32).toString('base64url');
      const hashedPassword = await bcrypt.hash(randomPassword, 10);
      user = await prisma.user.create({
        data: { email, password: hashedPassword, name },
      });
    }

    const token = jwt.sign({ id: user.id, email: user.email, name: user.name, role: user.role }, process.env.JWT_SECRET, { expiresIn: '7d' });

    res.json({
      success: true,
      token,
      verified: true,
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
    });
  } catch (error) {
    console.error('Google login verification failed');
    res.status(401).json({ success: false, message: 'Google token verification failed' });
  }
});

// GET /api/auth/me — returns the current user from a valid Bearer token.
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { id: true, email: true, name: true, role: true },
    });
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    res.json({ success: true, user });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
