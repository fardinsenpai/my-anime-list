/* ─────────────────────────────────────────────────────────────────────────
   fetch-dub-data.js  —  builds anime-dubs.json (used only by the AI chat)

   Where the data comes from
   -------------------------
   1. The Dubbing Database (dubdb.fandom.com) - one wiki page per dub:
        "<Title> (Hindi, Crunchyroll)" / "<Title> (Hindi)"
        "<Title> (English)"
      The page infobox carries the platform:
        |channel = Sony YAY!   |service = Crunchyroll   |service2 = Amazon Prime Video
   2. The Hindi Dubbing Wiki (hindi-dubbing.fandom.com) - the prose says
      which platform the Hindi dub premiered on, which catches the Indian
      channels (Sony YAY!, MX Player, Muse India, ...) the dub database does
      not always list.

   Sub is always there: the original Japanese audio + subtitles.

   Run:  node scripts/fetch-dub-data.js          (needs internet)
   It writes: anime-dubs.json
   Manual, hand-checked entries live in anime-dub-overrides.json and win.
   ───────────────────────────────────────────────────────────────────────── */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT_FILE = path.join(ROOT, 'anime-dubs.json');
const RATINGS = path.join(ROOT, 'anime-ratings.json');
const OVERRIDES = path.join(ROOT, 'anime-dub-overrides.json');

const DUBDB = 'https://dubdb.fandom.com/api.php';
const HINDI_WIKI = 'https://hindi-dubbing.fandom.com/api.php';

/* platform names -> what we show the visitor */
const PLATFORM_ALIASES = [
  [/crunchyroll/i, 'Crunchyroll'],
  [/netflix/i, 'Netflix'],
  [/sony\s*yay/i, 'Sony YAY!'],
  [/sonyliv/i, 'SonyLIV'],
  [/amazon\s*prime|prime\s*video/i, 'Amazon Prime'],
  [/mx\s*player/i, 'MX Player'],
  [/muse\s*india/i, 'Muse India'],
  [/hoichoi/i, 'Hoichoi'],
  [/jiocinema|jio\s*cinema/i, 'JioCinema'],
  [/zee5|zee\s*5/i, 'Zee5'],
  [/hoopla/i, 'Hoopla'],
  [/hotstar|disney\s*\+/i, 'Hotstar'],
  [/medialink/i, 'Medialink'],
  [/viki/i, 'Viki'],
  [/youtube/i, 'YouTube'],
  [/hidive/i, 'HIDIVE'],
  [/bilibili/i, 'Bilibili'],
  [/tv\s*tokyo/i, 'TV Tokyo'],
  [/european\s*español|latin\s*american/i, null],
  [/italian|german|french|portuguese|spanish|russian|tamil|telugu|malay|indonesian|arabic|thai/i, null]
];

function normalisePlatform(raw) {
  const s = String(raw || '').replace(/\[\[[^\]]*\]\]/g, '').replace(/\{\{[^}]*\}\}/g, '').replace(/\s+/g, ' ').trim();
  if (!s) return null;
  for (const [re, name] of PLATFORM_ALIASES) {
    if (re.test(s)) return name;      /* null = not an Indian/English platform */
  }
  return null;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 20000);
    try {
      const res = await fetch(url, {
        signal: ctl.signal,
        headers: { 'User-Agent': 'fardin-anime-hub dub fetcher/1.0 (github pages site)' }
      });
      clearTimeout(timer);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return await res.json();
    } catch (e) {
      clearTimeout(timer);
      if (i === tries - 1) return null;
      await sleep(1200 * (i + 1));
    }
  }
  return null;
}

async function searchWiki(base, q, limit) {
  const url = base + '?action=query&list=search&srsearch=' + encodeURIComponent(q) +
    '&srlimit=' + (limit || 15) + '&format=json&formatversion=2';
  const json = await api(url);
  return json && json.query && json.query.search ? json.query.search.map((s) => s.title) : [];
}

async function pageText(base, page) {
  const url = base + '?action=parse&page=' + encodeURIComponent(page) +
    '&prop=wikitext&format=json&formatversion=2';
  const json = await api(url);
  return json && json.parse && json.parse.wikitext ? String(json.parse.wikitext) : '';
}

/* the infobox of a dub page: |channel = / |service = / |service2 = ... */
function platformsFromInfobox(text) {
  const out = [];
  const re = /\|\s*(channel|service\d*|streaming|network)\s*=\s*([^\n|]+)/gi;
  let m;
  while ((m = re.exec(text))) {
    const p = normalisePlatform(m[2]);
    if (p && out.indexOf(p) === -1) out.push(p);
  }
  return out;
}

