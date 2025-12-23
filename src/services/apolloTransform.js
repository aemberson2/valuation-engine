const { parse } = require('csv-parse/sync');
const fs = require('fs');

// State name to abbreviation mapping (same as csvParser.js)
const STATE_ABBREVIATIONS = {
  'alabama': 'AL', 'alaska': 'AK', 'arizona': 'AZ', 'arkansas': 'AR',
  'california': 'CA', 'colorado': 'CO', 'connecticut': 'CT', 'delaware': 'DE',
  'florida': 'FL', 'georgia': 'GA', 'hawaii': 'HI', 'idaho': 'ID',
  'illinois': 'IL', 'indiana': 'IN', 'iowa': 'IA', 'kansas': 'KS',
  'kentucky': 'KY', 'louisiana': 'LA', 'maine': 'ME', 'maryland': 'MD',
  'massachusetts': 'MA', 'michigan': 'MI', 'minnesota': 'MN', 'mississippi': 'MS',
  'missouri': 'MO', 'montana': 'MT', 'nebraska': 'NE', 'nevada': 'NV',
  'new hampshire': 'NH', 'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY',
  'north carolina': 'NC', 'north dakota': 'ND', 'ohio': 'OH', 'oklahoma': 'OK',
  'oregon': 'OR', 'pennsylvania': 'PA', 'rhode island': 'RI', 'south carolina': 'SC',
  'south dakota': 'SD', 'tennessee': 'TN', 'texas': 'TX', 'utah': 'UT',
  'vermont': 'VT', 'virginia': 'VA', 'washington': 'WA', 'west virginia': 'WV',
  'wisconsin': 'WI', 'wyoming': 'WY', 'district of columbia': 'DC'
};

/**
 * Normalize state to 2-letter code
 */
function normalizeState(state) {
  if (!state) return null;

  const trimmed = state.trim();

  // If already 2 letters, return uppercase
  if (trimmed.length === 2) {
    return trimmed.toUpperCase();
  }

  // Try to find full state name
  const normalized = STATE_ABBREVIATIONS[trimmed.toLowerCase()];
  return normalized || trimmed.toUpperCase();
}

/**
 * Normalize industry (lowercase, replace spaces with underscores)
 */
function normalizeIndustry(industry) {
  if (!industry) return null;

  return industry
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, ''); // Remove any special characters
}

/**
 * Transform Apollo CSV to our format
 *
 * Maps:
 * - Company Name → company_name
 * - Company City (fallback to City) → city
 * - Company State (fallback to State) → state (2-letter code)
 * - Industry → industry (normalized)
 * - Keeps: First Name, Last Name, Email
 *
 * Filters:
 * - Only US businesses (Company Country = "United States")
 * - Must have company name, city, and state
 *
 * @param {string} filePath - Path to Apollo CSV file
 * @returns {Object} - {success: boolean, data: [], errors: [], stats: {}}
 */
async function transformApolloCSV(filePath) {
  try {
    let fileContent = fs.readFileSync(filePath, 'utf-8');

    // Remove BOM (Byte Order Mark) if present - common in Windows Excel exports
    if (fileContent.charCodeAt(0) === 0xFEFF) {
      fileContent = fileContent.slice(1);
    }

    // Parse CSV - use columns function to trim header names
    // (trim: true only trims values, not column headers)
    const records = parse(fileContent, {
      columns: (header) => header.map(h => h.trim()),
      skip_empty_lines: true,
      trim: true
    });

    const transformedBusinesses = [];
    const errors = [];
    const skipped = {
      nonUS: 0,
      missingData: 0,
      invalidState: 0
    };

    records.forEach((record, index) => {
      const lineNumber = index + 2; // +2 because index is 0-based and we skip header

      // Extract fields
      const companyName = record['Company Name'];
      const firstName = record['First Name'];
      const lastName = record['Last Name'];
      const email = record['Email'];
      const apolloContactId = record['Apollo Contact Id'];

      // Use Company City/State if available, fallback to contact City/State
      const city = record['Company City'] || record['City'];
      const state = record['Company State'] || record['State'];
      const country = record['Company Country'] || record['Country'];
      const industry = record['Industry'];

      // Filter: Only US businesses
      if (!country || country.trim() !== 'United States') {
        skipped.nonUS++;
        return;
      }

      // Validate required fields
      if (!companyName || !companyName.trim()) {
        errors.push(`Line ${lineNumber}: Missing Company Name`);
        skipped.missingData++;
        return;
      }

      if (!city || !city.trim()) {
        errors.push(`Line ${lineNumber}: Missing city for ${companyName}`);
        skipped.missingData++;
        return;
      }

      if (!state || !state.trim()) {
        errors.push(`Line ${lineNumber}: Missing state for ${companyName}`);
        skipped.missingData++;
        return;
      }

      // Normalize state
      const normalizedState = normalizeState(state);
      if (!normalizedState || normalizedState.length !== 2) {
        errors.push(`Line ${lineNumber}: Invalid state "${state}" for ${companyName}`);
        skipped.invalidState++;
        return;
      }

      // Normalize industry
      const normalizedIndustry = normalizeIndustry(industry);

      // Create transformed business object
      transformedBusinesses.push({
        company_name: companyName.trim(),
        city: city.trim(),
        state: normalizedState,
        industry: normalizedIndustry,
        // Keep contact info for export
        first_name: firstName ? firstName.trim() : '',
        last_name: lastName ? lastName.trim() : '',
        email: email ? email.trim() : '',
        apollo_contact_id: apolloContactId ? apolloContactId.trim() : ''
      });
    });

    return {
      success: errors.length === 0,
      data: transformedBusinesses,
      errors: errors,
      stats: {
        totalRecords: records.length,
        transformed: transformedBusinesses.length,
        skippedNonUS: skipped.nonUS,
        skippedMissingData: skipped.missingData,
        skippedInvalidState: skipped.invalidState,
        totalSkipped: skipped.nonUS + skipped.missingData + skipped.invalidState
      }
    };

  } catch (error) {
    return {
      success: false,
      data: [],
      errors: [`Failed to parse Apollo CSV: ${error.message}`],
      stats: {
        totalRecords: 0,
        transformed: 0,
        skippedNonUS: 0,
        skippedMissingData: 0,
        skippedInvalidState: 0,
        totalSkipped: 0
      }
    };
  }
}

module.exports = {
  transformApolloCSV,
  normalizeState,
  normalizeIndustry
};
