const express = require('express');
const router = express.Router();
const prisma = require('../lib/prisma');

// Stripe webhook (optional). Enabled only when STRIPE_SECRET_KEY + STRIPE_WEBHOOK_SECRET are set.
// Must be registered with express.raw in index.js so the raw body is available for signature check.
const STRIPE_KEY = process.env.STRIPE_SECRET_KEY || '';
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || '';

let stripe = null;
if (STRIPE_KEY) {
  try { stripe = require('stripe')(STRIPE_KEY); } catch (e) { /* demo mode */ }
}

// POST /api/stripe/webhook  (Stripe calls this on payment events)
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  if (!stripe || !WEBHOOK_SECRET) {
    return res.status(503).json({ received: false, message: 'Webhook not configured' });
  }
  const sig = req.headers['stripe-signature'];
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature error:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const pledgeId = session.metadata && session.metadata.pledgeId;
    if (pledgeId) {
      try {
        await prisma.pledge.update({
          where: { id: parseInt(pledgeId) },
          data: { status: 'completed', stripeSession: session.id },
        });
        // Recompute the story's raised total.
        const pledge = await prisma.pledge.findUnique({ where: { id: parseInt(pledgeId) } });
        if (pledge) {
          const agg = await prisma.pledge.aggregate({
            where: { storyId: pledge.storyId, status: 'completed' },
            _sum: { amount: true },
          });
          await prisma.story.update({
            where: { id: pledge.storyId },
            data: { fundingRaised: agg._sum.amount || 0 },
          });
        }
      } catch (e) {
        console.error('Failed to mark pledge complete:', e.message);
        return res.status(500).json({ received: false });
      }
    }
  }

  res.json({ received: true });
});

module.exports = { router, configured: !!stripe && !!WEBHOOK_SECRET };
