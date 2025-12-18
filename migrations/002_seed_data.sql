-- Seed valuation assumptions
INSERT INTO valuation_assumptions (industry, estimated_revenue, sde_margin_pct, multiple_low, multiple_base, multiple_high) VALUES
('generic', 750000, 0.20, 2.0, 2.5, 3.0),
('restaurant', 850000, 0.18, 1.8, 2.2, 2.8),
('dental_practice', 1200000, 0.30, 3.5, 4.0, 4.5),
('retail', 900000, 0.15, 2.0, 2.5, 3.0),
('hvac', 1000000, 0.25, 2.5, 3.0, 3.5),
('landscaping', 600000, 0.22, 2.0, 2.5, 3.0),
('professional_services', 800000, 0.28, 2.5, 3.0, 3.5);

-- Seed region mappings
INSERT INTO region_mappings (state, city, region_label, regional_modifier) VALUES
('MN', 'Minneapolis', 'the Minneapolis-St. Paul metro area', 1.10),
('MN', 'St. Paul', 'the Minneapolis-St. Paul metro area', 1.10),
('MN', 'Bloomington', 'the Minneapolis-St. Paul metro area', 1.10),
('MN', 'Rochester', 'the Rochester area', 1.05),
('MN', 'Duluth', 'the Duluth area', 0.95),
('MN', NULL, 'Minnesota', 1.00),
('WI', 'Madison', 'the Madison metro area', 1.08),
('WI', 'Milwaukee', 'the Milwaukee metro area', 1.10),
('WI', 'Green Bay', 'the Green Bay area', 1.00),
('WI', NULL, 'Wisconsin', 0.98),
('IA', 'Des Moines', 'the Des Moines metro area', 1.05),
('IA', 'Cedar Rapids', 'the Cedar Rapids area', 1.00),
('IA', NULL, 'Iowa', 0.95);
