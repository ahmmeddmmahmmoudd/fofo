// src/routes/auth.js
const express = require('express');
const { hashPassword, verifyPassword } = require('../authUtils');
const { requireAuth } = require('../middleware/requireAuth');

const VALID_BUSINESS_TYPES = ['gaming', 'restaurant'];
const POLICY_DEFAULTS = {
  gaming: { grace_window_minutes: 60, deposit_required: 0, deposit_amount: null, refund_cutoff_minutes: null },
  restaurant: { grace_window_minutes: 30, deposit_required: 1, deposit_amount: 50, refund_cutoff_minutes: 120 }
};

function toPublicBusiness(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    business_type: row.business_type,
    grace_window_minutes: row.grace_window_minutes,
    deposit_required: !!row.deposit_required,
    deposit_amount: row.deposit_amount,
    refund_cutoff_minutes: row.refund_cutoff_minutes,
    reliability_score: row.reliability_score
  };
}

function createAuthRouter(db) {
  const router = express.Router();

  router.post('/signup', (req, res) => {
    const { name, email, password, business_type } = req.body || {};
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'name, email and password are required' });
    }
    if (!VALID_BUSINESS_TYPES.includes(business_type)) {
      return res.status(400).json({ error: "business_type must be 'gaming' or 'restaurant'" });
    }
    const existing = db.prepare('SELECT id FROM businesses WHERE email = ?').get(email);
    if (existing) {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }

    const defaults = POLICY_DEFAULTS[business_type];
    const graceWindowMinutes = req.body.grace_window_minutes ?? defaults.grace_window_minutes;
    const depositRequired = req.body.deposit_required ?? defaults.deposit_required;
    const depositAmount = req.body.deposit_amount ?? defaults.deposit_amount;
    const refundCutoffMinutes = req.body.refund_cutoff_minutes ?? defaults.refund_cutoff_minutes;

    const passwordHash = hashPassword(password);
    const createdAt = new Date().toISOString();
    const info = db
      .prepare(
        `INSERT INTO businesses
           (name, email, password_hash, business_type, grace_window_minutes, deposit_required, deposit_amount, refund_cutoff_minutes, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(name, email, passwordHash, business_type, graceWindowMinutes, depositRequired ? 1 : 0, depositAmount, refundCutoffMinutes, createdAt);

    req.session.businessId = info.lastInsertRowid;
    req.session.businessName = name;

    const row = db.prepare('SELECT * FROM businesses WHERE id = ?').get(info.lastInsertRowid);
    res.status(201).json(toPublicBusiness(row));
  });

  router.post('/login', (req, res) => {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: 'email and password are required' });
    }
    const business = db.prepare('SELECT * FROM businesses WHERE email = ?').get(email);
    if (!business || !verifyPassword(password, business.password_hash)) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    req.session.businessId = business.id;
    req.session.businessName = business.name;
    res.status(200).json(toPublicBusiness(business));
  });

  router.post('/logout', (req, res) => {
    req.session.destroy(() => {
      res.status(200).json({ ok: true });
    });
  });

  router.get('/me', requireAuth, (req, res) => {
    const business = db
      .prepare('SELECT * FROM businesses WHERE id = ?')
      .get(req.session.businessId);
    if (!business) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    res.status(200).json(toPublicBusiness(business));
  });

  return router;
}

module.exports = { createAuthRouter };
