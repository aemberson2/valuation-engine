-- Add batch_name column to businesses table for grouping uploads

ALTER TABLE businesses
ADD COLUMN IF NOT EXISTS batch_name VARCHAR(255);

-- Create index for batch filtering
CREATE INDEX IF NOT EXISTS idx_businesses_batch_name ON businesses(batch_name);

COMMENT ON COLUMN businesses.batch_name IS 'Optional batch name for grouping businesses uploaded together (e.g., "December Minneapolis Restaurants")';
