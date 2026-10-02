# Setting up real admin login

The admin panel now uses a real, server-verified login instead of a
password check that ran in the browser. Nothing works until you add the
environment variables below in Vercel - until then, the admin panel keeps
working exactly as it did before (saved to your own browser only), so
nothing breaks in the meantime.

## Add these environment variables in Vercel

Project → Settings → Environment Variables. Add:

| Name | Value |
|---|---|
| `ADMIN_USERNAME` | your chosen admin username |
| `ADMIN_PASSWORD_HASH` | generate with `node scripts/hash-password.js "your real password"` - copy the `scrypt$...` value it prints |
| `SESSION_SECRET` | a long random string - generate with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `BUSINESS_EMAIL` | the inbox you want customer enquiries (contact, sell, trade-in) delivered to |

**Important: this file is in your public GitHub repository. Never paste the
actual values into this file or any other file in the project** - only into
Vercel's Environment Variables screen, which is private to your account.
`SESSION_SECRET` especially must stay out of the repo: anyone who can read
it could forge a valid admin login without ever knowing the password.

Apply all four to Production (and Preview if you want the same behaviour there).

## 3. Redeploy

Any push, or Vercel's "Redeploy" button, picks up the new environment
variables. After that, logging into `/admin` is verified on the server -
the password never touches the browser, and the session cookie is
`HttpOnly`, `Secure`, `SameSite=Strict` so JavaScript can't read it and it's
never sent on a request made from another site.

## 4. Optional: make "Publish" actually go live for every visitor

Right now, editing the catalog in `/admin` and clicking Publish still only
saves to your own browser (exactly like before) - logging in is real, but
there's nowhere durable to write a shared, site-wide copy yet. To fix that,
add a Vercel KV (Upstash Redis) store to the project - Vercel's dashboard
has a "Storage → KV" tab that connects it and sets the right environment
variables automatically. Once that's connected and redeployed, Publish
writes there instead, and every visitor sees the same live catalog.

If you don't do this, nothing breaks - the admin panel will tell you
clearly ("not connected") rather than pretending a change went live when it
didn't.
