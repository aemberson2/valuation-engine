-- Add LinkedIn URL and Company Website columns to businesses table

ALTER TABLE businesses
ADD COLUMN IF NOT EXISTS linkedin_url VARCHAR(500),
ADD COLUMN IF NOT EXISTS company_website VARCHAR(500);

-- Create indexes for lookups
CREATE INDEX IF NOT EXISTS idx_businesses_linkedin ON businesses(linkedin_url);
CREATE INDEX IF NOT EXISTS idx_businesses_website ON businesses(company_website);

COMMENT ON COLUMN businesses.linkedin_url IS 'LinkedIn profile URL from Apollo';
COMMENT ON COLUMN businesses.company_website IS 'Company website URL from Apollo';
