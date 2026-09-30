import { setSessionCookie, getFailureState, recordFailure, clearFailuresCookie, verifyPassword, fromAllowedOrigin, noStore } from './_auth.js';

export default async function handler(req, res) {
  noStore(res);
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }
  if (!fromAllowedOrigin(req)) {
    res.status(403).json({ error: 'forbidden_origin' });
    return;
  }

  const ADMIN_USER = process.env.ADMIN_USERNAME;
  const ADMIN_HASH = process.env.ADMIN_PASSWORD_HASH;
  const hasSecret = (() => { try { return !!process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 16; } catch (e) { return false; } })();
  if (!ADMIN_USER || !ADMIN_HASH || !hasSecret) {
    // The endpoint exists (so the client knows a server is present) but the
    // admin account has not been configured yet. See README-ADMIN-SETUP.md.
    res.status(503).json({ error: 'not_configured' });
    return;
  }

  // Stateless, per-browser brute-force throttle (see api/_auth.js for the
  // honest limitation: it's per-cookie, not per-IP or global).
  const st = getFailureState(req);
  if (st.count >= 5 && Date.now() < st.until) {
    const waitSec = Math.ceil((st.until - Date.now()) / 1000);
    res.status(429).json({ error: 'too_many_attempts', retryAfterSeconds: waitSec });
    return;
  }

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = null; } }
  const username = String((body && body.username) || '').slice(0, 100);
  const password = String((body && body.password) || '').slice(0, 200);
  if (!username || !password) {
    res.status(400).json({ error: 'bad_request' });
    return;
  }

  // Constant-shape comparison: always run the (slow) scrypt verification,
  // even when the username is already wrong, so response timing doesn't
  // reveal whether the username was correct.
  const userOk = username === ADMIN_USER;
  const passOk = verifyPassword(password, ADMIN_HASH);

  if (!userOk || !passOk) {
    const fail = recordFailure(req);
    res.setHeader('Set-Cookie', [fail.cookie]);
    res.status(401).json({ error: 'invalid_credentials' });
    return;
  }

  res.setHeader('Set-Cookie', [clearFailuresCookie(), setSessionCookie(username)]);
  res.status(200).json({ ok: true });
}
