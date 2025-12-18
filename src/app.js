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

// Test database connection on startup
db.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('❌ Database connection failed:', err);
    process.exit(1);
  }
  console.log('✅ Database connected at:', res.rows[0].now);
});

// Routes
app.use('/upload', uploadRouter);
app.use('/valuation', valuationRouter);
app.use('/admin', adminRouter);

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

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
