/* ─────────────────────────────────────────────────────────────────────────
   update-counters.js  —  keeps the three totals honest

   The site counts the anime from the cards, but the season and episode
   totals used to be typed in by hand and drifted every time an anime was
   added or corrected. This script reads the cards of index.html (the
   episode count and the season list are printed on the back of every card),
   adds them up and writes the real numbers into script.js.

   Run it on its own:      node scripts/update-counters.js
   Run it with a token:    GITHUB_TOKEN=ghp_xxx node scripts/update-counters.js
   (without a token it only writes the local files and prints the result)

   The admin panel runs the very same logic after every commit, so the
   counters can never be wrong for long.
   ───────────────────────────────────────────────────────────────────────── */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const INDEX = path.join(ROOT, 'index.html');
const SCRIPT = path.join(ROOT, 'script.js');

/* ── read the cards ─────────────────────────────────────────────────── */
function totalsFromHtml(html) {
  const lines = html.split('\n');
  let anime = 0, seasons = 0, episodes = 0;
  const perCard = [];
  lines.forEach((line) => {
    if (line.indexOf('class="card') === -1) return;
    if (line.indexOf('badge">#') === -1) return;
    anime++;

    const titleM = line.match(/<div class="title">([^<]*)<\/div>/);
    const title = titleM ? titleM[1] : '?';

    /* the back of the card prints the episode count */
    const epM = line.match(/back-episodes">([^<]*)</);
    let eps = 0;
    if (epM) {
      const n = epM[1].replace(/[^\d]/g, '');
      eps = n ? parseInt(n, 10) : 0;
    }

    /* …and the season list ("Season-1,2,3") */
    const seM = line.match(/back-season">([^<]*)</);
    let seasonCount = 1;
    if (seM) {
      const nums = seM[1].match(/\d+/g);
      if (nums && nums.length) seasonCount = nums.length;
    }
    if (!seM) seasonCount = 0;    /* no season line = no data yet */

    seasons += seasonCount;
    episodes += eps;
    perCard.push({ title: title, eps: eps, seasons: seasonCount });
  });
  return { anime: anime, seasons: seasons, episodes: episodes, perCard: perCard };
}

/* ── write the numbers into script.js ───────────────────────────────── */
function patchScript(js, totals) {
  const out = js
    .replace(/counterUp\("animeCount",\s*[^,]+,/, 'counterUp("animeCount", ' + totals.anime + ',')
    .replace(/counterUp\("seasonCount",\s*\d+/, 'counterUp("seasonCount", ' + totals.seasons)
    .replace(/counterUp\("episodeCount",\s*\d+/, 'counterUp("episodeCount", ' + totals.episodes);
  return out;
}

/* the numbers the site shows before the fetch */
function patchIndex(html, totals) {
  return html.replace(/(<span id="lastUpdatedDate">)(.*?)(<\/span>)/, '$1' + new Date().toLocaleDateString('en-GB') + '$3');
}

/* ── optionally push to GitHub ──────────────────────────────────────── */
async function commit(token, path, content, message) {
  const owner = 'fardinsenpai';
  const repo = 'my-anime-list';
  const res = await fetch('https://api.github.com/repos/' + owner + '/' + repo + '/contents/' + path, {
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

(async () => {
  const html = fs.readFileSync(INDEX, 'utf8');
  const js = fs.readFileSync(SCRIPT, 'utf8');
  const totals = totalsFromHtml(html);
  console.log('cards      :', totals.anime);
  console.log('seasons    :', totals.seasons);
  console.log('episodes   :', totals.episodes);

  const patched = patchScript(js, totals);
  const changed = patched !== js;
  console.log('script.js  :', changed ? 'counters updated' : 'already correct');

  const token = process.env.GITHUB_TOKEN || '';
  if (token) {
    if (changed) {
      await commit(token, 'script.js', patched, 'admin: update the season and episode totals (' + totals.seasons + ' seasons / ' + totals.episodes + ' episodes)');
      console.log('pushed script.js to GitHub');
    } else {
      console.log('nothing to push');
    }
  } else {
    if (changed) {
      fs.writeFileSync(SCRIPT, patched, 'utf8');
      console.log('written to script.js (set GITHUB_TOKEN to push it)');
    }
  }
})();
