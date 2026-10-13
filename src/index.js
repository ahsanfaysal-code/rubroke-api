const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();

// Trust the first proxy hop (Render's load balancer) so req.ip reflects the
// real client IP rather than the proxy. Required for per-IP rate limiting.
app.set('trust proxy', 1);

// Middleware — restrict CORS to allowed origins (production RuBroke domains and local dev ports).
const DEFAULT_ALLOWED_ORIGINS = [
  'http://localhost:4000',
  'http://localhost:4001',
  'http://127.0.0.1:4000',
  'http://127.0.0.1:4001',
  'https://rubroke.com',
  'https://www.rubroke.com',
];

const envOrigins = (process.env.CLIENT_ORIGINS || '')
  .split(',')
  .map(s => s.trim().replace(/\/+$/, ''))
  .filter(Boolean);

const allowedOriginsSet = new Set([
  ...DEFAULT_ALLOWED_ORIGINS.map(s => s.replace(/\/+$/, '')),
  ...envOrigins,
]);

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g. curl, server-to-server, same-origin, or test suites)
      if (!origin) {
        return callback(null, true);
      }
      const normalizedOrigin = origin.trim().replace(/\/+$/, '');
      if (allowedOriginsSet.has(normalizedOrigin)) {
        return callback(null, true);
      }
      return callback(null, false);
    },
    credentials: true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
    optionsSuccessStatus: 204,
  })
);

// Stripe webhook must read the RAW body (before express.json) for signature verification.
const stripeRoute = require('./routes/stripe');
if (stripeRoute.configured) {
  app.use('/api/stripe', express.raw({ type: 'application/json' }), stripeRoute.router);
} else {
  app.use('/api/stripe', stripeRoute.router);
}

app.use(express.json());

// Routes
const authRoutes = require('./routes/auth');
const storiesRoutes = require('./routes/stories');
const whyBrokeRoutes = require('./routes/whybroke');
const adminRoutes = require('./routes/admin');
const subscribersRoutes = require('./routes/subscribers');
const settingsRoutes = require('./routes/settings');
const aiRoutes = require('./routes/ai');
const calculationsRoutes = require('./routes/calculations');

app.use('/api/auth', authRoutes);
app.use('/api/stories', storiesRoutes);
app.use('/api/why-broke', whyBrokeRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/subscribers', subscribersRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/calculations', calculationsRoutes);

// Basic health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'RuBroke Vibe API is running' });
});

// Only start listening when run directly (not when imported by tests).
if (require.main === module) {
  const port = process.env.PORT || 5000;
  app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
  });
}

module.exports = app;
