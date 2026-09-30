// Server-only helpers for the admin login system. Nothing in this file is
// ever sent to the browser as source - it only runs inside Vercel's Node
// serverless runtime. No secret value from here is ever included in an
// HTTP response body; only opaque, signed tokens are.
import crypto from 'crypto';

const SESSION_COOKIE = 'pt_session';
const FAILS_COOKIE = 'pt_lf';
const SESSION_MAX_AGE = 60 * 60 * 8; // 8 hours

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 16) throw new Error('SESSION_SECRET missing or too short');
  return s;
}

function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function fromB64url(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  return Buffer.from(str, 'base64');
}
function hmac(payload) {
  return crypto.createHmac('sha256', secret()).update(payload).digest();
}
function sign(obj) {
  const payload = b64url(JSON.stringify(obj));
  const sig = b64url(hmac(payload));
  return payload + '.' + sig;
}
function verify(token) {
  if (!token || token.indexOf('.') === -1) return null;
  const [payload, sig] = token.split('.');
  let expected;
  try { expected = b64url(hmac(payload)); } catch (e) { return null; }
  const a = Buffer.from(sig || '');
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try { return JSON.parse(fromB64url(payload).toString('utf8')); } catch (e) { return null; }
}

/** Parse the Cookie header into a plain object. */
function parseCookies(req) {
  const out = {};
  const header = req.headers.cookie;
  if (!header) return out;
  header.split(';').forEach(part => {
    const i = part.indexOf('=');
    if (i === -1) return;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  });
  return out;
}

function cookieAttrs(maxAge) {
  // Secure is safe to always set: Vercel production and preview URLs are
  // always served over HTTPS, so this never blocks the cookie from being
  // set during real use.
  const parts = ['Path=/', 'HttpOnly', 'Secure', 'SameSite=Strict'];
  parts.push(maxAge === 0 ? 'Max-Age=0' : 'Max-Age=' + maxAge);
  return parts.join('; ');
}

function setSessionCookie(username) {
  const tok = sign({ u: username, exp: Date.now() + SESSION_MAX_AGE * 1000 });
  return `${SESSION_COOKIE}=${tok}; ${cookieAttrs(SESSION_MAX_AGE)}`;
}
function clearSessionCookie() {
  return `${SESSION_COOKIE}=; ${cookieAttrs(0)}`;
}

/** Returns the logged-in username, or null. Never throws. */
function getSession(req) {
  try {
    const cookies = parseCookies(req);
    const claim = verify(cookies[SESSION_COOKIE]);
    if (!claim || typeof claim.exp !== 'number' || Date.now() > claim.exp) return null;
    return claim.u || null;
  } catch (e) { return null; }
}

/**
 * Stateless brute-force throttling: a signed cookie carries the failed-attempt
 * count and the time of the last failure. The client cannot forge or roll
 * this back without the server's SESSION_SECRET (any tampering fails HMAC
 * verification and is treated as "no history"). This works without a
 * database, but it is per-browser, not per-IP or global: an attacker who
 * discards cookies between attempts resets their own counter. Real,
 * server-tracked, cross-client rate limiting needs a shared store (e.g.
 * Vercel KV / Upstash) - not configured here. Documented as a known
 * limitation rather than presented as complete protection.
 */
function getFailureState(req) {
  const cookies = parseCookies(req);
  const claim = verify(cookies[FAILS_COOKIE]);
  if (!claim) return { count: 0, until: 0 };
  return { count: claim.n || 0, until: claim.until || 0 };
}
function recordFailure(req) {
  const st = getFailureState(req);
  const count = st.count + 1;
  const delayMs = Math.min(30000, Math.pow(2, Math.min(count, 8)) * 250); // capped exponential backoff, max 30s
  const until = Date.now() + delayMs;
  const tok = sign({ n: count, until });
  return { count, until, cookie: `${FAILS_COOKIE}=${tok}; ${cookieAttrs(3600)}` };
}
function clearFailuresCookie() {
  return `${FAILS_COOKIE}=; ${cookieAttrs(0)}`;
}

/** scrypt password verification. Stored format: "scrypt$saltHex$hashHex". */
function verifyPassword(password, stored) {
  if (!stored || typeof stored !== 'string') return false;
  const parts = stored.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const [, saltHex, hashHex] = parts;
  try {
    const salt = Buffer.from(saltHex, 'hex');
    const expected = Buffer.from(hashHex, 'hex');
    const actual = crypto.scryptSync(String(password), salt, expected.length);
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
  } catch (e) { return false; }
}

/** Same-site allow-list check, matching the pattern used by api/chat.js. */
function fromAllowedOrigin(req) {
  const ALLOWED = ['https://phonetrade.nz', 'https://www.phonetrade.nz'];
  const origin = req.headers.origin || '';
  const referer = req.headers.referer || req.headers.referrer || '';
  const host = req.headers.host || '';
  if (origin && origin.replace(/^https?:\/\//, '') === host) return true;
  return ALLOWED.some(o => origin === o || referer.indexOf(o + '/') === 0);
}

function noStore(res) {
  res.setHeader('Cache-Control', 'no-store');
}

export {
  setSessionCookie, clearSessionCookie, getSession,
  getFailureState, recordFailure, clearFailuresCookie,
  verifyPassword, fromAllowedOrigin, noStore,
};
