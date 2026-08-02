const jwt = require('jsonwebtoken');

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  // The token will usually come as 'Bearer <token>'
  const token = authHeader && authHeader.split(' ')[1];

  if (token == null) {
    return res.status(401).json({ success: false, message: 'Authentication required' });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ success: false, message: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
}

function requireAdmin(req, res, next) {
  if (req.user && req.user.role === 'admin') {
    next();
  } else {
    res.status(403).json({ success: false, message: 'Admin privileges required' });
  }
}

module.exports = { authenticateToken, requireAdmin };
