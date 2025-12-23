-- Add clean URL slug column to businesses table

ALTER TABLE businesses
ADD COLUMN IF NOT EXISTS url_slug VARCHAR(255) UNIQUE;

-- Create index for fast slug lookups
CREATE INDEX IF NOT EXISTS idx_businesses_url_slug ON businesses(url_slug);

COMMENT ON COLUMN businesses.url_slug IS 'Clean URL slug generated from company name (e.g., minuteman-press-central)';
