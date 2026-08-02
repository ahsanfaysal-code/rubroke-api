const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();

// Middleware — restrict CORS to configured origins (defaults to localhost for dev).
const CLIENT_ORIGINS = (process.env.CLIENT_ORIGINS || 'http://localhost:4000').split(',').map(s => s.trim()).filter(Boolean);
app.use(cors({ origin: CLIENT_ORIGINS, credentials: true }));

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

app.use('/api/auth', authRoutes);
app.use('/api/stories', storiesRoutes);
app.use('/api/why-broke', whyBrokeRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/subscribers', subscribersRoutes);
app.use('/api/settings', settingsRoutes);

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
