#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════
   ask-knowledge.js  —  let the AI read the files of the website

   The chat on the site uses site-knowledge.js to pull the right rows out
   of site-knowledge.json. This CLI is the same retrieval from the shell,
   so an AI (or a human) can look up anything the site knows without
   opening the browser:

     node scripts/ask-knowledge.js "how many episodes does naruto have"
     node scripts/ask-knowledge.js "which anime are romantic"
     node scripts/ask-knowledge.js "naruto hindi dub"
     node scripts/ask-knowledge.js --all          every card, one per line
     node scripts/ask-knowledge.js --stats        the totals
     node scripts/ask-knowledge.js --facts 10     ten on-file statements
     node scripts/ask-knowledge.js --json "naruto"   the raw rows as JSON

   Exit code 0 when something was found, 1 when nothing matched.
   ══════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const Knowledge = require(path.join(ROOT, 'site-knowledge.js'));
const builder = require(path.join(__dirname, 'build-site-knowledge.js'));

const BUNDLE = path.join(ROOT, 'site-knowledge.json');

function loadBundle() {
  if (!fs.existsSync(BUNDLE)) {
    console.error('site-knowledge.json is missing - run: node scripts/build-site-knowledge.js');
    process.exit(2);
  }
  const data = JSON.parse(fs.readFileSync(BUNDLE, 'utf8'));
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const js = fs.readFileSync(path.join(ROOT, 'script.js'), 'utf8');
  const cards = builder.cardsFromHtml(html);
  const genreMap = builder.genresFromScript(js);

  /* number -> genres */
  const byNum = {};
  Object.keys(genreMap).forEach((g) => {
    if (g === 'All') return;
    (genreMap[g] || []).forEach((n) => { (byNum[n] = byNum[n] || []).push(g); });
  });

  /* the ratings file */
  let ratings = {};
  const ratingFile = path.join(ROOT, 'anime-ratings.json');
  if (fs.existsSync(ratingFile)) {
    try { ratings = JSON.parse(fs.readFileSync(ratingFile, 'utf8')); } catch (e) { ratings = {}; }
  }

  const rows = cards.map((c) => {
    const r = (data.anime || []).find((x) => x.n === c.n) || {};
    const row = {
      n: c.n,
      title: c.title,
      genres: byNum[c.n] || [],
      seasons: c.seasons,
      seasonCount: c.seasonCount,
      episodes: c.episodes,
      special: c.special || '',
      poster: c.poster
    };
    if (r.mal != null) row.mal = r.mal;
    if (r.alt) row.alt = r.alt;
    const rating = ratings[String(c.n)] || null;
    if (rating) {
      row.ratings = {
        malScore: rating.malScore, characters: rating.characters, animRating: rating.animRating,
        animePlanet: rating.animePlanet, anilist: rating.anilist, storyRating: rating.storyRating
      };
      if (row.mal == null && rating.malScore !== undefined && rating.malScore !== null && rating.malScore !== '') {
        const m = parseFloat(rating.malScore);
        if (isFinite(m)) row.mal = m;
      }
    }
    return row;
  });

  /* the dub table lives in anime-dubs.json */
  const dubFile = path.join(ROOT, 'anime-dubs.json');
  if (fs.existsSync(dubFile)) {
    try {
      const d = JSON.parse(fs.readFileSync(dubFile, 'utf8'));
      data.dubs = d.titles || d || {};
    } catch (e) {}
  }

  Knowledge.use(data, rows);
  if (data.specialTypes) Knowledge.setSpecial(data.specialTypes);
  return data;
}

function main() {
  const args = process.argv.slice(2);
  if (!args.length) {
    console.log('usage: node scripts/ask-knowledge.js "<question>"');
    console.log('       node scripts/ask-knowledge.js --all | --stats | --facts [n] | --json "<question>"');
    process.exit(2);
  }

  loadBundle();

  if (args[0] === '--all') {
    console.log(Knowledge.catalogue());
    process.exit(0);
  }
  if (args[0] === '--stats') {
    const s = Knowledge.stats();
    console.log('anime   :', s.anime);
    console.log('seasons :', s.seasons);
    console.log('episodes:', s.episodes);
    process.exit(0);
  }
  if (args[0] === '--facts') {
    const n = parseInt(args[1], 10) || 10;
    const data = Knowledge.data() || {};
    const facts = data.facts || [];
    for (let i = 0; i < Math.min(n, facts.length); i++) {
      const f = facts[i];
      console.log('- ' + (Array.isArray(f) ? f[0] : f.s) + '  ->  ' + (Array.isArray(f) ? (f[1] ? 'TRUE' : 'FALSE') : (f.t ? 'TRUE' : 'FALSE')));
    }
    process.exit(0);
  }
  if (args[0] === '--json') {
    const res = Knowledge.retrieve(args.slice(1).join(' '));
    console.log(JSON.stringify({ hits: res.hits, lines: res.lines }, null, 2));
    process.exit(res.hits.length ? 0 : 1);
  }

  const question = args.join(' ');
  const res = Knowledge.retrieve(question);
  if (!res.lines.length) {
    console.log('nothing in the site files matches: ' + question);
    process.exit(1);
  }
  console.log('FILES READ FROM THE WEBSITE (' + question + '):');
  console.log(res.lines.join('\n'));
  process.exit(0);
}

main();
