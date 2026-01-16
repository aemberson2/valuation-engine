-- Update default estimated revenue from $750,000 to $900,000
-- This affects businesses WITHOUT custom_revenue set

UPDATE valuation_assumptions
SET estimated_revenue = 900000
WHERE LOWER(industry) = 'generic';