/* dubdb: "<Title> (Hindi, Platform)" and "<Title> (Hindi)" */
async function fromDubDb(title) {
  const out = { hi: [], en: false, enPlatform: null };
  const base = title.trim().toLowerCase();

  const hindi = await searchWiki(DUBDB, '"' + title + '" Hindi');
  const pages = [];
  hindi.forEach((page) => {
    const m = page.match(/^(.+?)\s*\((Hindi[^()]*)\)\s*$/i);
    if (!m) return;
    if (m[1].trim().toLowerCase() !== base) return;
    if (pages.indexOf(page) === -1) pages.push(page);
  });
  for (const page of pages) {
    const txt = await pageText(DUBDB, page);
    const plats = platformsFromInfobox(txt);
    /* the title itself may name the platform: "<Title> (Hindi, Crunchyroll)" */
    const inline = page.match(/\((?:Hindi[^()]*)\)/i);
    if (inline) {
      const parts = page.replace(/^[^(]*\(/, '').replace(/\)\s*$/, '').split(',').slice(1).join(',');
      const p = normalisePlatform(parts);
      if (p && plats.indexOf(p) === -1) plats.push(p);
    }
    plats.forEach((p) => { if (out.hi.indexOf(p) === -1) out.hi.push(p); });
    await sleep(120);
  }

  const eng = await searchWiki(DUBDB, '"' + title + '" English');
  const epages = [];
  eng.forEach((page) => {
    const m = page.match(/^(.+?)\s*\((English[^()]*)\)\s*$/i);
    if (!m) return;
    if (m[1].trim().toLowerCase() !== base) return;
    if (epages.indexOf(page) === -1) epages.push(page);
  });
  for (const page of epages) {
    out.en = true;
    if (!out.enPlatform) {
      const txt = await pageText(DUBDB, page);
      const plats = platformsFromInfobox(txt);
      if (plats.length) out.enPlatform = plats[0];
    }
    await sleep(120);
  }

  return out;
}

/* the Hindi dubbing wiki: "A Hindi dub of the series premiered on <platform>." */
async function fromHindiWiki(title) {
  const out = { hi: [], en: false };
  const text = await pageText(HINDI_WIKI, title);
  if (!text) return out;
  let m;
  const re = /Hindi dub[^\n.]{0,140}?premiered on ([^.,\n]{2,40})/gi;
  while ((m = re.exec(text))) {
    const plat = normalisePlatform(m[1]);
    if (plat && out.hi.indexOf(plat) === -1) out.hi.push(plat);
  }
  const re2 = /English dub[^\n.]{0,140}?premiered on ([^.,\n]{2,40})/gi;
  while ((m = re2.exec(text))) {
    if (normalisePlatform(m[1])) out.en = true;
  }
  if (/dubbed in English|English dub/i.test(text)) out.en = true;
  return out;
}

(async () => {
  const ratings = JSON.parse(fs.readFileSync(RATINGS, 'utf8'));
  const titles = [];
  Object.keys(ratings).forEach((k) => {
    const t = ratings[k] && ratings[k].title;
    if (t && titles.indexOf(t) === -1) titles.push(t);
  });

  let overrides = {};
  try { overrides = JSON.parse(fs.readFileSync(OVERRIDES, 'utf8')).titles || {}; } catch (e) { overrides = {}; }

  const result = {};
  let done = 0, withHindi = 0, withEnglish = 0;

  for (const title of titles) {
    const [db, wiki] = await Promise.all([fromDubDb(title), fromHindiWiki(title)]);
    const hi = [];
    db.hi.concat(wiki.hi).forEach((p) => { if (p && hi.indexOf(p) === -1) hi.push(p); });

    const ov = overrides[title] || {};
    const finalHi = ov.hi ? [ov.hi].concat(hi.filter((p) => p !== ov.hi)) : hi;
    const finalEn = ov.en !== undefined ? ov.en : (db.en || wiki.en);

    result[title] = {
      hi: finalHi.length ? finalHi.join(' / ') : null,
      en: finalEn ? (db.enPlatform && !ov.en ? db.enPlatform : 'Official') : null,
      sub: 'Japanese',
      source: ov.hi ? 'manual + wiki' : (finalHi.length ? 'dubdb + hindi-dubbing wiki' : (finalEn ? 'dubdb' : 'none found'))
    };
    if (finalHi.length) withHindi++;
    if (finalEn) withEnglish++;
    done++;
    if (done % 10 === 0 || done === titles.length) {
      console.log('  ' + done + '/' + titles.length + '  hindi: ' + withHindi + '  english: ' + withEnglish);
    }
    await sleep(220);
  }

  const out = {
    _meta: {
      note: 'Official dub data for the AI chat. hi = Hindi dub platform(s), en = official English dub, sub = Japanese audio with subtitles. null means no verified official dub found - the chat must say so instead of guessing.',
      generated: new Date().toISOString().slice(0, 10),
      generator: 'scripts/fetch-dub-data.js',
      sources: ['dubdb.fandom.com', 'hindi-dubbing.fandom.com'],
      titles: Object.keys(result).length,
      withHindi: withHindi,
      withEnglish: withEnglish
    },
    titles: result
  };
  fs.writeFileSync(OUT_FILE, JSON.stringify(out, null, 2), 'utf8');
  console.log('\nwrote ' + OUT_FILE + '  (' + Object.keys(result).length + ' titles, ' + withHindi + ' with a Hindi dub)');
})();
