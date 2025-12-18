const express = require('express');
const db = require('../config/database');
const { calculateValuation } = require('../services/valuationEngine');

const router = express.Router();

// GET /valuation/:slug - Public valuation page
router.get('/:slug', async (req, res) => {
  try {
    const { slug } = req.params;

    // Load business by valuation_url_slug
    const result = await db.query(
      `SELECT id, company_name, city, state, industry, region_label,
              valuation_url_slug, view_count
       FROM businesses
       WHERE valuation_url_slug = $1
       LIMIT 1`,
      [slug]
    );

    // If not found, show 404
    if (result.rows.length === 0) {
      return res.status(404).render('404', {
        message: 'Valuation not found',
        detail: 'This valuation link is invalid or has expired.'
      });
    }

    const business = result.rows[0];

    // Increment view_count
    await db.query(
      `UPDATE businesses
       SET view_count = view_count + 1
       WHERE id = $1`,
      [business.id]
    );

    // Calculate valuation
    const valuation = await calculateValuation(business);

    // Render valuation page
    res.render('valuation-page', {
      valuation,
      contactEmail: 'valuations@yourbrokerage.com'
    });

  } catch (error) {
    console.error('Error loading valuation page:', error);
    res.status(500).send('An error occurred while loading this valuation.');
  }
});

module.exports = router;
