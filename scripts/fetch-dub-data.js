/* ─────────────────────────────────────────────────────────────────────────
   fetch-dub-data.js  —  builds anime-dubs.json (used only by the AI chat)

   Where the data comes from
   -------------------------
   1. The Dubbing Database (dubdb.fandom.com) - one wiki page per dub:
        "<Title> (Hindi, Crunchyroll)"   ->  Hindi dub on Crunchyroll
        "<Title> (English)"               ->  official English dub
   2. The Hindi Dubbing Wiki (hindi-dubbing.fandom.com) - the prose says
      which platform the Hindi dub premiered on, which catches the Indian
      channels (Sony YAY!, MX Player, Muse India, ...) the dub database does
      not always list.

   Sub is always there: the original Japanese audio + subtitles.

   Run:  node scripts/fetch-dub-data.js          (needs internet)
   It writes: anime-dubs.json
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
  [/sony/i, 'Sony'],
  [/mx\s*player/i, 'MX Player'],
  [/muse\s*india/i, 'Muse India'],
  [/hoichoi/i, 'Hoichoi'],
  [/jiocinema|jio\s*cinema/i, 'JioCinema'],
  [/zee5|zee\s*5/i, 'Zee5'],
  [/hoopla/i, 'Hoopla'],
  [/amazon\s*prime/i, 'Amazon Prime'],
  [/hotstar|disney\+/i, 'Hotstar'],
  [/medialink/i, 'Medialink'],
  [/viki/i, 'Viki'],
  [/youtube/i, 'YouTube'],
  [/prime\s*video/i, 'Prime Video']
];

function normalisePlatform(raw) {
  const s = String(raw || '').replace(/\s+/g, ' ').trim();
  if (!s) return null;
  for (const [re, name] of PLATFORM_ALIASES) if (re.test(s)) return name;
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

/* dubdb: "<Title> (Hindi, Platform)" / "<Title> (English)" */
async function fromDubDb(title) {
  const out = { hi: [], en: false };
  const search = async (q) => {
    const url = DUBDB + '?action=query&list=search&srsearch=' + encodeURIComponent(q) +
      '&srlimit=15&format=json&formatversion=2';
    const json = await api(url);
    return json && json.query && json.query.search ? json.query.search.map((s) => s.title) : [];
  };

  const hindi = await search('"' + title + '" Hindi');
  hindi.forEach((page) => {
    const m = page.match(/^(.+?)\s*\(([^()]*Hindi[^()]*)\)\s*$/i);
    if (!m) return;
    if (m[1].trim().toLowerCase() !== title.trim().toLowerCase()) return;
    const parts = m[2].split(',').map((p) => p.trim());
    const plat = parts.length > 1 ? normalisePlatform(parts.slice(1).join(',')) : null;
    if (plat && out.hi.indexOf(plat) === -1) out.hi.push(plat);
  });

  const eng = await search('"' + title + '" English');
  eng.forEach((page) => {
    const m = page.match(/^(.+?)\s*\((English[^()]*)\)\s*$/i);
    if (!m) return;
    if (m[1].trim().toLowerCase() !== title.trim().toLowerCase()) return;
    out.en = true;
  });

  return out;
}

/* the Hindi dubbing wiki: "A Hindi dub of the series premiered on <platform>." */
async function fromHindiWiki(title) {
  const out = { hi: [], en: false };
  const url = HINDI_WIKI + '?action=parse&page=' + encodeURIComponent(title) +
    '&prop=wikitext&format=json&formatversion=2';
  const json = await api(url);
  if (!json || !json.parse || !json.parse.wikitext) return out;
  const text = String(json.parse.wikitext);
  const re = /Hindi dub[^\n.]{0,120}?premiered on ([^.,\n]{2,40})/gi;
  let m;
  while ((m = re.exec(text))) {
    const plat = normalisePlatform(m[1]);
    if (plat && out.hi.indexOf(plat) === -1) out.hi.push(plat);
  }
  const re2 = /English dub[^\n.]{0,120}?premiered on ([^.,\n]{2,40})/gi;
  while ((m = re2.exec(text))) {
    const plat = normalisePlatform(m[1]);
    if (plat) out.en = true;
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
    const finalEn = ov.en !== undefined ? ov.en : db.en || wiki.en;

    result[title] = {
      hi: finalHi.length ? finalHi.join(' / ') : null,
      en: finalEn ? (ov.en === true ? 'Official' : 'Official') : null,
      sub: 'Japanese',
      source: ov.hi ? 'manual' : (finalHi.length ? 'dubdb + hindi-dubbing wiki' : 'none found')
    };
    if (finalHi.length) withHindi++;
    if (finalEn) withEnglish++;
    done++;
    if (done % 10 === 0 || done === titles.length) {
      console.log('  ' + done + '/' + titles.length + '  hindi: ' + withHindi + '  english: ' + withEnglish);
    }
    await sleep(260);
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
