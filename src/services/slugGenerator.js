/**
 * Generate a clean URL slug from a company name
 *
 * Examples:
 * - "Minuteman Press Central" → "minuteman-press-central"
 * - "Joe's Pizza & Pasta, LLC" → "joes-pizza-pasta-llc"
 * - "ABC Company #1" → "abc-company-1"
 */
function generateSlug(companyName) {
  if (!companyName) return '';

  return companyName
    .toLowerCase()
    .trim()
    // Replace & with 'and'
    .replace(/&/g, 'and')
    // Remove apostrophes
    .replace(/['']/g, '')
    // Replace spaces and underscores with hyphens
    .replace(/[\s_]+/g, '-')
    // Remove all characters except letters, numbers, and hyphens
    .replace(/[^a-z0-9-]/g, '')
    // Replace multiple consecutive hyphens with single hyphen
    .replace(/-+/g, '-')
    // Remove leading/trailing hyphens
    .replace(/^-+|-+$/g, '');
}

/**
 * Generate a short random suffix for duplicate slugs
 * Returns a 4-character alphanumeric string
 */
function generateRandomSuffix() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 4; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Generate a unique slug, checking against existing slugs in the database
 * @param {string} companyName - The company name to slugify
 * @param {object} db - Database connection pool
 * @returns {Promise<string>} - Unique slug
 */
async function generateUniqueSlug(companyName, db) {
  const baseSlug = generateSlug(companyName);

  if (!baseSlug) {
    // Fallback for empty/invalid company names
    return `business-${generateRandomSuffix()}`;
  }

  // Check if the base slug already exists
  let slug = baseSlug;
  let attempts = 0;
  const maxAttempts = 10;

  while (attempts < maxAttempts) {
    const result = await db.query(
      'SELECT id FROM businesses WHERE url_slug = $1 LIMIT 1',
      [slug]
    );

    if (result.rows.length === 0) {
      // Slug is unique
      return slug;
    }

    // Slug exists, add random suffix
    slug = `${baseSlug}-${generateRandomSuffix()}`;
    attempts++;
  }

  // Fallback: use timestamp if all attempts fail
  return `${baseSlug}-${Date.now()}`;
}

module.exports = {
  generateSlug,
  generateRandomSuffix,
  generateUniqueSlug
};
