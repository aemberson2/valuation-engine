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
    // Increment view_count — skip if ?preview=1 (e.g. admin "View →" link)
    if (req.query.preview !== '1') {
      await db.query(
        `UPDATE businesses
         SET view_count = view_count + 1
         WHERE id = $1`,
        [business.id]
      );
    }

    // Calculate valuation
    const valuation = await calculateValuation(business);

    const slug = req.params.slug;
    const updateUrl = `${req.baseUrl}/${slug}/update`;
    const trackUrl  = `${req.baseUrl}/${slug}/track`;

    // Render valuation page
    res.render('valuation-page', {
      valuation,
      updateUrl,
      trackUrl,
      updated: req.query.updated === '1',
      formError: req.query.error || null
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
              valuation_url_slug, url_slug, view_count, custom_revenue, custom_sde
       FROM businesses
       WHERE url_slug = $1
       LIMIT 1`,
      [slug]
    );

    // If not found by url_slug, try the old valuation_url_slug (UUID)
    if (result.rows.length === 0) {
      result = await db.query(
        `SELECT id, company_name, city, state, industry, region_label,
                valuation_url_slug, url_slug, view_count, custom_revenue, custom_sde
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

// POST /:slug/update - Save owner-submitted revenue and cash flow, recalculate
router.post('/:slug/update', async (req, res) => {
  const { slug } = req.params;
  const baseUrl = req.baseUrl;

  try {
    // Find business (cast uuid column to text to avoid type mismatch)
    let result = await db.query(
      `SELECT id FROM businesses
       WHERE url_slug = $1 OR valuation_url_slug::text = $1
       LIMIT 1`,
      [slug]
    );

    if (result.rows.length === 0) {
      return res.status(404).render('404', {
        message: 'Valuation not found',
        detail: 'This valuation link is invalid or has expired.'
      });
    }

    const businessId = result.rows[0].id;

    // Strip currency formatting and parse
    const rawRevenue = String(req.body.revenue || '').replace(/[$,\s]/g, '');
    const rawCashFlow = String(req.body.cash_flow || '').replace(/[$,\s]/g, '');

    const revenue = parseInt(rawRevenue, 10);
    const cashFlow = parseInt(rawCashFlow, 10);

    // Validate
    const errors = [];
    if (!rawRevenue || isNaN(revenue)) {
      errors.push('Please enter your annual revenue.');
    } else if (revenue < 10000) {
      errors.push('Revenue must be at least $10,000.');
    }

    if (!rawCashFlow || isNaN(cashFlow)) {
      errors.push("Please enter your owner's cash flow.");
    } else if (cashFlow < 1000) {
      errors.push('Cash flow must be at least $1,000.');
    }

    if (errors.length > 0) {
      return res.redirect(`${baseUrl}/${slug}?error=${encodeURIComponent(errors.join(' '))}`);
    }

    // Save to database
    await db.query(
      `UPDATE businesses SET custom_revenue = $1, custom_sde = $2 WHERE id = $3`,
      [revenue, cashFlow, businessId]
    );

    return res.redirect(`${baseUrl}/${slug}?updated=1`);

  } catch (error) {
    console.error('Error updating valuation:', error);
    return res.redirect(`${baseUrl}/${slug}?error=${encodeURIComponent('Something went wrong. Please try again.')}`);
  }
});

// POST /:slug/track - Save owner-submitted numbers for dashboard tracking (JSON)
router.post('/:slug/track', async (req, res) => {
  const { slug } = req.params;

  try {
    // Cast uuid column to text to avoid type mismatch when slug is a plain string
    const result = await db.query(
      `SELECT id FROM businesses
       WHERE url_slug = $1 OR valuation_url_slug::text = $1
       LIMIT 1`,
      [slug]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Business not found' });
    }

    const businessId = result.rows[0].id;

    const revenue   = parseFloat(String(req.body.revenue   || '').replace(/[$,\s]/g, '')) || null;
    const cashFlow  = parseFloat(String(req.body.cash_flow || '').replace(/[$,\s]/g, '')) || null;

    if (!revenue || !cashFlow) {
      return res.status(400).json({ success: false, error: 'Invalid values' });
    }

    await db.query(
      `UPDATE businesses SET actual_revenue = $1, actual_cash_flow = $2 WHERE id = $3`,
      [revenue, cashFlow, businessId]
    );

    return res.json({ success: true });

  } catch (error) {
    console.error('Error tracking valuation submission:', error);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
});

module.exports = router;
