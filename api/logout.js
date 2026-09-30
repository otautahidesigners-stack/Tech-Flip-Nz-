import { clearSessionCookie, fromAllowedOrigin, noStore } from './_auth.js';

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
  res.setHeader('Set-Cookie', [clearSessionCookie()]);
  res.status(200).json({ ok: true });
}
