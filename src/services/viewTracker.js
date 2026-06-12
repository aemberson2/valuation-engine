const crypto = require('crypto');
const { AUTH_COOKIE_NAME } = require('../middleware/auth');

/**
 * User-agent substrings (lowercase) that should never count as views.
 * Covers CLI tools, social-preview fetchers, email-security link scanners,
 * search crawlers, and headless browsers. Add new entries here as they
 * show up in logs.
 */
const BOT_UA_PATTERNS = [
  'curl',
  'wget',
  'python-requests',
  'python-urllib',
  'slackbot',
  'facebookexternalhit',
  'linkedinbot',
  'whatsapp',
  'twitterbot',
  'barracuda',
  'mimecast',
  'safelinks',
  'office existence discovery', // Microsoft Office link validation
  'googleimageproxy',
  'googlebot',
  'bingbot',
  'headlesschrome',
  'bot/',
  'spider',
  'crawler'
];

// At most 1 counted view per business + IP + user-agent per hour
const DEDUP_WINDOW_MS = 60 * 60 * 1000;
const SWEEP_THRESHOLD = 10000;

const recentViews = new Map();

function hashIp(ip) {
  return crypto.createHash('sha256').update(String(ip || '')).digest('hex').slice(0, 32);
}

function isBotUserAgent(userAgent) {
  if (!userAgent) return true; // no UA header = not a real browser
  const ua = userAgent.toLowerCase();
  return BOT_UA_PATTERNS.some((pattern) => ua.includes(pattern));
}

function hasAuthCookie(req) {
  const header = req.headers.cookie;
  if (!header) return false;
  return header.split(';').some((part) => part.trim().split('=')[0] === AUTH_COOKIE_NAME);
}

function isPrefetch(req) {
  const purpose = req.headers['sec-purpose'] || req.headers.purpose || req.headers['x-moz'] || '';
  return /prefetch|preview|prerender/i.test(purpose);
}

function sweepExpired(now) {
  for (const [key, timestamp] of recentViews) {
    if (now - timestamp >= DEDUP_WINDOW_MS) {
      recentViews.delete(key);
    }
  }
}

/**
 * Decide whether this request counts as a real view.
 * Filters HEAD requests, admin previews (?preview=1), requests carrying our
 * auth cookie (the admin's own visits), bot/scanner user agents, browser
 * prefetches, and repeat views from the same business + IP + UA within an hour.
 *
 * Note: this also records the request in the dedup cache when it counts,
 * so call it at most once per request.
 */
function shouldCountView(req, businessId) {
  if (req.method !== 'GET') return false; // Express routes HEAD to GET handlers
  if (req.query.preview === '1') return false;
  if (hasAuthCookie(req)) return false;
  if (isBotUserAgent(req.headers['user-agent'])) return false;
  if (isPrefetch(req)) return false;

  const now = Date.now();
  const key = `${businessId}|${hashIp(req.ip)}|${req.headers['user-agent']}`;
  const lastSeen = recentViews.get(key);
  if (lastSeen && now - lastSeen < DEDUP_WINDOW_MS) {
    return false;
  }

  recentViews.set(key, now);
  if (recentViews.size > SWEEP_THRESHOLD) {
    sweepExpired(now);
  }
  return true;
}

/**
 * Record a counted view: increment the cumulative view_count (what the
 * admin UI shows) and log a timestamped row in view_events for analytics.
 */
async function recordView(db, businessId, req) {
  await db.query(
    'UPDATE businesses SET view_count = view_count + 1 WHERE id = $1',
    [businessId]
  );

  try {
    await db.query(
      'INSERT INTO view_events (business_id, ip_hash, user_agent) VALUES ($1, $2, $3)',
      [businessId, hashIp(req.ip), req.headers['user-agent'] || null]
    );
  } catch (error) {
    // Event log is best-effort; never block the page over it
    console.error('Error logging view event:', error.message);
  }
}

module.exports = { shouldCountView, recordView, BOT_UA_PATTERNS };
