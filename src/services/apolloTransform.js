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
 * Standardize company name:
 * 1. Convert to title case (preserving McDonald's style names)
 * 2. Remove common business suffixes (Inc., LLC, etc.)
 * 3. Clean up extra spaces
 */
function standardizeCompanyName(name) {
  if (!name) return null;

  // First, trim and clean up multiple spaces
  let cleaned = name.trim().replace(/\s+/g, ' ');

  // Remove common business suffixes (case-insensitive)
  const suffixPatterns = [
    /,?\s*Inc\.?$/i,
    /,?\s*LLC$/i,
    /,?\s*L\.L\.C\.?$/i,
    /,?\s*Ltd\.?$/i,
    /,?\s*Corp\.?$/i,
    /,?\s*Co\.?$/i,
    /,?\s*Incorporated$/i,
    /,?\s*Corporation$/i,
    /,?\s*Limited$/i,
    /,?\s*Company$/i
  ];

  for (const pattern of suffixPatterns) {
    cleaned = cleaned.replace(pattern, '');
  }

  // Trim again after removing suffixes
  cleaned = cleaned.trim();

  // Convert to title case
  // Split on spaces and handle each word
  cleaned = cleaned.split(' ').map(word => {
    // Skip empty words
    if (!word) return word;

    // Check for special patterns that should preserve their case
    // McDonald's, O'Brien, etc. - words with apostrophes after first letter
    if (/^[A-Za-z][A-Za-z]?'[A-Za-z]/i.test(word)) {
      // Handle McDonald's style: first letter + letter + apostrophe + rest
      const apostropheIndex = word.indexOf("'");
      if (apostropheIndex > 0) {
        const beforeApostrophe = word.substring(0, apostropheIndex);
        const afterApostrophe = word.substring(apostropheIndex + 1);
        return beforeApostrophe.charAt(0).toUpperCase() +
               beforeApostrophe.slice(1).toLowerCase() +
               "'" +
               afterApostrophe.charAt(0).toUpperCase() +
               afterApostrophe.slice(1).toLowerCase();
      }
    }

    // Standard title case: capitalize first letter, lowercase the rest
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  }).join(' ');

  // Final cleanup of any double spaces that might have been created
  cleaned = cleaned.replace(/\s+/g, ' ').trim();

  return cleaned;
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
  // VERSION MARKER: v2.0 - includes contact fields (first_name, last_name, email, apollo_contact_id)
  console.log('=== APOLLO TRANSFORM v2.0 RUNNING ===');

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

    // DEBUG: Log first record's column names to verify exact headers
    if (records.length > 0) {
      console.log('=== APOLLO CSV DEBUG ===');
      console.log('Column names found:', Object.keys(records[0]));
      console.log('First record raw data:', JSON.stringify(records[0], null, 2));
    }

    records.forEach((record, index) => {
      const lineNumber = index + 2; // +2 because index is 0-based and we skip header

      // Helper function to find a field by multiple possible column names
      const getField = (...possibleNames) => {
        for (const name of possibleNames) {
          if (record[name] !== undefined && record[name] !== '') {
            return record[name];
          }
        }
        return undefined;
      };

      // Extract fields - try multiple possible column name variations
      const companyName = getField('Company Name', 'Company', 'Organization Name', 'Organization');
      const firstName = getField('First Name', 'First name', 'first_name', 'FirstName', 'Person First Name');
      const lastName = getField('Last Name', 'Last name', 'last_name', 'LastName', 'Person Last Name');
      const email = getField('Email', 'email', 'E-mail', 'Person Email', 'Work Email', 'Primary Email');
      const apolloContactId = getField('Apollo Contact Id', 'Apollo Contact ID', 'apollo_contact_id', 'Person ID', 'Contact ID', 'Apollo ID');
      const linkedinUrl = getField('Person Linkedin Url', 'LinkedIn URL', 'LinkedIn', 'Linkedin Url', 'Person LinkedIn URL');
      const companyWebsite = getField('Website', 'Company Website', 'website', 'Website URL', 'Company URL');
      const annualRevenueRaw = getField('Annual Revenue', 'annual_revenue', 'Revenue', 'Company Revenue');

      // DEBUG: Log contact fields for first few records
      if (index < 3) {
        console.log(`Record ${index + 1} contact fields:`, {
          firstName,
          lastName,
          email,
          apolloContactId,
          linkedinUrl,
          companyWebsite,
          companyName
        });
      }

      // Use ONLY Company City/State (not contact location)
      const city = getField('Company City', 'company_city');
      const state = getField('Company State', 'company_state');
      const country = getField('Company Country', 'Country', 'company_country', 'Location Country');
      const industry = getField('Industry', 'industry', 'Company Industry');

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

      // Parse Annual Revenue: if available, reduce by 20% (multiply by 0.8)
      let customRevenue = null;
      if (annualRevenueRaw) {
        // Remove currency symbols, commas, and whitespace, then parse as number
        const cleanedRevenue = annualRevenueRaw.replace(/[$,\s]/g, '');
        const parsedRevenue = parseFloat(cleanedRevenue);
        if (!isNaN(parsedRevenue) && parsedRevenue > 0) {
          // Reduce by 20% since Apollo revenue tends to be overstated
          customRevenue = Math.round(parsedRevenue * 0.8);
        }
      }

      // Standardize company name (title case, remove suffixes, clean spaces)
      const standardizedName = standardizeCompanyName(companyName);

      // Create transformed business object with contact fields
      const transformedBusiness = {
        company_name: standardizedName,
        city: city.trim(),
        state: normalizedState,
        industry: normalizedIndustry,
        first_name: firstName ? firstName.trim() : null,
        last_name: lastName ? lastName.trim() : null,
        email: email ? email.trim() : null,
        apollo_contact_id: apolloContactId ? apolloContactId.trim() : null,
        linkedin_url: linkedinUrl ? linkedinUrl.trim() : null,
        company_website: companyWebsite ? companyWebsite.trim() : null,
        custom_revenue: customRevenue
      };

      // DEBUG: Log what we're adding to the array
      if (index < 2) {
        console.log(`=== TRANSFORMED BUSINESS ${index + 1} ===`);
        console.log(JSON.stringify(transformedBusiness, null, 2));
      }

      transformedBusinesses.push(transformedBusiness);
    });

    // DEBUG: Verify the output before returning
    if (transformedBusinesses.length > 0) {
      console.log('=== TRANSFORM COMPLETE ===');
      console.log('Total transformed:', transformedBusinesses.length);
      console.log('First business keys:', Object.keys(transformedBusinesses[0]));
      console.log('First business contact fields:', {
        first_name: transformedBusinesses[0].first_name,
        last_name: transformedBusinesses[0].last_name,
        email: transformedBusinesses[0].email,
        apollo_contact_id: transformedBusinesses[0].apollo_contact_id,
        linkedin_url: transformedBusinesses[0].linkedin_url,
        company_website: transformedBusinesses[0].company_website
      });
    }

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
  normalizeIndustry,
  standardizeCompanyName
};
