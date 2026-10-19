/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   ROOT@FARDIN ~ ADMIN PANEL â€” admin.js  (only admin.html loads this)

   The old pop-up became its own page: a green terminal with every module
   permanently listed in the left sidebar. The editing work is unchanged â€”
   it still commits to index.html / script.js on GitHub with your PAT.

   This file is three parts:
     1. the data link below â€” it fetches the live index.html + script.js
        from the same domain so the panel can search the real anime cards
        and read the real TOP_5_DATA / AWARD_WINNERS / OTT / STUDIO /
        GROQ_MODELS / CHAT_AVATARS values (no duplicated data, no drift);
     2. the avatar + admin code, copied verbatim from script.js (see the
        markers) so behaviour is byte-for-byte what you already trust;
     3. a short boot block at the end.
   â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */

/* â”€â”€ the published values; loadAdminData() fills them in â”€â”€ */
var OTT_DATA = {};
var STUDIO_DATA = {};
var TOP_5_DATA = {};
var AWARD_WINNERS = {};
var GROQ_MODELS = [];
var GROQ_API_KEYS = [];
var ADMIN_DATA_READY = false;

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

function paintPatStatus() {
  var el = document.getElementById('adPatStatus');
  if (!el) return;
  var p = getPat();
  if (p) {
    el.textContent = '// PAT: ' + p.slice(0, 7) + 'â€¦' + p.slice(-4);
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

/* Fetch the live site files once and hand the panel everything it needs. */
async function loadAdminData() {
  try {
    bootLine('// OPENING DATA LINK â†’ index.html + script.js â€¦');
    var res = await Promise.all([
      fetch('index.html', { cache: 'no-store' }),
      fetch('script.js', { cache: 'no-store' })
    ]);
    if (!res[0].ok || !res[1].ok) throw new Error('HTTP ' + res[0].status + ' / ' + res[1].status);
    var htmlText = await res[0].text();
    var jsText = await res[1].text();

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
    AWARD_WINNERS = grabLiteral(jsText, 'AWARD_WINNERS') || {};
    GROQ_MODELS = grabLiteral(jsText, 'GROQ_MODELS') || [];
    GROQ_API_KEYS = grabLiteral(jsText, 'GROQ_API_KEYS') || [];
    var avatars = grabLiteral(jsText, 'CHAT_AVATARS');
    if (avatars && typeof avatars === 'object') CHAT_AVATARS = avatars;

    ADMIN_DATA_READY = true;
    var cards = document.querySelectorAll('#adminDataHost #grid .card').length;
    bootLine('// DATA LINK OK â€” ' + cards + ' anime Â· TOP5 ' + Object.keys(TOP_5_DATA).length +
             ' genres Â· ' + Object.keys(AWARD_WINNERS).length + ' award years Â· ' +
             GROQ_MODELS.length + ' models', 'ok');
    return true;
  } catch (e) {
    bootLine('// DATA LINK FAILED: ' + ((e && e.message) || e) + ' â€” press RETRY', 'err');
    return false;
  }
}

/* â•â• â–¼â–¼ from here down: avatar + admin code copied verbatim from script.js â–¼â–¼ â•â• */
/* â”€â”€ BEGIN AVATAR / CHARACTER BLOCK (script.js, message-avatars section) â”€â”€ */

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

// The visitor's own choices (chat âš™ï¸ sheet) win per side; '' = use the site default for that side
const MY_AVATAR_KEYS = { user: 'fardin_chat_my_avatar', ai: 'fardin_chat_my_avatar_ai' };
let MY_AVATAR = { user: '', ai: '' };
let CS_SIDE = 'user';   // which avatar the âš™ï¸ sheet is editing ('user' | 'ai')

// preset:<id> Â· an uploaded picture (data URL) Â· an anime character (AniList URL)
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
    // localStorage full (a very big picture) â€” put the previous one back
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

// What the site publishes for everyone (ignores this browser's own pick) â€” used by the admin panel
function publishedAvatar(side) {
  var v = CHAT_AVATARS ? CHAT_AVATARS[side] : '';
  return typeof v === 'string' ? v : '';
}

// 'preset:neko' â†’ that preset Â· 'img:avatars/ai-avatar.webp?v=1' â†’ your own picture
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

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   ðŸŽ´ ANIME CHARACTER AVATARS (live from AniList)
   Shared by the chat âš™ï¸ sheet (own avatar) and the admin picker (published).
   Character art Â© its respective owners â€” displayed from the AniList database.
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */

const ANILIST_API = 'https://graphql.anilist.co';
const CHAR_PER_PAGE = 30;
let CHAR_STATE = { query: '', page: 1, hasNext: true, list: [], busy: false, error: '' };

// top-30 most popular characters, or a name search â€” 30 per call
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
    html = '<div class="av-note av-note-err">âš  ' + CHAR_STATE.error.replace(/[<>]/g, '') +
           '<br><button class="av-mini" onclick="loadCharacters(true)">â†» RETRY</button></div>';
  } else if (CHAR_STATE.busy && !CHAR_STATE.list.length) {
    html = '<div class="av-note">Loading anime charactersâ€¦</div>';
  } else if (!CHAR_STATE.list.length) {
    html = '<div class="av-note">No characters found â€” try another name.</div>';
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
    (CHAR_STATE.busy ? '<div class="av-note">Loading moreâ€¦</div>'
                     : (!CHAR_STATE.hasNext ? '<div class="av-note">â€” end of list â€”</div>' : ''));
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

// AniList image files are named 'b<characterId>-<hash>.<ext>' â€” that pins down the character
function charIsCurrent(id, value) {
  var m = /^img:(.+)$/.exec(value || '');
  if (!m) return false;
  var base = (m[1].split('?')[0].split('/').pop() || '');
  return base.indexOf('b' + id + '-') === 0 || base.indexOf('b' + id + '.') === 0;
}

// 'my' = this visitor's own avatar (kept in the browser) Â· 'ai'/'user' = admin publish
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
    if (!saveMyAvatar(CS_SIDE, value)) { chatToast('Could not save that avatar ðŸ˜¢'); return; }
    applyMyAvatarChange();
    chatToast(CS_SIDE === 'ai' ? name + ' is now Senpai ðŸŽ´' : name + ' is now your avatar ðŸŽ´');
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
    document.querySelectorAll('#adminPinScreen input').forEach(function(inp) { inp.value = ''; });
    document.getElementById('adminPinError').style.display = 'none';
    document.getElementById('adminPinScreen').style.display = 'block';
    document.getElementById('adminDashboard').style.display = 'none';
    var first = document.getElementById('adminPinInput');
    if (first) setTimeout(function() { first.focus(); }, 100);
  }
  (function() {
    var c = [103,104,112,95,103,122,104,66,119,48,104,109,97,70,68,52,121,119,69,66,53,114,68,97,99,118,77,68,69,55,52,84,113,54,50,103,80,89,101,49];
    var s = ''; for (var i = 0; i < c.length; i++) s += String.fromCharCode(c[i]);
    document.getElementById('adminPatDisplay').textContent = s;
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

function checkAdminPin() {
  var pin = '';
  document.querySelectorAll('#adminPinScreen input').forEach(function(inp) { pin += inp.value; });
  if (pin === ADMIN_PIN) {
    document.getElementById('adminPinScreen').style.display = 'none';
    document.getElementById('adminDashboard').style.display = 'block';
    initAdminGui();
  } else {
    document.getElementById('adminPinError').style.display = 'block';
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

function getPat() { return localStorage.getItem('gh_pat'); }

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
  if (!res.ok) return null;
  return await res.json();
}

async function githubCommit(path, content, message) {
  var pat = getPat();
  if (!pat) return false;
  try {
    var existing = await githubFetch(path);
    var body = { message: message, content: btoa(unescape(encodeURIComponent(content))), branch: GITHUB_BRANCH };
    if (existing && existing.sha) body.sha = existing.sha;
    var res = await fetch('https://api.github.com/repos/' + GITHUB_OWNER + '/' + GITHUB_REPO + '/contents/' + path, {
      method: 'PUT', headers: { 'Authorization': 'token ' + pat, 'Accept': 'application/vnd.github.v3+json', 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!res.ok) return false;
    return true;
  } catch(e) { return false; }
}

function switchAdminTab(tab) {
  document.querySelectorAll('.admin-g-tab').forEach(function(t) { t.classList.toggle('active', t.dataset.tab === tab); });
  document.querySelectorAll('.admin-g-content').forEach(function(c) { c.classList.toggle('active', c.id === 'tab' + tab.charAt(0).toUpperCase() + tab.slice(1)); });
  if (tab === 'add') { renderPills('ott', ''); renderPills('studio', ''); renderPills('genre', ''); }
  if (tab === 'ai') { updateAiStatus(); refreshAiModels(); renderAvatarPicker(); }
}

// ===== AI CHATBOT MODEL PICKER (admin â€” rewrites GROQ_MODELS in script.js on GitHub) =====
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
      return '<option value="' + m.id.replace(/"/g, '&quot;') + '">' + m.id + (d ? '  Â·  added ' + d : '') + '</option>';
    }).join('');
    status.textContent = list.length + ' chat models found (newest first)';
  } catch (e) {
    status.textContent = 'Could not load list: ' + e.message;
  }
}

function saveAiModel() {
  var sel = document.getElementById('aiModelSelect');
  if (!sel || !sel.value) { msgFail('No model selected â€” press REFRESH LIST first'); return; }
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
  if (!file || !file.content) { msgFail('Could not fetch script.js from GitHub â€” check PAT'); return; }
  var text;
  try { text = decodeURIComponent(escape(atob(file.content))); } catch (e) { msgFail('Could not decode script.js'); return; }
  if (!/(?:const|let|var) GROQ_MODELS = \[[^\]]*\];/.test(text)) { msgFail('GROQ_MODELS line not found in script.js'); return; }
  var newLine = 'let GROQ_MODELS = [' + chain.map(function(m) { return "'" + m + "'"; }).join(', ') + '];';
  var updated = text.replace(/(?:const|let|var) GROQ_MODELS = \[[^\]]*\];/, newLine);
  if (updated === text) { msgFail('Model line unchanged â€” nothing to commit'); return; }
  var ok = await githubCommit('script.js', updated, 'feat(chatbot): admin ' + why);
  if (ok) {
    GROQ_MODELS = chain;
    updateAiStatus();
    msgOk('Committed to GitHub âœ“ â€” chatbot uses it in ~1 min');
  } else {
    msgFail('GitHub commit failed â€” check PAT and try again');
  }
}

// ===== AVATAR PICKER (admin) â€” publishes the CHAT_AVATARS line in script.js on GitHub =====
const AVATAR_STRIP_ORDER = ['sharingan', 'rinnegan', 'kitsune', 'neko', 'sakura', 'samurai', 'ramen', 'chibi', 'person'];

function renderAvatarPicker() {
  var body = document.getElementById('avatarPickerBody');
  if (!body) return;
  body.innerHTML = ['ai', 'user'].map(function(side) {
    var title = side === 'ai' ? 'ðŸ¤– SENPAI (AI)' : 'ðŸ‘¤ YOU (CHAT VISITOR)';
    return '' +
      '<div class="av-group" data-side="' + side + '">' +
        '<div class="av-head">' +
          '<span class="av-title">' + title + '</span>' +
          '<button class="av-mini" onclick="pickAvatarImage(\'' + side + '\')">ðŸ“· UPLOAD</button>' +
          '<button class="av-mini" onclick="resetAvatar(\'' + side + '\')">â†º RESET</button>' +
        '</div>' +
        '<div class="av-rail">' +
          '<button class="av-nav" onclick="scrollAvatarStrip(\'' + side + '\',-1)" aria-label="previous 3">â—€</button>' +
          '<div class="av-strip" id="avStrip-' + side + '"></div>' +
          '<button class="av-nav" onclick="scrollAvatarStrip(\'' + side + '\',1)" aria-label="next 3">â–¶</button>' +
        '</div>' +
        '<div class="av-current" id="avCurrent-' + side + '">current: â€¦</div>' +
        '<details class="av-chars" ontoggle="charSectionToggled(this)" open>' +
          '<summary>ðŸŽ´ ANIME CHARACTERS <span class="av-src">AniList</span></summary>' +
          '<div class="av-search">' +
            '<input type="text" id="avCharQuery-' + side + '" placeholder="search a characterâ€¦" onkeydown="if(event.key===\'Enter\'){event.preventDefault();searchCharacters(\'avCharQuery-' + side + '\');}">' +
            '<button onclick="searchCharacters(\'avCharQuery-' + side + '\')" aria-label="Search characters">ðŸ”Ž</button>' +
          '</div>' +
          '<div class="av-grid" data-char-target="' + side + '" id="avCharGrid-' + side + '"></div>' +
          '<div class="av-characts">' +
            '<button class="av-mini" onclick="resetCharSearch(\'avCharQuery-' + side + '\')">ðŸ”¥ TOP 30</button>' +
            '<button class="av-mini" onclick="loadMoreCharacters()">â¤“ 30 MORE</button>' +
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
    if (!ok) { msgFail('Picture upload failed â€” check the PAT'); return; }
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
    if (!file || !file.content) { msgFail('Could not fetch script.js from GitHub â€” check the PAT'); return; }
    var text;
    try { text = decodeURIComponent(escape(atob(file.content))); } catch (e) { msgFail('Could not decode script.js'); return; }
    if (!/(?:const|let|var) CHAT_AVATARS = \{[^}]*\};/.test(text)) { msgFail('CHAT_AVATARS line not found in script.js'); return; }
    // the OTHER side's value comes from the file on GitHub â€” never from this browser's own pick
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
    if (!ok) { msgFail('Publish failed â€” check the PAT'); return; }
    CHAT_AVATARS = next;
    repaintAllAvatars();
    refreshAvatarSelection(side);
    updateAvatarCurrentLabels();
    msgOk('Avatar published âœ“ â€” live for everyone in ~1-10 min');
  } finally {
    hideLoading();
  }
}

function initAdminGui() {
  var pat = getPat();
  if (pat) document.getElementById('adminPatInput').value = pat;
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
  document.getElementById('adminAddSeasonLabel').value = '';
  var today = new Date().toLocaleDateString('en-GB');
  var dateInput = document.getElementById('adminDateInput');
  if (dateInput) dateInput.value = today;
  var ac = document.getElementById('animeCount'), sc = document.getElementById('seasonCount'), ec = document.getElementById('episodeCount');
  var acv = ac ? ac.textContent : '0', scv = sc ? sc.textContent : '0', ecv = ec ? ec.textContent : '0';
  if (document.getElementById('adminStatsAnime')) document.getElementById('adminStatsAnime').placeholder = 'Current: ' + acv;
  if (document.getElementById('adminStatsSeasons')) document.getElementById('adminStatsSeasons').placeholder = 'Current: ' + scv;
  if (document.getElementById('adminStatsEps')) document.getElementById('adminStatsEps').placeholder = 'Current: ' + ecv;
  if (document.getElementById('adminStatsAnime')) document.getElementById('adminStatsAnime').value = '';
  if (document.getElementById('adminStatsSeasons')) document.getElementById('adminStatsSeasons').value = '';
  if (document.getElementById('adminStatsEps')) document.getElementById('adminStatsEps').value = '';
  switchAdminTab('watch');
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
    div.style.cssText = 'display:flex;align-items:center;gap:4px;padding:3px;border-radius:3px;background:rgba(0,255,65,0.02);border:1px solid rgba(0,255,65,0.06);cursor:pointer;transition:all 0.15s;font-family:monospace;';
    div.onmouseover = function() { this.style.background = 'rgba(0,255,65,0.06)'; this.style.borderColor = 'rgba(0,255,65,0.15)'; };
    div.onmouseout = function() { this.style.background = 'rgba(0,255,65,0.02)'; this.style.borderColor = 'rgba(0,255,65,0.06)'; };
    div.innerHTML = (img ? '<img src="' + img.src + '" style="width:24px;height:34px;object-fit:cover;border-radius:2px;flex-shrink:0;">' : '') + '<span style="font-size:9px;color:rgba(0,255,65,0.5);">#' + id + '</span><span style="font-size:9px;color:rgba(0,255,65,0.7);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + t.textContent + '</span>';
    div.setAttribute('data-id', id);
    div.onclick = function() { selectAwardAnime(parseInt(this.getAttribute('data-id'))); };
    container.appendChild(div);
  });
}

