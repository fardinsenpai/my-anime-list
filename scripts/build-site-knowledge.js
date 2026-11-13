/* ══════════════════════════════════════════════════════════════════════
   build-site-knowledge.js  —  packs the files of the website into one
   bundle the AI assistant can actually read.

   It reads:
     index.html            the cards (number, title, seasons, episodes,
                           the special card kind, the poster)
     script.js             the genre map (which card is in which genre)
     anime-ratings.json    the site's own ratings (MAL, story, characters…)
     anime-dubs.json       the official dub table
     quest-data.js         the quest questions (the deepest on-file facts)
     game-data.js          the clue sets (what the site knows about a show)
     game-data-extra.js    the extra clue sets
     game-data-facts.js    the true/false statements
     style.css             the colour of every special card kind

   and writes site-knowledge.json.

   Run it:      node scripts/build-site-knowledge.js
   Push it:     GITHUB_TOKEN=ghp_xxx node scripts/build-site-knowledge.js
   ══════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'site-knowledge.json');

const KNOWN_KINDS = ['legendary', 'epic', 'op', 'isekaiking', 'burning', 'earth', 'black', 'wind',
  'lightning', 'speed', 'frozen', 'healing', 'science', 'romance', 'psychic', 'levelup'];

const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const has = (f) => fs.existsSync(path.join(ROOT, f));

/* ── the cards ────────────────────────────────────────────────────── */
function cardsFromHtml(html) {
  const out = [];
  html.split('\n').forEach((line) => {
    if (line.indexOf('class="card') === -1) return;
    if (line.indexOf('badge">#') === -1) return;

    const numM = line.match(/<div class="number">NO\.?\s*(\d+)<\/div>/) ||
      line.match(/badge">#(\d+)</);
    const n = numM ? parseInt(numM[1], 10) : 0;

    const titleM = line.match(/<div class="title">([^<]*)<\/div>/);
    const title = titleM ? titleM[1].trim() : '';

    /* the special kind lives in the card's own class - "card-live" and
       friends are not kinds, so only the known ones count */
    const clsM = line.match(/<div class="card([^"]*)"/);
    let special = '';
    if (clsM) {
      const parts = clsM[1].trim().split(/\s+/).filter(Boolean);
      parts.forEach((p) => {
        if (p.indexOf('card-') !== 0) return;
        const kind = p.slice(5);
        if (KNOWN_KINDS.indexOf(kind) > -1) special = kind;
      });
    }

    const seM = line.match(/back-season">([^<]*)</);
    const seasonRaw = seM ? seM[1] : '';
    const seasonText = seasonRaw.replace(/^[^\w([{<]+/u, '').replace(/\s+/g, ' ').trim();
    const seasonNums = seasonRaw.match(/\d+/g);
    /* the same rule the site counters use: a season line without numbers
       ("Movie", "Ongoing") still counts as one season, so both totals agree */
    const seasonCount = seasonRaw
      ? (seasonNums && seasonNums.length ? seasonNums.length : 1)
      : 0;

    const epM = line.match(/back-episodes">([^<]*)</);
    const epRaw = epM ? epM[1] : '';
    const epDigits = epRaw.replace(/[^\d]/g, '');
    const episodes = epDigits ? parseInt(epDigits, 10) : null;

    const posterM = line.match(/poster-wrap"><img src="([^"]+)"/);

    out.push({
      n: n,
      title: title,
      special: special,
      seasons: seasonText,
      seasonCount: seasonCount,
      episodes: episodes,
      poster: posterM ? posterM[1] : ''
    });
  });
  return out;
}

/* ── the genre map (out of script.js) ─────────────────────────────── */
function genresFromScript(js) {
  const map = {};
  const block = js.match(/const GENRES = \{([\s\S]*?)\n  \};/);
  if (!block) return map;
  const re = /"([^"]+)":\s*\{\s*icon:\s*"[^"]*",\s*nums:\s*new Set\(\[([\s\S]*?)\]\)\s*\}/g;
  let m;
  while ((m = re.exec(block[1]))) {
    const name = m[1];
    const nums = (m[2].match(/\d+/g) || []).map((x) => parseInt(x, 10));
    map[name] = nums;
  }
  return map;
}

/* ── the special card colours (out of style.css) ─────────────────── */
function specialColours(css) {
  const out = {};
  const re = /\.card-([a-z]+) \.card-inner \{ border: 2px solid (#[0-9a-fA-F]{3,8})/g;
  let m;
  while ((m = re.exec(css))) out[m[1]] = m[2];
  return out;
}

/* ── the javascript data files ───────────────────────────────────── */
function runDataFile(file, sandbox) {
  if (!has(file)) return null;
  try {
    vm.runInNewContext(read(file), sandbox, { filename: file });
    return true;
  } catch (e) {
    console.log('!! could not read ' + file + ': ' + e.message);
    return null;
  }
}

function build() {
  const html = read('index.html');
  const js = read('script.js');

  const cards = cardsFromHtml(html);
  const genreMap = genresFromScript(js);
  const colours = has('style.css') ? specialColours(read('style.css')) : {};

  /* number -> genres */
  const genresByNum = {};
  Object.keys(genreMap).forEach((g) => {
    if (g === 'All') return;
    (genreMap[g] || []).forEach((n) => {
      (genresByNum[n] = genresByNum[n] || []).push(g);
    });
  });

  /* the ratings file */
  let ratings = {};
  if (has('anime-ratings.json')) {
    try { ratings = JSON.parse(read('anime-ratings.json')); } catch (e) { ratings = {}; }
  }

  /* the dub file */
  let dubs = {};
  if (has('anime-dubs.json')) {
    try {
      const d = JSON.parse(read('anime-dubs.json'));
      dubs = d.titles || d || {};
    } catch (e) { dubs = {}; }
  }

  /* the javascript data files */
  const sandbox = { window: {}, console: console };
  runDataFile('game-data.js', sandbox);
  runDataFile('game-data-extra.js', sandbox);
  runDataFile('game-data-facts.js', sandbox);
  runDataFile('quest-data.js', sandbox);

  const clues = sandbox.window.GUESS_CLUES || {};
  const facts = sandbox.window.TF_FACTS || [];
  const bank = sandbox.QUEST_BANK || [];

  /* the quest questions become question -> answer pairs */
  const qa = {};
  bank.forEach((q) => {
    if (!q || !q.anime || !q.question) return;
    const ans = (q.options || [])[q.correct];
    if (!ans) return;
    (qa[q.anime] = qa[q.anime] || []).push({ q: q.question, a: ans, d: q.difficulty || '' });
  });
  /* 30 questions per title is plenty - the file stays small enough to cache */
  Object.keys(qa).forEach((title) => {
    if (qa[title].length > 30) qa[title] = qa[title].slice(0, 30);
  });

  /* the clue sets, flattened */
  const clueOut = {};
  Object.keys(clues).forEach((title) => {
    const entry = clues[title] || {};
    const sets = entry.sets || [];
    const flat = [];
    sets.forEach((set) => { (set || []).forEach((c) => { if (c) flat.push(c); }); });
    const alt = (entry.alt || []).filter(Boolean);
    if (flat.length || alt.length) clueOut[title] = { alt: alt, clues: flat.slice(0, 16) };
  });

  /* the rows */
  const rows = cards.map((c) => {
    const r = ratings[String(c.n)] || null;
    const row = {
      n: c.n,
      title: c.title,
      genres: genresByNum[c.n] || [],
      seasons: c.seasons,
      seasonCount: c.seasonCount,
      episodes: c.episodes,
      special: c.special || '',
      poster: c.poster
    };
    if (r) {
      row.mal = (r.malScore !== undefined && r.malScore !== null && r.malScore !== '') ? parseFloat(r.malScore) : null;
      row.ratings = {
        malScore: r.malScore, characters: r.characters, animRating: r.animRating,
        animePlanet: r.animePlanet, anilist: r.anilist, storyRating: r.storyRating
      };
    }
    const alt = clueOut[c.title] ? clueOut[c.title].alt : [];
    if (alt.length) row.alt = alt;
    return row;
  });

  const totals = rows.reduce((acc, r) => {
    acc.anime += 1;
    acc.seasons += r.seasonCount || 0;
    acc.episodes += r.episodes || 0;
    return acc;
  }, { anime: 0, seasons: 0, episodes: 0 });

  /* the special kinds with their labels and colours */
  const specialTypes = {};
  const kindBlock = js.match(/const SPECIAL_CARD_TYPES = \{([\s\S]*?)\n\};/);
  if (kindBlock) {
    const re = /([a-z]+):\s*\{\s*t:\s*'([^']*)',\s*s:\s*'([^']*)'\s*\}/g;
    let m;
    while ((m = re.exec(kindBlock[1]))) {
      specialTypes[m[1]] = { t: m[2], s: m[3], color: colours[m[1]] || '' };
    }
  }

  /* The browser builds the card rows from the live DOM, so this table only
     needs what the DOM cannot know: the alternative names and the MAL score.
     That keeps the download small (it is cached for offline use). */
  const slimRows = rows.map((r) => {
    const s = { n: r.n, title: r.title };
    if (r.alt && r.alt.length) s.alt = r.alt;
    if (r.mal != null) s.mal = r.mal;
    return s;
  });

  const bundle = {
    generated: new Date().toISOString(),
    generator: 'scripts/build-site-knowledge.js',
    stats: totals,
    specialTypes: specialTypes,
    anime: slimRows,
    qa: qa,
    clues: clueOut,
    facts: facts.map((f) => (Array.isArray(f) ? [f[0], !!f[1]] : f))
  };

  /* the dub table lives in its own file (anime-dubs.json) - it is not copied here */
  bundle._dubFile = 'anime-dubs.json';
  void dubs;

  return bundle;
}

/* ── write it ─────────────────────────────────────────────────────── */
function writeBundle(bundle) {
  fs.writeFileSync(OUT, JSON.stringify(bundle), 'utf8');
  return OUT;
}

async function commit(token, file, content, message) {
  const owner = 'fardinsenpai';
  const repo = 'my-anime-list';
  const res = await fetch('https://api.github.com/repos/' + owner + '/' + repo + '/contents/' + file, {
    method: 'PUT',
    headers: {
      'Authorization': 'token ' + token,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      message: message,
      content: Buffer.from(content, 'utf8').toString('base64'),
      branch: 'main'
    })
  });
  if (!res.ok) {
    const why = await res.text();
    throw new Error('HTTP ' + res.status + ' ' + why.slice(0, 200));
  }
  return true;
}

if (require.main === module) {
  (async () => {
    const bundle = build();
    console.log('anime   :', bundle.stats.anime);
    console.log('seasons :', bundle.stats.seasons);
    console.log('episodes:', bundle.stats.episodes);
    console.log('special :', Object.keys(bundle.specialTypes).length, 'kinds');
    console.log('qa      :', Object.keys(bundle.qa).length, 'titles');
    console.log('clues   :', Object.keys(bundle.clues).length, 'titles');
    console.log('facts   :', bundle.facts.length);
    console.log('dubs    : in anime-dubs.json (not copied)');
    writeBundle(bundle);
    const size = fs.statSync(OUT).size;
    console.log('written :', OUT, '(' + Math.round(size / 1024) + ' KB)');

    const token = process.env.GITHUB_TOKEN || '';
    if (token) {
      const content = fs.readFileSync(OUT, 'utf8');
      await commit(token, 'site-knowledge.json', content,
        'admin: rebuild the site knowledge file (' + bundle.stats.anime + ' anime)');
      console.log('pushed  : site-knowledge.json');
    }
  })().catch((e) => { console.error(e); process.exit(1); });
}

module.exports = { build: build, writeBundle: writeBundle, cardsFromHtml: cardsFromHtml, genresFromScript: genresFromScript };
