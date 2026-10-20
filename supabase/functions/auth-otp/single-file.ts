// ================================================================
//  auth-otp  -  email one-time codes for Fardin's Anime Hub
//  SINGLE FILE VERSION - the helpers are inlined so this can be
//  pasted straight into the Supabase browser editor.
// ================================================================
const CODE_TTL_MIN = 10;      // how long a code stays usable
const RESEND_SECONDS = 60;    // "one code per email per minute"
const EMAIL_PER_HOUR = 5;     // per email address
const IP_PER_HOUR = 10;       // per ip address
const EMAILS_PER_DAY = 90;    // global cap, stays under Resend's 100/day
const MAX_ATTEMPTS = 5;       // wrong guesses before the code dies

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function normEmail(v: unknown): string {
  return String(v ?? "").trim().toLowerCase();
}

function isEmail(v: unknown): boolean {
  const e = normEmail(v);
  return EMAIL_RE.test(e) && e.length <= 254;
}

// sha256(pepper:email:code) -> hex. The pepper lives in the secrets, so a
// stolen table is useless on its own.
async function hashCode(pepper: string, email: string, code: string): Promise<string> {
  const data = new TextEncoder().encode(`${pepper}:${email}:${code}`);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// compare without leaking where the difference is
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// a 6 digit code from a crypto source (not Math.random)
function sixDigits(): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0] % 1000000;
}

function sixDigitString(): string {
  return String(sixDigits()).padStart(6, "0");
}

// ================================================================
//  auth-otp  -  email one-time codes for Fardin's Anime Hub
//
//  Free stack only:
//    * Supabase Edge Functions  (500,000 invocations / month free)
//    * Resend free              (3,000 emails / month, 100 / day)
//    * Cloudflare Turnstile    (free, unlimited)
//
//  The API keys live in the function's secrets - never in script.js.
//
//  Secrets to set (Dashboard > Edge Functions > auth-otp > Secrets,
//  or: supabase secrets set --env-file .env):
//    SUPABASE_URL            (the project url)
//    SUPABASE_SERVICE_ROLE_KEY
//    RESEND_API_KEY
//    OTP_PEPPER             (a long random string - mixed into the hash)
//    TURNSTILE_SECRET_KEY
//    OTP_FROM               ("Fardin Anime Hub <no-reply@your-domain.com>")
//
//  Two actions:
//    POST { action: "send",   email, turnstileToken, first?, last? }
//    POST { action: "verify", email, code, first?, last? }
// ================================================================


const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

// ---------------------------------------------------------------- turnstile
async function turnstileOk(token: string, ip: string): Promise<boolean> {
  const secret = Deno.env.get("TURNSTILE_SECRET_KEY") || "";
  if (!secret) {
    // no key configured -> do not let people through by default
    if ((Deno.env.get("TURNSTILE_REQUIRED") || "true").toLowerCase() === "false") return true;
    console.error("TURNSTILE_SECRET_KEY missing");
    return false;
  }
  if (!token) return false;
  const form = new FormData();
  form.append("secret", secret);
  form.append("response", token);
  if (ip) form.append("remoteip", ip);
  const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body: form,
  });
  const j = await r.json().catch(() => ({ success: false }));
  if (!j.success) console.warn("turnstile said no:", j["error-codes"]);
  return !!j.success;
}

// ------------------------------------------------------------------- resend
async function mailCode(to: string, code: string, first: string): Promise<void> {
  const key = Deno.env.get("RESEND_API_KEY") || "";
  if (!key) throw new Error("RESEND_API_KEY missing");
  const from = Deno.env.get("OTP_FROM") || "Fardin Anime Hub <onboarding@resend.dev>";
  const who = first ? `Hi ${first},` : "Hi,";
  const html = `
<div style="background:#0a0a0f;padding:28px 16px;font-family:Poppins,Segoe UI,sans-serif">
  <div style="max-width:520px;margin:0 auto;background:#12121c;border:1px solid rgba(255,143,190,.28);
              border-radius:16px;padding:28px">
    <div style="font-size:11px;letter-spacing:3px;color:#ff8fbe;font-weight:700">FARDIN'S ANIME HUB</div>
    <div style="font-size:22px;color:#fff;margin:10px 0 18px;font-weight:700">Your sign-in code</div>
    <p style="color:#b8b9c9;font-size:14px;line-height:1.7;margin:0 0 20px">${who} here is your 6-digit code. It works once and expires in ${CODE_TTL_MIN} minutes.</p>
    <div style="font-size:34px;letter-spacing:12px;color:#ffd7ea;background:#1a1020;border:1px dashed rgba(255,143,190,.45);
                border-radius:12px;padding:16px 10px;text-align:center;font-weight:700">${code}</div>
    <p style="color:#7d7d95;font-size:12px;line-height:1.7;margin:20px 0 0">
      If you did not ask for this code you can ignore this mail - no one can sign in with it.
      Never share the code with anyone.</p>
  </div>
</div>`;
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: [to],
      subject: `${code} is your Fardin Anime Hub sign-in code`,
      html,
    }),
  });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    console.error("resend refused the mail:", r.status, t.slice(0, 300));
    // Resend's shared test sender can only deliver to the account owner.
    // Say so plainly instead of "the code could not be sent".
    if (r.status === 403 && /only send testing emails/i.test(t)) {
      const e: any = new Error("owner only");
      e.ownerOnly = true;
      throw e;
    }
    throw new Error("mail could not be sent");
  }
}