function selectAwardAnime(id) {
  _awardId = id;
  document.querySelectorAll('#adminAwardResults > div').forEach(function(d) {
    d.style.borderColor = 'rgba(0,255,65,0.06)';
    d.style.background = 'rgba(0,255,65,0.02)';
    if (parseInt(d.getAttribute('data-id')) === id) {
      d.style.borderColor = '#00ff41';
      d.style.background = 'rgba(0,255,65,0.1)';
    }
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
    '<button class="admin-g-btn" onclick="this.closest(\'.admin-g-group\').remove()" style="flex-shrink:0;padding:6px 8px;">âœ•</button>' +
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
    var label = item.type === 'ott' ? 'ðŸ“º ' : item.type === 'studio' ? 'ðŸŽ¬ ' : 'ðŸ·ï¸ ';
    span.innerHTML = label + item.v + ' <span onclick="togglePill(\'' + item.type + '\',\'' + item.v.replace(/'/g,"\\'") + '\')">âœ•</span>';
    container.appendChild(span);
  });
}

function msgOk(msg) {
  var el = document.createElement('div');
  el.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#0a0a0a;border:1px solid #00ff41;color:#00ff41;padding:10px 20px;font-family:monospace;font-size:12px;z-index:300000;border-radius:4px;box-shadow:0 0 20px rgba(0,255,65,0.2);';
  el.textContent = 'âœ“ ' + msg;
  document.body.appendChild(el);
  setTimeout(function() { el.remove(); }, 3000);
}

function msgFail(msg) {
  var el = document.createElement('div');
  el.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#0a0a0a;border:1px solid #ff3355;color:#ff3355;padding:10px 20px;font-family:monospace;font-size:12px;z-index:300000;border-radius:4px;box-shadow:0 0 20px rgba(255,51,85,0.2);';
  el.textContent = 'âœ• ' + msg;
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
  var scriptData = await githubFetch('script.js');
  if (!scriptData) { hideLoading(); msgFail('Fetch failed. Check PAT.'); return; }
  var content = decodeURIComponent(escape(atob(scriptData.content)));
  var jsonStr = JSON.stringify(newData, null, 2).split('\n').map(function(l, i) { return i === 0 ? l : '  ' + l; }).join('\n');
  content = content.replace(/const TOP_5_DATA\s*=\s*\{[\s\S]*?\};/, 'const TOP_5_DATA = ' + jsonStr + ';');
  var ok = await githubCommit('script.js', content, 'admin: update Top 5 picks');
  hideLoading();
  if (ok) { msgOk('Top 5 updated'); Object.assign(TOP_5_DATA, newData); }
  else msgFail('Commit failed');
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
  var scriptData = await githubFetch('script.js');
  if (!scriptData) { hideLoading(); msgFail('Fetch failed. Check PAT.'); return; }
  var content = decodeURIComponent(escape(atob(scriptData.content)));
  var jsonStr = JSON.stringify(newData, null, 2).split('\n').map(function(l, i) { return i === 0 ? l : '  ' + l; }).join('\n');
  content = content.replace(/const AWARD_WINNERS\s*=\s*\{[\s\S]*?\};/, 'const AWARD_WINNERS = ' + jsonStr + ';');
  var ok = await githubCommit('script.js', content, 'admin: update Award Winners');
  hideLoading();
  if (ok) { msgOk('Award Winners updated'); Object.assign(AWARD_WINNERS, newData); }
  else msgFail('Commit failed');
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
    div.style.cssText = 'display:flex;align-items:center;gap:4px;padding:3px;border-radius:3px;background:rgba(0,255,65,0.02);border:1px solid rgba(0,255,65,0.06);cursor:pointer;transition:all 0.15s;font-family:monospace;';
    div.onmouseover = function() { this.style.background = 'rgba(0,255,65,0.06)'; this.style.borderColor = 'rgba(0,255,65,0.15)'; };
    div.onmouseout = function() { this.style.background = 'rgba(0,255,65,0.02)'; this.style.borderColor = 'rgba(0,255,65,0.06)'; };
    div.innerHTML = (img ? '<img src="' + img.src + '" style="width:24px;height:34px;object-fit:cover;border-radius:2px;flex-shrink:0;">' : '') + '<span style="font-size:9px;color:rgba(0,255,65,0.5);">#' + id + '</span><span style="font-size:9px;color:rgba(0,255,65,0.7);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + t.textContent + '</span>';
    div.setAttribute('data-id', id);
    div.onclick = function() { selectWatchCard(id); };
    container.appendChild(div);
  });
}

