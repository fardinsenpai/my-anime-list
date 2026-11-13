/* ══════════════════════════════════════════════════════════════════════
   ROOT@FARDIN ~ ADMIN PANEL — admin.js  (only admin.html loads this)

   The old pop-up became its own page: a green terminal with every module
   permanently listed in the left sidebar. The editing work is unchanged —
   it still commits to index.html / script.js on GitHub with your PAT.

   This file is three parts:
     1. the data link below — it fetches the live index.html + script.js
        from the same domain so the panel can search the real anime cards
        and read the real TOP_5_DATA / AWARD_WINNERS / OTT / STUDIO /
        GROQ_MODELS / CHAT_AVATARS values (no duplicated data, no drift);
     2. the avatar + admin code, copied verbatim from script.js (see the
        markers) so behaviour is byte-for-byte what you already trust;
     3. a short boot block at the end.
   ══════════════════════════════════════════════════════════════════════ */

/* ── the published values; loadAdminData() fills them in ── */
var OTT_DATA = {};
var STUDIO_DATA = {};
var TOP_5_DATA = {};
var RATING_DATA = {};
var RATING_DETAIL = {};          // anime-ratings.json → { id: {malScore, characters, animRating, storyRating, animePlanet, anilist} }
/* the 16 special card kinds the site knows about */
var SPECIAL_CARD_KINDS = ['legendary', 'epic', 'op', 'isekaiking', 'burning', 'earth', 'black', 'wind', 'lightning', 'speed', 'frozen', 'healing', 'science', 'romance', 'psychic', 'levelup'];
var SPECIAL_CARD_NAMES = {
  legendary:  { t: 'LEGENDARY',    s: 'MYTHIC TIER' },
  epic:       { t: 'EPIC',         s: 'SAVAGE TIER' },
  op:         { t: 'OVER POWERED', s: 'ABSOLUTE FORCE' },
  isekaiking: { t: 'ISEKAI LORD',  s: 'OTHER WORLD' },
  burning:    { t: 'FIRE',         s: 'BLAZING SOUL' },
  earth:      { t: 'EARTH',        s: 'UNSHAKEN' },
  black:      { t: 'CURSED',       s: 'BLACK SOUL' },
  wind:       { t: 'WIND',         s: 'STORM RIDER' },
  lightning:  { t: 'THUNDER',      s: 'STORM CALLER' },
  speed:      { t: 'SPEED',        s: 'FLASH STEP' },
  frozen:     { t: 'FROZEN',       s: 'ICE HEART' },
  healing:    { t: 'HEALING',      s: 'LIFE BRINGER' },
  science:    { t: 'SCIENCE',      s: 'THE GENIUS' },
  romance:    { t: 'ROMANCE',      s: 'SWEET HEART' },
  psychic:    { t: 'PSYCHIC',      s: 'MIND READER' },
  levelup:    { t: 'LEVEL UP',     s: 'RISING STAR' }
};
var AWARD_WINNERS = {};
var GROQ_MODELS = [];
var GROQ_API_KEYS = [];
var GENRE_BY_ID = {};          // anime id → ['Action', …] straight out of script.js
var ADMIN_DATA_READY = false;
var ADMIN_STATS_BASE = { anime: 0, seasons: 0, episodes: 0 };

/* The panel has no chat of its own, so the few chat-only helpers the shared
   avatar code can reach get harmless stand-ins. */
function googleAvatarValue() { return ''; }
function chatToast(message) { msgFail(message); }
function applyMyAvatarChange() { /* there is no chat on this page */ }

function bootLine(text, cls) {
  var el = document.getElementById('bootLine');
  if (!el) return;
  el.textContent = text;
  el.className = 'ad-boot' + (cls ? ' ' + cls : '');
}

/* Progress % is never typed by hand — it is derived from current ÷ total and
   shown with two decimals (e.g. 12 episodes of 51 -> 23.53). Total may be
   blank or "∞", in which case there is no percentage to show (0). */
function calcProgress(current, total) {
  var c = parseFloat(String(current).replace(/[^\d.]/g, ''));
  var t = parseFloat(String(total).replace(/[^\d.]/g, ''));
  if (!isFinite(c) || !isFinite(t) || t <= 0) return 0;
  var pct = (c / t) * 100;
  if (pct < 0) pct = 0;
  if (pct > 100) pct = 100;
  return Math.round(pct * 100) / 100;   // 2 decimals
}

/* Live preview line under the WATCH / READ forms. */
function paintProgressPreview(elId, curId, totId, unit) {
  var el = document.getElementById(elId);
  if (!el) return;
  var cur = document.getElementById(curId);
  var tot = document.getElementById(totId);
  var c = cur ? cur.value.trim() : '';
  var t = tot ? tot.value.trim() : '';
  if (!c || !t || !parseFloat(t)) {
    el.textContent = 'Progress is calculated automatically from current ÷ total ' + unit + '.';
    return;
  }
  el.textContent = 'Auto progress: ' + calcProgress(c, t).toFixed(2) + '%  (' + c + ' of ' + t + ')';
}

function paintPatStatus() {
  var el = document.getElementById('adPatStatus');
  if (!el) return;
  var p = getPat();
  if (p) {
    el.textContent = '// PAT: ' + p.slice(0, 7) + '…' + p.slice(-4);
    el.className = 'ad-pat-status ok';
  } else {
    el.textContent = '// PAT: NOT SET';
    el.className = 'ad-pat-status';
  }
}

/* Pull `const NAME = {...};` / `let NAME = [...];` / `window.NAME = {...};`
   out of a source file and evaluate it, so the panel always shows what is
   really published rather than a hard-coded guess. */
function grabLiteral(src, name) {
  var re = new RegExp('(?:window\\.|const |let |var )' + name + '\\s*=\\s*');
  var m = re.exec(src);
  if (!m) return null;
  var i = m.index + m[0].length;
  var start = i, depth = 0, str = null, esc = false;
  for (; i < src.length; i++) {
    var ch = src.charAt(i);
    if (str) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === str) str = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') { str = ch; continue; }
    if (ch === '/' && src.charAt(i + 1) === '/') { while (i < src.length && src.charAt(i) !== '\n') i++; continue; }
    if (ch === '{' || ch === '[') depth++;
    else if (ch === '}' || ch === ']') { depth--; if (depth <= 0) { i++; break; } }
  }
  try { return Function('return (' + src.slice(start, i) + ')')(); } catch (e) { return null; }
}

/* The site keeps its genre lists in a `const GENRES = { "Action": { icon, nums: new Set([…]) } }`
   block, and `nums` is exactly the list of anime ids in that genre. Flip it round so the
   EDIT module can show an anime's genres without guessing. */
function grabGenres(jsText) {
  var i = jsText.indexOf('const GENRES = {');
  if (i < 0) return {};
  var body = jsText.slice(i, i + 40000);
  var re = /"([^"]+)"\s*:\s*\{\s*icon:\s*"[^"]*"\s*,\s*nums:\s*new\s*Set\(\[([\d,\s]*)\]\)/g;
  var map = {}, m;
  while ((m = re.exec(body))) {
    if (m[1] === 'All') continue;
    (m[2] || '').split(',').forEach(function (n) {
      var id = parseInt(n.trim(), 10);
      if (!id) return;
      if (!map[id]) map[id] = [];
      map[id].push(m[1]);
    });
  }
  return map;
}

/* The newest cards of the list - the "last content" of the collection.
   Reads the hidden card host that loadAdminData() fills in. */
function renderLatestAnime() {
  var host = document.getElementById('adLatestList');
  if (!host) return;
  var cards = Array.prototype.slice.call(document.querySelectorAll('#grid .card'));
  var latest = cards.slice(-5).reverse();
  if (!latest.length) {
    host.innerHTML = '<div class="ad-status dim">// waiting for the data link …</div>';
    return;
  }
  var esc = function (s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  };
  host.innerHTML = latest.map(function (c) {
    var numEl = c.querySelector('.number');
    var id = numEl ? String(numEl.textContent || '').replace(/\D/g, '') : '?';
    var titleEl = c.querySelector('.title');
    var seasonEl = c.querySelector('.back-season');
    return '<div class="ad-latest-item">' +
      '<span class="ad-latest-id">#' + esc(id) + '</span>' +
      '<span class="ad-latest-title">' + esc(titleEl ? titleEl.textContent : '') + '</span>' +
      '<span class="ad-latest-season">' + esc(seasonEl ? seasonEl.textContent.replace('🌸', '').trim() : '') + '</span>' +
      '</div>';
  }).join('');
}

/* ── WAIFU module: the A&D → Waifu gallery lives in script.js ───────── */
var WAIFU_DATA = [];

function adEsc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* Insert one entry at the end of `const NAME = [ … ];` inside a source file.
   Returns the new source, or null when the array cannot be found. */
function insertIntoArrayLiteral(src, name, entryText) {
  var re = new RegExp('(?:window\\.|const |let |var )' + name + '\\s*=\\s*\\[');
  var m = re.exec(src);
  if (!m) return null;
  var i = m.index + m[0].length;
  var depth = 1, str = null, esc = false;
  for (; i < src.length; i++) {
    var ch = src.charAt(i);
    if (str) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === str) str = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') { str = ch; continue; }
    if (ch === '[') depth++;
    else if (ch === ']') { depth--; if (depth <= 0) break; }
  }
  if (i >= src.length) return null;
  var head = src.substring(0, i);
  var tail = src.substring(i);
  /* the previous entry already ends with a comma? then just add a new line */
  var trimmed = head.replace(/\s+$/, '');
  var sep = /,\s*$/.test(trimmed) ? '\n' : ',\n';
  return trimmed + sep + entryText + ',\n' + tail.replace(/^\s*\n/, '\n');
}

function renderWaifuList() {
  var host = document.getElementById('adminWaifuList');
  if (!host) return;
  if (!WAIFU_DATA || !WAIFU_DATA.length) {
    host.innerHTML = '<div class="ad-status dim">// waiting for the data link …</div>';
    return;
  }
  host.innerHTML = WAIFU_DATA.map(function (w, i) {
    return '<div class="ad-latest-item">' +
      '<span class="ad-latest-id">#' + (i + 1) + '</span>' +
      '<span class="ad-latest-title">' + adEsc(w.name) + '</span>' +
      '<span class="ad-latest-season">' + adEsc(w.anime) + '</span>' +
      '</div>';
  }).join('');
}

function renderWaifuPreview() {
  var frame = document.getElementById('adminWaifuPreview');
  if (!frame) return;
  var val = function (id) {
    var el = document.getElementById(id);
    return el ? String(el.value || '').trim() : '';
  };
  var name = adEsc(val('adminWaifuName') || 'Waifu name');
  var anime = adEsc(val('adminWaifuAnime') || 'Anime');
  var first = adEsc(val('adminWaifuFirst') || 'Episode 1');
  var img = adEsc(val('adminWaifuImg'));
  var card =
    '<div class="waifu-card"><div class="waifu-inner">' +
      '<div class="waifu-front">' +
        (img ? '<img src="' + img + '" alt="">' : '<div class="waifu-noimg"></div>') +
        '<div class="waifu-badge">#1</div>' +
        '<div class="waifu-info"><h3>' + name + '</h3></div>' +
      '</div>' +
      '<div class="waifu-back"><h3>' + anime + '</h3><p>' + first + '</p></div>' +
    '</div></div>';
  frame.srcdoc =
    '<!doctype html><html><head><meta charset="utf-8">' +
    '<link rel="stylesheet" href="style.css">' +
    '<style>html,body{margin:0;padding:0;background:#07070c;}' +
    'body{display:flex;align-items:center;justify-content:center;height:100vh;overflow:hidden;}' +
    '.waifu-card{width:200px!important;height:280px;cursor:pointer;}</style></head><body>' + card +
    '<script>document.addEventListener("click",function(e){var c=e.target.closest(".waifu-card");if(c)c.classList.toggle("flip");});<\/script>' +
    '</body></html>';
}

function renderWaifuTab() {
  renderWaifuList();
  renderWaifuPreview();
  if (window.__waifuPreviewWired) return;
  window.__waifuPreviewWired = true;
  var timer = null;
  ['adminWaifuName', 'adminWaifuAnime', 'adminWaifuFirst', 'adminWaifuImg'].forEach(function (id) {
    var el = document.getElementById(id);
    if (!el) return;
    var repaint = function () {
      clearTimeout(timer);
      timer = setTimeout(renderWaifuPreview, 150);
    };
    el.addEventListener('input', repaint);
    el.addEventListener('change', repaint);
  });
}

async function commitWaifu() {
  var val = function (id) {
    var el = document.getElementById(id);
    return el ? String(el.value || '').trim() : '';
  };
  var name = val('adminWaifuName');
  var anime = val('adminWaifuAnime');
  var first = val('adminWaifuFirst') || 'Episode 1';
  var img = val('adminWaifuImg');
  if (!name || !anime || !img) { msgFail('Name, anime and image URL are required'); return; }
  showLoading();
  adStep('fetching script.js…');
  try {
    var data = await githubFetch('script.js');
    if (!data) {
      hideLoading(); adStep('');
      saveCommitResult('add-waifu', false, 'fetch failed');
      msgFail('Failed to fetch script.js — check the PAT');
      return;
    }
    var content = decodeURIComponent(escape(atob(data.content)));
    var entry = '{ name:"' + name.replace(/"/g, '') + '", anime:"' + anime.replace(/"/g, '') +
                '", first:"' + first.replace(/"/g, '') + '", img:"' + img.replace(/"/g, '') + '" }';
    var updated = insertIntoArrayLiteral(content, 'waifus', entry);
    if (!updated) {
      hideLoading(); adStep('');
      saveCommitResult('add-waifu', false, 'waifus array not found in script.js');
      msgFail('Could not find the waifus list in script.js');
      return;
    }
    adStep('committing script.js…');
    var ok = await githubCommit('script.js', updated, 'admin: add waifu ' + name);
    hideLoading();
    adStep('');
    saveCommitResult('add-waifu', ok, name + ' (' + anime + ')');
    if (ok) {
      WAIFU_DATA.push({ name: name, anime: anime, first: first, img: img });
      renderWaifuList();
      msgOk('Waifu ' + name + ' added to the gallery');
    } else {
      msgFail('Commit failed');
    }
  } catch (e) {
    hideLoading();
    adStep('');
    saveCommitResult('add-waifu', false, 'exception: ' + ((e && e.message) || e));
    msgFail('Commit threw: ' + ((e && e.message) || e));
  }
}

/* Fetch the live site files once and hand the panel everything it needs. */
async function loadAdminData() {
  try {
    bootLine('// OPENING DATA LINK → index.html + script.js …');
    var res = await Promise.all([
      fetch('index.html', { cache: 'no-store' }),
      fetch('script.js', { cache: 'no-store' }),
      fetch('anime-ratings.json', { cache: 'no-store' }).catch(function () { return null; })
    ]);
    if (!res[0].ok || !res[1].ok) throw new Error('HTTP ' + res[0].status + ' / ' + res[1].status);
    var htmlText = await res[0].text();
    var jsText = await res[1].text();

    /* 0. the rich ratings file (MAL + Animation + Characters + Story + Planet) */
    if (res[2] && res[2].ok) {
      try {
        var ratingsJson = await res[2].json();
        var titles = (ratingsJson && ratingsJson.titles) ? ratingsJson.titles : ratingsJson;
        if (titles && typeof titles === 'object') RATING_DETAIL = titles;
      } catch (e) { /* the panel still works with the legacy ratings */ }
    }

    // 1. the anime cards (+ the counters the STATS placeholders show) go into a
    //    hidden host, so every `#grid .card` lookup in the panel keeps working
    var host = document.getElementById('adminDataHost');
    var doc = new DOMParser().parseFromString(htmlText, 'text/html');
    var grid = doc.getElementById('grid');
    if (!grid) throw new Error('#grid not found in index.html');
    host.appendChild(document.importNode(grid, true));
    ['animeCount', 'seasonCount', 'episodeCount', 'lastUpdatedDate'].forEach(function (id) {
      var el = doc.getElementById(id);
      if (el) host.appendChild(document.importNode(el, true));
    });
    // never download 260 posters for a panel nobody is looking at
    host.querySelectorAll('img').forEach(function (im) {
      im.loading = 'lazy';
      im.decoding = 'async';
      im.removeAttribute('srcset');
      im.removeAttribute('sizes');
    });

    // 2. the published globals straight out of the deployed script.js
    OTT_DATA = grabLiteral(jsText, 'OTT_DATA') || {};
    STUDIO_DATA = grabLiteral(jsText, 'STUDIO_DATA') || {};
    TOP_5_DATA = grabLiteral(jsText, 'TOP_5_DATA') || {};
    RATING_DATA = grabLiteral(jsText, 'RATING_DATA') || {};
    AWARD_WINNERS = grabLiteral(jsText, 'AWARD_WINNERS') || {};
    GROQ_MODELS = grabLiteral(jsText, 'GROQ_MODELS') || [];
    GROQ_API_KEYS = grabLiteral(jsText, 'GROQ_API_KEYS') || [];
    var avatars = grabLiteral(jsText, 'CHAT_AVATARS');
    if (avatars && typeof avatars === 'object') CHAT_AVATARS = avatars;
    GENRE_BY_ID = grabGenres(jsText);
    var waifuList = grabLiteral(jsText, 'waifus');
    WAIFU_DATA = (waifuList && typeof waifuList === 'object') ? waifuList : [];

    // current counter values: the season/episode counters are hardcoded numbers in
    // script.js, the anime counter is counted from the cards at runtime
    var _mS = jsText.match(/counterUp\("seasonCount",\s*(\d+)/);
    var _mE = jsText.match(/counterUp\("episodeCount",\s*(\d+)/);
    ADMIN_STATS_BASE = {
      anime: document.querySelectorAll('#adminDataHost #grid .card').length,
      seasons: _mS ? parseInt(_mS[1], 10) : 0,
      episodes: _mE ? parseInt(_mE[1], 10) : 0
    };

    refreshStatsPlaceholders();
    renderLatestAnime();
    renderWaifuList();

    ADMIN_DATA_READY = true;
    var cards = ADMIN_STATS_BASE.anime;
    bootLine('// DATA LINK OK — ' + cards + ' anime · TOP5 ' + Object.keys(TOP_5_DATA).length +
             ' genres · ' + Object.keys(AWARD_WINNERS).length + ' award years · ' +
             GROQ_MODELS.length + ' models', 'ok');
    return true;
  } catch (e) {
    bootLine('// DATA LINK FAILED: ' + ((e && e.message) || e) + ' — press RETRY', 'err');
    return false;
  }
}

/* the anime search suggests the titles of the list in the search fields */
function attachAnimeSearch() {
  if (!window.AnimeSearch) return;
  var el = document.getElementById('adminEditSearch');
  if (el) {
    el.setAttribute('data-search-clear', '0');
    window.AnimeSearch.attach(el, { clear: false });
  }
}

/* ══ SPECIAL CARDS - pick the kind of a card and commit it ══ */
var SPECIAL_KIND_COLORS = {
  legendary: '#eaf2ff', epic: '#ff8a2b', op: '#ff4fa3', isekaiking: '#8a6cff',
  burning: '#ff4a3d', earth: '#c08a44', black: '#a9a9c2', wind: '#3fd97a',
  lightning: '#ffe94d', speed: '#2ae6c0', frozen: '#57d2ff', healing: '#a8e63c',
  science: '#4d8cff', romance: '#ff7ec9', psychic: '#c07bff', levelup: '#ffbe2b'
};

function renderSpecialCards(filter) {
  var host = document.getElementById('adminSpecialList');
  if (!host) return;
  var q = String(filter || '').trim().toLowerCase();
  var cards = document.querySelectorAll('#adminDataHost #grid .card');
  var rows = [];
  Array.prototype.forEach.call(cards, function (c) {
    var t = c.querySelector('.title');
    var title = t ? String(t.textContent || '').trim() : '';
    if (!title) return;
    if (q && title.toLowerCase().indexOf(q) === -1) return;
    var b = c.querySelector('.badge');
    var id = b ? String(b.textContent || '').replace(/\D/g, '') : '';
    if (!id) return;
    var current = '';
    var cls = String(c.className || '').split(/\s+/);
    for (var i = 0; i < cls.length; i++) {
      if (cls[i].indexOf('card-') === 0 && SPECIAL_KIND_COLORS[cls[i].replace('card-', '')]) current = cls[i].replace('card-', '');
    }
    rows.push({ id: id, title: title, kind: current });
    if (rows.length >= 60) return;
  });
  var legend = document.getElementById('adminSpecialLegend');
  if (legend && !legend.innerHTML) {
    legend.innerHTML = Object.keys(SPECIAL_KIND_COLORS).map(function (k) {
      var name = (SPECIAL_CARD_NAMES[k] && SPECIAL_CARD_NAMES[k].t) || k;
      return '<span class="ad-special-chip" style="--k:' + SPECIAL_KIND_COLORS[k] + '">' + adEsc(name) + '</span>';
    }).join('');
  }
  host.innerHTML = rows.map(function (r) {
    var opts = '<option value="">None</option>' + Object.keys(SPECIAL_CARD_NAMES).map(function (k) {
      return '<option value="' + k + '"' + (r.kind === k ? ' selected' : '') + '>' +
        adEsc(SPECIAL_CARD_NAMES[k].t) + '</option>';
    }).join('');
    return '<div class="ad-special-row" data-id="' + r.id + '">' +
      '<span class="ad-special-id">#' + r.id + '</span>' +
      '<span class="ad-special-name">' + adEsc(r.title) + '</span>' +
      '<select class="admin-g-input ad-special-sel">' + opts + '</select></div>';
  }).join('') || '<div class="ad-status dim">// nothing matches that title</div>';
}

async function commitSpecialCards() {
  var picks = {};
  document.querySelectorAll('#adminSpecialList .ad-special-row').forEach(function (row) {
    var id = row.getAttribute('data-id');
    var sel = row.querySelector('select');
    if (id && sel) picks[id] = sel.value;
  });
  if (!Object.keys(picks).length) { msgFail('Nothing to save'); return; }
  showLoading();
  adStep('fetching index.html...');
  try {
    var data = await githubFetch('index.html');
    if (!data) { hideLoading(); adStep(''); saveCommitResult('special-cards', false, 'fetch failed'); msgFail('Failed to fetch index.html'); return; }
    var content = decodeURIComponent(escape(atob(data.content)));
    var lines = content.split('\n');
    var changed = 0;
    lines.forEach(function (line, i) {
      var m = line.match(/<span class="badge">#(\d+)<\/span>/);
      if (!m) return;
      var id = m[1];
      if (!(id in picks)) return;
      var kind = picks[id];
      var before = line;
      lines[i] = line.replace(/class="card([^"]*)"/, function (mm, rest) {
        var c = String(rest).replace(/\s*card-(legendary|epic|op|isekaiking|burning|earth|black|wind|lightning|speed|frozen|healing|science|romance|psychic|levelup)/g, '');
        return 'class="card' + c.replace(/\s+/g, ' ').trim() + (kind ? ' card-' + kind : '') + '"';
      });
      if (lines[i] !== before) changed++;
    });
    adStep('committing index.html...');
    var ok = await githubCommit('index.html', lines.join('\n'), 'admin: special cards');
    hideLoading();
    adStep('');
    saveCommitResult('special-cards', ok, changed + ' cards');
    if (ok) { msgOk(changed + ' special cards saved'); renderSpecialCards(); }
    else msgFail('Commit failed');
  } catch (e) {
    hideLoading();
    adStep('');
    saveCommitResult('special-cards', false, 'exception: ' + ((e && e.message) || e));
    msgFail('Commit threw: ' + ((e && e.message) || e));
  }
}

/* ══ ▼▼ from here down: avatar + admin code copied verbatim from script.js ▼▼ ══ */
/* ── BEGIN AVATAR / CHARACTER BLOCK (script.js, message-avatars section) ── */

let CHAT_AVATARS = { ai: 'img:https://s4.anilist.co/file/anilistcdn/character/large/b5187-y1OEdRu9sPN2.png', user: 'img:https://s4.anilist.co/file/anilistcdn/character/large/b123285-tKijiuQErDS0.png' };

