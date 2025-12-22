const express = require('express');
const db = require('../config/database');
const { calculateValuation } = require('../services/valuationEngine');

const router = express.Router();

// GET /admin - Show all businesses with filters and sorting
router.get('/', async (req, res) => {
  try {
    const {
      batch,
      dateFilter,
      viewsFilter,
      industry,
      state,
      search,
      sortBy = 'created_at',
      sortOrder = 'desc'
    } = req.query;

    // Build WHERE clause
    const whereClauses = [];
    const queryParams = [];
    let paramCounter = 1;

    // Batch filter
    if (batch) {
      whereClauses.push(`batch_name = $${paramCounter++}`);
      queryParams.push(batch);
    }

    // Date filter
    if (dateFilter) {
      const now = new Date();
      let dateThreshold;

      switch(dateFilter) {
        case 'today':
          dateThreshold = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          break;
        case 'last7':
          dateThreshold = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case 'last30':
          dateThreshold = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          break;
        case 'thisMonth':
          dateThreshold = new Date(now.getFullYear(), now.getMonth(), 1);
          break;
      }

      if (dateThreshold) {
        whereClauses.push(`created_at >= $${paramCounter++}`);
        queryParams.push(dateThreshold);
      }
    }

    // Views filter
    if (viewsFilter) {
      switch(viewsFilter) {
        case '0':
          whereClauses.push('view_count = 0');
          break;
        case '1+':
          whereClauses.push('view_count >= 1');
          break;
        case '5+':
          whereClauses.push('view_count >= 5');
          break;
        case '10+':
          whereClauses.push('view_count >= 10');
          break;
      }
    }

    // Industry filter
    if (industry) {
      whereClauses.push(`industry = $${paramCounter++}`);
      queryParams.push(industry);
    }

    // State filter
    if (state) {
      whereClauses.push(`state = $${paramCounter++}`);
      queryParams.push(state);
    }

    // Search filter
    if (search) {
      whereClauses.push(`LOWER(company_name) LIKE $${paramCounter++}`);
      queryParams.push(`%${search.toLowerCase()}%`);
    }

    const whereClause = whereClauses.length > 0 ? 'WHERE ' + whereClauses.join(' AND ') : '';

    // Validate sortBy to prevent SQL injection
    const validSortColumns = ['company_name', 'created_at', 'view_count', 'city', 'state', 'industry'];
    const safeSortBy = validSortColumns.includes(sortBy) ? sortBy : 'created_at';
    const safeSortOrder = sortOrder.toLowerCase() === 'asc' ? 'ASC' : 'DESC';

    // Get filtered businesses
    const result = await db.query(
      `SELECT id, company_name, city, state, industry, region_label, batch_name,
              valuation_url_slug, view_count, created_at
       FROM businesses
       ${whereClause}
       ORDER BY ${safeSortBy} ${safeSortOrder}`
      ,queryParams
    );

    // Get total count (unfiltered)
    const totalResult = await db.query('SELECT COUNT(*) as count FROM businesses');
    const totalCount = parseInt(totalResult.rows[0].count);

    // Get unique values for filters
    const batchesResult = await db.query(
      'SELECT DISTINCT batch_name FROM businesses WHERE batch_name IS NOT NULL ORDER BY batch_name'
    );
    const industriesResult = await db.query(
      'SELECT DISTINCT industry FROM businesses WHERE industry IS NOT NULL ORDER BY industry'
    );
    const statesResult = await db.query(
      'SELECT DISTINCT state FROM businesses ORDER BY state'
    );

    res.render('admin', {
      businesses: result.rows,
      filteredCount: result.rows.length,
      totalCount: totalCount,
      baseUrl: process.env.BASE_URL || 'http://localhost:3000',
      filters: {
        batch,
        dateFilter,
        viewsFilter,
        industry,
        state,
        search,
        sortBy: safeSortBy,
        sortOrder: safeSortOrder
      },
      batches: batchesResult.rows.map(r => r.batch_name),
      industries: industriesResult.rows.map(r => r.industry),
      states: statesResult.rows.map(r => r.state)
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
              valuation_url_slug, first_name, last_name, email, apollo_contact_id
       FROM businesses
       ORDER BY created_at DESC`
    );

    const businesses = result.rows;

    // Calculate valuations for all businesses
    const csvRows = [];

    // Add CSV header (with contact fields first for Instantly.ai)
    csvRows.push('first_name,last_name,email,company_name,city,state,industry,region_label,valuation_link,valuation_range_display,apollo_contact_id');

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
          escapeCsv(business.first_name || ''),
          escapeCsv(business.last_name || ''),
          escapeCsv(business.email || ''),
          escapeCsv(business.company_name),
          escapeCsv(business.city),
          escapeCsv(business.state),
          escapeCsv(business.industry || ''),
          escapeCsv(business.region_label),
          escapeCsv(valuationLink),
          escapeCsv(valuationRange),
          escapeCsv(business.apollo_contact_id || '')
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

// DELETE /admin/business/:id - Delete single business
router.delete('/business/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await db.query(
      'DELETE FROM businesses WHERE id = $1 RETURNING company_name',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Business not found' });
    }

    res.json({
      success: true,
      message: `Deleted ${result.rows[0].company_name}`
    });

  } catch (error) {
    console.error('Error deleting business:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /admin/businesses/delete-bulk - Delete multiple businesses
router.post('/businesses/delete-bulk', express.json(), async (req, res) => {
  try {
    const { ids } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, error: 'No business IDs provided' });
    }

    // Create placeholders for parameterized query
    const placeholders = ids.map((_, i) => `$${i + 1}`).join(',');

    const result = await db.query(
      `DELETE FROM businesses WHERE id IN (${placeholders}) RETURNING company_name`,
      ids
    );

    res.json({
      success: true,
      count: result.rows.length,
      message: `Deleted ${result.rows.length} business${result.rows.length !== 1 ? 'es' : ''}`
    });

  } catch (error) {
    console.error('Error bulk deleting businesses:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /admin/batch/delete - Delete all businesses in a batch
router.post('/batch/delete', express.json(), async (req, res) => {
  try {
    const { batchName } = req.body;

    if (!batchName) {
      return res.status(400).json({ success: false, error: 'No batch name provided' });
    }

    const result = await db.query(
      'DELETE FROM businesses WHERE batch_name = $1 RETURNING company_name',
      [batchName]
    );

    res.json({
      success: true,
      count: result.rows.length,
      message: `Deleted batch "${batchName}" (${result.rows.length} business${result.rows.length !== 1 ? 'es' : ''})`
    });

  } catch (error) {
    console.error('Error deleting batch:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