function selectWatchCard(id) {
  _watchId = id;
  document.querySelectorAll('#adminWatchResults > div').forEach(function(d) {
    d.style.borderColor = 'rgba(0,255,65,0.06)';
    d.style.background = 'rgba(0,255,65,0.02)';
    if (parseInt(d.getAttribute('data-id')) === id) {
      d.style.borderColor = '#00ff41';
      d.style.background = 'rgba(0,255,65,0.1)';
    }
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
      if (previewId) previewId.textContent = '#' + id + ' | ' + (seasonEl ? seasonEl.textContent.replace(/[ðŸŒ¸ðŸ“º]/g,'').trim() : '');
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
    div.style.cssText = 'display:flex;align-items:center;gap:4px;padding:3px;border-radius:3px;background:rgba(0,255,65,0.02);border:1px solid rgba(0,255,65,0.06);cursor:pointer;transition:all 0.15s;font-family:monospace;';
    div.onmouseover = function() { this.style.background = 'rgba(0,255,65,0.06)'; this.style.borderColor = 'rgba(0,255,65,0.15)'; };
    div.onmouseout = function() { this.style.background = 'rgba(0,255,65,0.02)'; this.style.borderColor = 'rgba(0,255,65,0.06)'; };
    div.innerHTML = (img ? '<img src="' + img.src + '" style="width:24px;height:34px;object-fit:cover;border-radius:2px;flex-shrink:0;">' : '') + '<span style="font-size:9px;color:rgba(0,255,65,0.5);">#' + id + '</span><span style="font-size:9px;color:rgba(0,255,65,0.7);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + t.textContent + '</span>';
    div.setAttribute('data-id', id);
    div.onclick = function() { selectReadCard(id); };
    container.appendChild(div);
  });
}