// Ready-made avatars (drawn as SVG so they stay crisp at any size)
const AVATAR_PRESETS = {
  sharingan: {
    label: 'Sharingan',
    bg: 'radial-gradient(circle at 32% 28%, #ff8fb8, #ff2d55 75%)',
    border: 'rgba(255,214,232,0.75)',
    glow: '0 0 10px rgba(255,45,85,0.45)',
    svg: '<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="45" fill="#8b0000" stroke="#ff2200" stroke-width="3"></circle><circle cx="50" cy="50" r="15" fill="#1a0000"></circle><circle cx="50" cy="28" r="7" fill="#1a0000"></circle><circle cx="69" cy="61" r="7" fill="#1a0000"></circle><circle cx="31" cy="61" r="7" fill="#1a0000"></circle><circle cx="50" cy="50" r="6" fill="#ff2200"></circle></svg>'
  },
  rinnegan: {
    label: 'Rinnegan',
    bg: 'radial-gradient(circle at 32% 28%, #c4b5fd, #5b21b6 78%)',
    border: 'rgba(221,214,254,0.8)',
    glow: '0 0 10px rgba(124,58,237,0.5)',
    svg: '<svg viewBox="0 0 100 100" fill="none" stroke="#ede9fe" stroke-width="6"><circle cx="50" cy="50" r="40"></circle><circle cx="50" cy="50" r="24"></circle><circle cx="50" cy="50" r="9" fill="#ede9fe" stroke="none"></circle></svg>'
  },
  kitsune: {
    label: 'Kitsune',
    bg: 'radial-gradient(circle at 32% 28%, #fdba74, #ea580c 78%)',
    border: 'rgba(254,215,170,0.85)',
    glow: '0 0 10px rgba(249,115,22,0.45)',
    svg: '<svg viewBox="0 0 24 24"><path d="M4 3 L8.2 6.2 L15.8 6.2 L20 3 L19.5 10.2 C19.5 15.4 16.1 19.5 12 19.5 C7.9 19.5 4.5 15.4 4.5 10.2 Z" fill="#fff7ed"></path><circle cx="9.2" cy="11.2" r="1.3" fill="#7c2d12"></circle><circle cx="14.8" cy="11.2" r="1.3" fill="#7c2d12"></circle><path d="M12 14.4l-1.4 1.5h2.8z" fill="#7c2d12"></path></svg>'
  },
  neko: {
    label: 'Neko',
    bg: 'radial-gradient(circle at 32% 28%, #fbcfe8, #db2777 80%)',
    border: 'rgba(251,207,232,0.85)',
    glow: '0 0 10px rgba(219,39,119,0.45)',
    svg: '<svg viewBox="0 0 24 24"><path d="M5.2 7.2 L4.4 2.6 L8.7 4.7 Z" fill="#fff0f6"></path><path d="M18.8 7.2 L19.6 2.6 L15.3 4.7 Z" fill="#fff0f6"></path><circle cx="12" cy="12.6" r="7.6" fill="#fff0f6"></circle><circle cx="9.3" cy="11.6" r="1.2" fill="#831843"></circle><circle cx="14.7" cy="11.6" r="1.2" fill="#831843"></circle><path d="M12 14.6l-1.2 1.3h2.4z" fill="#831843"></path></svg>'
  },
  sakura: {
    label: 'Sakura',
    bg: 'radial-gradient(circle at 32% 28%, #ffe9f4, #ff8fb8 80%)',
    border: 'rgba(255,143,184,0.95)',
    glow: '0 0 10px rgba(255,95,158,0.5)',
    svg: '<svg viewBox="0 0 24 24"><g transform="translate(12 12)" fill="#be185d"><ellipse cx="0" cy="-5" rx="3.1" ry="5"></ellipse><ellipse cx="0" cy="-5" rx="3.1" ry="5" transform="rotate(72)"></ellipse><ellipse cx="0" cy="-5" rx="3.1" ry="5" transform="rotate(144)"></ellipse><ellipse cx="0" cy="-5" rx="3.1" ry="5" transform="rotate(216)"></ellipse><ellipse cx="0" cy="-5" rx="3.1" ry="5" transform="rotate(288)"></ellipse></g><circle cx="12" cy="12" r="1.9" fill="#ffe4ef"></circle></svg>'
  },
  samurai: {
    label: 'Samurai',
    bg: 'radial-gradient(circle at 32% 28%, #60a5fa, #1e3a8a 80%)',
    border: 'rgba(191,219,254,0.85)',
    glow: '0 0 10px rgba(37,99,235,0.5)',
    svg: '<svg viewBox="0 0 24 24"><path d="M12 2.6c-5 0-8.6 3.7-8.6 8.6 0 1.9 0.5 3.4 1.3 4.6h14.6c0.8-1.2 1.3-2.7 1.3-4.6 0-4.9-3.6-8.6-8.6-8.6z" fill="#f8faff"></path><path d="M12 2.6c-1.3 0-2.5 0.2-3.6 0.7L12 9.4l3.6-6.1c-1.1-0.5-2.3-0.7-3.6-0.7z" fill="#a5b4fc"></path><path d="M4.7 15.8h14.6l-1.9 4.2a1 1 0 0 1-0.9 0.6H7.5a1 1 0 0 1-0.9-0.6z" fill="#4f46e5"></path><rect x="10.7" y="15.8" width="2.6" height="4.8" rx="0.7" fill="#eef2ff"></rect></svg>'
  },
  ramen: {
    label: 'Ramen',
    bg: 'radial-gradient(circle at 32% 28%, #fde68a, #d97706 80%)',
    border: 'rgba(253,230,138,0.85)',
    glow: '0 0 10px rgba(217,119,6,0.45)',
    svg: '<svg viewBox="0 0 24 24"><path d="M3 11.2h18c0 5.1-4 8.8-9 8.8s-9-3.7-9-8.8z" fill="#fde68a"></path><path d="M4.6 12.6h14.8c-0.4 3.6-3.5 6-7.4 6s-7-2.4-7.4-6z" fill="#7c2d12"></path><path d="M8.2 9c1-1.3 1-2.4 0-3.7M12 8.4c1.2-1.5 1.2-2.9 0-4.4M15.8 9c1-1.3 1-2.4 0-3.7" stroke="#fff7ed" stroke-width="1.4" fill="none" stroke-linecap="round"></path></svg>'
  },
  chibi: {
    label: 'Chibi',
    bg: 'radial-gradient(circle at 32% 28%, #fbcfe8, #be185d 82%)',
    border: 'rgba(252,231,243,0.85)',
    glow: '0 0 10px rgba(190,24,93,0.45)',
    svg: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9.6" fill="#9d174d"></circle><circle cx="12" cy="13.8" r="6.6" fill="#ffe9f2"></circle><path d="M5 11.5C5.6 8.6 8.4 6.9 12 6.9s6.4 1.7 7 4.6c-1.2 1.2-2.4 1.4-3.4 0.6-0.9-0.7-1.2-1.6-2.1-2.2-1.1 0.7-1.6 1.6-2.6 2.2-1 0.6-2.2 0.4-3.5-0.6z" fill="#7f1d4d"></path><circle cx="9.5" cy="14.6" r="1.2" fill="#4a044e"></circle><circle cx="14.5" cy="14.6" r="1.2" fill="#4a044e"></circle><path d="M10.9 17.2c0.8 0.7 1.4 0.7 2.2 0" stroke="#4a044e" stroke-width="1" fill="none" stroke-linecap="round"></path></svg>'
  },
  person: {
    label: 'You',
    bg: 'radial-gradient(circle at 32% 28%, #a78bfa, #6d28d9 80%)',
    border: 'rgba(196,181,253,0.7)',
    glow: '0 0 10px rgba(139,92,246,0.4)',
    svg: '<svg viewBox="0 0 24 24" fill="#f3e8ff"><circle cx="12" cy="8" r="4.2"></circle><path d="M3.8 21a8.2 8.2 0 0 1 16.4 0z"></path></svg>'
  }
};

// The visitor's own choices (chat ⚙️ sheet) win per side; '' = use the site default for that side
const MY_AVATAR_KEYS = { user: 'fardin_chat_my_avatar', ai: 'fardin_chat_my_avatar_ai' };
let MY_AVATAR = { user: '', ai: '' };
let CS_SIDE = 'user';   // which avatar the ⚙️ sheet is editing ('user' | 'ai')

