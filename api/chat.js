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
  const rawMsgs = Array.isArray(body && body.messages) ? body.messages : [];
  if (!system || !rawMsgs.length) {
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
      res.status(upstream.status || 502).json({
        error: (data && data.error && data.error.message) || 'upstream_error',
      });
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