// -------------------------------------------------------------------- supabase
function service() {
  return {
    url: Deno.env.get("SUPABASE_URL") || "",
    key: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
  };
}

async function sb(path: string, opts: RequestInit = {}): Promise<any> {
  const { url, key } = service();
  if (!url || !key) throw new Error("supabase service env missing");
  const r = await fetch(`${url}/rest/v1/${path}`, {
    ...opts,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...(opts.headers || {}),
    },
  });
  const t = await r.text();
  if (!r.ok) throw new Error(`supabase ${path} -> ${r.status} ${t.slice(0, 200)}`);
  return t ? JSON.parse(t) : null;
}

// ------------------------------------------------------------------ handlers
type SendBody = { email: string; turnstileToken: string; first?: string; last?: string };
type VerifyBody = { email: string; code: string; first?: string; last?: string };

async function handleSend(body: SendBody, ip: string) {
  const email = normEmail(body.email);
  if (!isEmail(email)) {
    return json({ ok: false, message: "That email address does not look right." }, 400);
  }
  if (!(await turnstileOk(String(body.turnstileToken || ""), ip))) {
    return json({ ok: false, message: "The human check did not pass - please try again." }, 400);
  }

  // housekeeping: drop anything that already expired
  await sb("rpc/purge_expired_codes", { method: "POST", body: JSON.stringify({}) }).catch(() => {});

  const hourAgo = new Date(Date.now() - 3600_000).toISOString();
  const dayAgo = new Date(Date.now() - 86400_000).toISOString();

  const recent = await sb(
    `email_codes?email=eq.${encodeURIComponent(email)}&select=id&created_at=gte.${hourAgo}`,
  );
  if (Array.isArray(recent) && recent.length >= EMAIL_PER_HOUR) {
    return json({ ok: false, message: "Too many codes for this address. Try again in a while." }, 429);
  }
  if (ip) {
    const byIp = await sb(
      `email_codes?ip=eq.${encodeURIComponent(ip)}&select=id&created_at=gte.${hourAgo}`,
    );
    if (Array.isArray(byIp) && byIp.length >= IP_PER_HOUR) {
      return json({ ok: false, message: "Too many tries from this connection. Try again later." }, 429);
    }
  }
  const today = await sb(`email_codes?select=id&created_at=gte.${dayAgo}`);
  if (Array.isArray(today) && today.length >= EMAILS_PER_DAY) {
    return json({ ok: false, message: "We have sent a lot of codes today. Please try again tomorrow." }, 429);
  }
  const last = await sb(
    `email_codes?email=eq.${encodeURIComponent(email)}&select=created_at&order=created_at.desc&limit=1`,
  );
  if (Array.isArray(last) && last.length && last[0]?.created_at) {
    const age = Date.now() - new Date(last[0].created_at).getTime();
    if (age < RESEND_SECONDS * 1000) {
      const wait = Math.ceil((RESEND_SECONDS * 1000 - age) / 1000);
      return json({ ok: false, message: `Please wait ${wait}s before asking for another code.` }, 429);
    }
  }

  const code = sixDigitString();
  const pepper = Deno.env.get("OTP_PEPPER") || "";
  const codeHash = await hashCode(pepper, email, code);
  const expiresAt = new Date(Date.now() + CODE_TTL_MIN * 60_000).toISOString();

  // one live code per address: the old one dies
  await sb(`email_codes?email=eq.${encodeURIComponent(email)}`, { method: "DELETE" }).catch(() => {});

  await sb("email_codes", {
    method: "POST",
    body: JSON.stringify({
      email,
      code_hash: codeHash,
      expires_at: expiresAt,
      attempts: 0,
      ip: ip || null,
    }),
  });

  const first = String(body.first || "").trim().toUpperCase().slice(0, 40);
  try {
    await mailCode(email, code, first);
  } catch (e: any) {
    console.error("mail failed:", e);
    await sb(`email_codes?email=eq.${encodeURIComponent(email)}`, { method: "DELETE" }).catch(() => {});
    if (e && e.ownerOnly) {
      return json({
        ok: false,
        message: "Email codes are not switched on for everyone yet - please continue with Google or GitHub.",
      }, 403);
    }
    return json({ ok: false, message: "The code could not be sent. Please try again." }, 502);
  }

  // the same message whether or not the address exists: no account probing
  return json({
    ok: true,
    message: "If that address can receive mail, a 6-digit code is on its way.",
    expires_in: CODE_TTL_MIN * 60,
    resend_in: RESEND_SECONDS,
  });
}

