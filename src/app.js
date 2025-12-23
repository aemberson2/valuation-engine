const express = require('express');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const db = require('./config/database');
const uploadRouter = require('./routes/upload');
const valuationRouter = require('./routes/valuation');
const adminRouter = require('./routes/admin');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// View engine setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
  console.log('✅ Created uploads directory');
}

/**
 * Auto-run database migrations on startup
 * Runs initial migrations for new databases, and ALTER migrations for existing ones
 */
async function runMigrations() {
  try {
    console.log('🔍 Checking database schema...');

    // Check if businesses table exists
    const tableCheck = await db.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'businesses'
      );
    `);

    const tablesExist = tableCheck.rows[0].exists;

    // Initial migrations (only run on fresh databases)
    const initialMigrations = [
      { file: '001_create_tables.sql', name: 'Create tables' },
      { file: '002_seed_data.sql', name: 'Seed data' }
    ];

    // ALTER migrations (always run, use IF NOT EXISTS so safe to re-run)
    const alterMigrations = [
      { file: '003_add_contact_fields.sql', name: 'Add contact fields' },
      { file: '004_add_apollo_contact_id.sql', name: 'Add Apollo Contact ID' },
      { file: '005_add_batch_name.sql', name: 'Add batch name' },
      { file: '006_add_linkedin_website.sql', name: 'Add LinkedIn and Website' },
      { file: '007_add_url_slug.sql', name: 'Add URL slug' }
    ];

    let migrationsToRun = [];

    if (!tablesExist) {
      console.log('📊 Running initial database setup...');
      migrationsToRun = [...initialMigrations, ...alterMigrations];
    } else {
      console.log('📊 Database exists - running ALTER migrations...');
      migrationsToRun = alterMigrations;
    }

    for (const migration of migrationsToRun) {
      try {
        const migrationPath = path.join(__dirname, '../migrations', migration.file);
        const sql = fs.readFileSync(migrationPath, 'utf-8');

        console.log(`  ⏳ Running: ${migration.name}...`);
        await db.query(sql);
        console.log(`  ✅ Completed: ${migration.name}`);
      } catch (error) {
        console.error(`  ❌ Failed: ${migration.name}`, error.message);
        // Don't crash on ALTER migrations that might already be applied
        if (alterMigrations.includes(migration)) {
          console.log(`  ⚠️  Continuing despite error (column may already exist)`);
        } else {
          throw error;
        }
      }
    }

    console.log('✅ All migrations completed successfully!');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

/**
 * Generate URL slugs for existing businesses that don't have one
 */
async function generateMissingSlugs() {
  try {
    // Check if url_slug column exists
    const columnCheck = await db.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.columns
        WHERE table_name = 'businesses'
        AND column_name = 'url_slug'
      );
    `);

    if (!columnCheck.rows[0].exists) {
      console.log('⏭️  url_slug column not yet created, skipping slug generation');
      return;
    }

    // Find businesses without slugs
    const result = await db.query(
      'SELECT id, company_name FROM businesses WHERE url_slug IS NULL'
    );

    if (result.rows.length === 0) {
      console.log('✅ All businesses have URL slugs');
      return;
    }

    console.log(`🔧 Generating slugs for ${result.rows.length} existing businesses...`);

    // Import slug generator
    const { generateSlug, generateRandomSuffix } = require('./services/slugGenerator');

    for (const business of result.rows) {
      let baseSlug = generateSlug(business.company_name);
      if (!baseSlug) {
        baseSlug = `business-${generateRandomSuffix()}`;
      }

      let slug = baseSlug;
      let attempts = 0;

      // Find a unique slug
      while (attempts < 10) {
        const existing = await db.query(
          'SELECT id FROM businesses WHERE url_slug = $1 LIMIT 1',
          [slug]
        );

        if (existing.rows.length === 0) {
          break;
        }

        slug = `${baseSlug}-${generateRandomSuffix()}`;
        attempts++;
      }

      // Update the business with the new slug
      await db.query(
        'UPDATE businesses SET url_slug = $1 WHERE id = $2',
        [slug, business.id]
      );
    }

    console.log(`✅ Generated slugs for ${result.rows.length} businesses`);
  } catch (error) {
    console.error('⚠️  Error generating slugs:', error.message);
    // Don't exit - this is not critical
  }
}

// Initialize database and run migrations
async function initializeApp() {
  try {
    // Test database connection
    const result = await db.query('SELECT NOW()');
    console.log('✅ Database connected at:', result.rows[0].now);

    // Run migrations if needed
    await runMigrations();

    // Generate slugs for existing businesses
    await generateMissingSlugs();

    // Start server
    const server = app.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
    });

    // Handle server errors
    server.on('error', (error) => {
      if (error.code === 'EADDRINUSE') {
        console.error(`❌ Port ${PORT} is already in use`);
      } else {
        console.error('❌ Server error:', error);
      }
      process.exit(1);
    });
  } catch (error) {
    console.error('❌ App initialization failed:', error);
    process.exit(1);
  }
}

// Routes (must be defined before initializeApp)
app.use('/upload', uploadRouter);
app.use('/valuation', valuationRouter);  // Old UUID-based URLs: /valuation/:uuid
app.use('/v', valuationRouter);          // New clean URLs: /v/:slug
app.use('/admin', adminRouter);

// Health check endpoint for Railway
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    port: PORT
  });
});

// Home page
app.get('/', async (req, res) => {
  try {
    // Get stats for homepage
    const result = await db.query(
      `SELECT
        COUNT(*) as total_businesses,
        COALESCE(SUM(view_count), 0) as total_views
       FROM businesses`
    );

    const stats = {
      totalBusinesses: parseInt(result.rows[0].total_businesses),
      totalViews: parseInt(result.rows[0].total_views)
    };

    res.render('home', { stats });
  } catch (error) {
    console.error('Error loading home page:', error);
    res.render('home', { stats: { totalBusinesses: 0, totalViews: 0 } });
  }
});

// Start the application (only listens once, inside initializeApp)
initializeApp();
