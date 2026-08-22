const express = require('express');

const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { createRateLimiter } = require('../middleware/rateLimit');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_MODEL = 'gemini-2.0-flash';

// Cap AI analysis usage per IP to avoid abuse / runaway Gemini cost.
const aiLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: 'Too many requests. Please wait a few minutes and try again.',
});

function fallbackResult() {
  return {
    roast: "Our AI is too stunned by your spending to offer a roast.",
    advice: ['Contact a real human professional', 'Stop clicking buttons for a bit', 'Breathe'],
    score: 0,
  };
}

function normalizeResult(value) {
  const advice = Array.isArray(value.advice)
    ? value.advice.filter((tip) => typeof tip === 'string').slice(0, 4)
    : [];
  const score = Number(value.score);

  return {
    roast: typeof value.roast === 'string' && value.roast.trim() ? value.roast : fallbackResult().roast,
    advice: advice.length ? advice : fallbackResult().advice,
    score: Number.isFinite(score) ? Math.max(0, Math.min(100, score)) : 50,
  };
}

// POST /api/ai/analyze
// Gemini credentials remain on the server; the browser receives only the analysis result.
router.post('/analyze', authenticateToken, aiLimiter, async (req, res) => {
  if (!GEMINI_API_KEY) {
    return res.status(503).json({ success: false, message: 'AI analysis is not configured' });
  }

  const { income, rent, dining, subscriptions, impulse } = req.body || {};
  if (![income, rent, subscriptions].every(Number.isFinite) || typeof dining !== 'string' || typeof impulse !== 'string') {
    return res.status(400).json({ success: false, message: 'Invalid analysis input' });
  }

  const prompt = `Analyze this person's financial situation based on these factors:
  - Monthly Income: $${income}
  - Monthly Rent/Mortgage: $${rent}
  - Dining Out: ${dining}
  - Number of Active Subscriptions: ${subscriptions}
  - Impulse Buying Frequency: ${impulse}

  Be a witty, slightly sarcastic but helpful financial advisor.
  Return ONLY valid JSON (no markdown, no code fences) with these exact keys:
  - "roast": A funny, sharp analysis of why they might be "broke".
  - "advice": A list of 3-4 actionable tips.
  - "score": A numeric score from 0-100 representing financial health.`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY)}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: 'application/json' },
        }),
      },
    );

    if (!response.ok) {
      console.error('Gemini analysis request failed:', response.status);
      return res.status(502).json({ success: false, message: 'AI analysis is temporarily unavailable' });
    }

    const payload = await response.json();
    const text = payload.candidates?.[0]?.content?.parts?.[0]?.text;
    const result = normalizeResult(JSON.parse(text || '{}'));
    return res.json({ success: true, data: result });
  } catch (error) {
    console.error('Gemini analysis failed');
    return res.status(502).json({ success: false, message: 'AI analysis is temporarily unavailable' });
  }
});

module.exports = router;
