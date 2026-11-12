/* ─────────────────────────────────────────────────────────────────────────
   fetch-itch-games.js  —  pulls playable action / anime games from itch.io

   itch.io has no free JSON API for browsing, but every browse page has a
   public RSS feed that needs no key:
       https://itch.io/games/tag-<tag>.xml
   From that feed we take the game URL, open the game page once and read
   out the embed id, the cover art and whether the author offers the
   SOURCE CODE for it.

   Run:  node scripts/fetch-itch-games.js
   It writes: itch-games.json
   ───────────────────────────────────────────────────────────────────────── */
const fs = require('fs');
const path = require('path');

const FEEDS = [
  { url: 'https://itch.io/games/free/source-code-available.xml', source: true },
  { url: 'https://itch.io/games/tag-anime/source-code-available.xml', source: true },
  { url: 'https://itch.io/games/tag-action/source-code-available.xml', source: true },
  { url: 'https://itch.io/games/tag-fighting/source-code-available.xml', source: true },
  { url: 'https://itch.io/games/tag-ninja/source-code-available.xml', source: true },
  { url: 'https://itch.io/games/tag-samurai/source-code-available.xml', source: true },
  { url: 'https://itch.io/games/tag-anime.xml', source: false },
  { url: 'https://itch.io/games/tag-action.xml', source: false },
  { url: 'https://itch.io/games/tag-fighting.xml', source: false },
  { url: 'https://itch.io/games/tag-samurai.xml', source: false },
  { url: 'https://itch.io/games/tag-arcade.xml', source: false },
  { url: 'https://itch.io/games/tag-ninja.xml', source: false },
  { url: 'https://itch.io/games/tag-pixel-art.xml', source: false },
  { url: 'https://itch.io/games/tag-roguelike.xml', source: false },
  { url: 'https://itch.io/games/tag-shonen.xml', source: false },
  { url: 'https://itch.io/games/tag-beat-em-up.xml', source: false },
  { url: 'https://itch.io/games/tag-hack-and-slash.xml', source: false }
];
const OUT = path.resolve(__dirname, '..', 'itch-games.json');
const WANT_SOURCE = 18;          // how many games with a source download
const WANT_OTHER = 22;           // how many playable games without one
const UA = 'Mozilla/5.0 (compatible; fardin-anime-hub/1.0; +https://fardinsenpai.github.io/my-anime-list/)';

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function get(url, asText) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept': asText ? 'application/rss+xml, text/xml, */*' : 'text/html' } });
  if (!res.ok) throw new Error('HTTP ' + res.status + ' ' + url);
  return asText ? res.text() : res.text();
}

function parseFeed(xml) {
  const items = [];
  const re = /<item>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = re.exec(xml))) {
    const block = m[1];
    const g = /<guid>([\s\S]*?)<\/guid>/.exec(block);
    const t = /<title>([\s\S]*?)<\/title>/.exec(block);
    const d = /<description>([\s\S]*?)<\/description>/.exec(block);
    const p = /<pubDate>([\s\S]*?)<\/pubDate>/.exec(block);
    if (!g || !t) continue;
    items.push({
      url: g[1].trim(),
      title: decodeEntities(t[1].trim()),
      desc: decodeEntities((d ? d[1] : '') || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 220),
      date: p ? p[1].trim() : ''
    });
  }
  return items;
}

function decodeEntities(s) {
  return String(s)
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'").replace(/&amp;/g, '&');
}

/* the game page carries the embed id, the cover and the source-code flag */
async function details(item) {
  const html = await get(item.url, false);
  const id = /data-game_id="(\d+)"/.exec(html);
  const cover = /property="og:image" content="([^"]+)"/.exec(html);
  /* the upload list holds the files: one of them can be the source code */
  const uploads = [...html.matchAll(/<strong[^>]*class="name"[^>]*>([^<]+)<\/strong>/g)].map((m) => m[1]);
  const sourceUpload = uploads.find((u) => /source/i.test(u));
  const sourceLink = /source\s*code/i.test(html);
  /* "Run game" means the game plays in the browser, so it can be embedded */
  const runnable = /Run game/i.test(html) || /<a[^>]*class="button btn-link"/.test(html);
  return {
    embedId: id ? id[1] : null,
    cover: cover ? decodeEntities(cover[1]) : '',
    source: !!(sourceUpload || sourceLink),
    sourceFile: sourceUpload || '',
    runnable: runnable,
    uploads: uploads.slice(0, 4)
  };
}

