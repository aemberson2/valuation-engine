const db = require('../config/database');

/**
 * Calculate valuation for a business
 *
 * Logic:
 * 1. Lookup industry assumptions (or use "generic" fallback)
 * 2. Lookup region modifier from region_mappings (or default to 1.0)
 * 3. Use custom_revenue if provided, otherwise use industry average
 * 4. Calculate valuation range based on formulas
 *
 * @param {Object} business - Business object with company_name, city, state, industry, region_label, custom_revenue
 * @returns {Promise<Object>} - Valuation breakdown object
 */
async function calculateValuation(business) {
  try {
    // 1. Lookup industry assumptions
    const assumptions = await getIndustryAssumptions(business.industry);

    // 2. Lookup regional modifier
    const regionalModifier = await getRegionalModifier(business.city, business.state);

    // 3. Determine revenue: use custom_revenue if set, otherwise use industry average
    const hasCustomRevenue = business.custom_revenue !== null && business.custom_revenue !== undefined;
    const baseRevenue = hasCustomRevenue ? business.custom_revenue : assumptions.estimated_revenue;

    // 4. Calculate valuation — use custom_sde if owner submitted it, otherwise derive from revenue
    const hasCustomSDE = business.custom_sde !== null && business.custom_sde !== undefined;
    const baseSDE = hasCustomSDE ? business.custom_sde : baseRevenue * assumptions.sde_margin_pct;
    const adjustedSDE = baseSDE * regionalModifier;
    const valuationLow = adjustedSDE * assumptions.multiple_low;
    const valuationBase = adjustedSDE * assumptions.multiple_base;
    const valuationHigh = adjustedSDE * assumptions.multiple_high;

    return {
      business: {
        company_name: business.company_name,
        city: business.city,
        state: business.state,
        industry: business.industry || 'generic',
        region_label: business.region_label
      },
      assumptions: {
        estimated_revenue: assumptions.estimated_revenue,
        sde_margin_pct: assumptions.sde_margin_pct,
        multiple_low: assumptions.multiple_low,
        multiple_base: assumptions.multiple_base,
        multiple_high: assumptions.multiple_high,
        industry_label: assumptions.industry
      },
      calculations: {
        base_revenue: baseRevenue,
        custom_revenue: hasCustomRevenue ? business.custom_revenue : null,
        uses_custom_revenue: hasCustomRevenue,
        custom_sde: hasCustomSDE ? business.custom_sde : null,
        uses_custom_sde: hasCustomSDE,
        base_sde: baseSDE,
        regional_modifier: regionalModifier,
        adjusted_sde: adjustedSDE,
        valuation_low: valuationLow,
        valuation_base: valuationBase,
        valuation_high: valuationHigh
      },
      formatted: {
        base_revenue: formatCurrency(baseRevenue),
        base_sde: formatCurrency(baseSDE),
        adjusted_sde: formatCurrency(adjustedSDE),
        valuation_low: formatCurrency(valuationLow),
        valuation_base: formatCurrency(valuationBase),
        valuation_high: formatCurrency(valuationHigh),
        sde_margin_pct: formatPercent(assumptions.sde_margin_pct),
        regional_modifier: regionalModifier.toFixed(2) + 'x',
        multiple_range: `${assumptions.multiple_low.toFixed(1)}x – ${assumptions.multiple_high.toFixed(1)}x`
      }
    };

  } catch (error) {
    console.error('Error calculating valuation:', error);
    throw error;
  }
}

/**
 * Get industry assumptions from database
 * Falls back to "generic" if industry not found or not active
 */
async function getIndustryAssumptions(industry) {
  try {
    // If no industry specified, use generic
    if (!industry) {
      return await getGenericAssumptions();
    }

    // Try to find industry-specific assumptions
    const result = await db.query(
      `SELECT industry, estimated_revenue, sde_margin_pct,
              multiple_low, multiple_base, multiple_high
       FROM valuation_assumptions
       WHERE LOWER(industry) = LOWER($1)
       AND is_active = true
       LIMIT 1`,
      [industry]
    );

    if (result.rows.length > 0) {
      return {
        industry: result.rows[0].industry,
        estimated_revenue: parseInt(result.rows[0].estimated_revenue),
        sde_margin_pct: parseFloat(result.rows[0].sde_margin_pct),
        multiple_low: parseFloat(result.rows[0].multiple_low),
        multiple_base: parseFloat(result.rows[0].multiple_base),
        multiple_high: parseFloat(result.rows[0].multiple_high)
      };
    }

    // Fallback to generic
    return await getGenericAssumptions();

  } catch (error) {
    console.error('Error looking up industry assumptions:', error);
    return await getGenericAssumptions();
  }
}

/**
 * Get generic fallback assumptions
 */
async function getGenericAssumptions() {
  const result = await db.query(
    `SELECT industry, estimated_revenue, sde_margin_pct,
            multiple_low, multiple_base, multiple_high
     FROM valuation_assumptions
     WHERE LOWER(industry) = 'generic'
     AND is_active = true
     LIMIT 1`
  );

  if (result.rows.length === 0) {
    throw new Error('Generic assumptions not found in database');
  }

  return {
    industry: result.rows[0].industry,
    estimated_revenue: parseInt(result.rows[0].estimated_revenue),
    sde_margin_pct: parseFloat(result.rows[0].sde_margin_pct),
    multiple_low: parseFloat(result.rows[0].multiple_low),
    multiple_base: parseFloat(result.rows[0].multiple_base),
    multiple_high: parseFloat(result.rows[0].multiple_high)
  };
}

/**
 * Get regional modifier from region_mappings
 * Returns 1.0 if no specific mapping found
 */
async function getRegionalModifier(city, state) {
  try {
    // Try exact city + state match
    const exactMatch = await db.query(
      `SELECT regional_modifier
       FROM region_mappings
       WHERE LOWER(TRIM(city)) = LOWER($1)
       AND UPPER(TRIM(state)) = UPPER($2)
       LIMIT 1`,
      [city, state]
    );

    if (exactMatch.rows.length > 0) {
      return parseFloat(exactMatch.rows[0].regional_modifier);
    }

    // Try state-only match
    const stateMatch = await db.query(
      `SELECT regional_modifier
       FROM region_mappings
       WHERE city IS NULL
       AND UPPER(TRIM(state)) = UPPER($1)
       LIMIT 1`,
      [state]
    );

    if (stateMatch.rows.length > 0) {
      return parseFloat(stateMatch.rows[0].regional_modifier);
    }

    // Default to 1.0
    return 1.0;

  } catch (error) {
    console.error('Error looking up regional modifier:', error);
    return 1.0;
  }
}

/**
 * Format number as currency
 */
function formatCurrency(amount) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount);
}

/**
 * Format decimal as percentage
 */
function formatPercent(decimal) {
  return (decimal * 100).toFixed(0) + '%';
}

module.exports = {
  calculateValuation
};
