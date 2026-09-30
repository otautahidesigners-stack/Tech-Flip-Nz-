// Browsers POST CSP violation reports here when the policy blocks something.
// This never returns report content to any client - it only logs to
// Vercel's server-side function logs, for the site owner to review.
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }
  try {
    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = null; } }
    // Cap what gets logged so a malicious/huge report can't fill up logs.
    const text = JSON.stringify(body).slice(0, 4000);
    console.warn('CSP violation report:', text);
  } catch (e) { /* never fail the request over a malformed report */ }
  res.status(204).end();
}
