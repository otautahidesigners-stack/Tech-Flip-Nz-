// Vercel serverless function: server-side bridge to the real Anthropic API.
// Keeps the API key on the server only (never sent to the browser).
//
// Setup required in Vercel: Project -> Settings -> Environment Variables
//   ANTHROPIC_API_KEY = sk-ant-...   (from console.anthropic.com)
// Redeploy after adding it. Until it is set, this endpoint replies 503 and
// the site quietly falls back to its built-in, no-AI assistant, so the chat
// never breaks - it just answers with rule-based replies instead of Claude.

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  // This endpoint has no server-side copy of the live device catalog, so the
  // system prompt (which embeds real catalog/pricing data) has to be sent by
  // the client. That means a bare POST could carry ANY system prompt an
  // attacker writes, turning this into a free, unrestricted Claude proxy.
  // Two real, but not bulletproof, mitigations: only accept requests whose
  // browser-set Origin/Referer matches this site (stops other sites' pages
  // and simple scripted abuse - a non-browser client can still spoof this
  // header), and require the prompt to carry this site's own marker line
  // (raises the bar above a naive curl request - anyone who reads the
  // client bundle can still find and replay it). Real, complete protection
  // needs the prompt built server-side instead of trusted from the client;
  // that isn't done here because it would mean duplicating the whole catalog
  // server-side, which this static-site architecture doesn't support.
  const ALLOWED_ORIGINS = ['https://phonetrade.nz', 'https://www.phonetrade.nz'];
  const origin = req.headers.origin || '';
  const referer = req.headers.referer || req.headers.referrer || '';
  const fromAllowedOrigin = ALLOWED_ORIGINS.some(o => origin === o || referer.indexOf(o + '/') === 0);
  // Also allow Vercel's own preview/production deployment hosts for this project.
  const host = req.headers.host || '';
  const fromThisHost = !!origin && origin.replace(/^https?:\/\//, '') === host;
  if (!fromAllowedOrigin && !fromThisHost) {
    res.status(403).json({ error: 'forbidden_origin' });
    return;
  }

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    res.status(503).json({ error: 'not_configured' });
    return;
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { body = null; }
  }
  const system = String((body && body.system) || '').slice(0, 16000);
  const PROMPT_MARKER = 'PhoneTrade New Zealand'; // present in the real rules() prompt only
  if (!system || system.indexOf(PROMPT_MARKER) === -1) {
    res.status(400).json({ error: 'bad_request' });
    return;
  }
  const rawMsgs = Array.isArray(body && body.messages) ? body.messages : [];
  if (!rawMsgs.length) {
    res.status(400).json({ error: 'bad_request' });
    return;
  }

  // Keep only the last 12 turns and cap each message's length, so a
  // malicious or huge client payload can't blow out cost or the request size.
  const messages = rawMsgs.slice(-12).map(m => ({
    role: m && m.role === 'assistant' ? 'assistant' : 'user',
    content: String((m && m.content) || '').slice(0, 4000),
  })).filter(m => m.content);
  if (!messages.length) {
    res.status(400).json({ error: 'bad_request' });
    return;
  }
  // The API requires the transcript to start with a user turn.
  while (messages.length && messages[0].role !== 'user') messages.shift();
  if (!messages.length) {
    res.status(400).json({ error: 'bad_request' });
    return;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);

  try {
    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 600,
        system,
        messages,
      }),
      signal: controller.signal,
    });

    const data = await upstream.json().catch(() => null);
    if (!upstream.ok || !data) {
      // Log the real reason server-side only - never echo upstream error
      // details (could include internal account/rate-limit specifics) back
      // to an untrusted browser client.
      try { console.error('PhoneTrade /api/chat upstream error:', upstream.status, data && data.error); } catch (_) {}
      res.status(upstream.status === 429 ? 429 : 502).json({ error: 'upstream_error' });
      return;
    }

    const text = (data.content || [])
      .filter(b => b && b.type === 'text' && typeof b.text === 'string')
      .map(b => b.text)
      .join('\n')
      .trim();

    if (!text) {
      res.status(502).json({ error: 'empty_response' });
      return;
    }

    res.status(200).json({ text });
  } catch (e) {
    const timedOut = e && e.name === 'AbortError';
    res.status(timedOut ? 504 : 500).json({ error: timedOut ? 'timeout' : 'server_error' });
  } finally {
    clearTimeout(timeout);
  }
}