async function handleVerify(body: VerifyBody) {
  const email = normEmail(body.email);
  const code = String(body.code || "").replace(/\D/g, "");
  const wrong = { ok: false, message: "That code is not right, or it has expired." };
  if (!email || code.length !== 6) return json(wrong, 400);

  await sb("rpc/purge_expired_codes", { method: "POST", body: JSON.stringify({}) }).catch(() => {});

  const rows = await sb(
    `email_codes?email=eq.${encodeURIComponent(email)}&order=created_at.desc&limit=1`,
  );
  const row = Array.isArray(rows) && rows.length ? rows[0] : null;
  if (!row) return json(wrong, 400);
  if (new Date(row.expires_at).getTime() < Date.now()) {
    await sb(`email_codes?id=eq.${row.id}`, { method: "DELETE" }).catch(() => {});
    return json(wrong, 400);
  }
  if ((row.attempts || 0) >= MAX_ATTEMPTS) {
    await sb(`email_codes?id=eq.${row.id}`, { method: "DELETE" }).catch(() => {});
    return json({ ok: false, message: "Too many wrong guesses. Ask for a new code." }, 429);
  }

  const pepper = Deno.env.get("OTP_PEPPER") || "";
  const given = await hashCode(pepper, email, code);
  if (!safeEqual(given, row.code_hash)) {
    await sb(`email_codes?id=eq.${row.id}`, {
      method: "PATCH",
      body: JSON.stringify({ attempts: (row.attempts || 0) + 1 }),
    }).catch(() => {});
    return json(wrong, 400);
  }

  // the code is right: burn it so it can only ever be used once
  await sb(`email_codes?id=eq.${row.id}`, { method: "DELETE" }).catch(() => {});

  // remember that this address is really theirs
  await sb("verified_users", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ email, method: "otp" }),
  }).catch((e) => console.error("verified_users write failed:", e));

  // hand Supabase a token hash - the browser exchanges it for a normal
  // session with the public anon key, so no service key ever reaches the client
  const { url, key } = service();
  const listRes = await fetch(`${url}/auth/v1/admin/users?per_page=1000`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  const listJson = await listRes.json().catch(() => ({ users: [] }));
  let user = (listJson.users || []).find(
    (u: any) => String(u.email || "").toLowerCase() === email,
  );

  const first = String(body.first || "").trim().toUpperCase().slice(0, 40);
  const last = String(body.last || "").trim().toUpperCase().slice(0, 40);

  if (!user) {
    const created = await fetch(`${url}/auth/v1/admin/users`, {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        email_confirm: true,          // the code already proved it
        user_metadata: {
          provider: "otp",
          first_name: first,
          last_name: last,
          full_name: [first, last].filter(Boolean).join(" "),
        },
      }),
    });
    const createdJson = await created.json().catch(() => ({}));
    if (!created.ok) {
      console.error("could not create the auth user:", created.status, JSON.stringify(createdJson).slice(0, 200));
      return json({ ok: false, message: "Sign-in is not available right now. Please try again." }, 500);
    }
    user = createdJson;
  } else if (!user.email_confirmed_at) {
    await fetch(`${url}/auth/v1/admin/users/${user.id}`, {
      method: "PUT",
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ email_confirm: true }),
    }).catch(() => {});
  }

  const linkRes = await fetch(`${url}/auth/v1/admin/generate_link`, {
    method: "POST",
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ type: "magiclink", email }),
  });
  const linkJson = await linkRes.json().catch(() => ({}));
  const hashed = linkJson?.properties?.hashed_token;
  if (!hashed) {
    console.error("generate_link failed:", JSON.stringify(linkJson).slice(0, 200));
    return json({ ok: false, message: "Sign-in is not available right now. Please try again." }, 500);
  }

  return json({ ok: true, token_hash: hashed, email });
}

// --------------------------------------------------------------------- main
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, message: "POST only" }, 405);

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, message: "bad request" }, 400);
  }

  const ip =
    (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() ||
    req.headers.get("cf-connecting-ip") ||
    "";

  try {
    if (body.action === "send") {
      return await handleSend(
        { email: body.email, turnstileToken: body.turnstileToken, first: body.first, last: body.last },
        ip,
      );
    }
    if (body.action === "verify") {
      return await handleVerify({
        email: body.email,
        code: body.code,
        first: body.first,
        last: body.last,
      });
    }
    return json({ ok: false, message: "unknown action" }, 400);
  } catch (e) {
    console.error("auth-otp failed:", e);
    return json({ ok: false, message: "Something went wrong. Please try again." }, 500);
  }
});
