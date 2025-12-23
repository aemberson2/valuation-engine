const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const db = require('../config/database');
const { parseCSV } = require('../services/csvParser');
const { mapRegion } = require('../services/regionMapper');
const { transformApolloCSV } = require('../services/apolloTransform');

const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../../uploads');

    // Create uploads directory if it doesn't exist
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${file.originalname}`;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
    if (path.extname(file.originalname).toLowerCase() !== '.csv') {
      return cb(new Error('Only CSV files are allowed'));
    }
    cb(null, true);
  }
});

// GET /upload - Render upload form
router.get('/', (req, res) => {
  res.render('upload');
});

// POST /upload - Handle CSV upload
router.post('/', upload.single('csvFile'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).render('upload', {
        error: 'Please select a CSV file to upload'
      });
    }

    const filePath = req.file.path;

    // Parse CSV
    const parseResult = await parseCSV(filePath);

    if (!parseResult.success || parseResult.data.length === 0) {
      // Delete uploaded file
      fs.unlinkSync(filePath);

      return res.render('upload', {
        error: 'CSV parsing failed',
        errors: parseResult.errors
      });
    }

    // Process businesses and insert into database
    const batchName = req.body.batchName?.trim() || null;
    const results = await processBusinesses(parseResult.data, batchName);

    // Delete uploaded file after processing
    fs.unlinkSync(filePath);

    // Render results page
    res.render('upload-results', {
      inserted: results.inserted,
      skipped: results.skipped,
      errors: results.errors,
      duplicates: results.duplicates,
      totalRecords: parseResult.totalRecords
    });

  } catch (error) {
    console.error('Upload error:', error);

    // Clean up file if it exists
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    res.status(500).render('upload', {
      error: `Upload failed: ${error.message}`
    });
  }
});

// POST /upload/apollo - Handle Apollo CSV upload
router.post('/apollo', upload.single('csvFile'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).render('upload', {
        error: 'Please select a CSV file to upload'
      });
    }

    const filePath = req.file.path;

    // Transform Apollo CSV
    const transformResult = await transformApolloCSV(filePath);

    // DEBUG: Log transformed data
    if (transformResult.data.length > 0) {
      console.log('=== UPLOAD.JS DEBUG ===');
      console.log('First transformed business:', JSON.stringify(transformResult.data[0], null, 2));
    }

    if (!transformResult.success || transformResult.data.length === 0) {
      // Delete uploaded file
      fs.unlinkSync(filePath);

      return res.render('upload', {
        error: 'Apollo CSV transformation failed',
        errors: transformResult.errors
      });
    }

    // Process businesses (same as standard upload)
    const batchName = req.body.batchName?.trim() || null;
    const results = await processBusinesses(transformResult.data, batchName);

    // Delete uploaded file after processing
    fs.unlinkSync(filePath);

    // Render results page with Apollo-specific stats
    res.render('upload-results', {
      inserted: results.inserted,
      skipped: results.skipped,
      errors: results.errors,
      duplicates: results.duplicates,
      totalRecords: transformResult.stats.totalRecords,
      apolloStats: transformResult.stats // Pass Apollo-specific stats
    });

  } catch (error) {
    console.error('Apollo upload error:', error);

    // Clean up file if it exists
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    res.status(500).render('upload', {
      error: `Apollo upload failed: ${error.message}`
    });
  }
});

/**
 * Process businesses: map regions, check duplicates, and insert
 * @param {Array} businesses - Array of validated business objects
 * @param {string|null} batchName - Optional batch name for grouping uploads
 * @returns {Object} - {inserted: count, skipped: count, errors: [], duplicates: []}
 */
async function processBusinesses(businesses, batchName = null) {
  let inserted = 0;
  let skipped = 0;
  const errors = [];
  const duplicates = [];

  for (const business of businesses) {
    try {
      // Check for duplicates
      const isDuplicate = await checkDuplicate(
        business.company_name,
        business.city,
        business.state
      );

      if (isDuplicate) {
        skipped++;
        duplicates.push(`${business.company_name} (${business.city}, ${business.state})`);
        continue;
      }

      // Map region
      const regionData = await mapRegion(business.city, business.state);

      // Generate valuation URL slug
      const valuationUrlSlug = uuidv4();

      // DEBUG: Log contact fields being inserted
      if (inserted < 3) {
        console.log(`=== INSERT DEBUG for ${business.company_name} ===`);
        console.log('Contact fields from business object:', {
          first_name: business.first_name,
          last_name: business.last_name,
          email: business.email,
          apollo_contact_id: business.apollo_contact_id
        });
        console.log('Values being inserted:', {
          first_name: business.first_name || null,
          last_name: business.last_name || null,
          email: business.email || null,
          apollo_contact_id: business.apollo_contact_id || null
        });
      }

      // Insert into businesses table (including contact fields from Apollo)
      const insertResult = await db.query(
        `INSERT INTO businesses (
          company_name,
          city,
          state,
          industry,
          region_label,
          valuation_url_slug,
          first_name,
          last_name,
          email,
          apollo_contact_id,
          batch_name
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING id, first_name, last_name, email, apollo_contact_id`,
        [
          business.company_name,
          business.city,
          business.state,
          business.industry,
          regionData.region_label,
          valuationUrlSlug,
          business.first_name || null,
          business.last_name || null,
          business.email || null,
          business.apollo_contact_id || null,
          batchName
        ]
      );

      // DEBUG: Verify what was actually inserted
      if (inserted < 3 && insertResult.rows.length > 0) {
        console.log('=== VERIFY INSERT ===');
        console.log('Row returned from DB:', insertResult.rows[0]);
      }

      inserted++;

    } catch (error) {
      console.error(`Error processing business ${business.company_name}:`, error);
      errors.push(`${business.company_name}: ${error.message}`);
    }
  }

  return {
    inserted,
    skipped,
    errors,
    duplicates
  };
}

/**
 * Check if business already exists in database
 * @param {string} companyName
 * @param {string} city
 * @param {string} state
 * @returns {Promise<boolean>}
 */
async function checkDuplicate(companyName, city, state) {
  const result = await db.query(
    `SELECT id FROM businesses
     WHERE LOWER(TRIM(company_name)) = LOWER(TRIM($1))
     AND LOWER(TRIM(city)) = LOWER(TRIM($2))
     AND state = $3
     LIMIT 1`,
    [companyName, city, state]
  );

  return result.rows.length > 0;
}

module.exports = router;
