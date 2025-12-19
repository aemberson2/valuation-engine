-- Add Apollo Contact ID column to businesses table for tracking

ALTER TABLE businesses
ADD COLUMN IF NOT EXISTS apollo_contact_id VARCHAR(100);

-- Create index for lookups
CREATE INDEX IF NOT EXISTS idx_businesses_apollo_id ON businesses(apollo_contact_id);

COMMENT ON COLUMN businesses.apollo_contact_id IS 'Apollo Contact ID for tracking in Instantly.ai campaigns';
