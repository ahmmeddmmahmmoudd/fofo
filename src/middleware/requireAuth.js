// src/middleware/requireAuth.js
function requireAuth(req, res, next) {
  if (!req.session || !req.session.businessId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  next();
}

module.exports = { requireAuth };
