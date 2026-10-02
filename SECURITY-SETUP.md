# PhoneTrade NZ - rate limiting & enquiry delivery setup

## Enquiry delivery (contact, sell, trade-in, "not listed", cart)

Forms no longer talk to FormSubmit directly from the browser. They POST to
`/api/enquiry`, a server-side relay (see `api/enquiry.js`), which forwards
to FormSubmit using the `BUSINESS_EMAIL` environment variable. That address
is never present in any file the browser downloads - only in Vercel's
environment variable store.

**To receive enquiries, add one environment variable in Vercel:**

| Name | Value |
|---|---|
| `BUSINESS_EMAIL` | the inbox you want enquiries delivered to |

The first submission after adding it triggers a one-off FormSubmit
activation email to that address - it must be clicked before anything is
actually delivered. Until the variable is set, the site tells the customer
the submission could not be sent rather than silently failing.

## Rate limiting already in place (client-side)

| Action | Limit |
| --- | --- |
| Enquiry emails (sell, trade-in, contact, not listed, cart) | 1 every 20 seconds, 5 per hour |
| Chat assistant messages | 1 every 1.5 seconds, 20 per 10 minutes |
| Admin login | 5 wrong tries locks for 30 s, then 1, 2, 4 min... up to 1 hour. Kept after reload. |
| `/api/login` (server-side) | Signed, tamper-evident per-browser backoff - see `api/_auth.js` |

A browser limit only stops normal people and simple bots. A determined bot
can skip the page and hit the endpoints directly, so add these at the edge
too for real protection:

## Cloudflare (recommended, free plan works)

1. Put the domain on Cloudflare (orange cloud on).
2. Security > WAF > Rate limiting rules > Create rule.
3. Rule 1 - Login
   - If: URI Path equals `/api/login` and Request Method equals `POST`
   - Rate: 5 requests per 1 minute, per IP
   - Then: Block for 10 minutes
4. Rule 2 - All API endpoints
   - If: URI Path starts with `/api/`
   - Rate: 60 requests per 1 minute, per IP
   - Then: Block for 1 minute
5. Security > Bots: turn on Bot Fight Mode.
6. Add Cloudflare Turnstile to the enquiry forms if spam still gets through.
