-- Add custom_sde column to businesses table
-- Stores owner-submitted SDE (salary + net profit) from the valuation page form

ALTER TABLE businesses
ADD COLUMN IF NOT EXISTS custom_sde INTEGER;

COMMENT ON COLUMN businesses.custom_sde IS 'Owner-submitted SDE (salary + net profit) in dollars. When set, overrides the calculated SDE in valuation.';