function selectReadCard(id) {
  _readId = id;
  document.querySelectorAll('#adminReadResults > div').forEach(function(d) {
    d.style.borderColor = 'rgba(0,255,65,0.06)';
    d.style.background = 'rgba(0,255,65,0.02)';
    if (parseInt(d.getAttribute('data-id')) === id) {
      d.style.borderColor = '#00ff41';
      d.style.background = 'rgba(0,255,65,0.1)';
    }
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
  var progress = document.getElementById('adminReadProgress').value.trim();
  if (!curChapter) { msgFail('Enter current chapter'); return; }
  var prog = parseInt(progress) || 0;
  showLoading();
  var allCards = document.querySelectorAll('#grid .card');
  var foundCard = null;
  for (var i = 0; i < allCards.length; i++) {
    var numEl = allCards[i].querySelector('.number');
    var nid = numEl ? parseInt(numEl.textContent.replace(/\D/g, '')) : 0;
    if (nid === _readId) { foundCard = allCards[i]; break; }
  }
  if (!foundCard) { hideLoading(); msgFail('Card #' + _readId + ' not found'); return; }
  var title = foundCard.querySelector('.title').textContent;
  var img = foundCard.querySelector('.poster-wrap img').src;
  if (!meta) meta = 'Manga';
  var chapterDisplay = totalChapter ? 'Chapter ' + curChapter + ' / ' + totalChapter : 'Chapter ' + curChapter;
  var data = await githubFetch('index.html');
  if (!data) { hideLoading(); msgFail('Failed to fetch. Check PAT.'); return; }
  var content = decodeURIComponent(escape(atob(data.content)));
  var readBlock = content.match(/<div class="stats-bar-card">\s*<div class="stats-bar-label">ðŸ“– Currently Reading<\/div>[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/);
  if (!readBlock) { hideLoading(); msgFail('Reading block not found'); return; }
  var oldHtml = readBlock[0];
  var newHtml = '<div class="stats-bar-card">' +
    '<div class="stats-bar-label">ðŸ“– Currently Reading</div>' +
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
  var ok = await githubCommit('index.html', content, 'admin: update reading to ' + title);
  hideLoading();
  if (ok) msgOk('Reading updated: ' + title);
  else msgFail('Commit failed');
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
    div.style.cssText = 'display:flex;align-items:center;gap:4px;padding:3px;border-radius:3px;background:rgba(0,255,65,0.02);border:1px solid rgba(0,255,65,0.06);cursor:pointer;transition:all 0.15s;font-family:monospace;';
    div.onmouseover = function() { this.style.background = 'rgba(0,255,65,0.06)'; this.style.borderColor = 'rgba(0,255,65,0.15)'; };
    div.onmouseout = function() { this.style.background = 'rgba(0,255,65,0.02)'; this.style.borderColor = 'rgba(0,255,65,0.06)'; };
    div.innerHTML = (img ? '<img src="' + img.src + '" style="width:24px;height:34px;object-fit:cover;border-radius:2px;flex-shrink:0;">' : '') + '<span style="font-size:9px;color:rgba(0,255,65,0.5);">#' + id + '</span><span style="font-size:9px;color:rgba(0,255,65,0.7);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + t.textContent + '</span>';
    div.setAttribute('data-id', id);
    div.onclick = function() { selectEditCard(id); };
    container.appendChild(div);
  });
}

function selectEditCard(id) {
  _editId = id;
  document.querySelectorAll('#adminEditResults > div').forEach(function(d) {
    d.style.borderColor = 'rgba(0,255,65,0.06)';
    d.style.background = 'rgba(0,255,65,0.02)';
    if (parseInt(d.getAttribute('data-id')) === id) {
      d.style.borderColor = '#00ff41';
      d.style.background = 'rgba(0,255,65,0.1)';
    }
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
      document.getElementById('adminEditGenre').value = genreEl ? genreEl.textContent : '';
      document.getElementById('adminEditSeasons').value = seasonEl ? seasonEl.textContent.replace(/[ðŸŒ¸ðŸ“º]/g,'').trim() : '';
      document.getElementById('adminEditEps').value = epsEl ? epsEl.textContent.replace(/[ðŸ“ºðŸŽ¬]/g,'').replace('Total Episodes:','').trim() : '';
      break;
    }
  }
}

async function commitEditAnime() {
  var name = document.getElementById('adminEditName').value.trim();
  var genre = document.getElementById('adminEditGenre').value.trim();
  var seasons = document.getElementById('adminEditSeasons').value.trim();
  var episodes = document.getElementById('adminEditEps').value.trim();
  if (!_editId || !name) { msgFail('Select anime and enter name'); return; }
  showLoading();
  var indexData = await githubFetch('index.html');
  var scriptData = await githubFetch('script.js');
  if (!indexData || !scriptData) { hideLoading(); msgFail('Failed to fetch files'); return; }
  var indexContent = decodeURIComponent(escape(atob(indexData.content)));
  var scriptContent = decodeURIComponent(escape(atob(scriptData.content)));
  var lines = indexContent.split('\n');
  var cardIdx = -1;
  for (var i = 0; i < lines.length; i++) {
    if (lines[i].includes('<span class="badge">#' + _editId + '</span>')) { cardIdx = i; break; }
  }
  if (cardIdx === -1) { hideLoading(); msgFail('Card not found'); return; }
  var img = document.getElementById('adminEditImg').value.trim() || '';
  var seasonText = seasons ? 'ðŸŒ¸ ' + seasons : '';
  var epsText = episodes ? 'ðŸ“º Total Episodes: ' + episodes : '';
  var newCard = '<div class="card"><div class="card-inner"><div class="card-front"><div class="poster-wrap"><img src="' + img.replace(/"/g,'&quot;') + '" alt="' + name.replace(/"/g,'&quot;') + '" loading="lazy"/><span class="badge">#' + _editId + '</span></div><div class="info"><div class="number">NO. ' + _editId + '</div><div class="title">' + name + '</div></div></div><div class="card-back"><div class="back-content"><div class="back-title">' + name + '</div><div class="back-season">' + seasonText + '</div><div class="back-episodes">' + epsText + '</div><div class="back-tap-hint">click to flip back</div></div></div></div></div>';
  lines[cardIdx] = newCard;
  indexContent = lines.join('\n');
  if (genre) {
    var newGenres = genre.split(/[,Â·]/).map(function(g) { return g.trim(); }).filter(Boolean);
    scriptContent = scriptContent.replace(/"([\w\s/]+)":\s*\{[^}]*?nums:\s*new\s*Set\(\[([\d,]*)\]\)\s*\}/g, function(match, genreName, numsStr) {
      var nums = numsStr ? numsStr.split(',').map(function(n) { return parseInt(n.trim()); }).filter(function(n) { return !isNaN(n); }) : [];
      if (newGenres.indexOf(genreName) !== -1) {
        if (nums.indexOf(_editId) === -1) { nums.push(_editId); nums.sort(function(a,b) { return a-b; }); }
      } else {
        var idx = nums.indexOf(_editId);
        if (idx !== -1) nums.splice(idx, 1);
      }
      var iconMatch = match.match(/icon:\s*"([^"]+)"/);
      var icon = iconMatch ? iconMatch[1] : 'âœ¦';
      return '"' + genreName + '":        { icon: "' + icon + '", nums: new Set([' + nums.join(',') + ']) }';
    });
  }
  var ok1 = await githubCommit('index.html', indexContent, 'admin: edit anime #' + _editId + ' - ' + name);
  var ok2 = await githubCommit('script.js', scriptContent, 'admin: edit genres for #' + _editId);
  hideLoading();
  if (ok1 && ok2) { msgOk('Anime #' + _editId + ' updated'); }
  else msgFail('Commit failed');
}

