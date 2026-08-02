const express = require('express');
const router = express.Router({ mergeParams: true });
const prisma = require('../lib/prisma');

// Stripe is optional. Real checkout when STRIPE_SECRET_KEY is set,
// otherwise a demo pledge is recorded immediately (dev fallback).
const STRIPE_KEY = process.env.STRIPE_SECRET_KEY || '';
let stripe = null;
if (STRIPE_KEY) {
  try {
    stripe = require('stripe')(STRIPE_KEY);
  } catch (e) {
    console.warn('stripe package not installed; falling back to demo pledges.');
  }
}

const APP_URL = process.env.APP_URL || 'http://localhost:4000';

// Recompute a story's fundingRaised from its completed pledges.
async function recomputeRaised(storyId) {
  const agg = await prisma.pledge.aggregate({
    where: { storyId, status: 'completed' },
    _sum: { amount: true },
  });
  const raised = agg._sum.amount || 0;
  await prisma.story.update({ where: { id: storyId }, data: { fundingRaised: raised } });
  return raised;
}

// GET /api/stories/:storyId/pledges  (public: list completed backers)
router.get('/', async (req, res) => {
  try {
    const storyId = parseInt(req.params.storyId);
    const pledges = await prisma.pledge.findMany({
      where: { storyId, status: 'completed' },
      orderBy: { createdAt: 'desc' },
      select: { id: true, name: true, amount: true, message: true, createdAt: true },
    });
    res.json({ success: true, data: pledges });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// POST /api/stories/:storyId/pledges  (public: back this business)
router.post('/', async (req, res) => {
  try {
    const storyId = parseInt(req.params.storyId);
    const { name, email, amount, message } = req.body;
    const amt = parseFloat(amount);

    if (!name || !email || !amt || amt <= 0) {
      return res.status(400).json({ success: false, message: 'Name, email and a positive amount are required.' });
    }

    const story = await prisma.story.findUnique({ where: { id: storyId } });
    if (!story) return res.status(404).json({ success: false, message: 'Story not found' });

    // Demo mode: no Stripe -> record the pledge as completed immediately.
    if (!stripe) {
      const pledge = await prisma.pledge.create({
        data: { storyId, name, email, amount: amt, message: message || null, status: 'completed' },
      });
      const raised = await recomputeRaised(storyId);
      return res.status(201).json({
        success: true, mode: 'demo', data: pledge, fundingRaised: raised,
        message: 'Pledge recorded (demo mode — configure STRIPE_SECRET_KEY for live payments).',
      });
    }

    // Live mode: create a pending pledge + Stripe Checkout session.
    const pledge = await prisma.pledge.create({
      data: { storyId, name, email, amount: amt, message: message || null, status: 'pending' },
    });

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      customer_email: email,
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: { name: `Support: ${story.title}` },
          unit_amount: Math.round(amt * 100),
        },
        quantity: 1,
      }],
      success_url: `${APP_URL}/stories/${storyId}?pledge=success`,
      cancel_url: `${APP_URL}/stories/${storyId}?pledge=cancel`,
      metadata: { pledgeId: String(pledge.id), storyId: String(storyId) },
    });

    await prisma.pledge.update({ where: { id: pledge.id }, data: { stripeSession: session.id } });
    res.status(201).json({ success: true, mode: 'live', url: session.url, pledgeId: pledge.id });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// POST /api/stories/:storyId/pledges/:id/confirm
// Confirms a pending pledge (called by the client after Stripe redirect, or by a webhook in prod).
router.post('/:id/confirm', async (req, res) => {
  try {
    const storyId = parseInt(req.params.storyId);
    const id = parseInt(req.params.id);
    const pledge = await prisma.pledge.update({
      where: { id },
      data: { status: 'completed' },
    });
    const raised = await recomputeRaised(storyId);
    res.json({ success: true, data: pledge, fundingRaised: raised });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