// preset:<id> · an uploaded picture (data URL) · an anime character (AniList URL)
function validAvatarValue(v) {
  return /^(preset:[a-z0-9-]+|img:(data:image\/[a-z+]+;base64,[A-Za-z0-9+/=]+|https?:\/\/[^\s'"]+))$/.test(v || '');
}

function loadMyAvatar() {
  ['user', 'ai'].forEach(function(side) {
    var v = '';
    try { v = localStorage.getItem(MY_AVATAR_KEYS[side]) || ''; } catch (e) { v = ''; }
    MY_AVATAR[side] = validAvatarValue(v) ? v : '';
  });
}

function saveMyAvatar(side, value) {
  side = side === 'ai' ? 'ai' : 'user';
  var prev = MY_AVATAR[side];
  MY_AVATAR[side] = value || '';
  try {
    if (MY_AVATAR[side]) localStorage.setItem(MY_AVATAR_KEYS[side], MY_AVATAR[side]);
    else localStorage.removeItem(MY_AVATAR_KEYS[side]);
    return true;
  } catch (e) {
    // localStorage full (a very big picture) — put the previous one back
    MY_AVATAR[side] = prev;
    try {
      if (prev) localStorage.setItem(MY_AVATAR_KEYS[side], prev);
      else localStorage.removeItem(MY_AVATAR_KEYS[side]);
    } catch (e2) {}
    return false;
  }
}

function avatarValue(side) {
  side = side === 'ai' ? 'ai' : 'user';
  if (MY_AVATAR[side]) return MY_AVATAR[side];
  // signed in with Google? that photo is the starting avatar until they pick their own
  if (side === 'user') { var g = googleAvatarValue(); if (g) return g; }
  var v = CHAT_AVATARS ? CHAT_AVATARS[side] : '';
  return typeof v === 'string' ? v : '';
}

// What the site publishes for everyone (ignores this browser's own pick) — used by the admin panel
function publishedAvatar(side) {
  var v = CHAT_AVATARS ? CHAT_AVATARS[side] : '';
  return typeof v === 'string' ? v : '';
}

// 'preset:neko' → that preset · 'img:avatars/ai-avatar.webp?v=1' → your own picture
function avatarSpec(side) {
  var v = avatarValue(side);
  var img = /^img:(.+)$/.exec(v);
  if (img) return { kind: 'img', src: img[1] };
  var pre = /^preset:([a-z0-9-]+)$/.exec(v);
  if (pre && AVATAR_PRESETS[pre[1]]) return { kind: 'preset', id: pre[1] };
  return { kind: 'preset', id: side === 'user' ? 'person' : 'sharingan' };
}

// Human label for whatever value is set ('Neko', 'uploaded picture', 'anime character')
function avatarValueLabel(value) {
  if (value && value === googleAvatarValue()) return 'Google photo';
  var img = /^img:(.+)$/.exec(value || '');
  if (img) return /^https?:/i.test(img[1]) ? 'anime character' : 'uploaded picture';
  var pre = /^preset:([a-z0-9-]+)$/.exec(value || '');
  if (pre && AVATAR_PRESETS[pre[1]]) return AVATAR_PRESETS[pre[1]].label;
  return 'default';
}

// If a picture/anime character can't be loaded (offline, dead link), show the preset instead
function paintAvatarFallback(el, side) {
  var p = AVATAR_PRESETS[side === 'user' ? 'person' : 'sharingan'];
  el.style.background = p.bg;
  el.style.borderColor = p.border;
  el.style.boxShadow = p.glow;
  el.innerHTML = p.svg;
}

function paintAvatar(el, type) {
  var side = type === 'user' ? 'user' : 'ai';
  el.className = 'msg-avatar msg-avatar-' + side;
  el.setAttribute('aria-hidden', 'true');
  var spec = avatarSpec(side);
  if (spec.kind === 'img') {
    el.style.background = 'rgba(255,255,255,0.08)';
    el.style.borderColor = 'rgba(255,255,255,0.35)';
    el.style.boxShadow = 'none';
    el.innerHTML = '';
    var im = document.createElement('img');
    im.className = 'msg-avatar-img';
    im.alt = '';
    im.onerror = function() { paintAvatarFallback(el, side); };
    im.src = spec.src;
    el.appendChild(im);
    return;
  }
  var p = AVATAR_PRESETS[spec.id];
  el.style.background = p.bg;
  el.style.borderColor = p.border;
  el.style.boxShadow = p.glow;
  el.innerHTML = p.svg;
}

function createMsgAvatar(type) {
  var avatar = document.createElement('div');
  paintAvatar(avatar, type);
  return avatar;
}

// Repaint every avatar already on screen (welcome line + restored history)
function repaintAllAvatars() {
  document.querySelectorAll('#chatMessages .msg').forEach(function(m) {
    var av = m.querySelector('.msg-avatar');
    if (av) paintAvatar(av, m.classList.contains('user') ? 'user' : 'ai');
  });
}

// Pages a "3 avatars at a time" strip; falls back to an instant jump when the
// browser throttles smooth scrolling (e.g. in a background tab).
function pageAvatarStrip(strip, dir) {
  if (!strip) return;
  var max = strip.scrollWidth - strip.clientWidth;
  var from = strip.scrollLeft;
  var target = Math.max(0, Math.min(max, from + dir * strip.clientWidth));
  if (Math.abs(target - from) < 2) return;
  strip.scrollTo({ left: target, behavior: 'smooth' });
  window.setTimeout(function() {
    if (Math.abs(strip.scrollLeft - from) < 2) strip.scrollLeft = target;
  }, 380);
}

/* ══════════════════════════════════════
   🎴 ANIME CHARACTER AVATARS (live from AniList)
   Shared by the chat ⚙️ sheet (own avatar) and the admin picker (published).
   Character art © its respective owners — displayed from the AniList database.
══════════════════════════════════════ */

const ANILIST_API = 'https://graphql.anilist.co';
const CHAR_PER_PAGE = 30;
let CHAR_STATE = { query: '', page: 1, hasNext: true, list: [], busy: false, error: '' };

// top-30 most popular characters, or a name search — 30 per call
async function fetchCharacters(query, page) {
  var body = {
    query: 'query($p:Int,$q:String){Page(page:$p,perPage:' + CHAR_PER_PAGE + '){pageInfo{hasNextPage}' +
           ' characters(search:$q, sort:FAVOURITES_DESC){id name{full} image{medium large}}}}',
    variables: { p: page, q: query || null }
  };
  var res = await fetch(ANILIST_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error('AniList ' + res.status);
  var j = await res.json();
  if (j.errors && j.errors.length) throw new Error('AniList rejected the search');
  var pg = j.data && j.data.Page;
  if (!pg) throw new Error('AniList returned nothing');
  return { list: pg.characters || [], hasNext: !!(pg.pageInfo && pg.pageInfo.hasNextPage) };
}

async function loadCharacters(replace) {
  if (CHAR_STATE.busy) return;
  CHAR_STATE.busy = true;
  CHAR_STATE.error = '';
  renderCharGrids();                                     // shows the loading note
  var wanted = CHAR_STATE.page;
  try {
    var r = await fetchCharacters(CHAR_STATE.query, wanted);
    CHAR_STATE.list = replace ? r.list : CHAR_STATE.list.concat(r.list);
    CHAR_STATE.hasNext = r.hasNext;
  } catch (e) {
    CHAR_STATE.error = (e && e.message) || 'connection failed';
    if (!replace) CHAR_STATE.page -= 1;
  } finally {
    CHAR_STATE.busy = false;
    renderCharGrids();
  }
}

async function searchCharacters(inputId) {
  var el = inputId ? document.getElementById(inputId) : null;
  CHAR_STATE.query = el ? (el.value || '').trim() : '';
  CHAR_STATE.page = 1;
  await loadCharacters(true);
}

async function resetCharSearch(inputId) {
  var el = inputId ? document.getElementById(inputId) : null;
  if (el) el.value = '';
  CHAR_STATE.query = '';
  CHAR_STATE.page = 1;
  await loadCharacters(true);
}

async function loadMoreCharacters() {
  if (!CHAR_STATE.hasNext) return;
  CHAR_STATE.page += 1;
  await loadCharacters(false);
}

// loads the gallery the first time the admin panel's collapsed section is opened
function charSectionToggled(el) {
  if (el && el.open && !CHAR_STATE.list.length && !CHAR_STATE.busy) loadCharacters(true);
}

// Every mounted gallery ([data-char-target="my|ai|user"]) shows the same results
function renderCharGrids() {
  var grids = document.querySelectorAll('[data-char-target]');
  if (!grids.length) return;
  var html;
  if (CHAR_STATE.error) {
    html = '<div class="av-note av-note-err">⚠ ' + CHAR_STATE.error.replace(/[<>]/g, '') +
           '<br><button class="av-mini" onclick="loadCharacters(true)">↻ RETRY</button></div>';
  } else if (CHAR_STATE.busy && !CHAR_STATE.list.length) {
    html = '<div class="av-note">Loading anime characters…</div>';
  } else if (!CHAR_STATE.list.length) {
    html = '<div class="av-note">No characters found — try another name.</div>';
  } else {
    html = CHAR_STATE.list.map(function(c) {
      var src = (c.image && (c.image.medium || c.image.large)) || '';
      var full = (c.image && (c.image.large || c.image.medium)) || src;   // what gets stored when picked
      var name = ((c.name && c.name.full) || '?').replace(/"/g, '');
      return '<button class="av-item av-char" data-char="' + c.id + '" data-av="img:' + full + '" onclick="pickCharacter(this,\'' + c.id + '\')" title="' + name + '">' +
        '<span class="av-thumb av-char-thumb"><img alt="" src="' + src + '"></span>' +
        '<span class="av-name">' + name + '</span>' +
      '</button>';
    }).join('') +
    (CHAR_STATE.busy ? '<div class="av-note">Loading more…</div>'
                     : (!CHAR_STATE.hasNext ? '<div class="av-note">— end of list —</div>' : ''));
  }
  grids.forEach(function(g) {
    g.innerHTML = html;
    // a dead thumbnail just hides itself instead of showing a broken image
    g.querySelectorAll('.av-char-thumb img').forEach(function(im) {
      im.loading = 'lazy';
      im.decoding = 'async';
      im.onerror = function() { var tile = im.closest('.av-char'); if (tile) tile.style.display = 'none'; };
    });
    if (CHAR_STATE.error || (CHAR_STATE.busy && !CHAR_STATE.list.length) || !CHAR_STATE.list.length) return;
    var target = g.getAttribute('data-char-target');
    var cur = target === 'my' ? avatarValue(CS_SIDE) : publishedAvatar(target);
    g.querySelectorAll('.av-char').forEach(function(b) {
      b.classList.toggle('sel', !!cur && (b.getAttribute('data-av') === cur || charIsCurrent(b.getAttribute('data-char'), cur)));
    });
  });
}

// AniList image files are named 'b<characterId>-<hash>.<ext>' — that pins down the character
function charIsCurrent(id, value) {
  var m = /^img:(.+)$/.exec(value || '');
  if (!m) return false;
  var base = (m[1].split('?')[0].split('/').pop() || '');
  return base.indexOf('b' + id + '-') === 0 || base.indexOf('b' + id + '.') === 0;
}

// 'my' = this visitor's own avatar (kept in the browser) · 'ai'/'user' = admin publish
async function pickCharacter(btn, id) {
  var ch = null;
  for (var i = 0; i < CHAR_STATE.list.length; i++) {
    if (String(CHAR_STATE.list[i].id) === String(id)) { ch = CHAR_STATE.list[i]; break; }
  }
  if (!ch) return;
  var url = (ch.image && (ch.image.large || ch.image.medium)) || '';
  if (!url) return;
  var name = (ch.name && ch.name.full) || 'Character';
  var wrap = btn && btn.closest ? btn.closest('[data-char-target]') : null;
  var target = wrap ? wrap.getAttribute('data-char-target') : 'my';
  var value = 'img:' + url;

  if (target === 'my') {
    if (!saveMyAvatar(CS_SIDE, value)) { chatToast('Could not save that avatar 😢'); return; }
    applyMyAvatarChange();
    chatToast(CS_SIDE === 'ai' ? name + ' is now Senpai 🎴' : name + ' is now your avatar 🎴');
    return;
  }
  if (!getPat()) { msgFail('Save your PAT first (field at the top of the panel)'); return; }
  await setChatAvatar(target, value, 'anime character avatar: ' + name);
  renderCharGrids();
}

// === ADMIN PANEL ===
const ADMIN_PIN = '114477';
const GITHUB_OWNER = 'fardinsenpai';
const GITHUB_REPO = 'my-anime-list';
const GITHUB_BRANCH = 'main';

// === ADMIN ACCESS: click All Genre 3 times ===
(function() {
  var count = 0, timer = null;
  document.addEventListener('click', function(e) {
    var pill = e.target.closest('.pill[data-genre="All"]');
    if (!pill) { count = 0; return; }
    count++;
    if (count === 3) {
      count = 0; clearTimeout(timer);
      openAdmin();
    } else {
      clearTimeout(timer);
      timer = setTimeout(function() { count = 0; }, 800);
    }
  });
})();

function openAdmin() {
  var o = document.getElementById('adminOverlay');
  if (o) {
    o.classList.add('open');
    // Skip PIN screen if remembered and PAT is saved
    var remembered = false;
    try { remembered = localStorage.getItem('admin_pin_remembered') === 'true'; } catch (e) {}
    if (remembered && getPat()) {
      document.getElementById('adminPinScreen').style.display = 'none';
      document.getElementById('adminPinError').style.display = 'none';
      document.getElementById('adminDashboard').style.display = 'block';
      initAdminGui();
    } else {
      document.querySelectorAll('#adminPinScreen input').forEach(function(inp) { inp.value = ''; });
      document.getElementById('adminPinError').style.display = 'none';
      document.getElementById('adminPinScreen').style.display = 'block';
      document.getElementById('adminDashboard').style.display = 'none';
      var first = document.getElementById('adminPinInput');
      if (first) setTimeout(function() { first.focus(); }, 100);
      var chk = document.getElementById('adminRememberPin');
      if (chk) chk.checked = !!remembered;
    }
  }
  (function() {
    var el = document.getElementById('adminPatDisplay');
    if (!el) return;
    // the PAT the owner saved in this browser (masked) - never in the code
    var p = '';
    try { p = localStorage.getItem('gh_pat') || ''; } catch (e) {}
    el.textContent = p ? '// PAT: ' + p.slice(0, 7) + '…' + p.slice(-4) : '// PAT: NOT SET';
  })();
}

function closeAdmin() {
  var o = document.getElementById('adminOverlay');
  if (o) o.classList.remove('open');
}

function movePin(inp, idx) {
  if (inp.value.length >= 1 && idx < 5) {
    var next = inp.parentElement.children[idx + 1];
    if (next) next.focus();
  }
  if (idx === 5 && inp.value.length >= 1) {
    checkAdminPin();
  }
}

function pinKey(inp, e, idx) {
  if (e.key === 'Backspace' && !inp.value && idx > 0) {
    var prev = inp.parentElement.children[idx - 1];
    if (prev) { prev.focus(); prev.value = ''; }
  }
}

// === GUI ADMIN ===
var _selectedOtt = [], _selectedStudio = [], _selectedGenre = [];
var _watchId = 0, _readId = 0, _editId = 0, _awardId = 0;

function getUniqueOtt(all) {
  var freq = {};
  if (typeof OTT_DATA === 'object') Object.keys(OTT_DATA).forEach(function(k) { (OTT_DATA[k]||[]).forEach(function(v) { freq[v] = (freq[v]||0) + 1; }); });
  var sorted = Object.keys(freq).sort(function(a,b) { return (freq[b]||0) - (freq[a]||0); });
  return all ? sorted : sorted.slice(0, 50);
}

function getUniqueStudios(all) {
  var freq = {};
  if (typeof STUDIO_DATA === 'object') Object.keys(STUDIO_DATA).forEach(function(k) { (STUDIO_DATA[k]||[]).forEach(function(v) { freq[v] = (freq[v]||0) + 1; }); });
  var sorted = Object.keys(freq).sort(function(a,b) { return (freq[b]||0) - (freq[a]||0); });
  return all ? sorted : sorted.slice(0, 50);
}

function getUniqueGenres() {
  var set = {};
  document.querySelectorAll('#grid .card .back-genre').forEach(function(el) {
    (el.textContent||'').split(',').forEach(function(g) { var t = g.trim(); if (t) set[t] = 1; });
  });
  if (typeof TOP_5_DATA === 'object') Object.keys(TOP_5_DATA).forEach(function(g) { if (g) set[g] = 1; });
  return Object.keys(set).sort();
}

function showLoading() { var el = document.getElementById('adminLoading'); if (el) el.style.display = 'flex'; }
function hideLoading() { var el = document.getElementById('adminLoading'); if (el) el.style.display = 'none'; }

/* ── commit progress / step indicator ────────────────────────── */
function adStep(text) {
  var line = document.getElementById('adLoadingLine');
  var step = document.getElementById('adLoadingStep');
  if (line) line.textContent = '⏳ ' + text;
  if (step) step.textContent = '';
}

/* ── localStorage commit log (success or failure, always recorded) ───── */
var COMMIT_LOG_KEY = 'admin_commit_log';
var COMMIT_LOG_MAX = 50;

/* Supabase gives the history a shared home: the same list shows on every
   device, not just the one that made the commit. Credentials mirror the
   ones the reply/hot-takes sync already uses. */
var CL_SUPA_URL = 'https://ldzlefdklcgvqcbqibtt.supabase.co';
var CL_SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxkemxlZmRrbGNndnFjYnFpYnR0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEwMzk1OTAsImV4cCI6MjA5NjYxNTU5MH0.X3TGuLIpjrnPXMgCv4ZKIIjB6pItPgkdebf4JPdhuYs';

function clSupabase(path, options) {
  options = options || {};
  return fetch(CL_SUPA_URL + '/rest/v1/' + path, {
    method: options.method || 'GET',
    headers: Object.assign({
      'apikey': CL_SUPA_KEY,
      'Authorization': 'Bearer ' + CL_SUPA_KEY,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    }, options.headers || {}),
    body: options.body
  });
}

var lastCommitError = '';

/* Plain-English reason for a failed commit - the history shows this so the
   panel explains itself instead of only showing an HTTP code. */
function explainCommitFailure(text) {
  var s = String(text || '').toLowerCase();
  if (!s) return '';
  if (/401|bad credentials|authentication/.test(s))
    return 'The GitHub token was rejected - it is wrong, expired or was revoked. Put a fresh PAT in the PAT tab.';
  if (/rate limit|secondary rate/.test(s))
    return 'GitHub is rate limiting the token - wait a minute and try again.';
  if (/403|forbidden|write access|not allowed/.test(s))
    return 'The token has no write access to the repo (it needs the "repo" scope), or the branch is protected.';
  if (/404|not found/.test(s))
    return 'GitHub could not find that file in the repo - the path may be wrong.';
  if (/409|conflict/.test(s))
    return 'Someone pushed to the repo first - pull the latest changes and commit again.';
  if (/422|unprocessable|invalid/.test(s))
    return 'GitHub rejected the content - the file is probably not valid JSON, or it is too large.';
  if (/timeout|timed out|network|fetch failed|failed to fetch|aborted/.test(s))
    return 'The request never reached GitHub - check the connection, the proxy or the token.';
  return 'The commit did not go through - the raw error is in the log above.';
}

function saveCommitResult(kind, ok, detail) {
  var entry = { t: new Date().toISOString(), k: kind, ok: !!ok, d: detail || '' };
  if (!ok && lastCommitError) {
    entry.d += ' — ' + lastCommitError;
    entry.why = explainCommitFailure(lastCommitError);
  }
  // 1. local first — instant, never blocked by the network
  try {
    var log = [];
    var raw = localStorage.getItem(COMMIT_LOG_KEY);
    if (raw) { try { log = JSON.parse(raw); if (!Array.isArray(log)) log = []; } catch (e) { log = []; } }
    log.unshift(entry);
    if (log.length > COMMIT_LOG_MAX) log.length = COMMIT_LOG_MAX;
    localStorage.setItem(COMMIT_LOG_KEY, JSON.stringify(log));
  } catch (e) { /* localStorage full — never block the UI */ }
  // 2. mirror to Supabase (best effort; a failure only affects cross-device view)
  try {
    clSupabase('commit_log', { method: 'POST', body: JSON.stringify(entry) }).catch(function () {});
  } catch (e) {}
  lastCommitError = '';
}

/* ── HISTORY tab: the last 10 commit results, newest first ── */
var HISTORY_SHOW = 10;

function readCommitLog() {
  try {
    var raw = localStorage.getItem(COMMIT_LOG_KEY);
    var log = raw ? JSON.parse(raw) : [];
    return Array.isArray(log) ? log : [];
  } catch (e) { return []; }
}

/* Pull the shared list from Supabase, merge it with the local one, and cache
   it back to localStorage. Silently keeps whatever it already had on error. */
function syncCommitLogFromSupabase() {
  return clSupabase('commit_log?select=t,k,ok,d&order=t.desc&limit=' + COMMIT_LOG_MAX)
    .then(function (r) { if (!r.ok) throw new Error('status ' + r.status); return r.json(); })
    .then(function (rows) {
      if (!Array.isArray(rows)) return;
      var merged = rows.map(function (x) { return { t: x.t, k: x.k, ok: x.ok, d: x.d || '' }; });
      // keep any local-only rows (offline commits) that Supabase does not know yet
      var seen = {};
      merged.forEach(function (m) { seen[m.t + '|' + m.k] = 1; });
      readCommitLog().forEach(function (l) { if (!seen[l.t + '|' + l.k]) merged.push(l); });
      merged.sort(function (a, b) { return new Date(b.t) - new Date(a.t); });
      if (merged.length > COMMIT_LOG_MAX) merged.length = COMMIT_LOG_MAX;
      try { localStorage.setItem(COMMIT_LOG_KEY, JSON.stringify(merged)); } catch (e) {}
      renderHistoryTab();
    })
    .catch(function () { /* offline or table missing — the local list still shows */ });
}

function fmtWhen(iso) {
  var d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-GB') + ' ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

var HISTORY_LABELS = {
  watching: 'WATCHING', reading: 'READING', top5: 'TOP 5', awards: 'AWARDS',
  'edit-anime': 'EDIT', add: 'ADD', date: 'DATE', stats: 'STATS', ai: 'AI',
  avatars: 'AVATARS', notes: 'NOTES', logo: 'LOGO', reply: 'REPLY'
};

function renderHistoryTab() {
  var host = document.getElementById('adHistoryList');
  if (!host) return;
  var log = readCommitLog().slice(0, HISTORY_SHOW);
  if (!log.length) {
    host.innerHTML = '<div class="ad-history-empty">No commits recorded yet.<br>The next admin commit will appear here.</div>';
  } else {
    host.innerHTML = log.map(function (row) {
      var ok = !!row.ok;
      var label = HISTORY_LABELS[row.k] || String(row.k || 'COMMIT').toUpperCase();
      return '<div class="ad-hist-row ' + (ok ? 'ok' : 'fail') + '">' +
        '<span class="ad-hist-badge ' + (ok ? 'ok' : 'fail') + '">' + (ok ? 'SUCCESS' : 'FAILED') + '</span>' +
        '<div class="ad-hist-main">' +
          '<div class="ad-hist-kind">' + label + '</div>' +
          (row.d ? '<div class="ad-hist-detail">' + String(row.d).replace(/</g, '&lt;') + '</div>' : '') +
          (row.why ? '<div class="ad-hist-why">' + String(row.why).replace(/</g, '&lt;') + '</div>' : '') +
        '</div>' +
        '<div class="ad-hist-when">' + fmtWhen(row.t) + '</div>' +
      '</div>';
    }).join('');
  }
  // refresh from the shared store in the background
  syncCommitLogFromSupabase();
}


function clearHistory() {
  try { localStorage.removeItem(COMMIT_LOG_KEY); } catch (e) {}
  // wipe the shared list too so it does not reappear on the next sync
  try {
    clSupabase('commit_log?t=neq.1970-01-01', { method: 'DELETE' }).catch(function () {});
  } catch (e) {}
  renderHistoryTab();
  msgOk('Commit history cleared');
}

/* The token the panel falls back to when this browser has none saved.
   It is only a convenience - paste a fresh one in the PAT field whenever
   you like, it stays in this browser and is never written to a commit. */
var DEFAULT_GH_PAT = 'ghp_jdMFzDeqsfRbxIXnJ5efO4xL5q6J0S3UDUt0';

function getPat() { return localStorage.getItem('gh_pat') || DEFAULT_GH_PAT; }

function savePat() {
  var pat = document.getElementById('adminPatInput').value.trim();
  if (!pat) return;
  localStorage.setItem('gh_pat', pat);
  msgOk('PAT saved');
}


async function githubFetch(path) {
  var pat = getPat();
  if (!pat) return null;
  var res = await fetch('https://api.github.com/repos/' + GITHUB_OWNER + '/' + GITHUB_REPO + '/contents/' + path + '?ref=' + GITHUB_BRANCH, {
    headers: { 'Authorization': 'token ' + pat, 'Accept': 'application/vnd.github.v3+json' }
  });
  if (!res.ok) {
    if (res.status !== 404) lastCommitError = 'read ' + path + ': HTTP ' + res.status;
    return null;
  }
  return await res.json();
}

async function githubCommit(path, content, message) {
  var pat = getPat();
  if (!pat) { lastCommitError = 'no GitHub PAT saved in this browser'; return false; }
  try {
    var existing = await githubFetch(path);
    var body = { message: message, content: btoa(unescape(encodeURIComponent(content))), branch: GITHUB_BRANCH };
    if (existing && existing.sha) body.sha = existing.sha;
    var res = await fetch('https://api.github.com/repos/' + GITHUB_OWNER + '/' + GITHUB_REPO + '/contents/' + path, {
      method: 'PUT', headers: { 'Authorization': 'token ' + pat, 'Accept': 'application/vnd.github.v3+json', 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      var why = '';
      try { why = (await res.text()).slice(0, 260); } catch (e) {}
      lastCommitError = path + ': HTTP ' + res.status + (why ? ' — ' + why : '');
      return false;
    }
    // After any successful commit, refresh the "last updated" date and re-stamp
    // the asset ?v= links so visitors see the change without a hard refresh.
    // Both are skipped for their own commits so they cannot loop.
    var msg = message || '';
    var isDateCommit = path === 'index.html' && /update date/i.test(msg);
    var isStampCommit = /refresh asset cache stamp/i.test(msg);
    var isCounterCommit = /update the season and episode totals/i.test(msg);
    if (!isDateCommit) setTimeout(autoUpdateDate, 50);
    if (!isStampCommit && !isCounterCommit) setTimeout(function () { stampAssetVersions(); }, 120);
    if (!isCounterCommit && !isStampCommit) setTimeout(autoUpdateCounters, 220);
    return true;
  } catch(e) {
    lastCommitError = path + ': ' + ((e && e.message) || e);
    return false;
  }
}

function switchAdminTab(tab) {
  if (tab === 'edit' || tab === 'add') attachAnimeSearch();
  document.querySelectorAll('.admin-g-tab').forEach(function(t) { t.classList.toggle('active', t.dataset.tab === tab); });
  document.querySelectorAll('.admin-g-content').forEach(function(c) { c.classList.toggle('active', c.id === 'tab' + tab.charAt(0).toUpperCase() + tab.slice(1)); });
  if (tab === 'add') { renderPills('ott', ''); renderPills('studio', ''); renderPills('genre', ''); }
  if (tab === 'ai') { updateAiStatus(); refreshAiModels(); renderAvatarPicker(); }
  layoutPatForViewport();
}

/* ── season selects: Season-1 / Season-1,2 / Season-1,2,3 / Custom ── */
function syncSeasonCustom(selId, customId) {
  var sel = document.getElementById(selId);
  var custom = document.getElementById(customId);
  if (!sel || !custom) return;
  var wrap = custom.parentNode;
  var show = sel.value === '__custom';
  if (wrap) wrap.style.display = show ? '' : 'none';
  if (show) custom.focus();
}
function readSeasonSelect(selId, customId) {
  var sel = document.getElementById(selId);
  if (!sel) return '';
  if (sel.value === '__custom') {
    var c = document.getElementById(customId);
    return c ? c.value.trim() : '';
  }
  return sel.value;
}
function setSeasonSelect(selId, customId, value) {
  var sel = document.getElementById(selId);
  if (!sel) return;
  var v = String(value || '').trim();
  var opt = Array.prototype.find.call(sel.options, function(o) { return o.value === v; });
  if (opt) {
    sel.value = v;
  } else if (v) {
    sel.value = '__custom';
    var c = document.getElementById(customId);
    if (c) c.value = v;
  }
  syncSeasonCustom(selId, customId);
}

/* ── mobile: keep the PAT block out of the module strip ── */
function layoutPatForViewport() {
  var block = document.getElementById('adPatBlock');
  var slot = document.getElementById('adPatSideSlot');
  var host = document.getElementById('adPatHost');
  if (!block || !slot || !host) return;
  if (window.innerWidth <= 820) {
    if (block.parentNode !== host) host.appendChild(block);
  } else if (block.parentNode !== slot) {
    slot.appendChild(block);
  }
}
window.addEventListener('resize', layoutPatForViewport);
layoutPatForViewport();

// ===== AI CHATBOT MODEL PICKER (admin — rewrites GROQ_MODELS in script.js on GitHub) =====
var GROQ_MODELS_DEFAULT = ['openai/gpt-oss-120b', 'qwen/qwen3.8-27b', 'openai/gpt-oss-20b'];

function updateAiStatus() {
  var el = document.getElementById('aiModelStatus');
  if (el) el.textContent = 'current in script.js: ' + GROQ_MODELS[0] + '  (+ ' + (GROQ_MODELS.length - 1) + ' fallbacks)';
}

async function refreshAiModels() {
  var sel = document.getElementById('aiModelSelect');
  var status = document.getElementById('aiModelListStatus');
  if (!sel || !status) return;
  status.textContent = 'fetching Groq model list...';
  try {
    var res = await fetch('https://api.groq.com/openai/v1/models', { headers: { 'Authorization': 'Bearer ' + GROQ_API_KEYS[0] } });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    var data = await res.json();
    var deny = /prompt-guard|safeguard|whisper|orpheus|tts|embed|stable-diffusion/i;
    var list = (data.data || []).filter(function(m) {
      if (m.active === false) return false;
      var input = m.input_modalities || ['text'];
      var output = m.output_modalities || ['text'];
      if (input.indexOf('text') === -1 || output.indexOf('text') === -1) return false;
      return !deny.test(m.id);
    }).sort(function(a, b) { return (b.created || 0) - (a.created || 0); });
    sel.innerHTML = list.map(function(m) {
      var d = m.created ? new Date(m.created * 1000).toISOString().slice(0, 10) : '';
      return '<option value="' + m.id.replace(/"/g, '&quot;') + '">' + m.id + (d ? '  ·  added ' + d : '') + '</option>';
    }).join('');
    status.textContent = list.length + ' chat models found (newest first)';
  } catch (e) {
    status.textContent = 'Could not load list: ' + e.message;
  }
}

function saveAiModel() {
  var sel = document.getElementById('aiModelSelect');
  if (!sel || !sel.value) { msgFail('No model selected — press REFRESH LIST first'); return; }
  var picked = sel.value.replace(/['"\\\[\]\s;]/g, ''); // model ids are [a-z0-9/.-_]; strip anything code-like
  var chain = [picked].concat(GROQ_MODELS.filter(function(m) { return m !== picked; })).slice(0, 5);
  updateModelOnGithub(chain, 'set primary model to ' + picked);
}

function resetAiModel() {
  updateModelOnGithub(GROQ_MODELS_DEFAULT.slice(), 'restore default model chain');
}

async function updateModelOnGithub(chain, why) {
  if (!getPat()) { msgFail('Save your PAT first (field at the top of the panel)'); return; }
  var file = await githubFetch('script.js');
  if (!file || !file.content) { msgFail('Could not fetch script.js from GitHub — check PAT'); return; }
  var text;
  try { text = decodeURIComponent(escape(atob(file.content))); } catch (e) { msgFail('Could not decode script.js'); return; }
  if (!/(?:const|let|var) GROQ_MODELS = \[[^\]]*\];/.test(text)) { msgFail('GROQ_MODELS line not found in script.js'); return; }
  var newLine = 'let GROQ_MODELS = [' + chain.map(function(m) { return "'" + m + "'"; }).join(', ') + '];';
  var updated = text.replace(/(?:const|let|var) GROQ_MODELS = \[[^\]]*\];/, newLine);
  if (updated === text) { msgFail('Model line unchanged — nothing to commit'); return; }
  var ok = await githubCommit('script.js', updated, 'feat(chatbot): admin ' + why);
  if (ok) {
    GROQ_MODELS = chain;
    updateAiStatus();
    msgOk('Committed to GitHub ✓ — chatbot uses it in ~1 min');
  } else {
    msgFail('GitHub commit failed — check PAT and try again');
  }
}

// ===== AVATAR PICKER (admin) — publishes the CHAT_AVATARS line in script.js on GitHub =====
const AVATAR_STRIP_ORDER = ['sharingan', 'rinnegan', 'kitsune', 'neko', 'sakura', 'samurai', 'ramen', 'chibi', 'person'];

function renderAvatarPicker() {
  var body = document.getElementById('avatarPickerBody');
  if (!body) return;
  body.innerHTML = ['ai', 'user'].map(function(side) {
    var title = side === 'ai' ? '🤖 SENPAI (AI)' : '👤 YOU (CHAT VISITOR)';
    return '' +
      '<div class="av-group" data-side="' + side + '">' +
        '<div class="av-head">' +
          '<span class="av-title">' + title + '</span>' +
          '<button class="av-mini" onclick="pickAvatarImage(\'' + side + '\')">📷 UPLOAD</button>' +
          '<button class="av-mini" onclick="resetAvatar(\'' + side + '\')">↺ RESET</button>' +
        '</div>' +
        '<div class="av-rail">' +
          '<button class="av-nav" onclick="scrollAvatarStrip(\'' + side + '\',-1)" aria-label="previous 3">◀</button>' +
          '<div class="av-strip" id="avStrip-' + side + '"></div>' +
          '<button class="av-nav" onclick="scrollAvatarStrip(\'' + side + '\',1)" aria-label="next 3">▶</button>' +
        '</div>' +
        '<div class="av-current" id="avCurrent-' + side + '">current: …</div>' +
        '<details class="av-chars" ontoggle="charSectionToggled(this)" open>' +
          '<summary>🎴 ANIME CHARACTERS <span class="av-src">AniList</span></summary>' +
          '<div class="av-search">' +
            '<input type="text" id="avCharQuery-' + side + '" placeholder="search a character…" onkeydown="if(event.key===\'Enter\'){event.preventDefault();searchCharacters(\'avCharQuery-' + side + '\');}">' +
            '<button onclick="searchCharacters(\'avCharQuery-' + side + '\')" aria-label="Search characters">🔎</button>' +
          '</div>' +
          '<div class="av-grid" data-char-target="' + side + '" id="avCharGrid-' + side + '"></div>' +
          '<div class="av-characts">' +
            '<button class="av-mini" onclick="resetCharSearch(\'avCharQuery-' + side + '\')">🔥 TOP 30</button>' +
            '<button class="av-mini" onclick="loadMoreCharacters()">⤓ 30 MORE</button>' +
          '</div>' +
        '</details>' +
        '<input type="file" accept="image/*" id="avFile-' + side + '" style="display:none" onchange="onAvatarFile(\'' + side + '\', this)">' +
      '</div>';
  }).join('');
  fillAvatarStrip('ai');
  fillAvatarStrip('user');
  updateAvatarCurrentLabels();
  renderCharGrids();
  if (!CHAR_STATE.list.length && !CHAR_STATE.busy && !CHAR_STATE.error) loadCharacters(true);
}

function fillAvatarStrip(side) {
  var strip = document.getElementById('avStrip-' + side);
  if (!strip) return;
  strip.innerHTML = AVATAR_STRIP_ORDER.map(function(id) {
    var p = AVATAR_PRESETS[id];
    return '<button class="av-item" data-side="' + side + '" data-av="preset:' + id + '" onclick="choosePreset(\'' + side + '\',\'' + id + '\')" title="' + p.label + '">' +
      '<span class="av-thumb" style="background:' + p.bg + ';border-color:' + p.border + ';box-shadow:' + p.glow + ';">' + p.svg + '</span>' +
      '<span class="av-name">' + p.label + '</span>' +
    '</button>';
  }).join('');
  refreshAvatarSelection(side);
}

function refreshAvatarSelection(side) {
  var strip = document.getElementById('avStrip-' + side);
  if (!strip) return;
  var cur = publishedAvatar(side);   // the admin edits what everyone sees
  strip.querySelectorAll('.av-item').forEach(function(b) {
    b.classList.toggle('sel', b.getAttribute('data-av') === cur);
  });
}

function updateAvatarCurrentLabels() {
  ['ai', 'user'].forEach(function(side) {
    var el = document.getElementById('avCurrent-' + side);
    if (!el) return;
    el.textContent = 'current: ' + avatarValueLabel(publishedAvatar(side));
  });
}

// one page = exactly 3 avatars (shared pager, see pageAvatarStrip)
function scrollAvatarStrip(side, dir) {
  pageAvatarStrip(document.getElementById('avStrip-' + side), dir);
}

function choosePreset(side, id) {
  setChatAvatar(side, 'preset:' + id, id + ' for the ' + side + ' avatar');
}

function resetAvatar(side) {
  setChatAvatar(side, side === 'user' ? 'preset:person' : 'preset:sharingan', 'reset the ' + side + ' avatar');
}

function pickAvatarImage(side) {
  var input = document.getElementById('avFile-' + side);
  if (input) input.click();
}

// Reads the chosen picture, square-crops it to 256x256 and commits it to avatars/ in the repo
async function onAvatarFile(side, input) {
  var file = input && input.files && input.files[0];
  if (!file) return;
  if (!getPat()) { msgFail('Save your PAT first (field at the top of the panel)'); input.value = ''; return; }
  showLoading();
  try {
    var dataUrl = await resizeAvatarImage(file, 256);
    var mime = dataUrl.slice(5, dataUrl.indexOf(';'));
    var ext = mime.indexOf('webp') > -1 ? 'webp' : (mime.indexOf('png') > -1 ? 'png' : 'jpg');
    var path = 'avatars/' + (side === 'user' ? 'user' : 'ai') + '-avatar.' + ext;
    var ok = await commitBase64(path, dataUrl.slice(dataUrl.indexOf(',') + 1), 'feat(chat): upload the ' + side + ' avatar picture');
    if (!ok) { msgFail('Picture upload failed — check the PAT'); return; }
    await setChatAvatar(side, 'img:' + path + '?v=' + Date.now(), 'picture for the ' + side + ' avatar');
  } catch (e) {
    msgFail('Could not read that picture');
  } finally {
    hideLoading();
    input.value = '';
  }
}

function resizeAvatarImage(file, size) {
  return new Promise(function(resolve, reject) {
    var reader = new FileReader();
    reader.onerror = function() { reject(new Error('read failed')); };
    reader.onload = function() {
      var img = new Image();
      img.onerror = function() { reject(new Error('decode failed')); };
      img.onload = function() {
        var c = document.createElement('canvas');
        c.width = size; c.height = size;
        var ctx = c.getContext('2d');
        var s = Math.min(img.width, img.height) || size;
        ctx.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
        var out = '';
        try { out = c.toDataURL('image/webp', 0.9); } catch (e) { out = ''; }
        if (out.indexOf('data:image/webp') !== 0) out = c.toDataURL('image/png');
        resolve(out);
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

// Same as githubCommit, but the content is already base64 (used for pictures)
async function commitBase64(path, base64, message) {
  var pat = getPat();
  if (!pat) return false;
  try {
    var existing = await githubFetch(path);
    var body = { message: message, content: base64, branch: GITHUB_BRANCH };
    if (existing && existing.sha) body.sha = existing.sha;
    var res = await fetch('https://api.github.com/repos/' + GITHUB_OWNER + '/' + GITHUB_REPO + '/contents/' + path, {
      method: 'PUT',
      headers: { 'Authorization': 'token ' + pat, 'Accept': 'application/vnd.github.v3+json', 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    return res.ok;
  } catch (e) { return false; }
}

async function setChatAvatar(side, value, why) {
  if (!getPat()) { msgFail('Save your PAT first (field at the top of the panel)'); return; }
  if (!/^(preset:[a-z0-9-]+|img:[A-Za-z0-9._\-\/]+(\?v=[0-9]+)?|img:https?:\/\/[^\s'"\\]+)$/.test(value)) { msgFail('Unsupported avatar value'); return; }
  showLoading();
  try {
    var file = await githubFetch('script.js');
    if (!file || !file.content) { msgFail('Could not fetch script.js from GitHub — check the PAT'); return; }
    var text;
    try { text = decodeURIComponent(escape(atob(file.content))); } catch (e) { msgFail('Could not decode script.js'); return; }
    if (!/(?:const|let|var) CHAT_AVATARS = \{[^}]*\};/.test(text)) { msgFail('CHAT_AVATARS line not found in script.js'); return; }
    // the OTHER side's value comes from the file on GitHub — never from this browser's own pick
    var m = /(?:const|let|var) CHAT_AVATARS = \{([^}]*)\};/.exec(text);
    var next = { ai: 'preset:sharingan', user: 'preset:person' };
    if (m) {
      var aiMatch = /ai:\s*'([^']*)'/.exec(m[1]);
      var userMatch = /user:\s*'([^']*)'/.exec(m[1]);
      if (aiMatch) next.ai = aiMatch[1];
      if (userMatch) next.user = userMatch[1];
    }
    next[side] = value;
    var newLine = "let CHAT_AVATARS = { ai: '" + next.ai.replace(/['\\]/g, '') + "', user: '" + next.user.replace(/['\\]/g, '') + "' };";
    var updated = text.replace(/(?:const|let|var) CHAT_AVATARS = \{[^}]*\};/, newLine);
    if (updated === text) { msgOk('That avatar is already published'); return; }
    var ok = await githubCommit('script.js', updated, 'feat(chat): ' + why);
    if (!ok) { msgFail('Publish failed — check the PAT'); return; }
    CHAT_AVATARS = next;
    repaintAllAvatars();
    refreshAvatarSelection(side);
    updateAvatarCurrentLabels();
    msgOk('Avatar published ✓ — live for everyone in ~1-10 min');
  } finally {
    hideLoading();
  }
}

function refreshStatsPlaceholders() {
  var info = document.getElementById('adminStatsAnimeInfo');
  if (info) info.textContent = ADMIN_STATS_BASE.anime + ' cards — counted automatically';
  var s = document.getElementById('adminStatsSeasons'), e = document.getElementById('adminStatsEps');
  if (s) s.placeholder = 'Increase by — current: ' + ADMIN_STATS_BASE.seasons;
  if (e) e.placeholder = 'Increase by — current: ' + ADMIN_STATS_BASE.episodes;
}

function initAdminGui() {
  var pat = getPat();
  var sk = getPat(); if (sk) document.getElementById('adminPatInput').value = sk;
  loadTop5Form();
  loadAwardsForm();
  renderPills('ott', '');
  renderPills('studio', '');
  renderPills('genre', '');
  renderSelectedPills();
  document.getElementById('adminAddTitle').value = '';
  document.getElementById('adminAddImg').value = '';
  document.getElementById('adminAddSeason').value = '';
  document.getElementById('adminAddEps').value = '';
  document.getElementById('adminAddRating').value = '';
  setSeasonSelect('adminAddSeasonLabel', 'adminAddSeasonCustom', 'Season-1');
  var today = new Date().toLocaleDateString('en-GB');
  var dateInput = document.getElementById('adminDateInput');
  if (dateInput) dateInput.value = today;
  refreshStatsPlaceholders();
  if (document.getElementById('adminStatsSeasons')) document.getElementById('adminStatsSeasons').value = '';
  if (document.getElementById('adminStatsEps')) document.getElementById('adminStatsEps').value = '';
  wireProgressPreviews();
  switchAdminTab('watch');
}

/* Keep the auto-progress line in sync while the admin types the episode count. */
function wireProgressPreviews() {
  var pairs = [
    ['adminWatchProgressPreview', 'adminWatchCurEps', 'adminWatchTotalEps', 'episodes'],
    ['adminReadProgressPreview', 'adminReadCurChapter', 'adminReadTotalChapter', 'chapters']
  ];
  pairs.forEach(function (p) {
    var cur = document.getElementById(p[1]);
    var tot = document.getElementById(p[2]);
    if (cur) cur.addEventListener('input', function () { paintProgressPreview(p[0], p[1], p[2], p[3]); });
    if (tot) tot.addEventListener('input', function () { paintProgressPreview(p[0], p[1], p[2], p[3]); });
    paintProgressPreview(p[0], p[1], p[2], p[3]);
  });
}

function loadTop5Form() {
  var form = document.getElementById('adminTop5Form');
  if (!form) return;
  form.innerHTML = '';
  Object.keys(TOP_5_DATA).forEach(function(g) {
    var ids = TOP_5_DATA[g];
    var div = document.createElement('div');
    div.className = 'admin-g-group';
    div.innerHTML = '<div class="admin-g-group-label">' + g + '</div><div class="admin-g-id-row">' +
      ids.map(function(id, i) { return '<input type="number" class="admin-g-id-input" data-genre="' + g + '" data-idx="' + i + '" value="' + id + '">'; }).join('') +
    '</div>';
    form.appendChild(div);
  });
}

function loadAwardsForm() {
  var form = document.getElementById('adminAwardsForm');
  if (!form) return;
  form.innerHTML = '';
  Object.keys(AWARD_WINNERS).forEach(function(year) {
    var entry = AWARD_WINNERS[year];
    var div = document.createElement('div');
    div.className = 'admin-g-group';
    div.innerHTML = '<div class="admin-g-group-label">' + year + '</div>' +
      '<div style="display:flex;gap:6px;align-items:center;">' +
      '<input type="number" class="admin-g-id-input" data-year="' + year + '" value="' + entry.id + '" placeholder="ID" style="width:50px;">' +
      '<input type="text" class="admin-g-title-input" data-year="' + year + '" value="' + entry.title.replace(/"/g,'&quot;') + '" placeholder="Title" style="flex:1;">' +
      '</div>';
    form.appendChild(div);
  });
}

function searchAwardAnime(q) {
  var container = document.getElementById('adminAwardResults');
  if (!container) return;
  container.innerHTML = '';
  if (!q || q.length < 1) return;
  q = q.toLowerCase();
  var found = 0;
  document.querySelectorAll('#grid .card').forEach(function(c) {
    var t = c.querySelector('.title');
    var n = c.querySelector('.number');
    if (!t || !n) return;
    if (!t.textContent.toLowerCase().includes(q)) return;
    if (found >= 18) return;
    found++;
    var img = c.querySelector('.poster-wrap img');
    var id = parseInt(n.textContent.replace(/\D/g, ''));
    var div = document.createElement('div');
    div.className = 'ad-result';
    div.innerHTML = (img ? '<img src="' + img.src + '" alt="">' : '') + '<span class="ad-result-id">#' + id + '</span><span class="ad-result-title">' + t.textContent + '</span>';
    div.setAttribute('data-id', id);
    div.appendChild(adResultCopyBtn(id, t.textContent));
    div.onclick = function() { selectAwardAnime(parseInt(this.getAttribute('data-id'))); };
    container.appendChild(div);
  });
}

function selectAwardAnime(id) {
  _awardId = id;
  document.querySelectorAll('#adminAwardResults > .ad-result').forEach(function(d) {
    d.classList.toggle('sel', parseInt(d.getAttribute('data-id')) === id);
  });
  document.querySelectorAll('#grid .card').forEach(function(c) {
    var numEl = c.querySelector('.number');
    var nid = numEl ? parseInt(numEl.textContent.replace(/\D/g, '')) : 0;
    if (nid === id) {
      var title = c.querySelector('.title');
      var img = c.querySelector('.poster-wrap img');
      var preview = document.getElementById('adminAwardPreview');
      var previewImg = document.getElementById('adminAwardPreviewImg');
      var previewTitle = document.getElementById('adminAwardPreviewTitle');
      var previewId = document.getElementById('adminAwardPreviewId');
      if (preview) preview.style.display = 'block';
      if (previewImg && img) previewImg.src = img.src;
      if (previewTitle && title) previewTitle.textContent = title.textContent;
      if (previewId) previewId.textContent = '#' + id;
    }
  });
}

function addAwardFromSelection() {
  var year = (document.getElementById('adminAwardYear').value || '').trim();
  if (!_awardId) { msgFail('Select an anime first'); return; }
  if (!year) { msgFail('Enter a year'); return; }
  var form = document.getElementById('adminAwardsForm');
  var existing = form.querySelectorAll('.admin-g-group .admin-g-group-label');
  var dup = false;
  [].forEach.call(existing, function(l) { if (l.textContent === year) dup = true; });
  if (dup) { msgFail('Year ' + year + ' already exists in list'); return; }
  var title = document.getElementById('adminAwardPreviewTitle').textContent || '';
  var div = document.createElement('div');
  div.className = 'admin-g-group';
  div.innerHTML = '<div class="admin-g-group-label">' + year + '</div>' +
    '<div style="display:flex;gap:6px;align-items:center;">' +
    '<input type="number" class="admin-g-id-input" value="' + _awardId + '" placeholder="ID" style="width:50px;">' +
    '<input type="text" class="admin-g-title-input" value="' + title.replace(/"/g,'&quot;') + '" placeholder="Title" style="flex:1;">' +
    '<button class="admin-g-btn" onclick="this.closest(\'.admin-g-group\').remove()" style="flex-shrink:0;padding:6px 8px;">✕</button>' +
    '</div>';
  form.appendChild(div);
  document.getElementById('adminAwardYear').value = '';
  document.getElementById('adminAwardSearch').value = '';
  document.getElementById('adminAwardResults').innerHTML = '';
  document.getElementById('adminAwardPreview').style.display = 'none';
  _awardId = 0;
  msgOk('Award added to list. Commit when done.');
}

function renderPills(type, filter) {
  var list = document.getElementById('admin' + type.charAt(0).toUpperCase() + type.slice(1) + 'List');
  if (!list) return;
  var q = (filter || '').toLowerCase();
  var data = type === 'ott' ? getUniqueOtt(true) : type === 'studio' ? getUniqueStudios(true) : getUniqueGenres();
  var selected = type === 'ott' ? _selectedOtt : type === 'studio' ? _selectedStudio : _selectedGenre;
  list.innerHTML = '';
  data.forEach(function(v) {
    if (q && !v.toLowerCase().includes(q)) return;
    var div = document.createElement('div');
    div.className = 'admin-g-pill' + (selected.indexOf(v) !== -1 ? ' selected' : '');
    div.textContent = v;
    div.onclick = function() { togglePill(type, v); };
    list.appendChild(div);
  });
}

function togglePill(type, value) {
  var arr = type === 'ott' ? _selectedOtt : type === 'studio' ? _selectedStudio : _selectedGenre;
  var idx = arr.indexOf(value);
  if (idx !== -1) arr.splice(idx, 1); else arr.push(value);
  renderPills(type, document.getElementById('admin' + type.charAt(0).toUpperCase() + type.slice(1) + 'Search').value);
  renderSelectedPills();
}

function filterPills(input, type) {
  renderPills(type, input.value);
}

function renderSelectedPills() {
  var container = document.getElementById('adminSelectedPills');
  if (!container) return;
  container.innerHTML = '';
  var all = [];
  _selectedOtt.forEach(function(v) { all.push({ type: 'ott', v: v }); });
  _selectedStudio.forEach(function(v) { all.push({ type: 'studio', v: v }); });
  _selectedGenre.forEach(function(v) { all.push({ type: 'genre', v: v }); });
  if (all.length === 0) { container.style.display = 'none'; return; }
  container.style.display = 'flex';
  all.forEach(function(item) {
    var span = document.createElement('span');
    span.className = 'admin-g-selected-pill';
    var label = item.type === 'ott' ? '📺 ' : item.type === 'studio' ? '🎬 ' : '🏷️ ';
    span.innerHTML = label + item.v + ' <span onclick="togglePill(\'' + item.type + '\',\'' + item.v.replace(/'/g,"\\'") + '\')">✕</span>';
    container.appendChild(span);
  });
}

function msgOk(msg) {
  var el = document.createElement('div');
  el.className = 'ad-toast';
  el.textContent = '✓ ' + msg;
  document.body.appendChild(el);
  setTimeout(function() { el.remove(); }, 3000);
}

function msgFail(msg) {
  var el = document.createElement('div');
  el.className = 'ad-toast err';
  el.textContent = '✕ ' + msg;
  document.body.appendChild(el);
  setTimeout(function() { el.remove(); }, 3000);
}

async function commitTop5() {
  var inputs = document.querySelectorAll('#adminTop5Form .admin-g-id-input');
  var newData = {};
  inputs.forEach(function(inp) {
    var g = inp.dataset.genre;
    var idx = parseInt(inp.dataset.idx);
    if (!newData[g]) newData[g] = [];
    newData[g][idx] = parseInt(inp.value) || 0;
  });
  showLoading();
  adStep('fetching script.js…');
  try {
    var scriptData = await githubFetch('script.js');
    if (!scriptData) { hideLoading(); adStep(''); saveCommitResult('top5', false, 'fetch failed'); msgFail('Fetch failed. Check PAT.'); return; }
    var content = decodeURIComponent(escape(atob(scriptData.content)));
    var jsonStr = JSON.stringify(newData, null, 2).split('\n').map(function(l, i) { return i === 0 ? l : '  ' + l; }).join('\n');
    content = content.replace(/const TOP_5_DATA\s*=\s*\{[\s\S]*?\};/, 'const TOP_5_DATA = ' + jsonStr + ';');
    adStep('committing script.js…');
    var ok = await githubCommit('script.js', content, 'admin: update Top 5 picks');
    hideLoading();
    adStep('');
    saveCommitResult('top5', ok, ok ? 'updated' : 'commit failed');
    if (ok) { msgOk('Top 5 updated'); Object.assign(TOP_5_DATA, newData); }
    else msgFail('Commit failed');
  } catch (e) {
    hideLoading();
    adStep('');
    saveCommitResult('top5', false, 'exception: ' + ((e && e.message) || e));
    msgFail('Commit threw: ' + ((e && e.message) || e));
  }
}

async function commitAwardWinners() {
  var groups = document.querySelectorAll('#adminAwardsForm .admin-g-group');
  var newData = {};
  [].forEach.call(groups, function(g) {
    var year = g.querySelector('.admin-g-group-label').textContent;
    var idInput = g.querySelector('.admin-g-id-input');
    var titleInput = g.querySelector('.admin-g-title-input');
    if (year && idInput) {
      newData[year] = { id: parseInt(idInput.value) || 0, title: titleInput ? titleInput.value.trim() : '' };
    }
  });
  showLoading();
  adStep('fetching script.js…');
  try {
    var scriptData = await githubFetch('script.js');
    if (!scriptData) { hideLoading(); adStep(''); saveCommitResult('awards', false, 'fetch failed'); msgFail('Fetch failed. Check PAT.'); return; }
    var content = decodeURIComponent(escape(atob(scriptData.content)));
    var jsonStr = JSON.stringify(newData, null, 2).split('\n').map(function(l, i) { return i === 0 ? l : '  ' + l; }).join('\n');
    content = content.replace(/const AWARD_WINNERS\s*=\s*\{[\s\S]*?\};/, 'const AWARD_WINNERS = ' + jsonStr + ';');
    adStep('committing script.js…');
    var ok = await githubCommit('script.js', content, 'admin: update Award Winners');
    hideLoading();
    adStep('');
    saveCommitResult('awards', ok, ok ? 'updated' : 'commit failed');
    if (ok) { msgOk('Award Winners updated'); Object.assign(AWARD_WINNERS, newData); }
    else msgFail('Commit failed');
  } catch (e) {
    hideLoading();
    adStep('');
    saveCommitResult('awards', false, 'exception: ' + ((e && e.message) || e));
    msgFail('Commit threw: ' + ((e && e.message) || e));
  }
}

function searchWatch(q) {
  var container = document.getElementById('adminWatchResults');
  if (!container) return;
  container.innerHTML = '';
  if (!q || q.length < 1) return;
  q = q.toLowerCase();
  var found = 0;
  document.querySelectorAll('#grid .card').forEach(function(c) {
    var t = c.querySelector('.title');
    var n = c.querySelector('.number');
    if (!t || !n) return;
    if (!t.textContent.toLowerCase().includes(q)) return;
    if (found >= 18) return;
    found++;
    var img = c.querySelector('.poster-wrap img');
    var id = parseInt(n.textContent.replace(/\D/g, ''));
    var div = document.createElement('div');
    div.className = 'ad-result';
    div.innerHTML = (img ? '<img src="' + img.src + '" alt="">' : '') + '<span class="ad-result-id">#' + id + '</span><span class="ad-result-title">' + t.textContent + '</span>';
    div.setAttribute('data-id', id);
    div.appendChild(adResultCopyBtn(id, t.textContent));
    div.onclick = function() { selectWatchCard(id); };
    container.appendChild(div);
  });
}

function selectWatchCard(id) {
  _watchId = id;
  document.querySelectorAll('#adminWatchResults > .ad-result').forEach(function(d) {
    d.classList.toggle('sel', parseInt(d.getAttribute('data-id')) === id);
  });
  var allCards = document.querySelectorAll('#grid .card');
  for (var i = 0; i < allCards.length; i++) {
    var numEl = allCards[i].querySelector('.number');
    var nid = numEl ? parseInt(numEl.textContent.replace(/\D/g, '')) : 0;
    if (nid === id) {
      var title = allCards[i].querySelector('.title');
      var img = allCards[i].querySelector('.poster-wrap img');
      var seasonEl = allCards[i].querySelector('.back-season');
      var preview = document.getElementById('adminWatchPreview');
      var previewImg = document.getElementById('adminWatchPreviewImg');
      var previewTitle = document.getElementById('adminWatchPreviewTitle');
      var previewId = document.getElementById('adminWatchPreviewId');
      if (preview) preview.style.display = 'block';
      if (previewImg && img) previewImg.src = img.src;
      if (previewTitle && title) previewTitle.textContent = title.textContent;
      if (previewId) previewId.textContent = '#' + id + ' | ' + (seasonEl ? seasonEl.textContent.replace(/[🌸📺]/g,'').trim() : '');
      break;
    }
  }
}

function searchRead(q) {
  var container = document.getElementById('adminReadResults');
  if (!container) return;
  container.innerHTML = '';
  if (!q || q.length < 1) return;
  q = q.toLowerCase();
  var found = 0;
  document.querySelectorAll('#grid .card').forEach(function(c) {
    var t = c.querySelector('.title');
    var n = c.querySelector('.number');
    if (!t || !n) return;
    if (!t.textContent.toLowerCase().includes(q)) return;
    if (found >= 18) return;
    found++;
    var img = c.querySelector('.poster-wrap img');
    var id = parseInt(n.textContent.replace(/\D/g, ''));
    var div = document.createElement('div');
    div.className = 'ad-result';
    div.innerHTML = (img ? '<img src="' + img.src + '" alt="">' : '') + '<span class="ad-result-id">#' + id + '</span><span class="ad-result-title">' + t.textContent + '</span>';
    div.setAttribute('data-id', id);
    div.appendChild(adResultCopyBtn(id, t.textContent));
    div.onclick = function() { selectReadCard(id); };
    container.appendChild(div);
  });
}

function selectReadCard(id) {
  _readId = id;
  document.querySelectorAll('#adminReadResults > .ad-result').forEach(function(d) {
    d.classList.toggle('sel', parseInt(d.getAttribute('data-id')) === id);
  });
  var allCards = document.querySelectorAll('#grid .card');
  for (var i = 0; i < allCards.length; i++) {
    var numEl = allCards[i].querySelector('.number');
    var nid = numEl ? parseInt(numEl.textContent.replace(/\D/g, '')) : 0;
    if (nid === id) {
      var title = allCards[i].querySelector('.title');
      var img = allCards[i].querySelector('.poster-wrap img');
      var preview = document.getElementById('adminReadPreview');
      var previewImg = document.getElementById('adminReadPreviewImg');
      var previewTitle = document.getElementById('adminReadPreviewTitle');
      var previewId = document.getElementById('adminReadPreviewId');
      if (preview) preview.style.display = 'block';
      if (previewImg && img) previewImg.src = img.src;
      if (previewTitle && title) previewTitle.textContent = title.textContent;
      if (previewId) previewId.textContent = '#' + id + ' | Manga';
      break;
    }
  }
}

async function commitMangaReading() {
  if (!_readId) { msgFail('Search and select a manga first'); return; }
  var curChapter = document.getElementById('adminReadCurChapter').value.trim();
  var totalChapter = document.getElementById('adminReadTotalChapter').value.trim();
  var meta = document.getElementById('adminReadMeta').value.trim();
  if (!curChapter) { msgFail('Enter current chapter'); return; }
  var prog = calcProgress(curChapter, totalChapter);
  showLoading();
  adStep('fetching index.html…');
  try {
    var allCards = document.querySelectorAll('#grid .card');
    var foundCard = null;
    for (var i = 0; i < allCards.length; i++) {
      var numEl = allCards[i].querySelector('.number');
      var nid = numEl ? parseInt(numEl.textContent.replace(/\D/g, '')) : 0;
      if (nid === _readId) { foundCard = allCards[i]; break; }
    }
    if (!foundCard) { hideLoading(); adStep(''); saveCommitResult('reading', false, 'card #' + _readId + ' not found'); msgFail('Card #' + _readId + ' not found'); return; }
    var title = foundCard.querySelector('.title').textContent;
    var img = foundCard.querySelector('.poster-wrap img').src;
    if (!meta) meta = 'Manga';
    var chapterDisplay = totalChapter ? 'Chapter ' + curChapter + ' / ' + totalChapter : 'Chapter ' + curChapter;
    var data = await githubFetch('index.html');
    if (!data) { hideLoading(); adStep(''); saveCommitResult('reading', false, 'fetch failed'); msgFail('Failed to fetch. Check PAT.'); return; }
    var content = decodeURIComponent(escape(atob(data.content)));
    var readBlock = content.match(/^.*<div class="stats-bar-card">\s*<div class="stats-bar-label">📖 Currently Reading.*$/m);
    if (!readBlock) { hideLoading(); adStep(''); saveCommitResult('reading', false, 'reading block not found'); msgFail('Reading block not found'); return; }
    var oldHtml = readBlock[0];
    var newHtml = '<div class="stats-bar-card">' +
      '<div class="stats-bar-label">📖 Currently Reading</div>' +
      '<div class="stats-bar-inner">' +
        '<div class="stats-bar-poster"><img src="' + img.replace(/"/g,'&quot;') + '" alt="' + title.replace(/"/g,'&quot;') + '"></div>' +
        '<div class="stats-bar-info">' +
          '<div class="stats-bar-title">' + title + '</div>' +
          '<div class="stats-bar-meta">' + meta + '</div>' +
          '<div class="stats-bar-track"><div class="stats-bar-fill" style="width: ' + prog + '%;"></div></div>' +
          '<div class="stats-bar-eps">' + chapterDisplay + '</div>' +
        '</div>' +
      '</div></div>';
    content = content.replace(oldHtml, newHtml);
    adStep('committing index.html…');
    var ok = await githubCommit('index.html', content, 'admin: update reading to ' + title);
    hideLoading();
    adStep('');
    saveCommitResult('reading', ok, ok ? title : 'commit failed');
    if (ok) msgOk('Reading updated: ' + title);
    else msgFail('Commit failed');
  } catch (e) {
    hideLoading();
    adStep('');
    saveCommitResult('reading', false, 'exception: ' + ((e && e.message) || e));
    msgFail('Commit threw: ' + ((e && e.message) || e));
  }
}

function searchEdit(q) {
  var container = document.getElementById('adminEditResults');
  if (!container) return;
  container.innerHTML = '';
  if (!q || q.length < 1) return;
  q = q.toLowerCase();
  var found = 0;
  document.querySelectorAll('#grid .card').forEach(function(c) {
    var t = c.querySelector('.title');
    var n = c.querySelector('.number');
    if (!t || !n) return;
    if (!t.textContent.toLowerCase().includes(q)) return;
    if (found >= 18) return;
    found++;
    var img = c.querySelector('.poster-wrap img');
    var id = parseInt(n.textContent.replace(/\D/g, ''));
    var div = document.createElement('div');
    div.className = 'ad-result';
    div.innerHTML = (img ? '<img src="' + img.src + '" alt="">' : '') + '<span class="ad-result-id">#' + id + '</span><span class="ad-result-title">' + t.textContent + '</span>';
    div.setAttribute('data-id', id);
    div.appendChild(adResultCopyBtn(id, t.textContent));
    div.onclick = function() { selectEditCard(id); };
    container.appendChild(div);
  });
}

function selectEditCard(id) {
  _editId = id;
  document.querySelectorAll('#adminEditResults > .ad-result').forEach(function(d) {
    d.classList.toggle('sel', parseInt(d.getAttribute('data-id')) === id);
  });
  var allCards = document.querySelectorAll('#grid .card');
  for (var i = 0; i < allCards.length; i++) {
    var numEl = allCards[i].querySelector('.number');
    var nid = numEl ? parseInt(numEl.textContent.replace(/\D/g, '')) : 0;
    if (nid === id) {
      var title = allCards[i].querySelector('.title');
      var img = allCards[i].querySelector('.poster-wrap img');
      var seasonEl = allCards[i].querySelector('.back-season');
      var epsEl = allCards[i].querySelector('.back-episodes');
      var genreEl = allCards[i].querySelector('.back-genre');
      var preview = document.getElementById('adminEditPreview');
      var previewImg = document.getElementById('adminEditPreviewImg');
      var previewTitle = document.getElementById('adminEditPreviewTitle');
      var previewId = document.getElementById('adminEditPreviewId');
      if (preview) preview.style.display = 'block';
      if (previewImg && img) previewImg.src = img.src;
      if (previewTitle && title) previewTitle.textContent = title.textContent;
      if (previewId) previewId.textContent = '#' + id;
      document.getElementById('adminEditName').value = title ? title.textContent : '';
      document.getElementById('adminEditImg').value = img ? img.src : '';
      document.getElementById('adminEditGenre').value = (genreEl && genreEl.textContent) ? genreEl.textContent : ((GENRE_BY_ID && GENRE_BY_ID[id]) ? GENRE_BY_ID[id].join(' · ') : '');
      var malField = document.getElementById('adminEditMal');
      if (malField) {
        var ms = malScoreOf(id);
        malField.value = ms === null ? '' : ms.toFixed(1);
      }
      var editRating = (typeof RATING_DETAIL === 'object' && RATING_DETAIL) ? RATING_DETAIL[id] : null;
      if (!editRating && typeof RATING_DATA === 'object' && RATING_DATA) editRating = RATING_DATA[id];
      var setEditNum = function (fieldId, value) {
        var el = document.getElementById(fieldId);
        if (el) el.value = (value === undefined || value === null || value === '') ? '' : value;
      };
      setEditNum('adminEditAnim', editRating ? editRating.animRating : '');
      setEditNum('adminEditChar', editRating ? editRating.characters : '');
      setEditNum('adminEditStory', editRating ? editRating.storyRating : '');
      setEditNum('adminEditPlanet', editRating ? editRating.animePlanet : '');
      setSeasonSelect('adminEditSeasons', 'adminEditSeasonsCustom', seasonEl ? seasonEl.textContent.replace(/[🌸📺]/g,'').trim() : 'Season-1');
      document.getElementById('adminEditEps').value = epsEl ? epsEl.textContent.replace(/[📺🎬]/g,'').replace('Total Episodes:','').trim() : '';
      // Detect the special card kind from the card class (card-<kind>)
      var specialSel = document.getElementById('adminEditSpecial');
      if (specialSel) {
        var specialClass = '';
        for (var sc = 0; sc < allCards[i].classList.length; sc++) {
          var cn = allCards[i].classList[sc];
          if (cn.indexOf('card-') === 0 && cn !== 'card-inner' && SPECIAL_CARD_KINDS.indexOf(cn.replace('card-', '')) > -1) {
            specialClass = cn.replace('card-', '');
            break;
          }
        }
        specialSel.value = specialClass;
      }
      break;
    }
  }
}

// Add/remove one anime id inside the GENRES sets, so the card back, the genre
// pills and the admin EDIT form all agree about that anime's genres.
function applyGenres(js, id, wanted) {
  return js.replace(/"([\w\s/]+)":\s*\{[^}]*?nums:\s*new\s*Set\(\[([\d,]*)\]\)\s*\}/g, function(match, genreName, numsStr) {
    var nums = numsStr ? numsStr.split(',').map(function(n) { return parseInt(n.trim(), 10); }).filter(function(n) { return !isNaN(n); }) : [];
    if (wanted.indexOf(genreName) !== -1) {
      if (nums.indexOf(id) === -1) { nums.push(id); nums.sort(function(a, b) { return a - b; }); }
    } else {
      var idx = nums.indexOf(id);
      if (idx !== -1) nums.splice(idx, 1);
    }
    var iconMatch = match.match(/icon:\s*"([^"]+)"/);
    var icon = iconMatch ? iconMatch[1] : '✦';
    return '"' + genreName + '":        { icon: "' + icon + '", nums: new Set([' + nums.join(',') + ']) }';
  });
}

// Write one field ("malScore", say) into a RATING_DATA entry, adding it if absent.
function setRatingField(js, id, field, value) {
  var entryRe = new RegExp('"' + id + '":\\{[^}]*\\}');
  return js.replace(entryRe, function(entry) {
    var fieldRe = new RegExp('"' + field + '":\\s*[^,}]+');
    if (fieldRe.test(entry)) return entry.replace(fieldRe, '"' + field + '":' + value);
    return entry.replace(/\}$/, ',"' + field + '":' + value + '}');
  });
}

// One MAL score for a card: explicit malScore wins, else the legacy 0-100 rating / 10.
function malScoreOf(id) {
  var detail = (typeof RATING_DETAIL === 'object' && RATING_DETAIL) ? RATING_DETAIL[id] : null;
  if (detail && detail.malScore !== undefined && detail.malScore !== null && detail.malScore !== '') {
    var dm = parseFloat(detail.malScore);
    if (isFinite(dm)) return dm;
  }
  var entry = (typeof RATING_DATA === 'object' && RATING_DATA) ? RATING_DATA[id] : null;
  if (!entry) return null;
  if (entry.malScore !== undefined && entry.malScore !== null && entry.malScore !== '') {
    var m = parseFloat(entry.malScore);
    if (isFinite(m)) return m;
  }
  if (entry.rating !== undefined && entry.rating !== null) {
    var r = parseFloat(entry.rating);
    if (isFinite(r)) return r / 10;
  }
  return null;
}

async function commitEditAnime() {
  var name = document.getElementById('adminEditName').value.trim();
  var genre = document.getElementById('adminEditGenre').value.trim();
  var seasons = readSeasonSelect('adminEditSeasons', 'adminEditSeasonsCustom');
  var episodes = document.getElementById('adminEditEps').value.trim();
  if (!_editId || !name) { msgFail('Select anime and enter name'); return; }
  showLoading();
  adStep('fetching files…');
  try {
    var indexData = await githubFetch('index.html');
    var scriptData = await githubFetch('script.js');
    var ratingsData = await githubFetch('anime-ratings.json');
    if (!indexData || !scriptData) { hideLoading(); adStep(''); saveCommitResult('edit-anime', false, 'fetch failed'); msgFail('Failed to fetch files'); return; }
    var indexContent = decodeURIComponent(escape(atob(indexData.content)));
    var scriptContent = decodeURIComponent(escape(atob(scriptData.content)));
    var ratingsContent = ratingsData ? decodeURIComponent(escape(atob(ratingsData.content))) : '';
    var lines = indexContent.split('\n');
    var cardIdx = -1;
    for (var i = 0; i < lines.length; i++) {
      if (lines[i].includes('<span class="badge">#' + _editId + '</span>')) { cardIdx = i; break; }
    }
    if (cardIdx === -1) { hideLoading(); adStep(''); saveCommitResult('edit-anime', false, 'card #' + _editId + ' not found'); msgFail('Card not found'); return; }
    var img = document.getElementById('adminEditImg').value.trim() || '';
    var seasonText = seasons ? '🌸 ' + seasons : '';
    var epsText = episodes ? '📺 Total Episodes: ' + episodes : '';
    var specialSel = document.getElementById('adminEditSpecial');
    var special = specialSel ? specialSel.value : '';
    var stampMap = SPECIAL_CARD_NAMES;
    var stamp = stampMap[special] || null;
    var specialClass = special ? ' card-' + special : '';
    var stampHtml = '';
    var backLabelHtml = stamp ? '<div class="back-special-label back-special-label--' + special + '"><b>' + stamp.t + '</b><i>' + stamp.s + '</i></div>' : '';
    var newCard = '<div class="card' + specialClass + '"><div class="card-inner">' + stampHtml + '<div class="card-front"><div class="poster-wrap"><img src="' + img.replace(/"/g,'&quot;') + '" alt="' + name.replace(/"/g,'&quot;') + '" loading="lazy"/><span class="badge">#' + _editId + '</span></div><div class="info"><div class="number">NO. ' + _editId + '</div><div class="title">' + name + '</div></div></div><div class="card-back"><div class="back-content">' + backLabelHtml + '<div class="back-title">' + name + '</div><div class="back-season">' + seasonText + '</div><div class="back-episodes">' + epsText + '</div><div class="back-tap-hint">click to flip back</div></div></div></div></div>';
    lines[cardIdx] = newCard;
    indexContent = lines.join('\n');
    if (genre) {
      var newGenres = genre.split(/[,·]/).map(function(g) { return g.trim(); }).filter(Boolean);
      scriptContent = applyGenres(scriptContent, _editId, newGenres);
    }
    var malInput = document.getElementById('adminEditMal');
    var malVal = malInput ? malInput.value.trim() : '';
    var ratingPatch = {};
    if (malVal !== '' && isFinite(parseFloat(malVal))) {
      ratingPatch.malScore = parseFloat(malVal);
      scriptContent = setRatingField(scriptContent, _editId, 'malScore', ratingPatch.malScore);
    }
    var readEditNum = function (fieldId) {
      var el = document.getElementById(fieldId);
      if (!el) return null;
      var raw = String(el.value || '').trim();
      if (raw === '') return null;
      var n = parseFloat(raw);
      return isFinite(n) ? n : null;
    };
    var animVal = readEditNum('adminEditAnim');
    var charVal = readEditNum('adminEditChar');
    var storyVal = readEditNum('adminEditStory');
    var planetVal = readEditNum('adminEditPlanet');
    if (animVal !== null) ratingPatch.animRating = animVal;
    if (charVal !== null) ratingPatch.characters = charVal;
    if (storyVal !== null) ratingPatch.storyRating = storyVal;
    if (planetVal !== null) ratingPatch.animePlanet = planetVal;
    var hasRatingPatch = Object.keys(ratingPatch).length > 0;
    if (hasRatingPatch) {
      var ratingsObj = {};
      if (ratingsContent) {
        try { ratingsObj = JSON.parse(ratingsContent) || {}; } catch (e) { ratingsObj = {}; }
      }
      if (!ratingsObj[_editId] || typeof ratingsObj[_editId] !== 'object') ratingsObj[_editId] = {};
      Object.keys(ratingPatch).forEach(function (k) { ratingsObj[_editId][k] = ratingPatch[k]; });
      ratingsObj[_editId].title = name;
      ratingsContent = JSON.stringify(ratingsObj, null, 8);
    }
    var totalSteps = hasRatingPatch ? 3 : 2;
    adStep('committing index.html (1/' + totalSteps + ')…');
    var ok1 = await githubCommit('index.html', indexContent, 'admin: edit anime #' + _editId + ' - ' + name);
    adStep('committing script.js (2/' + totalSteps + ')…');
    var ok2 = await githubCommit('script.js', scriptContent, 'admin: edit genres for #' + _editId);
    var ok3 = true;
    if (hasRatingPatch) {
      adStep('committing anime-ratings.json (3/3)…');
      ok3 = await githubCommit('anime-ratings.json', ratingsContent, 'admin: ratings for anime #' + _editId + ' - ' + name);
    }
    hideLoading();
    adStep('');
    var ok = ok1 && ok2 && ok3;
    if (ok && hasRatingPatch) {
      try {
        RATING_DATA[_editId] = RATING_DATA[_editId] || {};
        Object.keys(ratingPatch).forEach(function (k) { RATING_DATA[_editId][k] = ratingPatch[k]; });
        RATING_DATA[_editId].title = name;
        RATING_DETAIL[_editId] = RATING_DETAIL[_editId] || {};
        Object.keys(ratingPatch).forEach(function (k) { RATING_DETAIL[_editId][k] = ratingPatch[k]; });
        RATING_DETAIL[_editId].title = name;
      } catch (e) {}
    }
    saveCommitResult('edit-anime', ok, 'anime #' + _editId + ' - ' + name);
    if (ok) { msgOk('Anime #' + _editId + ' updated'); }
    else msgFail('Commit failed');
  } catch (e) {
    hideLoading();
    adStep('');
    saveCommitResult('edit-anime', false, 'exception: ' + ((e && e.message) || e));
    msgFail('Commit threw: ' + ((e && e.message) || e));
  }
}

async function commitDate(dateStr) {
  showLoading();
  adStep('fetching index.html…');
  try {
    var data = await githubFetch('index.html');
    if (!data) { hideLoading(); adStep(''); saveCommitResult('date', false, 'fetch failed'); msgFail('Fetch failed. Check PAT.'); return; }
    var content = decodeURIComponent(escape(atob(data.content)));
    content = content.replace(/(<span id="lastUpdatedDate">)(.*?)(<\/span>)/, '$1' + dateStr + '$3');
    adStep('committing index.html…');
    var ok = await githubCommit('index.html', content, 'admin: update date to ' + dateStr);
    hideLoading();
    adStep('');
    saveCommitResult('date', ok, ok ? dateStr : 'commit failed');
    if (ok) { msgOk('Date updated to ' + dateStr); var el = document.getElementById('lastUpdatedDate'); if (el) el.textContent = dateStr; }
    else msgFail('Commit failed');
  } catch (e) {
    hideLoading();
    adStep('');
    saveCommitResult('date', false, 'exception: ' + ((e && e.message) || e));
    msgFail('Commit threw: ' + ((e && e.message) || e));
  }
}

/* Quietly refresh the "last updated" date on the site after any admin commit,
   so the date never lags behind the data without a manual step. */
var _dateAutoPending = false;
/* the totals of the site are counted from the cards themselves, so they
   can never drift: every card prints its episodes and its season list on the
   back, and this adds them up */
function totalsFromCards(html) {
  var lines = String(html || '').split('\n');
  var anime = 0, seasons = 0, episodes = 0;
  lines.forEach(function (line) {
    if (line.indexOf('class="card') === -1) return;
    if (line.indexOf('badge">#') === -1) return;
    anime++;
    var epM = line.match(/back-episodes">([^<]*)</);
    if (epM) {
      var n = epM[1].replace(/[^\d]/g, '');
      if (n) episodes += parseInt(n, 10);
    }
    var seM = line.match(/back-season">([^<]*)</);
    if (seM) {
      var nums = seM[1].match(/\d+/g);
      if (nums && nums.length) seasons += nums.length;
    }
  });
  return { anime: anime, seasons: seasons, episodes: episodes };
}

function patchCounters(js, totals) {
  return String(js)
    .replace(/counterUp\("animeCount",\s*[^,]+,/, 'counterUp("animeCount", ' + totals.anime + ',')
    .replace(/counterUp\("seasonCount",\s*\d+/, 'counterUp("seasonCount", ' + totals.seasons)
    .replace(/counterUp\("episodeCount",\s*\d+/, 'counterUp("episodeCount", ' + totals.episodes);
}

var _counterAutoPending = false;
async function autoUpdateCounters() {
  if (_counterAutoPending) return;
  _counterAutoPending = true;
  try {
    var res = await Promise.all([githubFetch('index.html'), githubFetch('script.js')]);
    if (!res[0] || !res[1]) return;
    var html = decodeURIComponent(escape(atob(res[0].content)));
    var jsText = decodeURIComponent(escape(atob(res[1].content)));
    var totals = totalsFromCards(html);
    var patched = patchCounters(jsText, totals);
    if (patched === jsText) return;
    await githubCommit('script.js', patched, 'admin: update the season and episode totals');
  } catch (e) { /* silent - the counters are best effort */ }
  finally { _counterAutoPending = false; }
}

async function autoUpdateDate() {
  if (_dateAutoPending) return;
  _dateAutoPending = true;
  try {
    var today = new Date().toLocaleDateString('en-GB');
    var data = await githubFetch('index.html');
    if (!data) return;
    var content = decodeURIComponent(escape(atob(data.content)));
    var next = content.replace(/(<span id=\"lastUpdatedDate\">)(.*?)(<\/span>)/, '$1' + today + '$3');
    if (next === content) return;
    await githubCommit('index.html', next, 'admin: auto-update date to ' + today);
    var el = document.getElementById('lastUpdatedDate');
    if (el) el.textContent = today;
  } catch (e) { /* silent: date refresh is best-effort */ }
  finally { _dateAutoPending = false; }
}

/* After an admin commit, re-stamp every ?v= asset link in the two HTML files
   so browsers fetch the new css/js instead of a cached copy. The stamp is the
   current time (yyyymmddHHMM), so it changes on every commit. Skipped for the
   stamp/date commits themselves so they cannot loop. */
var _stampPending = false;
function assetStamp() {
  var d = new Date();
  function p(n) { return (n < 10 ? '0' : '') + n; }
  return '' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + p(d.getHours()) + p(d.getMinutes());
}

async function stampAssetVersions(force) {
  if (_stampPending) return;
  _stampPending = true;
  try {
    var stamp = assetStamp();
    var files = ['index.html', 'admin.html'];
    for (var i = 0; i < files.length; i++) {
      var path = files[i];
      var data = await githubFetch(path);
      if (!data) continue;
      var content = decodeURIComponent(escape(atob(data.content)));
      var next = content.replace(/((?:src|href)="[^"]+)\?v=[^"]*/g, '$1?v=' + stamp);
      if (next === content) continue;               // nothing to change
      await githubCommit(path, next, 'admin: refresh asset cache stamp ' + stamp);
    }
  } catch (e) { /* silent: version stamping is best-effort */ }
  finally { _stampPending = false; }
}

/* Public: the DATE tab's "restamp now" button. */
window.restampAssets = function () {
  showLoading();
  adStep('refreshing asset versions…');
  stampAssetVersions(true).then(function () {
    hideLoading();
    adStep('');
    msgOk('Asset versions refreshed to ' + assetStamp());
  });
};

async function commitStats() {
  var seasonsInp = document.getElementById('adminStatsSeasons');
  var epsInp = document.getElementById('adminStatsEps');
  var seasons = seasonsInp ? seasonsInp.value.trim() : '';
  var eps = epsInp ? epsInp.value.trim() : '';
  if (!seasons && !eps) { msgFail('Enter a season or episode increase'); return; }
  var addS = parseInt(seasons, 10) || 0;
  var addE = parseInt(eps, 10) || 0;
  if ((seasons && !addS) || (eps && !addE)) { msgFail('Enter a whole number'); return; }
  showLoading();
  adStep('fetching script.js…');
  try {
    var scriptData = await githubFetch('script.js');
    if (!scriptData) { hideLoading(); adStep(''); saveCommitResult('stats', false, 'fetch failed'); msgFail('Fetch failed'); return; }
    var content = decodeURIComponent(escape(atob(scriptData.content)));
    var before = content;
    var newSeasons = null, newEps = null;
    if (addS) {
      var mS = content.match(/counterUp\("seasonCount",\s*(\d+)/);
      if (!mS) { hideLoading(); adStep(''); saveCommitResult('stats', false, 'seasonCount line not found'); msgFail('seasonCount line not found in script.js'); return; }
      newSeasons = parseInt(mS[1], 10) + addS;
      content = content.replace(/counterUp\("seasonCount",\s*\d+/, 'counterUp("seasonCount", ' + newSeasons);
    }
    if (addE) {
      var mE = content.match(/counterUp\("episodeCount",\s*(\d+)/);
      if (!mE) { hideLoading(); adStep(''); saveCommitResult('stats', false, 'episodeCount line not found'); msgFail('episodeCount line not found in script.js'); return; }
      newEps = parseInt(mE[1], 10) + addE;
      content = content.replace(/counterUp\("episodeCount",\s*\d+/, 'counterUp("episodeCount", ' + newEps);
    }
    if (content === before) { hideLoading(); adStep(''); saveCommitResult('stats', false, 'nothing changed'); msgFail('Nothing to change'); return; }
    adStep('committing script.js…');
    var ok = await githubCommit('script.js', content, 'admin: increase counter stats');
    hideLoading();
    adStep('');
    saveCommitResult('stats', ok, ok ? 'updated' : 'commit failed');
    if (ok) {
      msgOk('Stats increased');
      if (newSeasons !== null) {
        var sEl = document.getElementById('seasonCount'); if (sEl) sEl.textContent = newSeasons;
        ADMIN_STATS_BASE.seasons = newSeasons;
        if (seasonsInp) seasonsInp.placeholder = 'Increase by — current: ' + newSeasons;
      }
      if (newEps !== null) {
        var eEl = document.getElementById('episodeCount'); if (eEl) eEl.textContent = newEps;
        ADMIN_STATS_BASE.episodes = newEps;
        if (epsInp) epsInp.placeholder = 'Increase by — current: ' + newEps;
      }
      if (seasonsInp) seasonsInp.value = '';
      if (epsInp) epsInp.value = '';
    }
    else msgFail('Commit failed');
  } catch (e) {
    hideLoading();
    adStep('');
    saveCommitResult('stats', false, 'exception: ' + ((e && e.message) || e));
    msgFail('Commit threw: ' + ((e && e.message) || e));
  }
}

async function commitWatching() {
  if (!_watchId) { msgFail('Search and select an anime first'); return; }
  var curEps = document.getElementById('adminWatchCurEps').value.trim();
  var totalEps = document.getElementById('adminWatchTotalEps').value.trim();
  var season = readSeasonSelect('adminWatchSeason', 'adminWatchSeasonCustom');
  if (!curEps) { msgFail('Enter current episode'); return; }
  var watchId = _watchId;
  var eps = totalEps ? 'Episode ' + curEps + ' / ' + totalEps : 'Episode ' + curEps;
  var prog = calcProgress(curEps, totalEps);
  showLoading();
  adStep('fetching index.html…');
  try {
    var allCards = document.querySelectorAll('#grid .card');
    var foundCard = null;
    for (var i = 0; i < allCards.length; i++) {
      var numEl = allCards[i].querySelector('.number');
      var nid = numEl ? parseInt(numEl.textContent.replace(/\D/g, '')) : 0;
      if (nid === watchId) { foundCard = allCards[i]; break; }
    }
    if (!foundCard) { hideLoading(); adStep(''); saveCommitResult('watching', false, 'card #' + watchId + ' not found'); msgFail('Card #' + watchId + ' not found'); return; }
    var title = foundCard.querySelector('.title').textContent;
    var img = foundCard.querySelector('.poster-wrap img').src;
    if (!season) {
      var seasonEl = foundCard.querySelector('.back-season');
      season = seasonEl ? seasonEl.textContent.replace(/[🌸📺]/g,'').trim() : 'Season-1';
    }
    var data = await githubFetch('index.html');
    if (!data) { hideLoading(); adStep(''); saveCommitResult('watching', false, 'fetch failed'); msgFail('Failed to fetch. Check PAT.'); return; }
    var content = decodeURIComponent(escape(atob(data.content)));
    var watchBlock = content.match(/^.*<div class="stats-bar-card">\s*<div class="stats-bar-label">🎬 Currently Watching.*$/m);
    if (!watchBlock) { hideLoading(); adStep(''); saveCommitResult('watching', false, 'watching block not found'); msgFail('Watching block not found'); return; }
    var oldHtml = watchBlock[0];
    var newHtml = '<div class="stats-bar-card">' +
      '<div class="stats-bar-label">🎬 Currently Watching</div>' +
      '<div class="stats-bar-inner">' +
        '<div class="stats-bar-poster"><img src="' + img.replace(/"/g,'&quot;') + '" alt="' + title.replace(/"/g,'&quot;') + '"></div>' +
        '<div class="stats-bar-info">' +
          '<div class="stats-bar-title">' + title + '</div>' +
          '<div class="stats-bar-meta">' + season + '</div>' +
          '<div class="stats-bar-track"><div class="stats-bar-fill" style="width: ' + prog + '%;"></div></div>' +
          '<div class="stats-bar-eps">' + eps + '</div>' +
        '</div>' +
      '</div></div>';
    content = content.replace(oldHtml, newHtml);
    adStep('committing index.html…');
    var ok = await githubCommit('index.html', content, 'admin: update watching to ' + title);
    hideLoading();
    adStep('');
    saveCommitResult('watching', ok, ok ? title : 'commit failed');
    if (ok) msgOk('Watching updated to: ' + title);
    else msgFail('Commit failed');
  } catch (e) {
    hideLoading();
    adStep('');
    saveCommitResult('watching', false, 'exception: ' + ((e && e.message) || e));
    msgFail('Commit threw: ' + ((e && e.message) || e));
  }
}

/* ── manual duel-rating popup ── lets the admin override/enter the duel
   ratings (malScore, characters, animRating, animePlanet, anilist, storyRating)
   when auto-derived values are missing or wrong (e.g. no Anime Planet data). ── */
function showDuelRatingPopup(title, derived) {
  return new Promise(function (resolve) {
    var overlay = document.createElement('div');
    overlay.className = 'ad-duel-overlay';
    var box = document.createElement('div');
    box.className = 'ad-duel';
    function duelField(id, label, hint, value, step, min, max) {
      return '<label class="ad-duel-field"><span>' + label +
        (hint ? '<small>' + hint + '</small>' : '') +
        '</span><input id="' + id + '" type="number" step="' + step + '" min="' + min + '" max="' + max + '" value="' + value + '"></label>';
    }
    box.innerHTML =
      '<div class="ad-duel-title">⚔️ DUEL RATINGS</div>' +
      '<div class="ad-duel-sub"><b>' + title.replace(/"/g, '&quot;') + '</b> — auto-derived for MAL / Planet / AniList / Story. Characters and Animation come from the DB/API; edit any field to override.</div>' +
      '<div class="ad-duel-grid">' +
      duelField('dr-mal', 'MAL Score', '', derived.mal || '', '0.01', 0, 10) +
      duelField('dr-char', 'Characters', 'DB / API', derived.chars || '', '0.1', 0, 10) +
      duelField('dr-anim', 'Animation', 'DB / API', derived.anim || '', '0.1', 0, 10) +
      duelField('dr-planet', 'Anime Planet', '', derived.planet || '', '0.1', 0, 10) +
      duelField('dr-anilist', 'AniList', '', derived.anilist || '', '1', 0, 100) +
      duelField('dr-story', 'Story Rating', '', derived.story || '', '0.1', 0, 10) +
      '</div>' +
      '<div class="ad-duel-actions">' +
      '<button type="button" class="ad-duel-cancel" id="dr-cancel">CANCEL</button>' +
      '<button type="button" class="ad-duel-save" id="dr-save">SAVE</button>' +
      '</div>';
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    var inputs = { mal: box.querySelector('#dr-mal'), chars: box.querySelector('#dr-char'), anim: box.querySelector('#dr-anim'), planet: box.querySelector('#dr-planet'), anilist: box.querySelector('#dr-anilist'), story: box.querySelector('#dr-story') };
    function cleanup() { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); }
    box.querySelector('#dr-cancel').onclick = function () { cleanup(); resolve(null); };
    box.querySelector('#dr-save').onclick = function () {
      var out = {};
      Object.keys(inputs).forEach(function (k) {
        var v = inputs[k].value.trim();
        out[k] = v === '' ? null : parseFloat(v);
      });
      cleanup();
      resolve(out);
    };
    box.querySelector('#dr-mal').focus();
  });
}

/* ══════════════════════════════════════════════════════════════════════
   ONE ANIME = ONE CARD
   ADD refuses to commit a title that is already in the grid. Titles are
   compared after normalising case, accents, punctuation and spacing, so
   "Attack on Titan!", "attack on titan" and "Attack  on Titan" collide.
   Two layers:
     · instant check against the loaded grid (live hint + commit guard)
     · authoritative check against the freshly fetched index.html, so a
       card added from another tab or device still blocks the commit
   ══════════════════════════════════════════════════════════════════════ */
function adUnescape(s) {
  return String(s || '')
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"')
    .replace(/&#0*39;/g, "'").replace(/&#x27;/gi, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}

function adNormTitle(s) {
  return adUnescape(s)
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function adFindExistingAnime(title) {
  var want = adNormTitle(title);
  if (!want) return null;
  var hit = null;
  Array.prototype.some.call(document.querySelectorAll('#grid .card'), function (c) {
    var t = c.querySelector('.title');
    if (!t || adNormTitle(t.textContent) !== want) return false;
    var n = c.querySelector('.number');
    hit = {
      id: parseInt(String(n ? n.textContent : '').replace(/\D/g, ''), 10) || 0,
      title: t.textContent.trim()
    };
    return true;
  });
  return hit;
}

function adDupHint() {
  var box = document.getElementById('adminAddDup');
  var input = document.getElementById('adminAddTitle');
  if (!box || !input) return;
  var v = input.value.trim();
  var hit = v ? adFindExistingAnime(v) : null;
  if (!hit) {
    box.style.display = 'none';
    box.textContent = '';
    return;
  }
  box.style.display = '';
  box.innerHTML = '⚠ Already in the list as <b>card #' + hit.id + '</b> — “' +
    adEsc(hit.title) + '”. A second card is blocked; edit that card instead.';
}

/* ── live card preview: the real site card, in an isolated iframe ────── */
function adEscHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function renderCardPreview() {
  var frame = document.getElementById('adminPreviewFrame');
  if (!frame) return;
  var val = function (id) {
    var el = document.getElementById(id);
    return el ? String(el.value || '').trim() : '';
  };
  var title = val('adminAddTitle') || 'Anime title';
  var img = val('adminAddImg');
  var eps = val('adminAddEps') || '?';
  var season = (typeof readSeasonSelect === 'function')
    ? readSeasonSelect('adminAddSeasonLabel', 'adminAddSeasonCustom')
    : val('adminAddSeasonLabel');
  season = season || 'Season-1';
  var nextId = ((typeof ADMIN_STATS_BASE === 'object' && ADMIN_STATS_BASE && ADMIN_STATS_BASE.anime)
    ? ADMIN_STATS_BASE.anime : 0) + 1;

  var t = adEscHtml(title), im = adEscHtml(img), se = adEscHtml(season), ep = adEscHtml(eps);
  var specialSel = document.getElementById('adminAddSpecial');
  var special = specialSel ? specialSel.value : '';
  var stampMap = SPECIAL_CARD_NAMES;
  var stampLabel = stampMap[special] || null;
  var stampHtml = '';
  var backLabelHtml = stampLabel ? '<div class="back-special-label back-special-label--' + special + '"><b>' + stampLabel.t + '</b><i>' + stampLabel.s + '</i></div>' : '';
  var specialClass = special ? ' card-' + special : '';
  var card =
    '<div class="card' + specialClass + '">' +
      '<div class="card-inner">' +
        stampHtml +
        '<div class="card-front">' +
          '<div class="poster-wrap">' +
            (img ? '<img src="' + im + '" alt="' + t + '" loading="lazy"/>' : '') +
            '<span class="badge">#' + nextId + '</span>' +
          '</div>' +
          '<div class="info"><div class="number">NO. ' + nextId + '</div><div class="title">' + t + '</div></div>' +
        '</div>' +
        '<div class="card-back"><div class="back-content">' +
          backLabelHtml +
          '<div class="back-title">' + t + '</div>' +
          '<div class="back-season">🌸 ' + se + '</div>' +
          '<div class="back-episodes">📺 Total Episodes: ' + ep + '</div>' +
          '<div class="back-tap-hint">click to flip back</div>' +
        '</div></div>' +
      '</div>' +
    '</div>';

  var doc =
    '<!doctype html><html><head><meta charset="utf-8">' +
    '<link rel="stylesheet" href="style.css">' +
    '<style>' +
      'html,body{margin:0;padding:0;background:#07070c;}' +
      'body{display:flex;align-items:center;justify-content:center;height:100vh;overflow:hidden;}' +
      '#grid{display:block!important;grid-template-columns:none!important;margin:0!important;padding:0!important;}' +
      '#grid .card{width:220px!important;height:380px;}' +
      '.card{cursor:pointer;}' +
    '</style></head><body>' +
    '<div class="grid" id="grid">' + card + '</div>' +
    '<script>document.addEventListener("click",function(e){var c=e.target.closest(".card");if(c)c.classList.toggle("flipped");});<\/script>' +
    '</body></html>';

  frame.srcdoc = doc;
}

(function wireCardPreview() {
  var ids = ['adminAddTitle', 'adminAddImg', 'adminAddEps', 'adminAddSeason', 'adminAddSeasonCustom', 'adminAddSpecial'];
  var timer = null;
  var repaint = function () {
    clearTimeout(timer);
    timer = setTimeout(renderCardPreview, 140);
  };
  ids.forEach(function (id) {
    var el = document.getElementById(id);
    if (el) { el.addEventListener('input', repaint); el.addEventListener('change', repaint); }
  });
  var sel = document.getElementById('adminAddSeasonLabel');
  if (sel) sel.addEventListener('change', repaint);
  renderCardPreview();
})();

async function commitAddAnime() {
  var title = document.getElementById('adminAddTitle').value.trim();
  var img = document.getElementById('adminAddImg').value.trim();
  var season = document.getElementById('adminAddSeason').value.trim();
  var eps = parseInt(document.getElementById('adminAddEps').value) || 0;
  var rating = parseInt(document.getElementById('adminAddRating').value) || null;
  var mal = parseFloat(document.getElementById('adminAddMal').value);
  var anim = parseFloat(document.getElementById('adminAddAnim').value);
  var char = parseFloat(document.getElementById('adminAddChar').value);
  var story = parseFloat(document.getElementById('adminAddStory').value);
  var planet = parseFloat(document.getElementById('adminAddPlanet').value);
  var ott = _selectedOtt.join(', ');
  var studio = _selectedStudio.join(', ');
  var genre = _selectedGenre.join(', ');
  var seasonLabel = readSeasonSelect('adminAddSeasonLabel', 'adminAddSeasonCustom') || 'Season-1';
  if (!title || !img) { msgFail('Title and Image URL required'); return; }
  var dupLocal = adFindExistingAnime(title);
  if (dupLocal) {
    adDupHint();
    msgFail('Already added as card #' + dupLocal.id + ' — ' + dupLocal.title);
    return;
  }
  showLoading();
  adStep('fetching site files…');
  try {
    var indexData = await githubFetch('index.html');
    var scriptData = await githubFetch('script.js');
    var ratingsData = await githubFetch('anime-ratings.json');
    if (!indexData || !scriptData) { hideLoading(); adStep(''); saveCommitResult('add-anime', false, 'fetch failed (index.html / script.js)'); msgFail('Failed to fetch files. Check PAT.'); return; }
    var indexContent = decodeURIComponent(escape(atob(indexData.content)));
    /* authoritative duplicate check against the very file we are about to edit */
    var wanted = adNormTitle(title);
    var dupInFile = null;
    var titleScan = /class="title">([^<]*)</g;
    var tmScan;
    while ((tmScan = titleScan.exec(indexContent))) {
      if (adNormTitle(tmScan[1]) === wanted) { dupInFile = adUnescape(tmScan[1]).trim(); break; }
    }
    if (dupInFile) {
      hideLoading(); adStep('');
      saveCommitResult('add-anime', false, 'duplicate: ' + dupInFile);
      msgFail('Already in the list: ' + dupInFile);
      adDupHint();
      return;
    }
    var scriptContent = decodeURIComponent(escape(atob(scriptData.content)));
    var ratingsContent = ratingsData ? decodeURIComponent(escape(atob(ratingsData.content))) : '';
    var maxId = 0;
    var badgeMax = indexContent.match(/class="badge">#(\d+)</g);
    if (badgeMax) badgeMax.forEach(function(m) { var n = parseInt(m.replace(/\D/g,'')); if (n > maxId) maxId = n; });
    if (typeof RATING_DATA === 'object') Object.keys(RATING_DATA).forEach(function(k) { var n = parseInt(k); if (n > maxId) maxId = n; });
    var nextId = maxId + 1;
    // Special cards: the admin can give a new anime a stamp as well.
    var specialSel = document.getElementById('adminAddSpecial');
    var special = specialSel ? specialSel.value : '';
    var stampMap = SPECIAL_CARD_NAMES;
    var stamp = stampMap[special] || null;
    var specialClass = special ? ' card-' + special : '';
    var stampHtml = '';
    var backLabelHtml = stamp ? '<div class="back-special-label back-special-label--' + special + '"><b>' + stamp.t + '</b><i>' + stamp.s + '</i></div>' : '';
    var cardHtml = '\n\n<div class="card' + specialClass + '"><div class="card-inner">' + stampHtml + '<div class="card-front"><div class="poster-wrap"><img src="' + img.replace(/"/g,'&quot;') + '" alt="' + title.replace(/"/g,'&quot;') + '" loading="lazy"/><span class="badge">#' + nextId + '</span></div><div class="info"><div class="number">NO. ' + nextId + '</div><div class="title">' + title + '</div></div></div><div class="card-back"><div class="back-content">' + backLabelHtml + '<div class="back-title">' + title + '</div><div class="back-season">🌸 ' + seasonLabel + '</div><div class="back-episodes">📺 Total Episodes: ' + eps + '</div><div class="back-tap-hint">click to flip back</div></div></div></div></div>';
    indexContent = indexContent.replace(/<!-- === GRID END === -->/, cardHtml + '\n\n<!-- === GRID END === -->');
    scriptContent = scriptContent.replace(/counterUp\("seasonCount",\s*(\d+)/, function(m, c) { return 'counterUp("seasonCount", ' + (parseInt(c) + 1); });
    scriptContent = scriptContent.replace(/counterUp\("episodeCount",\s*(\d+)/, function(m, c) { return 'counterUp("episodeCount", ' + (parseInt(c) + eps); });
    var addEntry = function(key, entry) {
      var pos = scriptContent.indexOf(key); if (pos === -1) return scriptContent;
      var start = pos + key.length, i = start, braces = 0;
      if (scriptContent[i] === '{') braces = 1; else return scriptContent;
      i++; while (i < scriptContent.length && braces > 0) { if (scriptContent[i] === '{') braces++; else if (scriptContent[i] === '}') braces--; i++; }
      var before = scriptContent.substring(0, i - 1), after = scriptContent.substring(i - 1);
      before = before.replace(/,(\s*)$/, function(m, s) { return s; });
      return before + ',' + entry + after;
    };
    adStep('committing index.html (1/4)…');
    scriptContent = addEntry('window.RATING_DATA = ', '"' + nextId + '":{"rating":' + rating + ',"season":"' + season + '"' + (isFinite(mal) ? ',"malScore":' + mal : '') + '}');
    var ottArr = ott ? '["' + ott.split(/\s*,\s*/).join('","') + '"]' : '[]';
    scriptContent = addEntry('window.OTT_DATA = ', '"' + nextId + '":' + ottArr);
    var studioArr = studio ? '["' + studio.split(/\s*,\s*/).join('","') + '"]' : '[]';
    scriptContent = addEntry('window.STUDIO_DATA = ', '"' + nextId + '":' + studioArr);
    var duelMal = isFinite(mal) ? mal : (rating ? (0.0725 * rating + 2.2649) : 0);
    duelMal = Math.round(duelMal * 100) / 100;
    var duelAnim = isFinite(anim) ? anim : Math.round(duelMal * 2) / 2;
    var duelChar = isFinite(char) ? char : Math.round(duelMal * 2) / 2;
    var duelPlanet = isFinite(planet) ? planet : Math.round((duelMal / 2) * 10) / 10;
    var duelAnilist = rating || 0;
    var duelStory = isFinite(story) ? story : (isFinite(char) ? char : Math.round(duelMal * 2) / 2);
    var addGenres = genre ? genre.split(/[,·]/).map(function(g) { return g.trim(); }).filter(Boolean) : [];
    var duelEntry = '\n    "' + nextId + '": {\n' +
      '        "malScore": ' + duelMal + ',\n' +
      '        "characters": ' + duelChar + ',\n' +
      '        "animRating": ' + duelAnim + ',\n' +
      '        "animePlanet": ' + duelPlanet + ',\n' +
      '        "anilist": ' + duelAnilist + ',\n' +
      '        "title": ' + JSON.stringify(title) + ',\n' +
      '        "genres": ' + JSON.stringify(addGenres) + ',\n' +
      '        "storyRating": ' + duelStory + '\n' +
      '    }';
    if (ratingsContent) {
      try {
        var dbObj = JSON.parse(ratingsContent);
        dbObj[nextId] = { malScore: duelMal, characters: duelChar, animRating: duelAnim, animePlanet: duelPlanet, anilist: duelAnilist, title: title, genres: addGenres, storyRating: duelStory };
        ratingsContent = JSON.stringify(dbObj, null, 8);
      } catch (e) {
        var _rc = ratingsContent.lastIndexOf('}');
        if (_rc >= 0) { var _before = ratingsContent.substring(0, _rc).replace(/,\s*$/, ''); ratingsContent = _before + ',' + duelEntry + '\n}' + ratingsContent.substring(_rc + 1); }
      }
    } else {
      // anime-ratings.json does not exist yet — create it with this single entry
      ratingsContent = '{\n' + duelEntry + '\n}';
    }
    if (addGenres.length) {
      scriptContent = applyGenres(scriptContent, nextId, addGenres);
    }
    adStep('committing script.js (2/4)…');
    var ok1 = await githubCommit('index.html', indexContent, 'admin: add anime #' + nextId + ' - ' + title);
    adStep('committing script.js (3/4)…');
    var ok2 = await githubCommit('script.js', scriptContent, 'admin: add data for anime #' + nextId + ' - ' + title);
    adStep('committing anime-ratings.json (4/4)…');
    var ok3 = await githubCommit('anime-ratings.json', ratingsContent, 'admin: duel data for anime #' + nextId + ' - ' + title);
    hideLoading();
    adStep('');
    var ok = ok1 && ok2 && ok3;
    saveCommitResult('add-anime', ok, 'anime #' + nextId + ' - ' + title);
    if (ok) msgOk('Anime #' + nextId + ' added: ' + title + ' (duel data included)');
    else msgFail('Commit failed — ' + (lastCommitError || 'check the commit log'));
  } catch (e) {
    hideLoading();
    adStep('');
    saveCommitResult('add-anime', false, 'exception: ' + ((e && e.message) || e));
    msgFail('Commit threw: ' + ((e && e.message) || e));
  }
}


/* ══════════════════════════════════════════════════════════════════════
   NOTES — the admin's private scratch space.

   Two views in one module:
     📄 QUICK PAD   one big pad for whatever you're doing right now
     🗂 MY NOTES    many titled notes, with a searchable list on the left

   Everything is written to this browser's localStorage on every keystroke,
   so it survives reloads and works with no PAT and no network.

   Your repo is PUBLIC, so the optional GitHub backup never leaves the
   browser in the clear: PBKDF2-SHA256 (150k rounds) turns your passphrase
   into an AES-GCM-256 key, and only the ciphertext is committed as
   notes.enc.json. The passphrase is never uploaded — and if you forget it,
   the backup cannot be recovered by anyone, including you.
   ══════════════════════════════════════════════════════════════════════ */

var NOTES_FILE = 'notes.enc.json';
var NOTES_KEY_PAD = 'fardin.admin.pad';
var NOTES_KEY_LIST = 'fardin.admin.notes';
var NOTES_KEY_PASS = 'fardin.admin.pass';
var NOTES_KEY_SEL = 'fardin.admin.sel';
var NOTES_KEY_VIEW = 'fardin.admin.notesview';
var NOTES_KEY_META = 'fardin.admin.notesmeta';
var NOTES_SEL = '';
var NOTES_LIST_TIMER = null;

/* ── tiny localStorage helpers (never throw at the UI) ── */
function notesLS(key, def) {
  try { var v = localStorage.getItem(key); return v === null ? def : v; } catch (e) { return def; }
}
function notesSet(key, val) {
  try { localStorage.setItem(key, val); return true; }
  catch (e) { msgFail('This browser refused to store that (storage full?)'); return false; }
}
function notesLoadList() {
  try { var a = JSON.parse(notesLS(NOTES_KEY_LIST, '[]')); return Array.isArray(a) ? a : []; } catch (e) { return []; }
}
function notesFind(id) {
  var l = notesLoadList().filter(function (n) { return n.id === id; });
  return l.length ? l[0] : null;
}
function notesMetaGet() { try { return JSON.parse(notesLS(NOTES_KEY_META, '{}')); } catch (e) { return {}; } }
function notesSetMeta(k, v) { var m = notesMetaGet(); m[k] = v; notesSet(NOTES_KEY_META, JSON.stringify(m)); }
function notesWhen(iso) {
  if (!iso) return '';
  var d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}
function notesCount(id, text) {
  var el = document.getElementById(id);
  if (!el) return;
  text = text || '';
  var words = (text.trim().match(/\S+/g) || []).length;
  el.textContent = text.length + ' chars · ' + words + ' words';
}

/* ── the two views ── */
function notesView(which) {
  which = which === 'list' ? 'list' : 'pad';
  document.querySelectorAll('.ad-note-tabs .ad-tabbtn').forEach(function (b) {
    b.classList.toggle('active', b.getAttribute('data-notesview') === which);
  });
  var pad = document.getElementById('notesPadView'), list = document.getElementById('notesListView');
  if (pad) pad.style.display = which === 'pad' ? 'block' : 'none';
  if (list) list.style.display = which === 'list' ? 'block' : 'none';
  notesSet(NOTES_KEY_VIEW, which);
}

/* ── quick pad ── */
function notesPadInput() {
  var el = document.getElementById('notesPad');
  if (!el) return;
  notesSet(NOTES_KEY_PAD, el.value);
  notesCount('notesPadCount', el.value);
}
function notesClearPad() {
  var el = document.getElementById('notesPad');
  if (!el || !el.value) return;
  if (!confirm('Clear the quick pad? (this browser only — the GitHub backup keeps whatever you last saved)')) return;
  el.value = '';
  notesPadInput();
  msgOk('Pad cleared');
}

/* ── titled notes ── */
function notesRenderList() {
  var box = document.getElementById('notesList');
  if (!box) return;
  var q = (document.getElementById('notesSearch').value || '').trim().toLowerCase();
  var all = notesLoadList();
  var list = all.filter(function (n) {
    if (!q) return true;
    return (n.title || '').toLowerCase().indexOf(q) > -1 || (n.body || '').toLowerCase().indexOf(q) > -1;
  }).sort(function (a, b) {
    var pa = a.pinned ? 0 : 1, pb = b.pinned ? 0 : 1;
    if (pa !== pb) return pa - pb;
    var da = a.done ? 1 : 0, db = b.done ? 1 : 0;
    if (da !== db) return da - db;
    return String(b.updated || '').localeCompare(String(a.updated || ''));
  });

  box.innerHTML = '';
  if (!list.length) {
    var d = document.createElement('div');
    d.className = 'ad-notes-empty';
    d.textContent = all.length ? 'no note matches "' + q + '"' : 'no notes yet — press ＋ NEW NOTE';
    box.appendChild(d);
    return;
  }
  list.forEach(function (n) {
    var item = document.createElement('div');
    item.className = 'ad-note-item' + (n.id === NOTES_SEL ? ' sel' : '') + (n.pinned ? ' pinned' : '') + (n.done ? ' done' : '');
    var t = document.createElement('div');
    t.className = 'ad-note-item-title';
    t.textContent = (n.title || '').trim() || '(untitled)';
    var s = document.createElement('div');
    s.className = 'ad-note-item-snip';
    s.textContent = (n.body || '').replace(/\s+/g, ' ').trim().slice(0, 60) || 'empty';
    var w = document.createElement('div');
    w.className = 'ad-note-item-when';
    w.textContent = notesWhen(n.updated);
    var ctl = document.createElement('div');
    ctl.className = 'ad-note-item-ctl';
    var done = document.createElement('label');
    done.className = 'ad-note-check';
    done.title = 'Mark done';
    var cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = !!n.done;
    cb.onchange = function (e) { if (e) e.stopPropagation(); notesToggleDone(n.id); };
    done.appendChild(cb);
    var dn = document.createElement('span');
    dn.textContent = 'done';
    done.appendChild(dn);
    var pin = document.createElement('button');
    pin.type = 'button';
    pin.className = 'ad-note-pin' + (n.pinned ? ' on' : '');
    pin.textContent = n.pinned ? '📌' : '📍';
    pin.title = n.pinned ? 'Unpin' : 'Pin to top';
    pin.setAttribute('aria-label', n.pinned ? 'Unpin note' : 'Pin note');
    pin.onclick = function (e) { if (e) e.stopPropagation(); notesTogglePin(n.id); };
    ctl.appendChild(done); ctl.appendChild(pin);
    item.appendChild(t); item.appendChild(s); item.appendChild(w); item.appendChild(ctl);
    item.onclick = function () { notesSelect(n.id); };
    box.appendChild(item);
  });
}
function notesSaveCurrent() {
  if (NOTES_SEL) notesEdit(true);
}
function notesSelect(id) {
  notesSaveCurrent();
  NOTES_SEL = id || '';
  notesSet(NOTES_KEY_SEL, NOTES_SEL);
  var n = notesFind(NOTES_SEL);
  var ti = document.getElementById('noteTitle'), bo = document.getElementById('noteBody');
  if (ti) ti.value = n ? (n.title || '') : '';
  if (bo) bo.value = n ? (n.body || '') : '';
  notesCount('noteMeta', bo ? bo.value : '');
  notesRenderList();
}
function notesEdit(skipSort) {
  if (!NOTES_SEL) return;
  var list = notesLoadList();
  var n = list.filter(function (x) { return x.id === NOTES_SEL; })[0];
  if (!n) return;
  var ti = document.getElementById('noteTitle'), bo = document.getElementById('noteBody');
  n.title = ti ? ti.value : n.title;
  n.body = bo ? bo.value : n.body;
  n.updated = new Date().toISOString();
  notesSet(NOTES_KEY_LIST, JSON.stringify(list));
  notesCount('noteMeta', n.body);
  clearTimeout(NOTES_LIST_TIMER);
  // don't re-sort the list under the cursor while you're still typing
  NOTES_LIST_TIMER = setTimeout(function () { notesRenderList(); notesCount('noteMeta', n.body); }, skipSort ? 0 : 700);
}
function notesNew() {
  notesSaveCurrent();
  var list = notesLoadList();
  var n = { id: 'n' + Date.now() + '-' + Math.floor(Math.random() * 1000), title: '', body: '', updated: new Date().toISOString() };
  list.push(n);
  notesSet(NOTES_KEY_LIST, JSON.stringify(list));
  notesView('list');
  notesSelect(n.id);
  var ti = document.getElementById('noteTitle');
  if (ti) ti.focus();
  msgOk('New note — give it a title');
}
function notesDelete() {
  if (!NOTES_SEL) { msgFail('No note selected'); return; }
  var n = notesFind(NOTES_SEL);
  if (!n) return;
  if (!confirm('Delete "' + ((n.title || '').trim() || 'untitled') + '"? This cannot be undone.')) return;
  var list = notesLoadList().filter(function (x) { return x.id !== NOTES_SEL; });
  notesSet(NOTES_KEY_LIST, JSON.stringify(list));
  NOTES_SEL = '';
  notesSet(NOTES_KEY_SEL, '');
  var ti = document.getElementById('noteTitle'), bo = document.getElementById('noteBody');
  if (ti) ti.value = '';
  if (bo) bo.value = '';
  notesCount('noteMeta', '');
  notesRenderList();
  msgOk('Note deleted');
}

/* ── pin + done + export ── */
function notesTogglePin(id) {
  if (!id) return;
  var list = notesLoadList();
  var n = list.filter(function (x) { return x.id === id; })[0];
  if (!n) return;
  n.pinned = !n.pinned;
  notesSet(NOTES_KEY_LIST, JSON.stringify(list));
  notesRenderList();
  msgOk(n.pinned ? 'Pinned to top' : 'Unpinned');
}
function notesToggleDone(id) {
  if (!id) return;
  var list = notesLoadList();
  var n = list.filter(function (x) { return x.id === id; })[0];
  if (!n) return;
  n.done = !n.done;
  n.doneAt = n.done ? new Date().toISOString() : '';
  notesSet(NOTES_KEY_LIST, JSON.stringify(list));
  notesRenderList();
  msgOk(n.done ? 'Marked done ✓' : 'Reopened');
}
function notesExport() {
  var list = notesLoadList();
  if (!list.length) { msgFail('No notes to export'); return; }
  var out = ['# Fardin — Private Notes', '', 'Exported ' + new Date().toLocaleString('en-GB') +
    ' · ' + list.length + ' note(s)', ''];
  list.forEach(function (n, i) {
    var title = (n.title || '').trim() || 'Untitled';
    var flags = [];
    if (n.pinned) flags.push('📌 pinned');
    if (n.done) flags.push('✅ done' + (n.doneAt ? ' (' + notesWhen(n.doneAt) + ')' : ''));
    out.push('## ' + title);
    out.push(flags.length ? '_' + flags.join(' · ') + '_ · updated ' + notesWhen(n.updated) : '_updated ' + notesWhen(n.updated) + '_');
    out.push('');
    out.push((n.body || '').trim());
    out.push('');
    out.push('---');
    out.push('');
  });
  var blob = new Blob([out.join('\n')], { type: 'text/markdown;charset=utf-8' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = 'fardin-notes.md';
  document.body.appendChild(a);
  a.click();
  setTimeout(function () { URL.revokeObjectURL(url); document.body.removeChild(a); }, 800);
  msgOk('Notes exported as fardin-notes.md');
}

/* ── passphrase handling ── */
function notesPassValue() {
  var el = document.getElementById('notesPass');
  return el ? (el.value || '') : '';
}
function notesRememberPass() {
  var on = document.getElementById('notesRemember');
  if (on && on.checked) {
    var v = notesPassValue();
    if (v) notesSet(NOTES_KEY_PASS, v);
    msgOk('Passphrase will be remembered in this browser');
  } else {
    notesSet(NOTES_KEY_PASS, '');
    msgOk('Passphrase will not be remembered');
  }
}
function notesForgetPass() {
  notesSet(NOTES_KEY_PASS, '');
  var el = document.getElementById('notesPass'), cb = document.getElementById('notesRemember');
  if (el) el.value = '';
  if (cb) cb.checked = false;
  msgOk('Passphrase forgotten');
}

/* ── base64 + WebCrypto (AES-GCM 256, PBKDF2-SHA256 150k) ── */
function notesB64(buf) {
  var b = new Uint8Array(buf), s = '';
  for (var i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
  return btoa(s);
}
function notesUnb64(str) {
  var bin = atob(str), out = new Uint8Array(bin.length);
  for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
async function notesKey(pass, salt, usage) {
  var km = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt, iterations: 150000, hash: 'SHA-256' },
    km, { name: 'AES-GCM', length: 256 }, false, [usage]
  );
}
async function notesEncrypt(plain, pass) {
  var salt = crypto.getRandomValues(new Uint8Array(16));
  var iv = crypto.getRandomValues(new Uint8Array(12));
  var key = await notesKey(pass, salt, 'encrypt');
  var ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, key, new TextEncoder().encode(plain));
  return { v: 1, alg: 'PBKDF2-SHA256/150000+AES-GCM-256', salt: notesB64(salt), iv: notesB64(iv), data: notesB64(ct) };
}
async function notesDecrypt(obj, pass) {
  var key = await notesKey(pass, notesUnb64(obj.salt), 'decrypt');
  var pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: notesUnb64(obj.iv) }, key, notesUnb64(obj.data));
  return new TextDecoder().decode(pt);
}

/* ── GitHub backup (ciphertext only) ── */
function notesPaintSync() {
  var el = document.getElementById('notesSyncStatus');
  if (!el) return;
  var m = notesMetaGet(), parts = [];
  if (m.savedAt) parts.push('saved to GitHub ' + notesWhen(m.savedAt) + ' (' + (m.bytes || '?') + ' bytes encrypted)');
  if (m.loadedAt) parts.push('loaded from GitHub ' + notesWhen(m.loadedAt));
  if (!parts.length) parts.push('no GitHub backup yet — your notes live in this browser only');
  el.textContent = '// ' + parts.join(' · ');
}
async function notesPush() {
  var pass = notesPassValue().trim();
  if (!pass) { msgFail('Type a passphrase first'); var p = document.getElementById('notesPass'); if (p) p.focus(); return; }
  if (pass.length < 6) { msgFail('Use at least 6 characters for the passphrase'); return; }
  if (!getPat()) { msgFail('Save your GitHub PAT first (left sidebar)'); return; }
  notesSaveCurrent();
  var payload = JSON.stringify({
    pad: notesLS(NOTES_KEY_PAD, ''),
    notes: notesLoadList(),
    savedAt: new Date().toISOString()
  });
  showLoading();
  try {
    var body = JSON.stringify(await notesEncrypt(payload, pass), null, 2);
    var ok = await githubCommit(NOTES_FILE, body, 'admin(notes): encrypted notes backup');
    hideLoading();
    if (!ok) { msgFail('Commit failed — check your PAT'); return; }
    if (document.getElementById('notesRemember').checked) notesSet(NOTES_KEY_PASS, pass);
    notesSetMeta('savedAt', new Date().toISOString());
    notesSetMeta('bytes', body.length);
    notesPaintSync();
    msgOk('Encrypted notes saved to ' + NOTES_FILE);
  } catch (e) {
    hideLoading();
    msgFail('Encryption failed: ' + ((e && e.message) || e));
  }
}
async function notesPull() {
  var pass = notesPassValue().trim();
  if (!pass) { msgFail('Type your passphrase first'); return; }
  if (!getPat()) { msgFail('Save your GitHub PAT first (left sidebar)'); return; }
  var hasLocal = (notesLS(NOTES_KEY_PAD, '') || '').trim() || notesLoadList().length;
  if (hasLocal && !confirm('This replaces the notes in this browser with the GitHub copy. Continue?')) return;
  showLoading();
  try {
    var file = await githubFetch(NOTES_FILE);
    if (!file || !file.content) { hideLoading(); msgFail('No ' + NOTES_FILE + ' in the repo yet'); return; }
    var obj = JSON.parse(decodeURIComponent(escape(atob(String(file.content).replace(/\s/g, '')))));
    var plain;
    try { plain = await notesDecrypt(obj, pass); }
    catch (e) { hideLoading(); msgFail('Wrong passphrase (or the file is damaged)'); return; }
    var data = JSON.parse(plain);
    if (typeof data.pad === 'string') notesSet(NOTES_KEY_PAD, data.pad);
    if (Array.isArray(data.notes)) notesSet(NOTES_KEY_LIST, JSON.stringify(data.notes));
    if (document.getElementById('notesRemember').checked) notesSet(NOTES_KEY_PASS, pass);
    notesSetMeta('loadedAt', new Date().toISOString());
    hideLoading();
    notesRestore();
    msgOk('Decrypted and loaded from GitHub');
  } catch (e) {
    hideLoading();
    msgFail('Could not read the backup: ' + ((e && e.message) || e));
  }
}

/* ── render on module open ── */
function notesRestore() {
  var pad = document.getElementById('notesPad');
  if (pad) pad.value = notesLS(NOTES_KEY_PAD, '');
  notesCount('notesPadCount', pad ? pad.value : '');
  notesView(notesLS(NOTES_KEY_VIEW, 'pad'));

  var pass = notesLS(NOTES_KEY_PASS, '');
  var pi = document.getElementById('notesPass'), cb = document.getElementById('notesRemember');
  if (pi && pass) pi.value = pass;
  if (cb) cb.checked = !!pass;

  var list = notesLoadList();
  var want = notesLS(NOTES_KEY_SEL, '');
  var sel = list.some(function (n) { return n.id === want; }) ? want : (list.length ? list[0].id : '');
  NOTES_SEL = '';
  notesSelect(sel);
  notesPaintSync();
}
function renderNotesTab() {
  notesRestore();
}


/* ── END ADMIN BLOCK ── */

/* ══════════════════════════════════════════════════════════════════════
   BOOT — the PIN gate. The PIN sits on a full-screen gate, so a correct
   PIN has to hide the gate as well as the PIN screen.
   ══════════════════════════════════════════════════════════════════════ */
function checkAdminPin() {
  var inputs = document.querySelectorAll('#adminPinScreen input');
  var pin = '';
  inputs.forEach(function (inp) { pin += inp.value; });

  if (pin !== ADMIN_PIN) {
    document.getElementById('adminPinError').style.display = 'block';
    inputs.forEach(function (inp) { inp.value = ''; });
    var first = document.getElementById('adminPinInput');
    if (first) first.focus();
    return;
  }

  document.getElementById('adminPinError').style.display = 'none';
  try {
    var rememberChk = document.getElementById('adminRememberPin');
    if (rememberChk && rememberChk.checked) localStorage.setItem('admin_pin_remembered', 'true');
    else localStorage.removeItem('admin_pin_remembered');
  } catch (e) {}
  document.getElementById('pinGate').style.display = 'none';
  document.getElementById('adminDashboard').style.display = 'block';
  paintPatStatus();
  initAdminGui();
}

// the ⏻ LOCK button: forget the "remember me" flag first, otherwise the
// reload would skip the PIN gate again
function lockAdmin() {
  try { localStorage.removeItem('admin_pin_remembered'); } catch (e) {}
  location.reload();
}

/* ══════════════════════════════════════════════════════════════════════
   EDIT module: top up what the ported selectEditCard() cannot know.

   Cards stopped carrying a `.back-genre` element, so the old prefill came
   back empty and every genre edit had to be typed by hand; the seasons /
   episodes fields also arrived with the site's emoji and stray spaces
   (which used to be committed back as a double space). Both are filled
   from the real data here, right after a card is picked.
   ══════════════════════════════════════════════════════════════════════ */
function fillEditExtras() {
  var id = _editId;
  if (!id) return;

  var genre = document.getElementById('adminEditGenre');
  if (genre && !genre.value.trim()) {
    var list = GENRE_BY_ID[id];
    if (list && list.length) genre.value = list.join(', ');
  }

  var clean = function (el, drop) {
    if (!el) return;
    // strip by codepoint: the site's emoji carry variation selectors the old
    // /[🌸📺]/ regex never matched, which is why "220" arrived as "📺 220".
    var v = el.value.replace(/[^\x20-\x7E]/g, '');
    if (drop) v = v.replace(drop, '');
    el.value = v.replace(/\s+/g, ' ').trim();
  };
  clean(document.getElementById('adminEditEps'), /Total Episodes:/i);
}

(function editExtraWire() {
  var box = document.getElementById('adminEditResults');
  if (!box) return;
  // capture phase: runs before the row's own onclick, the timeout after it
  box.addEventListener('click', function () { window.setTimeout(fillEditExtras, 0); }, true);
})();

/* ══════════════════════════════════════════════════════════════════════
   THE PAT VAULT — the sidebar keeps your GitHub token in this browser's
   localStorage (key 'gh_pat'), masked in a password field and only
   reachable behind the PIN. Nothing is ever committed.

   Flow that means you never memorise it: paste once → SAVE → then ⧉ COPY
   wherever you need it. 👁 SHOW reveals it, 🗑 FORGET wipes it.
   ══════════════════════════════════════════════════════════════════════ */
function patReveal() {
  var el = document.getElementById('adminPatInput');
  var lab = document.getElementById('patRevealLabel');
  if (!el) return;
  if (!el.value) {
    var stored = getPat();
    if (!stored) { msgFail('No PAT saved yet — paste it and press SAVE'); return; }
    el.value = stored;
  }
  var wasHidden = el.type === 'password';
  el.type = wasHidden ? 'text' : 'password';
  if (lab) lab.textContent = wasHidden ? 'HIDE' : 'SHOW';
}
/* one clipboard path for every ⧉ button in the panel (PAT, pad, note):
   modern API first, hidden-textarea fallback for older/insecure contexts. */
function adCopyFallback(text, what) {
  var ta = document.createElement('textarea');
  ta.value = text;
  ta.style.cssText = 'position:fixed;left:-9999px;top:0;';
  document.body.appendChild(ta);
  ta.select();
  var ok = false;
  try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
  document.body.removeChild(ta);
  if (ok) msgOk(what + ' copied to clipboard');
  else msgFail('Copy blocked — select the text and copy it by hand');
}
function adCopy(text, what) {
  what = what || 'Text';
  text = text == null ? '' : String(text);
  if (!text.trim()) { msgFail('Nothing to copy — it is empty'); return; }
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(text).then(
      function () { msgOk(what + ' copied to clipboard'); },
      function () { adCopyFallback(text, what); }
    );
  } else {
    adCopyFallback(text, what);
  }
}
/* ⧉ COPY on every admin result row (WATCH / READ / EDIT / AWARDS):
   copies "#id | title" and never selects the card. */
function adResultCopyBtn(id, title) {
  var b = document.createElement('button');
  b.type = 'button';
  b.className = 'ad-result-copy';
  b.textContent = '⧉';
  b.title = 'Copy #' + id + ' + title';
  b.setAttribute('aria-label', 'Copy number and title');
  b.onclick = function (e) {
    if (e) e.stopPropagation();
    adCopy('#' + id + ' | ' + (title || ''), 'Row');
  };
  return b;
}
function patCopy() {
  var v = (getPat() || '').trim();
  if (!v) { msgFail('No PAT saved yet — paste it and press SAVE'); return; }
  adCopy(v, 'PAT');
}
function notesCopyPad() {
  var el = document.getElementById('notesPad');
  adCopy(el ? el.value : '', 'Pad');
}
function notesCopyNote() {
  var t = document.getElementById('noteTitle');
  var b = document.getElementById('noteBody');
  if (!t || !b) return;
  if (!NOTES_SEL && !(t.value || '').trim() && !(b.value || '').trim()) { msgFail('No note selected'); return; }
  var head = (t.value || '').trim();
  adCopy((head ? head + '\n\n' : '') + (b.value || ''), 'Note');
}
function patForget() {
  if (!confirm('Forget the saved GitHub PAT in this browser?')) return;
  var el = document.getElementById('adminPatInput');
  if (el) { el.value = ''; el.type = 'password'; }
  var lab = document.getElementById('patRevealLabel');
  if (lab) lab.textContent = 'SHOW';
  paintPatStatus();
  msgOk('PAT forgotten in this browser');
}

/* ══════════════════════════════════════════════════════════════════════
   DAY / NIGHT — one switch, remembered in this browser.

   admin.css keeps every colour behind variables (--bg, --surface,
   --g-rgb, …), so flipping data-theme on <html> repaints the whole
   panel. The tiny inline script in admin.html's head applies it before
   the first paint, so night mode never flashes white.
   ══════════════════════════════════════════════════════════════════════ */
var ADMIN_THEME_KEY = 'fardin.admin.theme';

function adminThemeApply(theme) {
  var dark = theme === 'dark';
  var root = document.documentElement;
  /* Kill transitions for the swap itself: without this every colour on the
     page animates (and elements on hidden tabs can get stuck mid-way). */
  root.classList.add('ad-no-transition');
  root.setAttribute('data-theme', dark ? 'dark' : 'light');
  try { localStorage.setItem(ADMIN_THEME_KEY, dark ? 'dark' : 'light'); } catch (e) {}
  var btn = document.getElementById('themeBtn');
  if (btn) btn.textContent = dark ? '☀️ DAY MODE' : '🌙 NIGHT MODE';
  var meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', dark ? '#040705' : '#eef2ef');
  void root.offsetWidth; /* force the repaint before transitions come back */
  requestAnimationFrame(function () {
    requestAnimationFrame(function () {
      root.classList.remove('ad-no-transition');
    });
  });
}
function adminThemeNow() {
  return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
}
function toggleAdminTheme() {
  var next = adminThemeNow() === 'dark' ? 'light' : 'dark';
  adminThemeApply(next);
  msgOk(next === 'dark' ? 'Night mode on' : 'Day mode on');
}
adminThemeApply(localStorage.getItem(ADMIN_THEME_KEY) === 'dark' ? 'dark' : 'light');

/* ══════════════════════════════════════════════════════════════════════
   PANEL FONT — the ▾ in the top bar. Sets data-font on <html>, which
   admin.css turns into --font-ui (and --mono, which every panel rule
   reads), so one pick restyles the whole panel. Remembered per browser.
   The wordmark uses --font-display instead, so it keeps its own flavour.
   ══════════════════════════════════════════════════════════════════════ */
var ADMIN_FONT_KEY = 'fardin.admin.font';
var ADMIN_FONTS = {
  jetbrains: 'JetBrains Mono',
  spacemono: 'Space Mono',
  plex: 'IBM Plex Mono',
  chakra: 'Chakra Petch',
  grotesk: 'Space Grotesk'
};

function adminFontApply(font) {
  if (!ADMIN_FONTS[font]) font = 'jetbrains';
  document.documentElement.setAttribute('data-font', font);
  try { localStorage.setItem(ADMIN_FONT_KEY, font); } catch (e) {}
  var pick = document.getElementById('fontPick');
  if (pick && pick.value !== font) pick.value = font;
  // make sure the family is actually fetched before we claim it is on
  if (document.fonts && document.fonts.load) {
    document.fonts.load('12px "' + ADMIN_FONTS[font] + '"').catch(function () {});
  }
  return font;
}
function adminFontNow() {
  var f = document.documentElement.getAttribute('data-font');
  return ADMIN_FONTS[f] ? f : 'jetbrains';
}
function adminFontPick(value) {
  var font = adminFontApply(value);
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(function () {
      var loaded = !document.fonts.check || document.fonts.check('12px "' + ADMIN_FONTS[font] + '"');
      msgOk(loaded ? 'Font: ' + ADMIN_FONTS[font] : 'Font set — webfont blocked, using local fallback');
    });
    return;
  }
  msgOk('Font: ' + ADMIN_FONTS[font]);
}
adminFontApply(adminFontNow());

/* ══════════════════════════════════════════════════════════════════════
   AVATARS module. The ported switchAdminTab() only knows the original
   tabs, so the sidebar button asks for the picker explicitly instead of
   guessing (see admin.html).
   ══════════════════════════════════════════════════════════════════════ */
function renderAvatarsTab() {
  renderAvatarPicker();
}

/* ══════════════════════════════════════════════════════════════════════
   LOGO module — a picture and/or wordmark for the console. Applied to the
   header, the PIN gate, the tab title and the favicon. Browser-local:
   the repo never sees it, so the public site gains no weight.
   ══════════════════════════════════════════════════════════════════════ */
var ADMIN_LOGO_KEY = 'fardin.admin.logo';
var ADMIN_LOGO_DEFAULT = {
  main: 'ROOT@FARDIN',
  sub: 'ADMIN CONTROL · v3.0',
  icon: '',
  src: ''
};
var ADMIN_LOGO = { main: ADMIN_LOGO_DEFAULT.main, sub: ADMIN_LOGO_DEFAULT.sub, icon: '', src: '' };

function adEsc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

function adminLogoLoad() {
  var cfg = { main: ADMIN_LOGO_DEFAULT.main, sub: ADMIN_LOGO_DEFAULT.sub, icon: '', src: '' };
  try {
    var raw = localStorage.getItem(ADMIN_LOGO_KEY);
    if (raw) {
      var o = JSON.parse(raw) || {};
      cfg.main = String(o.main == null ? cfg.main : o.main).slice(0, 28) || ADMIN_LOGO_DEFAULT.main;
      cfg.sub = String(o.sub == null ? cfg.sub : o.sub).slice(0, 70);
      cfg.icon = String(o.icon == null ? '' : o.icon).slice(0, 4);
      cfg.src = /^data:image\/(png|jpeg|webp|gif);base64,/i.test(String(o.src || '')) ? String(o.src) : '';
    }
  } catch (e) {}
  return cfg;
}

function adminLogoApply(cfg) {
  cfg = cfg || adminLogoLoad();
  ADMIN_LOGO = cfg;

  var main = document.querySelector('.ad-brand-main');
  if (main) {
    main.innerHTML =
      (cfg.src ? '<img src="' + cfg.src + '" alt="" style="height:24px;width:auto;max-width:130px;object-fit:contain;vertical-align:middle;margin-right:9px;border-radius:6px;">' : '') +
      (cfg.icon ? '<span style="margin-right:6px;">' + adEsc(cfg.icon) + '</span>' : '') +
      adEsc(cfg.main);
  }
  var sub = document.querySelector('.ad-brand-sub');
  if (sub) { sub.textContent = cfg.sub; sub.style.display = cfg.sub ? '' : 'none'; }

  var gate = document.querySelector('.ad-gate-logo');
  if (gate) {
    if (cfg.src) gate.innerHTML = '<img src="' + cfg.src + '" alt="" style="height:46px;width:auto;max-width:190px;object-fit:contain;">';
    else if (cfg.main === ADMIN_LOGO_DEFAULT.main && cfg.sub === ADMIN_LOGO_DEFAULT.sub && !cfg.icon) gate.textContent = 'SECURE';
    else gate.textContent = (cfg.icon ? cfg.icon + ' ' : '') + cfg.main;
  }

  var icon = document.querySelector('link[rel="icon"]');
  if (icon) icon.href = cfg.src || 'logo.png';

  document.title = (cfg.main || 'ADMIN') + ' ~ ADMIN';

  var note = document.getElementById('adLogoImgNote');
  if (note) note.textContent = cfg.src ? 'picture loaded ✓' : 'no picture — wordmark only';
  adLogoPreview();
}

function adLogoPreview() {
  var box = document.getElementById('adLogoPreview');
  if (!box) return;
  var mainEl = document.getElementById('adLogoMain');
  var subEl = document.getElementById('adLogoSub');
  var iconEl = document.getElementById('adLogoIcon');
  var main = mainEl ? mainEl.value : ADMIN_LOGO.main;
  var sub = subEl ? subEl.value : ADMIN_LOGO.sub;
  var icon = iconEl ? iconEl.value : ADMIN_LOGO.icon;
  var src = ADMIN_LOGO.src;
  box.innerHTML =
    (src
      ? '<img src="' + src + '" alt="" style="height:54px;width:auto;max-width:180px;object-fit:contain;border-radius:8px;flex:0 0 auto;">'
      : '<div style="flex:0 0 auto;width:54px;height:54px;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:26px;background:var(--g-faint);border:1px solid var(--g-line);">' + adEsc(icon || '🎨') + '</div>') +
    '<div style="min-width:0;">' +
      '<div style="font-family:var(--font-display),sans-serif;font-size:20px;letter-spacing:1px;color:var(--g-ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' +
        adEsc(main || ADMIN_LOGO_DEFAULT.main) + '</div>' +
      '<div style="font-size:10px;letter-spacing:2.4px;color:var(--g-dim);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' +
        adEsc(sub || '') + '</div>' +
    '</div>';
}

function renderLogoTab() {
  var main = document.getElementById('adLogoMain');
  var sub = document.getElementById('adLogoSub');
  var icon = document.getElementById('adLogoIcon');
  if (main) main.value = ADMIN_LOGO.main;
  if (sub) sub.value = ADMIN_LOGO.sub;
  if (icon) icon.value = ADMIN_LOGO.icon;
  adLogoPreview();
}

function adLogoPickFile() {
  var f = document.getElementById('adLogoFile');
  if (f) f.click();
}

function adLogoFileChosen(input) {
  var file = input && input.files && input.files[0];
  if (!file) return;
  if (!/^image\//i.test(file.type)) { msgFail('That file is not an image'); input.value = ''; return; }
  var reader = new FileReader();
  reader.onload = function () {
    var img = new Image();
    img.onload = function () {
      var max = 512;
      var scale = Math.min(1, max / Math.max(img.width || 1, img.height || 1));
      var w = Math.max(1, Math.round((img.width || 1) * scale));
      var h = Math.max(1, Math.round((img.height || 1) * scale));
      var c = document.createElement('canvas');
      c.width = w; c.height = h;
      var ctx = c.getContext('2d');
      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      try {
        ADMIN_LOGO.src = c.toDataURL('image/png');
      } catch (e) {
        msgFail('Could not read that picture');
        return;
      }
      adLogoPreview();
      var note = document.getElementById('adLogoImgNote');
      if (note) note.textContent = 'picture loaded — press ▶ APPLY LOGO';
      msgOk('Picture loaded (' + w + '×' + h + ')');
    };
    img.onerror = function () { msgFail('Could not open that picture'); };
    img.src = String(reader.result || '');
  };
  reader.onerror = function () { msgFail('Could not read that file'); };
  reader.readAsDataURL(file);
  input.value = '';
}

function adLogoDropImage() {
  ADMIN_LOGO.src = '';
  adLogoPreview();
  var note = document.getElementById('adLogoImgNote');
  if (note) note.textContent = 'no picture — wordmark only (press APPLY to save)';
}

function adLogoSave() {
  var main = String((document.getElementById('adLogoMain') || {}).value || '').trim();
  var sub = String((document.getElementById('adLogoSub') || {}).value || '').trim();
  var icon = String((document.getElementById('adLogoIcon') || {}).value || '').trim();
  var cfg = {
    main: main.slice(0, 28) || ADMIN_LOGO_DEFAULT.main,
    sub: sub.slice(0, 70),
    icon: icon.slice(0, 4),
    src: ADMIN_LOGO.src || ''
  };
  try {
    localStorage.setItem(ADMIN_LOGO_KEY, JSON.stringify(cfg));
  } catch (e) {
    msgFail('Could not save — the picture may be too big for this browser');
    return;
  }
  adminLogoApply(cfg);
  msgOk('Logo applied');
}

function adLogoReset() {
  try { localStorage.removeItem(ADMIN_LOGO_KEY); } catch (e) {}
  adminLogoApply({ main: ADMIN_LOGO_DEFAULT.main, sub: ADMIN_LOGO_DEFAULT.sub, icon: '', src: '' });
  renderLogoTab();
  msgOk('Back to ROOT@FARDIN');
}

ADMIN_LOGO = adminLogoLoad();
adminLogoApply(ADMIN_LOGO);

/* ============================================================
   💬 HOT TAKES — ADMIN REPLY (avatar + badge)
   script.js reads the same localStorage key, so a pick here is live
   in this browser at once. APPLY also rewrites the admin replies
   already stored in Supabase — that is what visitors actually render.
   ============================================================ */
var AD_REPLY_KEY = 'fardin.admin.reply';
var AD_SUPA_URL = 'https://ldzlefdklcgvqcbqibtt.supabase.co';
var AD_SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxkemxlZmRrbGNndnFjYnFpYnR0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEwMzk1OTAsImV4cCI6MjA5NjYxNTU5MH0.X3TGuLIpjrnPXMgCv4ZKIIjB6pItPgkdebf4JPdhuYs';
var AD_REPLY_DEFAULT = { avatar: 'site:admin', badge: 'shield-glow' };
var AD_REPLY = { avatar: AD_REPLY_DEFAULT.avatar, badge: AD_REPLY_DEFAULT.badge };

var AD_REPLY_PRESETS = {
  chibi: { bg: 'radial-gradient(circle at 32% 28%, #fbcfe8, #be185d 82%)', border: 'rgba(252,231,243,0.85)', svg: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9.6" fill="#9d174d"></circle><circle cx="12" cy="13.8" r="6.6" fill="#ffe9f2"></circle><path d="M5 11.5C5.6 8.6 8.4 6.9 12 6.9s6.4 1.7 7 4.6c-1.2 1.2-2.4 1.4-3.4 0.6-0.9-0.7-1.2-1.6-2.1-2.2-1.1 0.7-1.6 1.6-2.6 2.2-1 0.6-2.2 0.4-3.5-0.6z" fill="#7f1d4d"></path><circle cx="9.5" cy="14.6" r="1.2" fill="#4a044e"></circle><circle cx="14.5" cy="14.6" r="1.2" fill="#4a044e"></circle><path d="M10.9 17.2c0.8 0.7 1.4 0.7 2.2 0" stroke="#4a044e" stroke-width="1" fill="none" stroke-linecap="round"></path></svg>' },
  neko: { bg: 'radial-gradient(circle at 32% 28%, #fbcfe8, #db2777 80%)', border: 'rgba(251,207,232,0.85)', svg: '<svg viewBox="0 0 24 24"><path d="M5.2 7.2 L4.4 2.6 L8.7 4.7 Z" fill="#fff0f6"></path><path d="M18.8 7.2 L19.6 2.6 L15.3 4.7 Z" fill="#fff0f6"></path><circle cx="12" cy="12.6" r="7.6" fill="#fff0f6"></circle><circle cx="9.3" cy="11.6" r="1.2" fill="#831843"></circle><circle cx="14.7" cy="11.6" r="1.2" fill="#831843"></circle><path d="M12 14.6l-1.2 1.3h2.4z" fill="#831843"></path></svg>' },
  sakura: { bg: 'radial-gradient(circle at 32% 28%, #ffe9f4, #ff8fb8 80%)', border: 'rgba(255,143,184,0.95)', svg: '<svg viewBox="0 0 24 24"><g transform="translate(12 12)" fill="#be185d"><ellipse cx="0" cy="-5" rx="3.1" ry="5"></ellipse><ellipse cx="0" cy="-5" rx="3.1" ry="5" transform="rotate(72)"></ellipse><ellipse cx="0" cy="-5" rx="3.1" ry="5" transform="rotate(144)"></ellipse><ellipse cx="0" cy="-5" rx="3.1" ry="5" transform="rotate(216)"></ellipse><ellipse cx="0" cy="-5" rx="3.1" ry="5" transform="rotate(288)"></ellipse></g><circle cx="12" cy="12" r="1.9" fill="#ffe4ef"></circle></svg>' },
  kitsune: { bg: 'radial-gradient(circle at 32% 28%, #fdba74, #ea580c 78%)', border: 'rgba(254,215,170,0.85)', svg: '<svg viewBox="0 0 24 24"><path d="M4 3 L8.2 6.2 L15.8 6.2 L20 3 L19.5 10.2 C19.5 15.4 16.1 19.5 12 19.5 C7.9 19.5 4.5 15.4 4.5 10.2 Z" fill="#fff7ed"></path><circle cx="9.2" cy="11.2" r="1.3" fill="#7c2d12"></circle><circle cx="14.8" cy="11.2" r="1.3" fill="#7c2d12"></circle><path d="M12 14.4l-1.4 1.5h2.8z" fill="#7c2d12"></path></svg>' },
  sharingan: { bg: 'radial-gradient(circle at 32% 28%, #ff8fb8, #ff2d55 75%)', border: 'rgba(255,214,232,0.75)', svg: '<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="45" fill="#8b0000" stroke="#ff2200" stroke-width="3"></circle><circle cx="50" cy="50" r="15" fill="#1a0000"></circle><circle cx="50" cy="28" r="7" fill="#1a0000"></circle><circle cx="69" cy="61" r="7" fill="#1a0000"></circle><circle cx="31" cy="61" r="7" fill="#1a0000"></circle><circle cx="50" cy="50" r="6" fill="#ff2200"></circle></svg>' },
  rinnegan: { bg: 'radial-gradient(circle at 32% 28%, #c4b5fd, #5b21b6 78%)', border: 'rgba(221,214,254,0.8)', svg: '<svg viewBox="0 0 100 100" fill="none" stroke="#ede9fe" stroke-width="6"><circle cx="50" cy="50" r="40"></circle><circle cx="50" cy="50" r="24"></circle><circle cx="50" cy="50" r="9" fill="#ede9fe" stroke="none"></circle></svg>' },
  samurai: { bg: 'radial-gradient(circle at 32% 28%, #60a5fa, #1e3a8a 80%)', border: 'rgba(191,219,254,0.85)', svg: '<svg viewBox="0 0 24 24"><path d="M12 2.6c-5 0-8.6 3.7-8.6 8.6 0 1.9 0.5 3.4 1.3 4.6h14.6c0.8-1.2 1.3-2.7 1.3-4.6 0-4.9-3.6-8.6-8.6-8.6z" fill="#f8faff"></path><path d="M12 2.6c-1.3 0-2.5 0.2-3.6 0.7L12 9.4l3.6-6.1c-1.1-0.5-2.3-0.7-3.6-0.7z" fill="#a5b4fc"></path><path d="M4.7 15.8h14.6l-1.9 4.2a1 1 0 0 1-0.9 0.6H7.5a1 1 0 0 1-0.9-0.6z" fill="#4f46e5"></path><rect x="10.7" y="15.8" width="2.6" height="4.8" rx="0.7" fill="#eef2ff"></rect></svg>' },
  ramen: { bg: 'radial-gradient(circle at 32% 28%, #fde68a, #d97706 80%)', border: 'rgba(253,230,138,0.85)', svg: '<svg viewBox="0 0 24 24"><path d="M3 11.2h18c0 5.1-4 8.8-9 8.8s-9-3.7-9-8.8z" fill="#fde68a"></path><path d="M4.6 12.6h14.8c-0.4 3.6-3.5 6-7.4 6s-7-2.4-7.4-6z" fill="#7c2d12"></path><path d="M8.2 9c1-1.3 1-2.4 0-3.7M12 8.4c1.2-1.5 1.2-2.9 0-4.4M15.8 9c1-1.3 1-2.4 0-3.7" stroke="#fff7ed" stroke-width="1.4" fill="none" stroke-linecap="round"></path></svg>' },
  person: { bg: 'radial-gradient(circle at 32% 28%, #a78bfa, #6d28d9 80%)', border: 'rgba(196,181,253,0.7)', svg: '<svg viewBox="0 0 24 24" fill="#f3e8ff"><circle cx="12" cy="8" r="4.2"></circle><path d="M3.8 21a8.2 8.2 0 0 1 16.4 0z"></path></svg>' }
};

var AD_REPLY_AVATARS = [
  { id: 'site:admin', label: 'SITE LOGO' },
  { id: 'site:photo', label: 'MY PHOTO' },
  { id: 'preset:chibi', label: 'CHIBI' },
  { id: 'preset:neko', label: 'NEKO' },
  { id: 'preset:sakura', label: 'SAKURA' },
  { id: 'preset:kitsune', label: 'KITSUNE' },
  { id: 'preset:sharingan', label: 'SHARINGAN' },
  { id: 'preset:rinnegan', label: 'RINNEGAN' },
  { id: 'preset:samurai', label: 'SAMURAI' },
  { id: 'preset:ramen', label: 'RAMEN' },
  { id: 'preset:person', label: 'YOU' }
];

var AD_REPLY_BADGES = {
  'shield': '<svg width="16" height="16" viewBox="0 0 64 64" fill="none" style="vertical-align:middle;"><path d="M32 6L8 18v12c0 18 10 28 24 28s24-10 24-28V18L32 6z" fill="#1a1a2e" stroke="#ffd700" stroke-width="3"/><path d="M22 32l7 7 13-13" stroke="#ffd700" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  'shield-glow': '<svg width="16" height="16" viewBox="0 0 64 64" fill="none" style="vertical-align:middle;filter:drop-shadow(0 0 3px rgba(255,215,0,0.75));"><path d="M32 6L8 18v12c0 18 10 28 24 28s24-10 24-28V18L32 6z" fill="#1a1a2e" stroke="#ffd700" stroke-width="3"/><path d="M22 32l7 7 13-13" stroke="#ffd700" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  'coin-gold': '<svg width="16" height="16" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10.5" fill="#ffd700"/><circle cx="12" cy="12" r="10.5" fill="none" stroke="#b8860b" stroke-width="1"/><text x="12" y="16.4" text-anchor="middle" font-size="13" font-weight="900" font-family="Arial,sans-serif" fill="#1a1a2e">F</text></svg>',
  'coin-blue': '<svg width="16" height="16" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10.5" fill="#1877F2"/><text x="12" y="16.4" text-anchor="middle" font-size="13" font-weight="900" font-family="Arial,sans-serif" fill="#fff">F</text></svg>',
  'check-gold': '<svg width="16" height="16" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10.5" fill="#ffd700"/><path d="M7.4 12.3l3.1 3.2 6.1-6.6" fill="none" stroke="#1a1a2e" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  'tick-blue': '<svg width="15" height="15" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="11" fill="#1877F2"/><path d="M7 12.4l3.2 3.2L17 8.6" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  'star': '<svg width="16" height="16" viewBox="0 0 24 24"><path d="M12 2.6l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.4l-5.8 3.1 1.1-6.5L2.6 9.4l6.5-.9z" fill="#ffd700"/></svg>',
  'crown': '<span style="font-size:13px;line-height:1;">\uD83D\uDC51</span>',
  'flame': '<span style="font-size:13px;line-height:1;">\uD83D\uDD25</span>',
  'bolt': '<span style="font-size:13px;line-height:1;">\u26A1</span>',
  'sparkle': '<span style="font-size:13px;line-height:1;">\u2728</span>',
  'gem': '<span style="font-size:13px;line-height:1;">\uD83D\uDC8E</span>',
  'sakura': '<span style="font-size:13px;line-height:1;">\uD83C\uDF38</span>'
};
var AD_REPLY_BADGE_ORDER = ['shield-glow', 'shield', 'coin-gold', 'coin-blue', 'check-gold', 'tick-blue', 'star', 'crown', 'flame', 'bolt', 'sparkle', 'gem', 'sakura'];
var AD_REPLY_BADGE_LABEL = { 'shield-glow': 'SHIELD \u2728', 'shield': 'SHIELD', 'coin-gold': 'GOLD F', 'coin-blue': 'BLUE F', 'check-gold': 'CHECK', 'tick-blue': 'BLUE \u2713', 'star': 'STAR', 'crown': 'CROWN', 'flame': 'FIRE', 'bolt': 'BOLT', 'sparkle': 'SPARKLE', 'gem': 'GEM', 'sakura': 'SAKURA' };

function adReplyLoad() {
  var cfg = { avatar: AD_REPLY_DEFAULT.avatar, badge: AD_REPLY_DEFAULT.badge };
  try {
    var o = JSON.parse(localStorage.getItem(AD_REPLY_KEY) || '{}') || {};
    if (o.avatar) cfg.avatar = String(o.avatar);
    if (o.badge) cfg.badge = String(o.badge);
  } catch (e) {}
  if (!AD_REPLY_BADGES[cfg.badge]) cfg.badge = AD_REPLY_DEFAULT.badge;
  return cfg;
}

function adReplyAvatarHtml(id, size) {
  size = size || 40;
  var box = 'width:' + size + 'px;height:' + size + 'px;border-radius:50%;display:inline-flex;' +
    'align-items:center;justify-content:center;overflow:hidden;flex:0 0 auto;' +
    'border:1px solid rgba(199,125,255,0.5);';
  if (id === 'site:admin') {
    return '<span style="' + box + '" title="Site logo"><img src="admin-avatar.png" alt="" ' +
      'style="width:100%;height:100%;object-fit:cover;display:block;"></span>';
  }
  if (id === 'site:photo') {
    return '<span style="' + box + '" title="My photo"><img src="admin-photo.jpg" alt="" ' +
      'style="width:100%;height:100%;object-fit:cover;display:block;"></span>';
  }
  if (/^img:(https:|data:image\/)/i.test(String(id || ''))) {
    return '<span style="' + box + '" title="My picture"><img src="' + String(id).slice(4) + '" alt="" ' +
      'style="width:100%;height:100%;object-fit:cover;display:block;"></span>';
  }
  var pid = /^preset:/.test(id) ? id.slice(7) : '';
  var p = AD_REPLY_PRESETS[pid] || AD_REPLY_PRESETS.chibi;
  return '<span style="' + box + 'background:' + p.bg + ';border-color:' + p.border + ';">' + p.svg + '</span>';
}

function adReplyBadgeHtml(id) {
  return AD_REPLY_BADGES[id] || AD_REPLY_BADGES[AD_REPLY_DEFAULT.badge];
}

function adReplyPreview() {
  var box = document.getElementById('adReplyPreview');
  if (!box) return;
  box.innerHTML =
    adReplyAvatarHtml(AD_REPLY.avatar, 34) +
    '<span style="font-family:Orbitron,sans-serif;font-size:12px;font-weight:700;color:#00e5ff;letter-spacing:.5px;">Fardin</span>' +
    '<span style="display:inline-block;vertical-align:middle;margin-left:4px;line-height:0;">' +
      adReplyBadgeHtml(AD_REPLY.badge) + '</span>';
}

function renderReplyTab() {
  var wrap = document.getElementById('adReplyAvatars');
  if (wrap) {
    var list = AD_REPLY_AVATARS.slice();
    if (/^img:/.test(AD_REPLY.avatar)) list.unshift({ id: AD_REPLY.avatar, label: 'MY UPLOAD' });
    wrap.innerHTML = list.map(function (o) {
      var on = AD_REPLY.avatar === o.id;
      return '<button type="button" data-av="' + adEsc(o.id) + '" title="' + adEsc(o.label) + '" ' +
        'style="background:transparent;border:1px solid ' + (on ? '#ffd700' : 'var(--g-line)') + ';border-radius:12px;' +
        'padding:8px 10px 6px;display:flex;flex-direction:column;align-items:center;gap:5px;cursor:pointer;' +
        (on ? 'box-shadow:0 0 0 2px rgba(255,215,0,.28);' : '') + '">' +
        adReplyAvatarHtml(o.id, 38) +
        '<span style="font-size:8.5px;letter-spacing:.6px;color:' + (on ? '#ffd700' : 'var(--g-dim)') + ';">' + adEsc(o.label) + '</span>' +
      '</button>';
    }).join('');
    Array.prototype.forEach.call(wrap.querySelectorAll('[data-av]'), function (b) {
      b.addEventListener('click', function () { adReplyPickAvatar(b.getAttribute('data-av')); });
    });
  }

  var bw = document.getElementById('adReplyBadges');
  if (bw) {
    bw.innerHTML = AD_REPLY_BADGE_ORDER.map(function (id) {
      var on = AD_REPLY.badge === id;
      var lbl = AD_REPLY_BADGE_LABEL[id] || id;
      return '<button type="button" data-badge="' + id + '" title="' + adEsc(lbl) + '" ' +
        'style="background:transparent;border:1px solid ' + (on ? '#ffd700' : 'var(--g-line)') + ';border-radius:12px;' +
        'padding:9px 11px;display:flex;flex-direction:column;align-items:center;gap:6px;cursor:pointer;min-width:64px;' +
        (on ? 'box-shadow:0 0 0 2px rgba(255,215,0,.28);' : '') + '">' +
        '<span style="display:inline-flex;align-items:center;justify-content:center;height:16px;line-height:0;">' + adReplyBadgeHtml(id) + '</span>' +
        '<span style="font-size:8.5px;letter-spacing:.5px;color:' + (on ? '#ffd700' : 'var(--g-dim)') + ';">' + adEsc(lbl) + '</span>' +
      '</button>';
    }).join('');
    Array.prototype.forEach.call(bw.querySelectorAll('[data-badge]'), function (b) {
      b.addEventListener('click', function () { adReplyPickBadge(b.getAttribute('data-badge')); });
    });
  }

  adReplyPreview();
}

function adReplyPickAvatar(id) {
  AD_REPLY.avatar = String(id || AD_REPLY_DEFAULT.avatar);
  renderReplyTab();
  var note = document.getElementById('adReplyNote');
  if (note) note.textContent = 'picked — press APPLY TO SITE to keep it';
}

function adReplyPickBadge(id) {
  AD_REPLY.badge = AD_REPLY_BADGES[id] ? id : AD_REPLY_DEFAULT.badge;
  renderReplyTab();
  var note = document.getElementById('adReplyNote');
  if (note) note.textContent = 'picked — press APPLY TO SITE to keep it';
}

function adReplyPickFile() {
  var f = document.getElementById('adReplyFile');
  if (f) f.click();
}

function adReplyFileChosen(input) {
  var file = input && input.files && input.files[0];
  if (!file) return;
  if (!/^image\//i.test(file.type)) { msgFail('That file is not an image'); input.value = ''; return; }
  var reader = new FileReader();
  reader.onload = function () {
    var img = new Image();
    img.onload = function () {
      var max = 96;
      var scale = Math.min(1, max / Math.max(img.width || 1, img.height || 1));
      var w = Math.max(1, Math.round((img.width || 1) * scale));
      var h = Math.max(1, Math.round((img.height || 1) * scale));
      var c = document.createElement('canvas');
      c.width = w; c.height = h;
      var ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);
      var url = '';
      try { url = c.toDataURL('image/jpeg', 0.86); } catch (e) {}
      if (!url) { msgFail('Could not read that picture'); return; }
      AD_REPLY.avatar = 'img:' + url;
      renderReplyTab();
      var note = document.getElementById('adReplyNote');
      if (note) note.textContent = 'picture loaded (' + w + '\u00D7' + h + ') — press APPLY TO SITE';
      msgOk('Picture loaded');
    };
    img.onerror = function () { msgFail('Could not open that picture'); };
    img.src = String(reader.result || '');
  };
  reader.onerror = function () { msgFail('Could not read that file'); };
  reader.readAsDataURL(file);
  input.value = '';
}

function adReplyIsAdmin(r) {
  if (!r) return false;
  if (r.admin) return true;
  var n = String(r.userName || '').trim().toLowerCase();
  return !!n && n === 'fardin';
}

async function adReplyPushToSite() {
  var st = document.getElementById('adReplyStatus');
  function say(t) { if (st) st.textContent = t; }
  say('pushing to the site\u2026');
  try {
    var res = await fetch(AD_SUPA_URL + '/rest/v1/hot_takes?select=id,replies', {
      headers: { apikey: AD_SUPA_KEY, Authorization: 'Bearer ' + AD_SUPA_KEY }
    });
    if (!res.ok) throw new Error('read HTTP ' + res.status);
    var takes = await res.json();
    var takesChanged = 0, repliesChanged = 0;
    for (var i = 0; i < takes.length; i++) {
      var t = takes[i];
      if (!t || !Array.isArray(t.replies) || !t.replies.length) continue;
      var changed = false;
      var next = t.replies.map(function (r) {
        if (!adReplyIsAdmin(r)) return r;
        if (r.avatar === AD_REPLY.avatar && r.badge === AD_REPLY.badge) return r;
        changed = true;
        repliesChanged++;
        var copy = {};
        for (var k in r) if (Object.prototype.hasOwnProperty.call(r, k)) copy[k] = r[k];
        copy.avatar = AD_REPLY.avatar;
        copy.badge = AD_REPLY.badge;
        return copy;
      });
      if (!changed) continue;
      var up = await fetch(AD_SUPA_URL + '/rest/v1/hot_takes?id=eq.' + encodeURIComponent(t.id), {
        method: 'PATCH',
        headers: {
          apikey: AD_SUPA_KEY,
          Authorization: 'Bearer ' + AD_SUPA_KEY,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal'
        },
        body: JSON.stringify({ replies: next })
      });
      if (!up.ok) throw new Error('write HTTP ' + up.status);
      takesChanged++;
    }
    say('on the site \u2014 ' + repliesChanged + ' admin repl' + (repliesChanged === 1 ? 'y' : 'ies') +
        ' updated in ' + takesChanged + ' take' + (takesChanged === 1 ? '' : 's'));
    if (repliesChanged) msgOk('Site updated');
    else msgOk('Already matches the site');
  } catch (e) {
    say('site push failed: ' + ((e && e.message) || e) + ' \u2014 the choice still applies in this browser');
    msgFail('This browser only \u2014 the site push failed');
  }
}

async function adReplySave() {
  try {
    localStorage.setItem(AD_REPLY_KEY, JSON.stringify(AD_REPLY));
  } catch (e) {
    msgFail('Could not save \u2014 that picture may be too big for this browser');
    return;
  }
  adReplyPreview();
  msgOk('Saved in this browser');
  await adReplyPushToSite();
}

function adReplyReset() {
  AD_REPLY = { avatar: AD_REPLY_DEFAULT.avatar, badge: AD_REPLY_DEFAULT.badge };
  try { localStorage.removeItem(AD_REPLY_KEY); } catch (e) {}
  renderReplyTab();
  var note = document.getElementById('adReplyNote');
  if (note) note.textContent = 'a square PNG looks best \u2014 stored at 96px';
  var st = document.getElementById('adReplyStatus');
  if (st) st.textContent = 'reset to the site logo + glowing shield (press APPLY TO SITE to push it)';
  msgOk('Back to the default look');
}

AD_REPLY = adReplyLoad();

(function adminBoot() {
  var retry = document.getElementById('bootRetry');

  function revealPin() {
    var remembered = false;
    try { remembered = localStorage.getItem('admin_pin_remembered') === 'true'; } catch (e) {}
    var chk = document.getElementById('adminRememberPin');
    if (chk) chk.checked = remembered;
    var screen = document.getElementById('adminPinScreen');
    if (screen) screen.style.display = 'flex';
    var first = document.getElementById('adminPinInput');
    if (first) first.focus();
  }

  function skipPin() {
    document.getElementById('adminPinError').style.display = 'none';
    document.getElementById('pinGate').style.display = 'none';
    document.getElementById('adminDashboard').style.display = 'block';
    paintPatStatus();
    initAdminGui();
  }

  loadAdminData().then(function (ok) {
    if (!ok) { if (retry) retry.style.display = 'inline-block'; return; }
    var remembered = false;
    try { remembered = localStorage.getItem('admin_pin_remembered') === 'true'; } catch (e) {}
    if (remembered && getPat()) { skipPin(); return; }
    revealPin();
  });

  if (retry) retry.addEventListener('click', function () {
    retry.style.display = 'none';
    loadAdminData().then(function (ok) {
      if (!ok) { retry.style.display = 'inline-block'; return; }
      var remembered = false;
      try { remembered = localStorage.getItem('admin_pin_remembered') === 'true'; } catch (e) {}
      if (remembered && getPat()) { skipPin(); return; }
      revealPin();
    });
  });

  function tick() {
    var el = document.getElementById('adClock');
    if (el) el.textContent = new Date().toLocaleString('en-GB');
  }
  tick();
  setInterval(tick, 1000);
})();

