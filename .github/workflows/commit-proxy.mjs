// Token-less admin commit proxy.
// Reads pending rows from Supabase `commit_queue`, commits each to the
// GitHub repo using the PAT from Actions Secrets, then marks the row done.
// The PAT never exists in the browser.
const https = require('https');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const GH_PAT = process.env.GH_PAT;
const OWNER = process.env.OWNER;
const REPO = process.env.REPO;

const ADMIN_PIN = '114477';
const BRANCH = 'main';

function req(opts, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(opts.url);
    const r = https.request({
      hostname: u.hostname,
      path: u.pathname + u.search,
      method: opts.method || 'GET',
      headers: opts.headers || {},
    }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        let parsed = null;
        try { parsed = data ? JSON.parse(data) : null; } catch (e) {}
        resolve({ status: res.statusCode, body: parsed });
      });
    });
    r.on('error', reject);
    if (body !== undefined) r.write(body);
    r.end();
  });
}

function supabase(path, method, payload) {
  return req({
    url: SUPABASE_URL + '/rest/v1/' + path,
    method,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: 'Bearer ' + SERVICE_KEY,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
  }, payload ? JSON.stringify(payload) : undefined);
}

async function getSha(filePath) {
  const r = await req({
    url: `https://api.github.com/repos/${OWNER}/${REPO}/contents/${filePath}?ref=${BRANCH}`,
    headers: { Authorization: 'token ' + GH_PAT, 'User-Agent': 'commit-proxy', Accept: 'application/vnd.github.v3+json' },
  });
  return r.body && r.body.sha ? r.body.sha : null;
}

async function githubCommit(filePath, contentB64, message) {
  const sha = await getSha(filePath);
  const r = await req({
    url: `https://api.github.com/repos/${OWNER}/${REPO}/contents/${filePath}`,
    method: 'PUT',
    headers: { Authorization: 'token ' + GH_PAT, 'User-Agent': 'commit-proxy', Accept: 'application/vnd.github.v3+json', 'Content-Type': 'application/json' },
  }, JSON.stringify({ message, content: contentB64, branch: BRANCH, sha }));
  return r.status === 200 || r.status === 201;
}

async function main() {
  if (!SUPABASE_URL || !SERVICE_KEY || !GH_PAT) {
    console.log('Missing secrets; skipping.');
    return;
  }
  const list = await supabase('commit_queue?status=eq.pending&order=created_at.asc&limit=10', 'GET');
  const rows = (list.body && Array.isArray(list.body)) ? list.body : [];
  console.log('pending rows:', rows.length);
  for (const row of rows) {
    const okPin = row.pin === ADMIN_PIN;
    if (!okPin) {
      console.log('bad pin for', row.id);
      await supabase(`commit_queue?id=eq.${row.id}`, 'PATCH', { status: 'failed', error: 'bad pin' });
      continue;
    }
    try {
      const ok = await githubCommit(row.path, row.content, row.message);
      console.log(row.id, '->', ok ? 'OK' : 'FAIL');
      await supabase(`commit_queue?id=eq.${row.id}`, 'PATCH', { status: ok ? 'done' : 'failed', error: ok ? '' : 'commit rejected' });
    } catch (e) {
      console.log('error', row.id, e.message);
      await supabase(`commit_queue?id=eq.${row.id}`, 'PATCH', { status: 'failed', error: String(e.message) });
    }
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
