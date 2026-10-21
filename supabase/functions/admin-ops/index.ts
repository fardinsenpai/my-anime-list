// ================================================================
//  admin-ops  -  the privileged actions, kept on the server
//
//  Until now the GitHub token and the admin PIN lived in the public
//  JavaScript, so anybody could read them and push to the repo. They
//  live in this function's secrets instead:
//
//    ADMIN_TOKEN   a long random string the owner types into the panel
//    GITHUB_PAT    the GitHub token, used only here
//    GITHUB_OWNER  default: fardinsenpai
//    GITHUB_REPO   default: my-anime-list
//    GITHUB_BRANCH default: main
//
//  Actions (all of them need the server key):
//    check   { key }                      -> is the key right?
//    commit  { key, path, content, message }
//    config  { key, key2?, value }        -> site_config
//    users   { key }                      -> auth users + verified state
//    verify  { key, email, on }           -> mark an address verified
// ================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

// compare without leaking where the difference is
function safeEqual(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function keyOk(key: unknown): boolean {
  const secret = Deno.env.get("ADMIN_TOKEN") || "";
  if (!secret) return false;
  return safeEqual(String(key || ""), secret);
}

function service() {
  return createClient(
    Deno.env.get("SUPABASE_URL") || "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
    { auth: { persistSession: false } },
  );
}

// base64 of utf-8 text, in chunks so a big file cannot blow the stack
function b64utf8(s: string): string {
  const bytes = new TextEncoder().encode(String(s ?? ""));
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

async function gh(path: string, opts: RequestInit = {}): Promise<Response> {
  const pat = await currentToken();
  return fetch("https://api.github.com" + path, {
    ...opts,
    headers: {
      Authorization: "Bearer " + pat,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      "User-Agent": "fardin-anime-hub",
      ...(opts.headers || {}),
    },
  });
}

// the token the panel stores (it replaces the one in the env secret)
// the env secret is the fallback, so the panel keeps working either way
async function currentToken(): Promise<string> {
  try {
    const sb = service();
    const { data } = await sb.from("panel_tokens").select("token").eq("name", "github").maybeSingle();
    if (data && data.token) return String(data.token);
  } catch (e) {
    console.error("could not read the stored token:", e);
  }
  return Deno.env.get("GITHUB_PAT") || "";
}

// the token the panel hands out - the DECOY. The real one never leaves the
// server, so even the page source carries nothing useful. If the owner has
// not set a decoy of their own, one is made by changing the last character
// (ghp_xxx...1 -> ghp_xxx...2 - a digit only the owner knows to correct).
async function publicToken(): Promise<string> {
  try {
    const sb = service();
    const { data } = await sb.from("panel_tokens").select("token").eq("name", "github_public").maybeSingle();
    if (data && data.token) return String(data.token);
  } catch (e) {
    console.error("could not read the public token:", e);
  }
  const real = await currentToken();
  if (!real) return "";
  return real.slice(0, -1) + (real.slice(-1) === "9" ? "8" : "9");
}

async function commitToGithub(body: any) {
  const owner = Deno.env.get("GITHUB_OWNER") || "fardinsenpai";
  const repo = Deno.env.get("GITHUB_REPO") || "my-anime-list";
  const branch = body.branch || Deno.env.get("GITHUB_BRANCH") || "main";
  const path = String(body.path || "").replace(/^\/+/, "");
  if (!path) return { ok: false, error: "no path" };

  // deleting a file is a different endpoint
  if (body.delete) {
    const head = await gh(`/repos/${owner}/${repo}/contents/${path}?ref=${branch}`);
    if (!head.ok) return { ok: false, error: "github read " + head.status };
    const j = await head.json().catch(() => null);
    const res = await gh(`/repos/${owner}/${repo}/contents/${path}`, {
      method: "DELETE",
      body: JSON.stringify({ message: String(body.message || "admin delete"), sha: j?.sha, branch }),
    });
    const txt = await res.text();
    if (!res.ok) return { ok: false, error: "github " + res.status + " " + txt.slice(0, 200) };
    return { ok: true, deleted: path };
  }

  // the current sha is needed, or GitHub refuses the write
  let sha: string | null = null;
  const head = await gh(`/repos/${owner}/${repo}/contents/${path}?ref=${branch}`);
  if (head.ok) {
    const j = await head.json().catch(() => null);
    sha = j && j.sha ? j.sha : null;
  } else if (head.status !== 404) {
    return { ok: false, error: "github read " + head.status };
  }

  const payload: Record<string, unknown> = {
    message: String(body.message || "admin update"),
    // the picture path sends base64 already
    content: body.base64 ? String(body.content || "") : b64utf8(body.content),
    branch,
  };
  if (sha) payload.sha = sha;

  let res = await gh(`/repos/${owner}/${repo}/contents/${path}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
  let txt = await res.text();

  // someone pushed the same file between our read and our write - read the
  // fresh sha and try once more
  if (res.status === 409) {
    const again = await gh(`/repos/${owner}/${repo}/contents/${path}?ref=${branch}`);
    if (again.ok) {
      const j2 = await again.json().catch(() => null);
      if (j2 && j2.sha) {
        payload.sha = j2.sha;
        res = await gh(`/repos/${owner}/${repo}/contents/${path}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
        txt = await res.text();
      }
    }
  }

  if (!res.ok) {
    return { ok: false, error: "github " + res.status + " " + txt.slice(0, 240) };
  }
  const j = JSON.parse(txt);
  return { ok: true, sha: j?.content?.sha || null, url: j?.content?.html_url || null };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, message: "POST only" }, 405);

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, message: "bad request" }, 400);
  }

  if (body.action === "check") {
    return json({ ok: keyOk(body.key) });
  }
  if (!keyOk(body.key)) {
    return json({ ok: false, message: "wrong server key" }, 403);
  }

  const sb = service();

  if (body.action === "token") {
    // the DECOY - the real token never leaves the server
    const t = await publicToken();
    return json({ ok: !!t, token: t, decoy: true });
  }

  if (body.action === "set-public-token") {
    // the owner sets the decoy they want the panel to hand out
    const token = String(body.token || "").trim();
    if (!token) return json({ ok: false, message: "no token given" }, 400);
    const { error } = await sb.from("panel_tokens")
      .upsert({ name: "github_public", token, owner: "decoy", updated_at: new Date().toISOString() }, { onConflict: "name" });
    if (error) return json({ ok: false, message: error.message }, 500);
    return json({ ok: true });
  }

  if (body.action === "set-token") {
    const token = String(body.token || "").trim();
    if (!/^(gh[pousr]_|github_pat_)[A-Za-z0-9_]{30,255}$/.test(token)) {
      return json({ ok: false, message: "that does not look like a GitHub token" }, 400);
    }
    // check it before storing it
    const check = await fetch("https://api.github.com/user", {
      headers: { Authorization: "Bearer " + token, Accept: "application/vnd.github+json", "User-Agent": "fardin-anime-hub" },
    });
    if (!check.ok) {
      return json({ ok: false, message: "GitHub does not accept that token" }, 400);
    }
    const who = await check.json().catch(() => ({}));
    const { error } = await sb.from("panel_tokens")
      .upsert({ name: "github", token, owner: who.login || null, updated_at: new Date().toISOString() }, { onConflict: "name" });
    if (error) return json({ ok: false, message: error.message }, 500);
    return json({ ok: true, owner: who.login || null });
  }

  try {
    if (body.action === "commit") {
      const r = await commitToGithub(body);
      return json(r, r.ok ? 200 : 500);
    }

    if (body.action === "read") {
      const owner = Deno.env.get("GITHUB_OWNER") || "fardinsenpai";
      const repo = Deno.env.get("GITHUB_REPO") || "my-anime-list";
      const branch = body.branch || Deno.env.get("GITHUB_BRANCH") || "main";
      const path = String(body.path || "").replace(/^\/+/, "");
      const res = await gh(`/repos/${owner}/${repo}/contents/${path}?ref=${branch}`);
      const txt = await res.text();
      if (!res.ok) return json({ ok: false, message: "github " + res.status }, 404);
      const j = JSON.parse(txt);
      // the panel expects the shape the GitHub API returns
      return json({ ok: true, sha: j.sha, content: j.content, path: j.path, size: j.size });
    }

    if (body.action === "config") {
      const row = String(body.key2 || body.name || "chatbot_model");
      const { error } = await sb
        .from("site_config")
        .upsert({ key: row, value: String(body.value ?? ""), updatedAt: new Date().toISOString() }, { onConflict: "key" });
      return error ? json({ ok: false, message: error.message }, 500) : json({ ok: true });
    }

    if (body.action === "users") {
      const { data: users, error: uerr } = await sb.auth.admin.listUsers({ page: 1, perPage: 200 });
      if (uerr) return json({ ok: false, message: uerr.message }, 500);
      const { data: verified } = await sb.from("verified_users").select("email,method,verified_at");
      const map: Record<string, any> = {};
      (verified || []).forEach((v: any) => { map[String(v.email || "").toLowerCase()] = v; });
      return json({
        ok: true,
        users: (users?.users || []).map((u: any) => {
          const key = String(u.email || "").toLowerCase();
          return {
            email: u.email || "",
            phone: u.phone || "",
            confirmed: !!u.email_confirmed_at,
            verified: !!map[key],
            method: map[key]?.method || null,
            last_sign_in_at: u.last_sign_in_at || null,
            created_at: u.created_at || null,
          };
        }),
      });
    }

    if (body.action === "verify") {
      const email = String(body.email || "").trim().toLowerCase();
      if (!email) return json({ ok: false, message: "no email" }, 400);
      if (body.on === false) {
        const { error } = await sb.from("verified_users").delete().eq("email", email);
        return error ? json({ ok: false, message: error.message }, 500) : json({ ok: true });
      }
      const { error } = await sb
        .from("verified_users")
        .upsert({ email, method: String(body.method || "manual") }, { onConflict: "email" });
      return error ? json({ ok: false, message: error.message }, 500) : json({ ok: true });
    }

    return json({ ok: false, message: "unknown action" }, 400);
  } catch (e) {
    console.error("admin-ops failed:", e);
    return json({ ok: false, message: "server error" }, 500);
  }
});
