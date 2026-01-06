const express = require('express');
const db = require('../config/database');
const { calculateValuation } = require('../services/valuationEngine');

const router = express.Router();

/**
 * Helper function to load business and render valuation page
 * Used by both the new /v/:slug and old /valuation/:uuid routes
 */
async function renderValuationPage(req, res, business) {
  try {
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
    console.error('Error rendering valuation page:', error);
    res.status(500).send('An error occurred while loading this valuation.');
  }
}

// GET /:slug - Public valuation page (handles both clean slugs and UUIDs)
router.get('/:slug', async (req, res) => {
  try {
    const { slug } = req.params;

    // First try to find by clean url_slug
    let result = await db.query(
      `SELECT id, company_name, city, state, industry, region_label,
              valuation_url_slug, url_slug, view_count, custom_revenue
       FROM businesses
       WHERE url_slug = $1
       LIMIT 1`,
      [slug]
    );

    // If not found by url_slug, try the old valuation_url_slug (UUID)
    if (result.rows.length === 0) {
      result = await db.query(
        `SELECT id, company_name, city, state, industry, region_label,
                valuation_url_slug, url_slug, view_count, custom_revenue
         FROM businesses
         WHERE valuation_url_slug = $1
         LIMIT 1`,
        [slug]
      );
    }

    // If still not found, show 404
    if (result.rows.length === 0) {
      return res.status(404).render('404', {
        message: 'Valuation not found',
        detail: 'This valuation link is invalid or has expired.'
      });
    }

    const business = result.rows[0];
    await renderValuationPage(req, res, business);

  } catch (error) {
    console.error('Error loading valuation page:', error);
    res.status(500).send('An error occurred while loading this valuation.');
  }
});

module.exports = router;
