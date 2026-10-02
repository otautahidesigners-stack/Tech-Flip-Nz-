import { fromAllowedOrigin, noStore } from './_auth.js';

// Proxies enquiry-form submissions to FormSubmit. The destination address
// lives only in the BUSINESS_EMAIL environment variable - unlike before,
// it is never present in any file the browser downloads, so it cannot be
// read from page source, view-source, or the network tab's request URL.
const MAX_FIELD = 4000;
const MAX_FIELDS = 40;

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

  const email = process.env.BUSINESS_EMAIL;
  if (!email) {
    res.status(503).json({ error: 'not_configured' });
    return;
  }

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = null; } }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    res.status(400).json({ error: 'bad_request' });
    return;
  }

  // Rebuild a clean payload rather than forwarding the client's object
  // as-is - caps field count/size and drops anything that isn't a plain
  // string, so a malicious payload can't smuggle unexpected structure
  // through to FormSubmit.
  const clean = {};
  let count = 0;
  for (const k of Object.keys(body)) {
    if (count >= MAX_FIELDS) break;
    const v = body[k];
    if (typeof v !== 'string' && typeof v !== 'number') continue;
    clean[String(k).slice(0, 80)] = String(v).slice(0, MAX_FIELD);
    count++;
  }

  try {
    const upstream = await fetch(`https://formsubmit.co/ajax/${encodeURIComponent(email)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'accept': 'application/json' },
      body: JSON.stringify(clean),
    });
    const data = await upstream.json().catch(() => null);
    if (!upstream.ok) {
      res.status(502).json({ error: 'upstream_error' });
      return;
    }
    res.status(200).json({ ok: true, data });
  } catch (e) {
    res.status(502).json({ error: 'upstream_error' });
  }
}
