# Email code sign-in (OTP) — setup guide

**Free stack only:** Supabase Edge Functions (500k invocations/mo free) · Resend free
(3,000 mails/mo, 100/day) · Cloudflare Turnstile (free).

Nothing in this folder ever runs in the browser except `login-otp.js`; the API keys
live only in the Edge Function's secrets.

---

## 1. Run the SQL (once)

Open the project → **SQL Editor** → paste the whole of `otp-auth.sql` → **Run**.

It creates:

| thing | what it is |
|---|---|
| `public.email_codes` | the hashed codes (RLS on, no policy for the public → only the service role can touch it) |
| `public.verified_users` | who has proved they own an address |
| `public.is_email_verified(email)` | a **boolean** only — nobody can read the list of addresses |
| `public.purge_expired_codes()` | housekeeping |

## 2. Create the Edge Function

**Dashboard → Edge Functions → Deploy a new function → name: `auth-otp`**
and paste the contents of `functions/auth-otp/index.ts` (Deno, `index.ts` required).

> `functions/auth-otp/_lib.ts` holds the shared helpers. If the dashboard editor
> does not accept relative imports, paste `_lib.ts` **above** `index.ts` in the
> same file and delete the `import { ... } from "./_lib.ts"` line.

### Secrets (Edge Functions → auth-otp → Secrets)

| secret | where to get it |
|---|---|
| `SUPABASE_URL` | Project Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Project Settings → API (the **service_role** one — server side only, never in script.js) |
| `RESEND_API_KEY` | resend.com → API Keys |
| `OTP_PEPPER` | any long random string, e.g. `openssl rand -hex 32` — mixing it into the hash means a stolen table is useless on its own |
| `TURNSTILE_SECRET_KEY` | Cloudflare dashboard → Turnstile → the widget's secret key |
| `OTP_FROM` | `"Fardin Anime Hub <no-reply@your-domain.com>"` |

## 3. Resend — the sending domain

Resend → **Domains** → add the domain you want the mail to come from and add the
DNS records it gives you (SPF + DKIM). Without a domain you can only send to
your own address (the `onboarding@resend.dev` fallback) — fine for testing.

## 4. Cloudflare Turnstile

dashboard.cloudflare.com → **Turnstile → Add widget** → *Managed* → copy the
**site key** and the **secret key**.

- The secret key goes into the Edge Function secret `TURNSTILE_SECRET_KEY`.
- The **site key** goes into `login-otp.js` → `CF_SITE_KEY` (it currently holds
  Cloudflare's always-passes test key `1x00000000000000000000AA`, which is right
  for local testing).

## 5. Test

1. Open the site, sign in with an email address, tick the human check, press
   **Send code** → the mail should arrive in a minute or two.
2. Type the 6 digits → **Verify code** → you are signed in.
3. A wrong code must say "That code is not right" and count towards the 5-try
   limit; a code older than 10 minutes must not work; a second code must
   replace the first.

---

## How it behaves

| rule | value |
|---|---|
| code length / lifetime | 6 digits, 10 minutes, single use |
| wrong guesses | 5, then the code dies |
| one code per address | every 60 s |
| per address | 5 / hour |
| per connection | 10 / hour |
| whole site | 90 / day (Resend's free cap is 100/day) |
| e-mail to the user | the same answer whether or not the address exists (no account probing) |
| the code itself | never stored, only `sha256(pepper:email:code)` |

## What happens to sign-in

- **Email** → 6-digit code (verified). The password is no longer used for email.
- **Google / GitHub** → unchanged, and the provider already confirms the address.
- **Phone number** → unchanged (password), and it is **never** verified, so it
  never earns the blue tick.

If the Edge Function is not deployed, the site quietly keeps the old password
sign-in — you cannot lock anyone out.

## Tests

```bash
node supabase/functions/auth-otp/_lib.test.ts     # 22 checks, no network needed
```

## Rolling it back

Delete the function in the dashboard → the client falls back to password
sign-in by itself. The tables can stay; they cost nothing.
