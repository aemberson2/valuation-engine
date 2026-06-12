-- Log each counted valuation-page view as an event row
-- view_count on businesses keeps working as the cumulative total for the
-- admin UI; this table adds real timestamps for analytics.

CREATE TABLE IF NOT EXISTS view_events (
  id SERIAL PRIMARY KEY,
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  viewed_at TIMESTAMPTZ DEFAULT now(),
  ip_hash TEXT,
  user_agent TEXT
);

CREATE INDEX IF NOT EXISTS idx_view_events_business_id ON view_events(business_id);
CREATE INDEX IF NOT EXISTS idx_view_events_viewed_at ON view_events(viewed_at);
