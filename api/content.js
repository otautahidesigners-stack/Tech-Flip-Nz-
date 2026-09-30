import { getSession, fromAllowedOrigin, noStore } from './_auth.js';

// Persists the admin-edited catalog/site overrides so "Publish" really does
// go live for every visitor, not just the admin's own browser. Backed by
// Vercel KV (Upstash Redis) via its REST API, if that integration has been
// added to the project (env vars KV_REST_API_URL / KV_REST_API_TOKEN, or
// Upstash's own UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN names -
// Vercel's KV integration sets one of these pairs automatically). If neither
// is present, reads return "not connected" and writes are refused with a
// clear message - the admin panel then correctly shows "saved in this
// browser only", exactly as it already does today with no server at all.
const KV_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const KEY = 'phonetrade:site-content';
const MAX_BYTES = 2 * 1024 * 1024; // 2MB sanity cap

async function kvGet() {
  const r = await fetch(`${KV_URL}/get/${encodeURIComponent(KEY)}`, {
    headers: { Authorization: `Bearer ${KV_TOKEN}` },
  });
  if (!r.ok) throw new Error('kv_get_failed');
  const data = await r.json();
  if (!data || data.result == null) return null;
  try { return JSON.parse(data.result); } catch (e) { return null; }
}
async function kvSet(value) {
  const r = await fetch(`${KV_URL}/set/${encodeURIComponent(KEY)}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(JSON.stringify(value)),
  });
  if (!r.ok) throw new Error('kv_set_failed');
}

export default async function handler(req, res) {
  noStore(res);
  const kvConnected = !!(KV_URL && KV_TOKEN);

  if (req.method === 'GET') {
    if (!kvConnected) { res.status(200).json({}); return; }
    try {
      const data = await kvGet();
      res.status(200).json(data || {});
    } catch (e) {
      res.status(200).json({}); // fail open to "no overrides yet", never 500 the whole site's content load
    }
    return;
  }

  if (req.method === 'PUT') {
    if (!fromAllowedOrigin(req)) { res.status(403).json({ error: 'forbidden_origin' }); return; }
    // Authorization happens here, server-side, on every write - never
    // trusted from any client-supplied flag.
    const username = getSession(req);
    if (!username) { res.status(401).json({ error: 'unauthorized' }); return; }
    if (!kvConnected) {
      res.status(501).json({ error: 'kv_not_configured', message: 'No Vercel KV / Upstash Redis is connected to this project yet, so publishing has nowhere durable to write. Add the integration (or KV_REST_API_URL/KV_REST_API_TOKEN env vars) in Vercel, then redeploy.' });
      return;
    }
    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = null; } }
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      res.status(400).json({ error: 'bad_request' });
      return;
    }
    const size = Buffer.byteLength(JSON.stringify(body), 'utf8');
    if (size > MAX_BYTES) {
      res.status(413).json({ error: 'too_large' });
      return;
    }
    try {
      await kvSet(body);
      res.status(200).json({ ok: true });
    } catch (e) {
      res.status(502).json({ error: 'kv_write_failed' });
    }
    return;
  }

  res.status(405).json({ error: 'method_not_allowed' });
}
