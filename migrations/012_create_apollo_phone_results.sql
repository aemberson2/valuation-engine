-- Store raw Apollo phone-reveal webhook deliveries
-- Each POST to /api/apollo/phone-webhook is saved as one row with the full JSON payload

CREATE TABLE IF NOT EXISTS apollo_phone_results (
  id SERIAL PRIMARY KEY,
  received_at TIMESTAMPTZ DEFAULT now(),
  payload JSONB
);
