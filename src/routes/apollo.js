const express = require('express');
const db = require('../config/database');

const router = express.Router();

// POST /api/apollo/phone-webhook - Receive Apollo phone-reveal webhook deliveries
// Apollo can't send auth headers, so it authenticates via ?token=<token>
// (handled by the requireAuth middleware applied in app.js).
// Accepts any JSON body regardless of Content-Type and stores it verbatim.
router.post('/phone-webhook', express.json({ type: () => true, limit: '2mb' }), async (req, res) => {
  try {
    await db.query(
      'INSERT INTO apollo_phone_results (payload) VALUES ($1)',
      [JSON.stringify(req.body ?? {})]
    );
    res.status(200).json({ ok: true });
  } catch (error) {
    console.error('Error storing Apollo phone webhook:', error);
    res.status(500).json({ ok: false, error: 'Failed to store webhook' });
  }
});

// GET /api/apollo/phone-results?since_id=<n> - Poll stored webhook deliveries
// Returns rows with id > since_id, oldest first, max 500 per call.
router.get('/phone-results', async (req, res) => {
  try {
    const sinceId = Number.parseInt(req.query.since_id, 10) || 0;

    const result = await db.query(
      `SELECT id, received_at, payload
       FROM apollo_phone_results
       WHERE id > $1
       ORDER BY id ASC
       LIMIT 500`,
      [sinceId]
    );

    res.json({ items: result.rows });
  } catch (error) {
    console.error('Error fetching Apollo phone results:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
