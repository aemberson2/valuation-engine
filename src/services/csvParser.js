const { parse } = require('csv-parse/sync');
const fs = require('fs');

// State name to abbreviation mapping
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
 * Handles both full state names and abbreviations
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
 * Parse CSV file and return validated business objects
 * @param {string} filePath - Path to CSV file
 * @returns {Object} - {success: boolean, data: [], errors: []}
 */
async function parseCSV(filePath) {
  try {
    const fileContent = fs.readFileSync(filePath, 'utf-8');

    // Parse CSV with multiple delimiter support
    let records;
    try {
      // Try comma first
      records = parse(fileContent, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        delimiter: ','
      });
    } catch (e) {
      // Try semicolon
      try {
        records = parse(fileContent, {
          columns: true,
          skip_empty_lines: true,
          trim: true,
          delimiter: ';'
        });
      } catch (e2) {
        // Try tab
        records = parse(fileContent, {
          columns: true,
          skip_empty_lines: true,
          trim: true,
          delimiter: '\t'
        });
      }
    }

    const validatedBusinesses = [];
    const errors = [];

    records.forEach((record, index) => {
      const lineNumber = index + 2; // +2 because index is 0-based and we skip header

      // Trim all fields
      const trimmedRecord = {};
      Object.keys(record).forEach(key => {
        trimmedRecord[key.trim()] = typeof record[key] === 'string' ? record[key].trim() : record[key];
      });

      // Validate required fields
      const companyName = trimmedRecord.company_name || trimmedRecord.Company_Name || trimmedRecord['Company Name'];
      const city = trimmedRecord.city || trimmedRecord.City;
      const state = trimmedRecord.state || trimmedRecord.State;

      if (!companyName) {
        errors.push(`Line ${lineNumber}: Missing company_name`);
        return;
      }

      if (!city) {
        errors.push(`Line ${lineNumber}: Missing city`);
        return;
      }

      if (!state) {
        errors.push(`Line ${lineNumber}: Missing state`);
        return;
      }

      // Normalize state
      const normalizedState = normalizeState(state);
      if (!normalizedState) {
        errors.push(`Line ${lineNumber}: Invalid state "${state}"`);
        return;
      }

      // Get optional industry field
      const industry = trimmedRecord.industry || trimmedRecord.Industry || null;

      // Create validated business object
      validatedBusinesses.push({
        company_name: companyName,
        city: city,
        state: normalizedState,
        industry: industry
      });
    });

    return {
      success: errors.length === 0,
      data: validatedBusinesses,
      errors: errors,
      totalRecords: records.length,
      validRecords: validatedBusinesses.length
    };

  } catch (error) {
    return {
      success: false,
      data: [],
      errors: [`Failed to parse CSV: ${error.message}`],
      totalRecords: 0,
      validRecords: 0
    };
  }
}

module.exports = {
  parseCSV,
  normalizeState
};
