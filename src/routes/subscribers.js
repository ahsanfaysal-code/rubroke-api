const express = require('express');
const router = express.Router();
const prisma = require('../lib/prisma');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

// POST /api/subscribers  (public newsletter signup from the footer)
router.post('/', async (req, res) => {
  try {
    const { email, source } = req.body;
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return res.status(400).json({ success: false, message: 'A valid email is required.' });
    }

    const existing = await prisma.subscriber.findUnique({ where: { email } });
    if (existing) {
      return res.json({ success: true, alreadySubscribed: true, message: 'You are already subscribed.' });
    }

    await prisma.subscriber.create({
      data: { email, source: source || 'footer' },
    });

    res.status(201).json({ success: true, message: 'Subscribed successfully.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server error saving subscription' });
  }
});

// GET /api/subscribers  (admin only)
router.get('/', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const subscribers = await prisma.subscriber.findMany({ orderBy: { createdAt: 'desc' } });
    res.json({ success: true, data: subscribers });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