(async () => {
  const seen = {};
  const all = [];
  for (const feed of FEEDS) {
    let xml;
    try { xml = await get(feed.url, true); }
    catch (e) { console.log('feed failed', feed.url, String(e).slice(0, 60)); continue; }
    const items = parseFeed(xml);
    console.log('feed ' + feed.url.replace('https://itch.io/games/', '') + ': ' + items.length + ' games');
    items.forEach((it) => {
      if (seen[it.url]) return;
      seen[it.url] = true;
      it.tag = (it.title.match(/\[([^\]]+)\]/g) || []).map((s) => s.replace(/[\[\]]/g, '')).pop() || 'itch.io';
      it.fromSourceFeed = feed.source;
      all.push(it);
    });
    await sleep(300);
  }

  const scored = all.map((it) => {
    const t = (' ' + it.title + ' ' + it.desc + ' ' + it.tag + ' ').toLowerCase();
    let s = 0;
    if (/anime|manga|naruto|one piece|bleach|sword|shonen|isekai/.test(t)) s += 3;
    if (/action|fighting|battle|samurai|ninja|sword|slash|dojo|shinobi/.test(t)) s += 3;
    if (/\[free\]/.test(it.title.toLowerCase())) s += 1;
    if (/\[demo\]/.test(it.title.toLowerCase())) s -= 1;
    if (/itch\.io/.test(it.desc.toLowerCase())) s -= 1;
    if (it.fromSourceFeed) s += 4;
    return { it: it, s: s };
  }).sort((a, b) => b.s - a.s);

  const withSource = [];
  const playable = [];
  for (const row of scored) {
    if (playable.length >= WANT_SOURCE + WANT_OTHER) break;
    let d;
    try { d = await details(row.it); } catch (e) { continue; }
    if (!d.embedId || !d.runnable) continue;   /* only the browser games can be embedded */
    const g = {
      id: d.embedId,
      title: (row.it.title.split('|')[0].replace(/\s*\[[^\]]+\]/g, '').trim() || row.it.title),
      rawTitle: row.it.title,
      desc: row.it.desc,
      url: row.it.url,
      tag: row.it.tag,
      cover: d.cover,
      source: d.source || row.it.fromSourceFeed === true,
      sourceFile: d.sourceFile || '',
      embed: 'https://itch.io/embed/' + d.embedId
    };
    if (g.source && withSource.length < WANT_SOURCE) withSource.push(g);
    else if (playable.length < WANT_SOURCE + WANT_OTHER) playable.push(g);
    await sleep(250);
  }

  const games = withSource.concat(playable).slice(0, WANT_SOURCE + WANT_OTHER);
  const out = {
    _meta: {
      source: 'itch.io public RSS feeds (no key needed)',
      feeds: FEEDS.map((f) => f.url),
      generated: new Date().toISOString().slice(0, 10),
      count: games.length,
      withSource: games.filter((g) => g.source).length,
      note: 'These are real games by other creators, embedded with the official itch.io player.'
    },
    games: games
  };
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2), 'utf8');
  console.log('\nwrote ' + OUT + ' - ' + games.length + ' games (' + withSource.length + ' with source code)');
  games.slice(0, 8).forEach((g) => console.log('  ', (g.source ? '[SRC] ' : '      ') + g.title + '  (' + g.tag + ')'));
})();