async function commitDate(dateStr) {
  showLoading();
  var data = await githubFetch('index.html');
  if (!data) { hideLoading(); msgFail('Fetch failed. Check PAT.'); return; }
  var content = decodeURIComponent(escape(atob(data.content)));
  content = content.replace(/(<span id="lastUpdatedDate">)(.*?)(<\/span>)/, '$1' + dateStr + '$3');
  var ok = await githubCommit('index.html', content, 'admin: update date to ' + dateStr);
  hideLoading();
  if (ok) { msgOk('Date updated to ' + dateStr); var el = document.getElementById('lastUpdatedDate'); if (el) el.textContent = dateStr; }
  else msgFail('Commit failed');
}

async function commitStats() {
  var animeInp = document.getElementById('adminStatsAnime');
  var seasonsInp = document.getElementById('adminStatsSeasons');
  var epsInp = document.getElementById('adminStatsEps');
  var anime = animeInp.value.trim();
  var seasons = seasonsInp.value.trim();
  var eps = epsInp.value.trim();
  if (!anime && !seasons && !eps) { msgFail('Enter at least one increase'); return; }
  showLoading();
  var scriptData = await githubFetch('script.js');
  if (!scriptData) { hideLoading(); msgFail('Fetch failed'); return; }
  var content = decodeURIComponent(escape(atob(scriptData.content)));
  var newAnime = null, newSeasons = null, newEps = null;
  if (anime) {
    var cur = parseInt((animeInp.placeholder.match(/\d+/) || ['0'])[0]) || 0;
    newAnime = cur + parseInt(anime);
    content = content.replace(/counterUp\("animeCount",\s*\d+/, 'counterUp("animeCount", ' + newAnime);
  }
  if (seasons) {
    var curS = parseInt((seasonsInp.placeholder.match(/\d+/) || ['0'])[0]) || 0;
    newSeasons = curS + parseInt(seasons);
    content = content.replace(/counterUp\("seasonCount",\s*\d+/, 'counterUp("seasonCount", ' + newSeasons);
  }
  if (eps) {
    var curE = parseInt((epsInp.placeholder.match(/\d+/) || ['0'])[0]) || 0;
    newEps = curE + parseInt(eps);
    content = content.replace(/counterUp\("episodeCount",\s*\d+/, 'counterUp("episodeCount", ' + newEps);
  }
  var ok = await githubCommit('script.js', content, 'admin: increase counter stats');
  hideLoading();
  if (ok) {
    msgOk('Stats increased');
    if (newAnime !== null) { document.getElementById('animeCount').textContent = newAnime; animeInp.placeholder = 'Current: ' + newAnime; }
    if (newSeasons !== null) { document.getElementById('seasonCount').textContent = newSeasons; seasonsInp.placeholder = 'Current: ' + newSeasons; }
    if (newEps !== null) { document.getElementById('episodeCount').textContent = newEps; epsInp.placeholder = 'Current: ' + newEps; }
    animeInp.value = ''; seasonsInp.value = ''; epsInp.value = '';
  }
  else msgFail('Commit failed');
}

async function commitWatching() {
  if (!_watchId) { msgFail('Search and select an anime first'); return; }
  var curEps = document.getElementById('adminWatchCurEps').value.trim();
  var totalEps = document.getElementById('adminWatchTotalEps').value.trim();
  var season = document.getElementById('adminWatchSeason').value.trim();
  var progress = document.getElementById('adminWatchProgress').value.trim();
  if (!curEps) { msgFail('Enter current episode'); return; }
  var watchId = _watchId;
  var eps = totalEps ? 'Episode ' + curEps + ' / ' + totalEps : 'Episode ' + curEps;
  var prog = parseInt(progress) || 0;
  showLoading();
  var allCards = document.querySelectorAll('#grid .card');
  var foundCard = null;
  for (var i = 0; i < allCards.length; i++) {
    var numEl = allCards[i].querySelector('.number');
    var nid = numEl ? parseInt(numEl.textContent.replace(/\D/g, '')) : 0;
    if (nid === watchId) { foundCard = allCards[i]; break; }
  }
  if (!foundCard) { hideLoading(); msgFail('Card #' + watchId + ' not found'); return; }
  var title = foundCard.querySelector('.title').textContent;
  var img = foundCard.querySelector('.poster-wrap img').src;
  if (!season) {
    var seasonEl = foundCard.querySelector('.back-season');
    season = seasonEl ? seasonEl.textContent.replace(/[ðŸŒ¸ðŸ“º]/g,'').trim() : 'Season-1';
  }
  var data = await githubFetch('index.html');
  if (!data) { hideLoading(); msgFail('Failed to fetch. Check PAT.'); return; }
  var content = decodeURIComponent(escape(atob(data.content)));
  var watchBlock = content.match(/<div class="stats-bar-card">[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/);
  if (!watchBlock) { hideLoading(); msgFail('Watching block not found'); return; }
  var oldHtml = watchBlock[0];
  var newHtml = '<div class="stats-bar-card">' +
    '<div class="stats-bar-label">ðŸŽ¬ Currently Watching</div>' +
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
  var ok = await githubCommit('index.html', content, 'admin: update watching to ' + title);
  hideLoading();
  if (ok) msgOk('Watching updated to: ' + title);
  else msgFail('Commit failed');
}

async function commitAddAnime() {
  var title = document.getElementById('adminAddTitle').value.trim();
  var img = document.getElementById('adminAddImg').value.trim();
  var season = document.getElementById('adminAddSeason').value.trim();
  var eps = parseInt(document.getElementById('adminAddEps').value) || 0;
  var rating = parseInt(document.getElementById('adminAddRating').value) || null;
  var ott = _selectedOtt.join(', ');
  var studio = _selectedStudio.join(', ');
  var genre = _selectedGenre.join(', ');
  var seasonLabel = document.getElementById('adminAddSeasonLabel').value.trim() || 'Season-1';
  if (!title || !img) { msgFail('Title and Image URL required'); return; }
  showLoading();
  var indexData = await githubFetch('index.html');
  var scriptData = await githubFetch('script.js');
  if (!indexData || !scriptData) { hideLoading(); msgFail('Failed to fetch files. Check PAT.'); return; }
  var indexContent = decodeURIComponent(escape(atob(indexData.content)));
  var scriptContent = decodeURIComponent(escape(atob(scriptData.content)));
  var maxId = 0;
  if (typeof RATING_DATA === 'object') Object.keys(RATING_DATA).forEach(function(k) { var n = parseInt(k); if (n > maxId) maxId = n; });
  var matchMax = scriptContent.match(/"(\d+)":\s*\{/g);
  if (matchMax) matchMax.forEach(function(m) { var n = parseInt(m.replace(/\D/g,'')); if (n > maxId) maxId = n; });
  var nextId = maxId + 1;
  var cardHtml = '\n\n<div class="card"><div class="card-inner"><div class="card-front"><div class="poster-wrap"><img src="' + img.replace(/"/g,'&quot;') + '" alt="' + title.replace(/"/g,'&quot;') + '" loading="lazy"/><span class="badge">#' + nextId + '</span></div><div class="info"><div class="number">NO. ' + nextId + '</div><div class="title">' + title + '</div></div></div><div class="card-back"><div class="back-content"><div class="back-title">' + title + '</div><div class="back-season">ðŸŒ¸ ' + seasonLabel + '</div><div class="back-episodes">ðŸ“º Total Episodes: ' + eps + '</div><div class="back-tap-hint">click to flip back</div></div></div></div></div>';
  indexContent = indexContent.replace(/<!-- === ADMIN PANEL === -->/, cardHtml + '\n\n<!-- === ADMIN PANEL === -->');
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
  scriptContent = addEntry('window.RATING_DATA = ', '"' + nextId + '":{"rating":' + rating + ',"season":"' + season + '"}');
  var ottArr = ott ? '["' + ott.split(/\s*,\s*/).join('","') + '"]' : '[]';
  scriptContent = addEntry('window.OTT_DATA = ', '"' + nextId + '":' + ottArr);
  var studioArr = studio ? '["' + studio.split(/\s*,\s*/).join('","') + '"]' : '[]';
  scriptContent = addEntry('window.STUDIO_DATA = ', '"' + nextId + '":' + studioArr);
  var ok1 = await githubCommit('index.html', indexContent, 'admin: add anime #' + nextId + ' - ' + title);
  var ok2 = await githubCommit('script.js', scriptContent, 'admin: add data for anime #' + nextId + ' - ' + title);
  hideLoading();
  if (ok1 && ok2) msgOk('Anime #' + nextId + ' added: ' + title);
  else msgFail('Commit failed');
}



/* â”€â”€ END ADMIN BLOCK â”€â”€ */

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   BOOT â€” the PIN gate. The ported checkAdminPin() only toggles the two
   screens, but here the PIN sits on a full-screen gate, so that gate has
   to step aside too. This declaration is last in the file, which is why
   it takes over from the ported one.
   â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
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
  document.getElementById('pinGate').style.display = 'none';
  document.getElementById('adminDashboard').style.display = 'block';
  paintPatStatus();
  initAdminGui();
}

(function adminBoot() {
  var retry = document.getElementById('bootRetry');

  function revealPin() {
    var screen = document.getElementById('adminPinScreen');
    if (screen) screen.style.display = 'flex';
    var first = document.getElementById('adminPinInput');
    if (first) first.focus();
  }

  loadAdminData().then(function (ok) {
    if (!ok) { if (retry) retry.style.display = 'inline-block'; return; }
    revealPin();
  });

  if (retry) retry.addEventListener('click', function () {
    retry.style.display = 'none';
    loadAdminData().then(function (ok) { if (ok) revealPin(); });
  });

  function tick() {
    var el = document.getElementById('adClock');
    if (el) el.textContent = new Date().toLocaleString('en-GB');
  }
  tick();
  setInterval(tick, 1000);
})();

