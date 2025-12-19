# Railway Database Migrations

This guide explains how to run database migrations on your Railway PostgreSQL instance.

## Prerequisites

1. **Railway CLI** - Will be installed automatically by the script
2. **Railway API Token** - Already configured in the script
3. **psql** - PostgreSQL client (usually comes with PostgreSQL installation)

## Running Migrations

### Step 1: Install Railway CLI (if not installed)

```bash
npm install -g @railway/cli
```

### Step 2: Run the Migration Script

```bash
./run-railway-migrations.sh
```

### What the Script Does:

1. **Sets Railway API Token** - Authenticates with Railway
2. **Links to Project** - Connects to your valuation-engine project (interactive)
3. **Runs Migrations** - Executes all 3 SQL migration files in order:
   - `001_create_tables.sql` - Creates businesses, valuation_assumptions, region_mappings tables
   - `002_seed_data.sql` - Seeds industry assumptions and regional data
   - `003_add_contact_fields.sql` - Adds first_name, last_name, email columns

## Manual Migration (Alternative)

If you prefer to run migrations manually:

```bash
# 1. Set Railway token
export RAILWAY_TOKEN="your-token-here"

# 2. Link to project
railway link

# 3. Run each migration
railway run psql $DATABASE_URL -f migrations/001_create_tables.sql
railway run psql $DATABASE_URL -f migrations/002_seed_data.sql
railway run psql $DATABASE_URL -f migrations/003_add_contact_fields.sql
```

## Verifying Migrations

### Check Tables

```bash
railway run psql $DATABASE_URL -c '\dt'
```

### Check Data

```bash
# View valuation assumptions
railway run psql $DATABASE_URL -c 'SELECT * FROM valuation_assumptions;'

# View region mappings
railway run psql $DATABASE_URL -c 'SELECT * FROM region_mappings;'

# Check businesses table schema
railway run psql $DATABASE_URL -c '\d businesses'
```

## Troubleshooting

### Issue: Railway CLI not found
**Solution:** Install it globally:
```bash
npm install -g @railway/cli
```

### Issue: psql command not found
**Solution:** Install PostgreSQL client:
- **Mac:** `brew install postgresql`
- **Ubuntu:** `sudo apt-get install postgresql-client`
- **Windows:** Download from postgresql.org

### Issue: Authentication failed
**Solution:** Verify your Railway API token is correct in the script

### Issue: Database connection error
**Solution:**
1. Verify Railway project is linked correctly
2. Check that DATABASE_URL environment variable exists in Railway
3. Ensure PostgreSQL service is running in Railway

## After Migration

Once migrations are complete, your Railway database will have:
- All required tables (businesses, valuation_assumptions, region_mappings)
- Seeded data for 6 industries
- Regional data for MN, WI, IA cities
- Contact fields ready for Apollo imports

Your application should now work in production!
