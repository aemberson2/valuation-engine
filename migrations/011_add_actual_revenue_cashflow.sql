-- Add actual_revenue and actual_cash_flow columns to businesses table
-- These store the values entered by the business owner on the valuation page form

ALTER TABLE businesses
ADD COLUMN IF NOT EXISTS actual_revenue NUMERIC;

ALTER TABLE businesses
ADD COLUMN IF NOT EXISTS actual_cash_flow NUMERIC;

COMMENT ON COLUMN businesses.actual_revenue IS 'Revenue entered by the business owner on the valuation page form. NULL means owner has not completed the form.';
COMMENT ON COLUMN businesses.actual_cash_flow IS 'Owner salary + net profit entered by the business owner on the valuation page form. NULL means owner has not completed the form.';
