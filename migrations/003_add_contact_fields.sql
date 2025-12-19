-- Add contact fields to businesses table for Apollo imports and Instantly.ai exports
-- Uses IF NOT EXISTS to handle cases where table was created with these fields

ALTER TABLE businesses
ADD COLUMN IF NOT EXISTS first_name VARCHAR(100),
ADD COLUMN IF NOT EXISTS last_name VARCHAR(100),
ADD COLUMN IF NOT EXISTS email VARCHAR(255);

-- Create index on email for lookups (skip if exists)
CREATE INDEX IF NOT EXISTS idx_businesses_email ON businesses(email);

COMMENT ON COLUMN businesses.first_name IS 'Contact first name from Apollo or other sources';
COMMENT ON COLUMN businesses.last_name IS 'Contact last name from Apollo or other sources';
COMMENT ON COLUMN businesses.email IS 'Contact email for outreach campaigns';
