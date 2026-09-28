# PhoneTrade NZ - rate limiting setup

The website already throttles itself in the visitor's browser:

| Action | Limit |
| --- | --- |
| Enquiry emails (sell, trade-in, contact, not listed, cart) | 1 every 20 seconds, 5 per hour |
| Chat assistant messages | 1 every 1.5 seconds, 20 per 10 minutes |
| Admin login | 5 wrong tries locks for 30 s, then 1, 2, 4 min... up to 1 hour. Kept after reload. |

A browser limit only stops normal people and simple bots. A determined bot can
skip the page and hit the endpoints directly, so add these at the edge too.

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

## FormSubmit (the email relay the forms use)

- Log in at formsubmit.co with ravinderbhullar1789@gmail.com and switch the
  form to the random-string endpoint so the email address is not exposed.
- Only allow your own domain in the FormSubmit dashboard.
