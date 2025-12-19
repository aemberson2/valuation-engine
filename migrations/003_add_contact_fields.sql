-- Add contact fields to businesses table for Apollo imports and Instantly.ai exports

ALTER TABLE businesses
ADD COLUMN first_name VARCHAR(100),
ADD COLUMN last_name VARCHAR(100),
ADD COLUMN email VARCHAR(255);

-- Create index on email for lookups
CREATE INDEX idx_businesses_email ON businesses(email);

COMMENT ON COLUMN businesses.first_name IS 'Contact first name from Apollo or other sources';
COMMENT ON COLUMN businesses.last_name IS 'Contact last name from Apollo or other sources';
COMMENT ON COLUMN businesses.email IS 'Contact email for outreach campaigns';
