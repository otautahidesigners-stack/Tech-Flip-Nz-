# Setting up real admin login

The admin panel now uses a real, server-verified login instead of a
password check that ran in the browser. Nothing works until you add three
environment variables in Vercel - until then, the admin panel keeps working
exactly as it did before (saved to your own browser only), so nothing breaks
in the meantime.

## 1. Generate your password hash

On your own computer (not on the server, not here in chat - this keeps your
real password private):

```
node scripts/hash-password.js "your real admin password"
```

It prints something like:

```
scrypt$3f1c...$9a02...
```

Copy that whole value.

## 2. Add environment variables in Vercel

Project → Settings → Environment Variables. Add:

| Name | Value |
|---|---|
| `ADMIN_USERNAME` | whatever username you want to log in with |
| `ADMIN_PASSWORD_HASH` | the `scrypt$...` value from step 1 |
| `SESSION_SECRET` | a long random string - generate one with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |

Apply all three to Production (and Preview if you want the same login there).

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
