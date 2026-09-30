import { getSession, noStore } from './_auth.js';

export default async function handler(req, res) {
  noStore(res);
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }
  // Presence of this endpoint (any 200 response) is what tells the client
  // "a real server exists" (see SRV.on in the frontend). Whether the admin
  // account itself is configured, and whether this visitor is logged in,
  // are reported separately so the client never has to guess.
  const configured = !!(process.env.ADMIN_USERNAME && process.env.ADMIN_PASSWORD_HASH && process.env.SESSION_SECRET);
  const username = configured ? getSession(req) : null;
  res.status(200).json({ server: true, configured, admin: !!username });
}
