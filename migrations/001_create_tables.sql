-- Create UUID extension if not exists
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Businesses table
CREATE TABLE businesses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_name VARCHAR(255) NOT NULL,
    city VARCHAR(100) NOT NULL,
    state VARCHAR(2) NOT NULL,
    industry VARCHAR(100),
    region_label VARCHAR(255) NOT NULL,
    valuation_url_slug UUID NOT NULL UNIQUE DEFAULT uuid_generate_v4(),
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    email VARCHAR(255),
    apollo_contact_id VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    view_count INTEGER DEFAULT 0
);

-- Valuation assumptions table
CREATE TABLE valuation_assumptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    industry VARCHAR(100) NOT NULL UNIQUE,
    estimated_revenue INTEGER NOT NULL,
    sde_margin_pct DECIMAL(5,4) NOT NULL,
    multiple_low DECIMAL(4,2) NOT NULL,
    multiple_base DECIMAL(4,2) NOT NULL,
    multiple_high DECIMAL(4,2) NOT NULL,
    is_active BOOLEAN DEFAULT true,
    CHECK (multiple_low < multiple_base),
    CHECK (multiple_base < multiple_high),
    CHECK (sde_margin_pct >= 0 AND sde_margin_pct <= 1)
);

-- Region mappings table
CREATE TABLE region_mappings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    state VARCHAR(2) NOT NULL,
    city VARCHAR(100),
    region_label VARCHAR(255) NOT NULL,
    regional_modifier DECIMAL(4,2) NOT NULL DEFAULT 1.00,
    CHECK (regional_modifier >= 0.5 AND regional_modifier <= 1.5),
    UNIQUE(state, city)
);

-- Create indexes for common queries
CREATE INDEX idx_businesses_slug ON businesses(valuation_url_slug);
CREATE INDEX idx_businesses_location ON businesses(city, state);
CREATE INDEX idx_businesses_email ON businesses(email);
CREATE INDEX idx_businesses_apollo_id ON businesses(apollo_contact_id);
CREATE INDEX idx_region_mappings_lookup ON region_mappings(state, city);
