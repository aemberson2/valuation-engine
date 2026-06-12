const crypto = require('crypto');

const AUTH_COOKIE_NAME = 'api_auth_token';

// Warn once at startup if auth is not configured
if (!process.env.API_AUTH_TOKEN) {
  console.warn('⚠️  API_AUTH_TOKEN is not set - sensitive routes are UNPROTECTED. Set API_AUTH_TOKEN in Railway to enable authentication.');
}

/**
 * Constant-time comparison of a candidate token against the configured token.
 * Hashes both sides first so timingSafeEqual works on equal-length buffers
 * and token length is not leaked.
 */
function tokenMatches(candidate) {
  if (typeof candidate !== 'string' || candidate.length === 0) {
    return false;
  }
  const expected = crypto.createHash('sha256').update(process.env.API_AUTH_TOKEN).digest();
  const actual = crypto.createHash('sha256').update(candidate).digest();
  return crypto.timingSafeEqual(expected, actual);
}

/**
 * Extract the auth cookie without requiring the cookie-parser dependency.
 */
function getCookieToken(req) {
  const header = req.headers.cookie;
  if (!header) return null;

  for (const part of header.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === AUTH_COOKIE_NAME) {
      return decodeURIComponent(rest.join('='));
    }
  }
  return null;
}

/**
 * Auth middleware for sensitive routes.
 * Accepts the token via (in order):
 *   1. Authorization: Bearer <token> header
 *   2. ?token=<token> query parameter
 *   3. Cookie set by visiting /auth?token=<token>
 *
 * If API_AUTH_TOKEN is unset, requests are allowed through (warning logged
 * at startup) so the app stays usable before the token is configured.
 */
function requireAuth(req, res, next) {
  if (!process.env.API_AUTH_TOKEN) {
    return next();
  }

  let candidate = null;

  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    candidate = authHeader.slice('Bearer '.length).trim();
  } else if (typeof req.query.token === 'string') {
    candidate = req.query.token;
  } else {
    candidate = getCookieToken(req);
  }

  if (tokenMatches(candidate)) {
    return next();
  }

  res.status(401);
  if (req.accepts('html') && !req.xhr) {
    return res.send(
      '<h1>401 Unauthorized</h1>' +
      '<p>This page requires authentication. In your browser, visit ' +
      '<code>/auth?token=&lt;your token&gt;</code> once to sign in, ' +
      'or pass an <code>Authorization: Bearer</code> header for API access.</p>'
    );
  }
  return res.json({ success: false, error: 'Unauthorized' });
}

/**
 * GET /auth?token=<token> - validates the token and stores it in a cookie
 * so the browser can use the upload and admin pages normally.
 */
function authRoute(req, res) {
  if (!process.env.API_AUTH_TOKEN) {
    return res.send('API_AUTH_TOKEN is not configured on the server - authentication is currently disabled.');
  }

  const token = typeof req.query.token === 'string' ? req.query.token : null;

  if (!tokenMatches(token)) {
    return res.status(401).send('Invalid or missing token. Use /auth?token=<your token>');
  }

  const cookieParts = [
    `${AUTH_COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${60 * 60 * 24 * 90}` // 90 days
  ];
  if (process.env.NODE_ENV === 'production') {
    cookieParts.push('Secure');
  }
  res.setHeader('Set-Cookie', cookieParts.join('; '));

  res.redirect('/admin');
}

module.exports = { requireAuth, authRoute, AUTH_COOKIE_NAME };
