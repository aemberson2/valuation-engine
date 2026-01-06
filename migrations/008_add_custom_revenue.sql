-- Add custom_revenue column to businesses table
-- When set, this overrides the industry average revenue in valuation calculations

ALTER TABLE businesses
ADD COLUMN IF NOT EXISTS custom_revenue INTEGER;

COMMENT ON COLUMN businesses.custom_revenue IS 'Custom annual revenue in dollars. If NULL, uses industry average for valuation calculation.';
