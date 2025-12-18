const express = require('express');
const db = require('../config/database');
const { calculateValuation } = require('../services/valuationEngine');

const router = express.Router();

// GET /admin - Show all businesses
router.get('/', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, company_name, city, state, industry, region_label,
              valuation_url_slug, view_count, created_at
       FROM businesses
       ORDER BY created_at DESC`
    );

    res.render('admin', {
      businesses: result.rows,
      totalCount: result.rows.length,
      baseUrl: process.env.BASE_URL || 'http://localhost:3000'
    });

  } catch (error) {
    console.error('Error loading admin page:', error);
    res.status(500).send('Error loading businesses');
  }
});

// GET /export - Download CSV for Instantly.ai
router.get('/export', async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, company_name, city, state, industry, region_label,
              valuation_url_slug
       FROM businesses
       ORDER BY created_at DESC`
    );

    const businesses = result.rows;

    // Calculate valuations for all businesses
    const csvRows = [];

    // Add CSV header
    csvRows.push('company_name,city,state,industry,region_label,valuation_link,valuation_range_display');

    // Add business rows
    for (const business of businesses) {
      try {
        const valuation = await calculateValuation(business);

        const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
        const valuationLink = `${baseUrl}/valuation/${business.valuation_url_slug}`;
        const valuationRange = `${valuation.formatted.valuation_low} - ${valuation.formatted.valuation_high}`;

        // Escape fields for CSV (wrap in quotes and escape internal quotes)
        const escapeCsv = (field) => {
          if (field === null || field === undefined) return '';
          const str = String(field);
          if (str.includes(',') || str.includes('"') || str.includes('\n')) {
            return `"${str.replace(/"/g, '""')}"`;
          }
          return str;
        };

        csvRows.push([
          escapeCsv(business.company_name),
          escapeCsv(business.city),
          escapeCsv(business.state),
          escapeCsv(business.industry || ''),
          escapeCsv(business.region_label),
          escapeCsv(valuationLink),
          escapeCsv(valuationRange)
        ].join(','));

      } catch (error) {
        console.error(`Error calculating valuation for ${business.company_name}:`, error);
        // Skip this business if valuation fails
      }
    }

    // Generate filename with current date
    const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const filename = `businesses-export-${date}.csv`;

    // Set headers for CSV download
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    // Send CSV
    res.send(csvRows.join('\n'));

  } catch (error) {
    console.error('Error generating CSV export:', error);
    res.status(500).send('Error generating export');
  }
});

module.exports = router;
