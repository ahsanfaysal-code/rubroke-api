// Cloudflare Turnstile verification middleware.
// Blocks bots/abuse on auth endpoints by verifying the Turnstile token
// submitted from the frontend. Only active when TURNSTILE_SECRET_KEY is set.
// Uses the built-in global fetch (Node 18+).

const TURNSTILE_SECRET = process.env.TURNSTILE_SECRET_KEY || '';
const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

// If no secret is configured (e.g. local dev), skip verification.
async function verifyTurnstile(req, res, next) {
  if (!TURNSTILE_SECRET) {
    return next();
  }

  const token = req.body && req.body.turnstileToken;
  if (!token) {
    return res.status(400).json({ success: false, message: 'Human verification token is missing. Please complete the challenge.' });
  }

  try {
    const formData = new URLSearchParams();
    formData.append('secret', TURNSTILE_SECRET);
    formData.append('response', token);
    if (req.headers['cf-connecting-ip']) {
      formData.append('remoteip', req.headers['cf-connecting-ip']);
    }

    const response = await fetch(TURNSTILE_VERIFY_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: formData.toString(),
    });

    const outcome = await response.json();
    if (outcome.success) {
      return next();
    }
    return res.status(403).json({ success: false, message: 'Human verification failed. Please try again.' });
  } catch (err) {
    console.error('Turnstile verification error:', err);
    return res.status(500).json({ success: false, message: 'Human verification could not be completed. Please try again.' });
  }
}

module.exports = { verifyTurnstile };
