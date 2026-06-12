const express = require('express');
const db = require('../config/database');

const router = express.Router();

// GET /api/businesses/views - Cumulative view counts for every business with an email
// Returns the same per-business view_count shown in the admin table, with the
// valuation link built the same way as the admin CSV export.
router.get('/views', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT email, company_name, view_count, url_slug, valuation_url_slug
       FROM businesses
       WHERE email IS NOT NULL AND TRIM(email) != ''
       ORDER BY view_count DESC`
    );

    const baseUrl = process.env.BASE_URL || 'http://localhost:3000';

    const businesses = result.rows.map((business) => ({
      email: business.email,
      company_name: business.company_name,
      views: business.view_count,
      valuation_link: business.url_slug
        ? `${baseUrl}/v/${business.url_slug}`
        : `${baseUrl}/valuation/${business.valuation_url_slug}`
    }));

    res.json({ businesses });
  } catch (error) {
    console.error('Error fetching business views:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
