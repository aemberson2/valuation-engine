const db = require('../config/database');

/**
 * Map city and state to region label and regional modifier
 * Lookup logic:
 *   1. Try exact match: city + state in region_mappings
 *   2. Fallback: state-only match (where city IS NULL)
 *   3. Default: return {region_label: "{city}, {state}", regional_modifier: 1.0}
 *
 * @param {string} city - City name
 * @param {string} state - State abbreviation (2-letter code)
 * @returns {Promise<Object>} - {region_label, regional_modifier}
 */
async function mapRegion(city, state) {
  try {
    // Normalize inputs
    const normalizedCity = city.trim();
    const normalizedState = state.trim().toUpperCase();

    // Try exact match: city + state
    const exactMatch = await db.query(
      `SELECT region_label, regional_modifier
       FROM region_mappings
       WHERE LOWER(TRIM(city)) = LOWER($1)
       AND UPPER(TRIM(state)) = UPPER($2)
       LIMIT 1`,
      [normalizedCity, normalizedState]
    );

    if (exactMatch.rows.length > 0) {
      return {
        region_label: exactMatch.rows[0].region_label,
        regional_modifier: parseFloat(exactMatch.rows[0].regional_modifier)
      };
    }

    // Fallback: state-only match (where city IS NULL)
    const stateMatch = await db.query(
      `SELECT region_label, regional_modifier
       FROM region_mappings
       WHERE city IS NULL
       AND UPPER(TRIM(state)) = UPPER($1)
       LIMIT 1`,
      [normalizedState]
    );

    if (stateMatch.rows.length > 0) {
      return {
        region_label: stateMatch.rows[0].region_label,
        regional_modifier: parseFloat(stateMatch.rows[0].regional_modifier)
      };
    }

    // Default: no match found
    return {
      region_label: `${normalizedCity}, ${normalizedState}`,
      regional_modifier: 1.0
    };

  } catch (error) {
    console.error('Error mapping region:', error);

    // Return default on error
    return {
      region_label: `${city}, ${state}`,
      regional_modifier: 1.0
    };
  }
}

module.exports = {
  mapRegion
};
