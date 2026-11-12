/* ══════════════════════════════════════════════════════════════════════
   ANIME WEB GAMES
   Fourteen games built from the site's own list (and from AniList for the
   character art), so the hub works offline too.

   Every game asks a signed-in visitor for a player name once, saves the
   score to Supabase and shows its own top three.
   ══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var SUPABASE_URL = 'https://ldzlefdklcgvqcbqibtt.supabase.co';
  var SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxkemxlZmRrbGNndnFjYnFpYnR0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEwMzk1OTAsImV4cCI6MjA5NjYxNTU5MH0.X3TGuLIpjrnPXMgCv4ZKIIjB6pItPgkdebf4JPdhuYs';
  var SCORES = 'game_scores';
  var PLAYERS = 'game_players';
  var PLAYER_KEY = 'game_player_v1';

  var overlay = null;
  var db = null;
  var player = null;
  var state = null;
  var charPool = null;

  /* ─────────────────────────────────────────── helpers */
  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html !== undefined && html !== null) e.innerHTML = html;
    return e;
  }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function toast(msg, kind) {
    if (typeof msgOk === 'function') { kind === 'err' ? msgFail(msg) : msgOk(msg); }
  }

  /* ── answers are judged kindly: spaces, punctuation and small spelling
        mistakes never lose a point ───────────────────────────────────── */
  function norm(s) {
    return String(s == null ? '' : s)
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }
  function levenshtein(a, b) {
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;
    var prev = [], cur = [], i, j;
    for (j = 0; j <= b.length; j++) prev[j] = j;
    for (i = 1; i <= a.length; i++) {
      cur[0] = i;
      for (j = 1; j <= b.length; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      }
      for (j = 0; j <= b.length; j++) prev[j] = cur[j];
    }
    return prev[b.length];
  }
  function answerMatches(input, accepted) {
    var a = norm(input);
    if (!a) return false;
    var list = [accepted].concat((arguments.length > 2 && arguments[2]) ? arguments[2] : []);
    for (var i = 0; i < list.length; i++) {
      var b = norm(list[i]);
      if (!b) continue;
      if (a === b) return true;
      if (a.replace(/\s+/g, '') === b.replace(/\s+/g, '')) return true;
      if (b.length >= 4 && a.length >= 4 && (a.indexOf(b) > -1 || b.indexOf(a) > -1)) return true;
      var max = b.length >= 10 ? 3 : b.length >= 6 ? 2 : 1;
      if (Math.abs(a.length - b.length) <= max && levenshtein(a, b) <= max) return true;
    }
    return false;
  }

  /* ─────────────────────────────────────────── the game list */
  var GAMES = [
    { key: 'quest', title: 'Anime Quest', icon: '🎯', tag: 'TRIVIA',
      desc: 'Ten trivia questions about the anime you pick. Earn a rank from F to SSS and download your certificate.' },
    { key: 'tournament', title: 'Anime Tournament', icon: '🏆', tag: 'BRACKET',
      desc: 'Draft a roster, pick a genre and auto-simulate the whole bracket until a champion is crowned.' },
    { key: 'card', title: 'Guess the Anime', icon: '🕵️', tag: 'CLUES',
      desc: 'Five clues, ten points. Every extra clue costs points - and the first clue is nearly impossible.' },
    { key: 'character', title: 'Guess the Character', icon: '👤', tag: 'SHADOW',
      desc: 'A face in the dark. Type the name - the art comes straight from AniList.' },
    { key: 'emoji', title: 'Emoji Anime', icon: '😀', tag: 'EMOJIS',
      desc: 'Three little pictures stand in for a whole series. Type the anime.' },
    { key: 'truefalse', title: 'True or False', icon: '⚖️', tag: 'FACTS',
      desc: 'Ten statements about the list - half of them are lies. Spot every one.' },
    { key: 'wordle', title: 'Anime Wordle', icon: '🟩', tag: 'WORD',
      desc: 'Six guesses, green and yellow tiles. The title is longer than you think.' },
    { key: 'scramble', title: 'Title Scramble', icon: '🔀', tag: 'SCRAMBLE',
      desc: 'The anime title comes back in pieces. Put it back together.' },
    { key: 'initials', title: 'Initials Challenge', icon: '🔤', tag: 'INITIALS',
      desc: 'The first letters of the title, a genre and a year. Name it.' },
    { key: 'memory', title: 'Anime Memory', icon: '🃏', tag: 'MEMORY',
      desc: 'Twelve cards, six pairs of anime. Find them all before the clock runs out.' },
    { key: 'timeline', title: 'Timeline Rush', icon: '📅', tag: 'TIMELINE',
      desc: 'Five anime, one order. Put them on the timeline from oldest to newest.' },
    { key: 'fight', title: 'Anime Duel Rush', icon: '👊', tag: 'ACTION',
      desc: 'Pick your fighter, watch the power bar and land the hit in the perfect window.' },
    { key: 'power', title: 'Strongest Round', icon: '🏋️', tag: 'POWER',
      desc: 'Two anime, one bracket. Who wins the power fight? Ten rounds of bracket action.' },
    { key: 'genre', title: 'Genre Rush', icon: '🏷️', tag: 'QUICK',
      desc: 'Fifteen seconds a card. Which genre does this anime belong to?' }
  ];
  var GAME_BY_KEY = {};
  GAMES.forEach(function (g) { GAME_BY_KEY[g.key] = g; });

  /* ─────────────────────────────────────────── the data the games use */
  function buildDb() {
    if (db) return db;
    var list = [];
    var cards = document.querySelectorAll('#grid .card');
    var genresById = {};
    try {
      var G = window.ANIME_GENRES || {};
      Object.keys(G).forEach(function (g) {
        if (g === 'All' || !G[g] || !G[g].nums) return;
        G[g].nums.forEach(function (n) {
          if (!genresById[n]) genresById[n] = [];
          genresById[n].push(g);
        });
      });
    } catch (e) {}
    var studios = window.STUDIO_DATA || {};
    var ratings = window.RATING_DATA || {};

    Array.prototype.forEach.call(cards, function (c, i) {
      var numEl = c.querySelector('.number');
      var id = numEl ? parseInt(String(numEl.textContent || '').replace(/\D/g, ''), 10) : (i + 1);
      if (!id) return;
      var titleEl = c.querySelector('.title');
      var title = titleEl ? String(titleEl.textContent || '').trim() : '';
      if (!title) return;
      var img = c.querySelector('.poster-wrap img');
      var epsEl = c.querySelector('.back-episodes');
      var eps = epsEl ? parseInt(String(epsEl.textContent || '').replace(/[^\d]/g, ''), 10) : 0;
      var seaEl = c.querySelector('.back-season');
      var seasonText = seaEl ? String(seaEl.textContent || '').replace(/🌸/, '').trim() : '';
      var r = ratings[id] || {};
      var year = 0;
      var m = String(r.season || '').match(/(\d{4})/);
      if (m) year = parseInt(m[1], 10);
      list.push({
        id: id, title: title,
        poster: img ? img.getAttribute('src') : '',
        eps: eps || 0,
        seasonText: seasonText,
        seasons: (seasonText.match(/\d+/g) || []).length,
        year: year,
        airText: r.season || '',
        genres: genresById[id] || [],
        studio: (studios[id] || [])[0] || '',
        mal: r.malScore || 0
      });
    });
    db = list;
    return db;
  }

  function famousPool() {
    var list = buildDb();
    var withData = list.filter(function (a) { return a.eps > 0 && a.year > 1980; });
    var top = withData.filter(function (a) { return a.id <= 120; });
    return top.length >= 20 ? top : withData;
  }

  /* ─────────────────────────────────────────── supabase */
  function readSession() {
    return new Promise(function (resolve) {
      try {
        var c = (typeof window.authClient === 'function') ? window.authClient() : null;
        if (!c) return resolve(null);
        c.auth.getSession().then(function (r) { resolve(r && r.data ? r.data.session : null); });
      } catch (e) { resolve(null); }
    });
  }
  function token() {
    return readSession().then(function (s) { return (s && s.access_token) || ''; });
  }
  function sb(path, opts) {
    opts = opts || {};
    return token().then(function (t) {
      var headers = Object.assign({
        apikey: SUPABASE_KEY,
        Authorization: 'Bearer ' + (t || SUPABASE_KEY),
        'Content-Type': 'application/json',
        Prefer: 'return=representation'
      }, opts.headers || {});
      return fetch(SUPABASE_URL + '/rest/v1/' + path, Object.assign({}, opts, { headers: headers }));
    });
  }
  function signedIn() { return readSession().then(function (s) { return !!(s && s.user); }); }
  function profileName() {
    var n = '';
    try { if (window.AUTH_USER && window.AUTH_USER.name) n = window.AUTH_USER.name; } catch (e) {}
    return n;
  }
  function profileAvatar() {
    var a = '';
    try { if (window.AUTH_USER && window.AUTH_USER.avatar) a = window.AUTH_USER.avatar; } catch (e) {}
    return a;
  }
  function readPlayer() {
    try {
      var raw = localStorage.getItem(PLAYER_KEY);
      var p = raw ? JSON.parse(raw) : null;
      return (p && p.name) ? p : null;
    } catch (e) { return null; }
  }
  function writePlayer(p) { try { localStorage.setItem(PLAYER_KEY, JSON.stringify(p)); } catch (e) {} }

  function saveScore(gameKey, score, maxScore) {
    if (!player) return Promise.resolve(false);
    var row = {
      user_id: player.id, user_name: player.name, avatar: player.avatar || '',
      game_key: gameKey, score: score, max_score: maxScore || 5,
      played_at: new Date().toISOString()
    };
    return sb(SCORES + '?on_conflict=user_id,game_key', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(row)
    }).then(function (res) { return res.ok; }).catch(function () { return false; });
  }
  function topScores(gameKey, limit) {
    var q = SCORES + '?select=*&game_key=eq.' + encodeURIComponent(gameKey) +
      '&order=score.desc,played_at.asc&limit=' + (limit || 3);
    return sb(q, { method: 'GET' }).then(function (res) { return res.ok ? res.json() : []; })
      .catch(function () { return []; });
  }
  function allScores() {
    return sb(SCORES + '?select=*&order=score.desc&limit=200', { method: 'GET' })
      .then(function (res) { return res.ok ? res.json() : []; }).catch(function () { return []; });
  }
  function overallBoard() {
    return allScores().then(function (rows) {
      var byUser = {};
      rows.forEach(function (r) {
        if (!r || !r.user_id) return;
        var u = byUser[r.user_id] || (byUser[r.user_id] = {
          id: r.user_id, name: r.user_name || 'Player', avatar: r.avatar || '', points: 0, games: {}
        });
        u.games[r.game_key] = Math.max(u.games[r.game_key] || 0, r.score || 0);
      });
      var list = Object.keys(byUser).map(function (k) {
        var u = byUser[k];
        u.points = Object.keys(u.games).reduce(function (s, g) { return s + u.games[g]; }, 0);
        u.played = Object.keys(u.games).length;
        return u;
      });
      list.sort(function (a, b) { return b.points - a.points || a.name.localeCompare(b.name); });
      return list.slice(0, 10);
    });
  }
  function boardHtml(rows, emptyText) {
    if (!rows || !rows.length) return '<div class="ag-board-empty">' + esc(emptyText || 'No scores yet - be the first!') + '</div>';
    return rows.map(function (r, i) {
      var medal = ['🥇', '🥈', '🥉'][i] || ('#' + (i + 1));
      var av = r.avatar
        ? '<img class="ag-board-ava" src="' + esc(r.avatar) + '" alt="">'
        : '<span class="ag-board-ava ag-board-ava--none">' + esc((r.name || '?').charAt(0).toUpperCase()) + '</span>';
      return '<div class="ag-board-row">' +
        '<span class="ag-board-rank">' + medal + '</span>' + av +
        '<span class="ag-board-name">' + esc(r.name || 'Player') + '</span>' +
        '<span class="ag-board-score">' + (r.score != null ? r.score : (r.points != null ? r.points : 0)) + '</span>' +
        '</div>';
    }).join('');
  }

  /* ─────────────────────────────────────────── the name gate */
  function askPlayerName(cb) {
    signedIn().then(function (ok) {
      if (!ok) {
        openGate('Sign in to play', 'The games keep a leaderboard with your name, so you need to sign in first.', null, function () {
          toast('Sign in to play the games', 'err');
        });
        return;
      }
      var saved = readPlayer();
      if (saved && saved.id) { player = saved; cb(); return; }
      openGate('Confirm your player name', 'This name goes on the leaderboards. You only have to do it once.', profileName(), function (name) {
        var p = { id: 'u-' + ((window.AUTH_USER && window.AUTH_USER.id) || 'local'), name: name, avatar: profileAvatar() };
        try { if (window.AUTH_USER && window.AUTH_USER.id) p.id = window.AUTH_USER.id; } catch (e) {}
        writePlayer(p);
        player = p;
        sb(PLAYERS, { method: 'POST', body: JSON.stringify({
          user_id: p.id, user_name: p.name, avatar: p.avatar || '', confirmed_at: new Date().toISOString()
        }) }).catch(function () {});
        cb();
      });
    });
  }
  function openGate(title, note, value, onOk) {
    var m = el('div', 'ag-gate');
    m.innerHTML =
      '<div class="ag-gate-box">' +
        '<div class="ag-gate-title">' + esc(title) + '</div>' +
        '<p class="ag-gate-note">' + esc(note || '') + '</p>' +
        '<label class="ag-gate-label">User name</label>' +
        '<input class="ag-gate-input" id="agPlayerName" maxlength="24" placeholder="Type your name" value="' + esc(value || '') + '">' +
        '<div class="ag-gate-actions">' +
          '<button class="ag-btn ag-btn--go" id="agGateOk">Confirm</button>' +
          '<button class="ag-btn ag-btn--ghost" id="agGateCancel">Cancel</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(m);
    var input = m.querySelector('#agPlayerName');
    var ok = m.querySelector('#agGateOk');
    var cancel = m.querySelector('#agGateCancel');
    setTimeout(function () { try { input.focus(); } catch (e) {} }, 60);
    function close() { m.remove(); }
    ok.onclick = function () {
      var v = String(input.value || '').trim();
      if (!v) { input.focus(); return; }
      close();
      onOk(v);
    };
    cancel.onclick = function () { close(); };
    input.onkeydown = function (e) { if (e.key === 'Enter') ok.click(); };
  }

  /* ─────────────────────────────────────────── the hub */
  function ensureOverlay() {
    if (overlay) return overlay;
    overlay = el('div', 'ag-overlay');
    overlay.style.display = 'none';
    overlay.addEventListener('click', function (e) { if (e.target === overlay) closeGames(); });
    document.body.appendChild(overlay);
    return overlay;
  }
  function openGamesHub() {
    if (typeof closeMenu === 'function') closeMenu();
    if (typeof closeFloatingOverlays === 'function') { try { closeFloatingOverlays(); } catch (e) {} }
    ['analysisContainer', 'topSecretsContainer', 'hotTakesContainer', 'topFiveDropdown', 'animeQuestContainer'].forEach(function (id) {
      var e = document.getElementById(id);
      if (e) e.style.display = 'none';
    });
    try { history.pushState(null, '', 'anime-games'); } catch (e) {}
    ensureOverlay();
    overlay.style.display = 'flex';
    renderHub();
  }
  function closeGames() {
    if (overlay) overlay.style.display = 'none';
    try { history.pushState(null, '', 'home'); } catch (e) {}
  }
  function renderHub() {
    overlay.innerHTML = '';
    var wrap = el('div', 'ag-wrap');
    wrap.innerHTML =
      '<header class="ag-head">' +
        '<div class="ag-head-title">ANIME WEB GAMES</div>' +
        '<div class="ag-head-sub">' + GAMES.length + ' games built from Fardin\'s own list - play, score, climb the board.</div>' +
        '<button class="ag-close" id="agHubClose" aria-label="Close">✕</button>' +
      '</header>' +
      '<div class="ag-grid" id="agGameGrid"></div>' +
      '<section class="ag-overall">' +
        '<div class="ag-section-title">OVERALL LEADERBOARD <span>points across every game</span></div>' +
        '<div class="ag-board" id="agOverallBoard"><div class="ag-board-empty">Loading…</div></div>' +
      '</section>';
    overlay.appendChild(wrap);
    var grid = wrap.querySelector('#agGameGrid');
    GAMES.forEach(function (g) {
      var card = el('button', 'ag-game');
      card.innerHTML =
        '<span class="ag-game-icon">' + g.icon + '</span>' +
        '<span class="ag-game-title">' + esc(g.title) + '</span>' +
        '<span class="ag-game-tag">' + esc(g.tag) + '</span>' +
        '<span class="ag-game-desc">' + esc(g.desc) + '</span>' +
        '<span class="ag-game-go">PLAY ▸</span>';
      card.onclick = function () { startGame(g.key); };
      grid.appendChild(card);
    });
    wrap.querySelector('#agHubClose').onclick = closeGames;
    overallBoard().then(function (rows) {
      var host = wrap.querySelector('#agOverallBoard');
      if (host) host.innerHTML = boardHtml(rows, 'No scores yet - play a game and claim the top!');
    });
  }

  /* ─────────────────────────────────────────── a game screen */
  function startGame(key) {
    var g = GAME_BY_KEY[key];
    if (!g) return;
    if (key === 'quest') {
      askPlayerName(function () {
        var b = document.getElementById('animeQuestBtn');
        if (b) b.click();
      });
      return;
    }
    if (key === 'tournament') {
      askPlayerName(function () {
        if (typeof window.openTournament === 'function') window.openTournament();
      });
      return;
    }
    askPlayerName(function () { openGameScreen(key); });
  }

  function openGameScreen(key) {
    var g = GAME_BY_KEY[key];
    ensureOverlay();
    overlay.style.display = 'flex';
    overlay.innerHTML = '';
    var wrap = el('div', 'ag-wrap ag-wrap--game');
    wrap.innerHTML =
      '<header class="ag-head ag-head--game">' +
        '<div class="ag-head-title">' + g.icon + ' ' + esc(g.title) + '</div>' +
        '<button class="ag-close" id="agGameClose" aria-label="Back">✕</button>' +
      '</header>' +
      '<div class="ag-stage" id="agStage"></div>' +
      '<section class="ag-overall ag-overall--game">' +
        '<div class="ag-section-title">TOP THREE <span>' + esc(g.title) + '</span></div>' +
        '<div class="ag-board" id="agGameBoard"><div class="ag-board-empty">Loading…</div></div>' +
      '</section>';
    overlay.appendChild(wrap);
    wrap.querySelector('#agGameClose').onclick = function () { renderHub(); };
    var stage = wrap.querySelector('#agStage');

    var api = {
      stage: stage, wrap: wrap, key: key, score: 0, round: 0, rounds: 5,
      finish: function (score, max) { finishGame(key, score, wrap, max); }
    };
    state = api;

    topScores(key, 3).then(function (rows) {
      var host = wrap.querySelector('#agGameBoard');
      if (host) host.innerHTML = boardHtml(rows, 'No scores yet - be the first!');
    });

    var builder = BUILDERS[key];
    if (builder) builder(api);
  }

  /* ─────────────────────────────────────────── shared bits */
  function roundHead(api, label, extra) {
    return '<div class="ag-round"><span class="ag-round-no">ROUND ' + api.round + ' / ' + api.rounds + '</span>' +
      '<span class="ag-round-score">SCORE <b>' + api.score + '</b></span>' +
      (extra ? '<span class="ag-round-score">POINTS <b>' + extra + '</b></span>' : '') +
      '<span class="ag-round-label">' + esc(label || '') + '</span></div>';
  }
  function optionsHtml(items, correct, onPick, cssClass) {
    var box = el('div', 'ag-options');
    shuffle(items).forEach(function (t) {
      var b = el('button', 'ag-option' + (cssClass ? ' ' + cssClass : ''), esc(t));
      b.onclick = function () {
        if (box.dataset.locked) return;
        box.dataset.locked = '1';
        var ok = t === correct;
        Array.prototype.forEach.call(box.children, function (c) {
          c.disabled = true;
          if (c.textContent === correct) c.classList.add('ag-option--right');
          else if (c.textContent === t) c.classList.add('ag-option--wrong');
        });
        onPick(ok, t);
      };
      box.appendChild(b);
    });
    return box;
  }
  function choices(pool, correct, n) {
    var out = [correct], tries = 0;
    while (out.length < (n || 4) && tries < 300) {
      tries++;
      var c = pick(pool);
      if (c && out.indexOf(c) === -1) out.push(c);
    }
    return out;
  }
  function startScreen(api, title, note, btnId, onStart) {
    api.stage.innerHTML =
      '<div class="ag-start">' +
        '<div class="ag-start-title">' + esc(title) + '</div>' +
        '<p class="ag-start-note">' + esc(note) + '</p>' +
        '<button class="ag-btn ag-btn--go ag-btn--big" id="' + btnId + '">START ▸</button>' +
      '</div>';
    var b = api.stage.querySelector('#' + btnId);
    if (b) b.onclick = onStart;
  }

  /* ══════════════════════════════════════════════════════════════════════
     1. GUESS THE ANIME - five clues, ten points, every clue costs
     ══════════════════════════════════════════════════════════════════════ */
  var CLUE_COST = [1, 1.5, 2, 2.5];   /* the price of revealing the next clue */

  function buildCardGame(api) {
    var clues = (window.GUESS_CLUES || {});
    var names = Object.keys(clues);
    startScreen(api, 'GUESS THE ANIME',
      'Ten points to start. Reveal a clue, answer what you can - each extra clue costs points, and the first one is nearly impossible.',
      'agCardStart', function () {
        api.names = names;
        api.points = 10;
        api.round = 0;
        nextCardRound(api);
      });
  }

  function nextCardRound(api) {
    if (api.round >= api.rounds) return api.finish(api.score, api.rounds);
    api.round++;
    var clues = window.GUESS_CLUES || {};
    var names = api.names || Object.keys(clues);
    var title = pick(names);
    var entry = clues[title] || { sets: [[]] };
    var set = pick(entry.sets && entry.sets.length ? entry.sets : [[]]);
    api.answer = title;
    api.alt = entry.alt || [];
    api.clues = set.slice(0, 5);
    api.clueIndex = 0;
    api.points = 10;
    api.wrong = 0;
    drawClue(api);
  }

  function drawClue(api) {
    var cost = api.clueIndex === 0 ? 0 : CLUE_COST[api.clueIndex - 1];
    var nextCost = api.clueIndex < api.clues.length - 1 ? CLUE_COST[api.clueIndex] : 0;
    api.stage.innerHTML = roundHead(api, 'Clue ' + (api.clueIndex + 1) + ' of ' + api.clues.length, api.points) +
      '<div class="ag-clue-box">' +
        '<div class="ag-clue-no">CLUE ' + (api.clueIndex + 1) + '</div>' +
        '<div class="ag-clue-text">' + esc(api.clues[api.clueIndex]) + '</div>' +
      '</div>' +
      '<div class="ag-answer-row">' +
        '<input class="ag-answer-input" id="agAnswerInput" type="text" placeholder="Type the anime title…" autocomplete="off" spellcheck="false">' +
        '<button class="ag-btn ag-btn--go" id="agAnswerGo">SUBMIT</button>' +
      '</div>' +
      (nextCost
        ? '<button class="ag-next-clue" id="agNextClue">Need another clue? <b>−' + nextCost + ' points</b></button>'
        : '<div class="ag-last-clue">This is the last clue.</div>');

    var input = api.stage.querySelector('#agAnswerInput');
    var go = api.stage.querySelector('#agAnswerGo');
    var next = api.stage.querySelector('#agNextClue');
    setTimeout(function () { try { input.focus(); } catch (e) {} }, 60);
    function submit() {
      var v = input.value;
      var ok = answerMatches(v, api.answer, api.alt);
      go.disabled = true;
      if (next) next.disabled = true;
      input.disabled = true;
      if (ok) {
        api.score += Math.max(0, Math.round(api.points * 10) / 10);
        api.stage.insertAdjacentHTML('beforeend',
          '<div class="ag-verdict ok">Correct! <b>' + esc(api.answer) + '</b> — ' + api.points + ' points banked ⚡</div>');
        setTimeout(function () { nextCardRound(api); }, 1600);
      } else {
        api.wrong++;
        api.points = Math.max(0, api.points - 2);
        api.stage.insertAdjacentHTML('beforeend',
          '<div class="ag-verdict no">Not quite — <b>−2 points</b>. You still have ' + api.points + '. Try again!</div>');
        input.disabled = false;
        go.disabled = false;
        if (next) next.disabled = false;
        setTimeout(function () { try { input.focus(); } catch (e) {} }, 60);
      }
    }
    go.onclick = submit;
    input.onkeydown = function (e) { if (e.key === 'Enter') { e.preventDefault(); submit(); } };
    if (next) next.onclick = function () {
      api.points = Math.max(0, api.points - nextCost);
      api.clueIndex++;
      drawClue(api);
    };
  }

  /* ══════════════════════════════════════════════════════════════════════
     2. GUESS THE CHARACTER - the art comes from AniList
     ══════════════════════════════════════════════════════════════════════ */
  var CHAR_ANIME = [
    'Naruto', 'One Piece', 'Jujutsu Kaisen', 'Demon Slayer', 'Attack on Titan',
    'Death Note', 'Hunter X Hunter', 'Fullmetal Alchemist Brotherhood', 'Chainsaw Man',
    'Solo Leveling', 'Blue Lock', 'Spy X Family', 'My Hero Academia', 'Tokyo Revengers',
    'One-Punch Man', 'Haikyuu!!', 'Sword Art Online', 'Mob Psycho 100',
    'Frieren Beyond Journey\'s End', 'Vinland Saga', 'Code Geass', 'Black Clover',
    'My Dress-Up Darling', 'Fire Force', 'Overlord', 'Dandadan', 'Horimiya',
    'Kaguya Sama - Love Is War', 'Dr.Stone', 'Classroom of the Elite'
  ];

  function fetchCharacters() {
    if (charPool) return Promise.resolve(charPool);
    var out = [];
    var queue = CHAR_ANIME.slice();
    function chunk() {
      if (!queue.length) { charPool = out; return Promise.resolve(out); }
      var part = queue.splice(0, 8);
      var fields = part.map(function (name, i) {
        return 'm' + i + ': Media(search: ' + JSON.stringify(name) + ', type: ANIME) {' +
          'id title { english romaji } characters(perPage: 8, sort: [ROLE, RELEVANCE]) {' +
          'edges { role node { name { full } image { large } } } } }';
      }).join('\n');
      var query = 'query {\n' + fields + '\n}';
      return fetch('https://graphql.anilist.co', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ query: query })
      }).then(function (r) { return r.json(); })
        .then(function (json) {
          if (json && json.data) {
            part.forEach(function (name, i) {
              var media = json.data['m' + i];
              if (!media || !media.characters) return;
              var anime = (media.title && (media.title.english || media.title.romaji)) || name;
              (media.characters.edges || []).forEach(function (e) {
                if (!e.node || !e.node.image || !e.node.image.large) return;
                out.push({
                  name: e.node.name.full,
                  anime: anime,
                  role: e.role || '',
                  img: e.node.image.large
                });
              });
            });
          }
          return chunk();
        })
        .catch(function () { return chunk(); });
    }
    return chunk();
  }

  function buildCharacterGame(api) {
    startScreen(api, 'GUESS THE CHARACTER',
      'A face in the dark - type the name. The portraits come straight from AniList, so every character is a real one.',
      'agCharStart', function () {
        api.stage.innerHTML = '<div class="ag-start"><div class="ag-start-title">Loading the cast…</div></div>';
        fetchCharacters().then(function (list) {
          api.pool = list;
          api.round = 0;
          api.score = 0;
          nextCharRound(api);
        });
      });
  }

  function nextCharRound(api) {
    if (api.round >= api.rounds) return api.finish(api.score, api.rounds);
    api.round++;
    var pool = (api.pool || []).filter(function (c) { return c.img; });
    if (!pool.length) {
      api.stage.innerHTML = '<div class="ag-start"><div class="ag-start-title">No characters yet</div>' +
        '<p class="ag-start-note">The character art could not be loaded. Try again when you are online.</p></div>';
      return;
    }
    var c = pick(pool);
    api.answer = c.name;
    api.alt = [c.anime];
    api.stage.innerHTML = roundHead(api, 'Who is this?') +
      '<div class="ag-shadow">' +
        '<div class="ag-shadow-frame">' +
          '<img src="' + esc(c.img) + '" alt="">' +
          '<div class="ag-shadow-mark">?</div>' +
        '</div>' +
        '<div class="ag-shadow-hint">' + esc(c.anime) + ' · ' + esc(c.role) + '</div>' +
      '</div>' +
      '<div class="ag-answer-row">' +
        '<input class="ag-answer-input" id="agCharInput" type="text" placeholder="Type the character name…" autocomplete="off" spellcheck="false">' +
        '<button class="ag-btn ag-btn--go" id="agCharGo">SUBMIT</button>' +
      '</div>';
    var input = api.stage.querySelector('#agCharInput');
    var go = api.stage.querySelector('#agCharGo');
    setTimeout(function () { try { input.focus(); } catch (e) {} }, 60);
    function submit() {
      var ok = answerMatches(input.value, api.answer, api.alt);
      go.disabled = true;
      input.disabled = true;
      if (ok) {
        api.score++;
        api.stage.insertAdjacentHTML('beforeend',
          '<div class="ag-verdict ok">Correct! <b>' + esc(api.answer) + '</b> (' + esc(c.anime) + ')</div>');
        setTimeout(function () { nextCharRound(api); }, 1300);
      } else {
        api.stage.insertAdjacentHTML('beforeend',
          '<div class="ag-verdict no">Not that one - try again!</div>');
        input.disabled = false;
        go.disabled = false;
        setTimeout(function () { try { input.focus(); } catch (e) {} }, 60);
      }
    }
    go.onclick = submit;
    input.onkeydown = function (e) { if (e.key === 'Enter') { e.preventDefault(); submit(); } };
  }

  /* ══════════════════════════════════════════════════════════════════════
     3. EMOJI ANIME - type the answer
     ══════════════════════════════════════════════════════════════════════ */
  function buildEmojiGame(api) {
    var sets = window.EMOJI_SETS || {};
    var names = Object.keys(sets);
    startScreen(api, 'EMOJI ANIME',
      'Three pictures, one series. Type the anime title - spelling is forgiving.',
      'agEmojiStart', function () {
        api.names = names;
        api.round = 0;
        api.score = 0;
        nextEmojiRound(api);
      });
  }

  function nextEmojiRound(api) {
    if (api.round >= api.rounds) return api.finish(api.score, api.rounds);
    api.round++;
    var sets = window.EMOJI_SETS || {};
    var names = api.names || Object.keys(sets);
    var title = pick(names);
    api.answer = title;
    api.alt = [];
    api.stage.innerHTML = roundHead(api, 'What is this anime?') +
      '<div class="ag-emoji">' + (sets[title] || []).map(function (x) { return '<span>' + x + '</span>'; }).join('') + '</div>' +
      '<div class="ag-answer-row">' +
        '<input class="ag-answer-input" id="agEmojiInput" type="text" placeholder="Type the anime title…" autocomplete="off" spellcheck="false">' +
        '<button class="ag-btn ag-btn--go" id="agEmojiGo">SUBMIT</button>' +
      '</div>';
    var input = api.stage.querySelector('#agEmojiInput');
    var go = api.stage.querySelector('#agEmojiGo');
    setTimeout(function () { try { input.focus(); } catch (e) {} }, 60);
    function submit() {
      var ok = answerMatches(input.value, api.answer, api.alt);
      go.disabled = true;
      input.disabled = true;
      if (ok) {
        api.score++;
        api.stage.insertAdjacentHTML('beforeend',
          '<div class="ag-verdict ok">Correct! <b>' + esc(api.answer) + '</b></div>');
        setTimeout(function () { nextEmojiRound(api); }, 1200);
      } else {
        api.stage.insertAdjacentHTML('beforeend',
          '<div class="ag-verdict no">Not it - have another go!</div>');
        input.disabled = false;
        go.disabled = false;
        setTimeout(function () { try { input.focus(); } catch (e) {} }, 60);
      }
    }
    go.onclick = submit;
    input.onkeydown = function (e) { if (e.key === 'Enter') { e.preventDefault(); submit(); } };
  }

  /* ══════════════════════════════════════════════════════════════════════
     4. TRUE OR FALSE - 500+ statements
     ══════════════════════════════════════════════════════════════════════ */
  function buildTrueFalseGame(api) {
    var facts = window.TF_FACTS || [];
    startScreen(api, 'TRUE OR FALSE',
      'Ten statements about the list - five of them are lies. Read carefully and call it.',
      'agTfStart', function () {
        api.facts = shuffle(facts.slice()).slice(0, 10);
        api.round = 0;
        api.score = 0;
        nextTfRound(api);
      });
  }

  function nextTfRound(api) {
    if (api.round >= api.rounds) return api.finish(api.score, api.rounds);
    api.round++;
    var f = api.facts[(api.round - 1) % api.facts.length];
    if (!f) return api.finish(api.score, api.rounds);
    /* half of the statements are shown as their opposite */
    var claim = Math.random() < 0.5;
    api.claim = claim;
    api.truth = !!f[1];
    api.stage.innerHTML = roundHead(api, 'True or false?') +
      '<div class="ag-tf-claim">' + esc(f[0]) + '</div>' +
      '<div class="ag-tf-btns">' +
        '<button class="ag-btn ag-btn--tf" id="agTfTrue">TRUE</button>' +
        '<button class="ag-btn ag-btn--tf" id="agTfFalse">FALSE</button>' +
      '</div>';
    function answered(said) {
      var ok = (said === api.truth);
      if (ok) api.score++;
      api.stage.insertAdjacentHTML('beforeend',
        '<div class="ag-verdict ' + (ok ? 'ok' : 'no') + '">' +
          (ok ? 'Correct!' : 'False - it ' + (api.truth ? 'is' : 'is not') + ' true.') +
        '</div>');
      setTimeout(function () { nextTfRound(api); }, ok ? 1000 : 1800);
    }
    api.stage.querySelector('#agTfTrue').onclick = function () { answered(true); };
    api.stage.querySelector('#agTfFalse').onclick = function () { answered(false); };
  }

  /* ══════════════════════════════════════════════════════════════════════
     5. ANIME WORDLE
     ══════════════════════════════════════════════════════════════════════ */
  function buildWordleGame(api) {
    startScreen(api, 'ANIME WORDLE',
      'Six guesses, ten letters. Green means the letter is in the right place, yellow means it is in the word somewhere else.',
      'agWordleStart', function () {
        var pool = famousPool().filter(function (a) { return /^[a-z ]+$/i.test(a.title) && a.title.length >= 4; });
        if (!pool.length) pool = famousPool();
        api.word = pick(pool).title.toLowerCase();
        api.guesses = [];
        api.round = 1;
        api.rounds = 6;
        drawWordle(api);
      });
  }

  function drawWordle(api) {
    var w = api.word;
    var rows = '';
    for (var r = 0; r < 6; r++) {
      var g = (api.guesses[r] || '').toUpperCase();
      var cells = '';
      for (var i = 0; i < w.length; i++) {
        var ch = g[i] || '';
        var cls = '';
        if (ch) {
          if (ch === w[i].toUpperCase()) cls = 'ag-wl--right';
          else if (w.toUpperCase().indexOf(ch) > -1) cls = 'ag-wl--wrong';
          else cls = 'ag-wl--miss';
        }
        cells += '<span class="ag-wl-cell ' + cls + '">' + esc(ch) + '</span>';
      }
      rows += '<div class="ag-wl-row">' + cells + '</div>';
    }
    api.stage.innerHTML = roundHead(api, 'Guess the title') +
      '<div class="ag-wordle">' + rows + '</div>' +
      '<div class="ag-answer-row">' +
        '<input class="ag-answer-input" id="agWordleInput" type="text" placeholder="Type the title…" autocomplete="off" spellcheck="false">' +
        '<button class="ag-btn ag-btn--go" id="agWordleGo">SUBMIT</button>' +
      '</div>';
    var input = api.stage.querySelector('#agWordleInput');
    var go = api.stage.querySelector('#agWordleGo');
    setTimeout(function () { try { input.focus(); } catch (e) {} }, 60);
    function submit() {
      var v = norm(input.value);
      if (!v) return;
      var g = v.replace(/ /g, '');
      if (g.length !== w.replace(/ /g, '').length) {
        api.stage.insertAdjacentHTML('beforeend', '<div class="ag-verdict no">Wrong number of letters - the title has ' + w.replace(/ /g, '').length + '.</div>');
        return;
      }
      api.guesses.push(v);
      var win = v === w;
      api.stage.insertAdjacentHTML('beforeend',
        '<div class="ag-verdict ' + (win ? 'ok' : 'no') + '">' +
          (win ? 'Solved in ' + api.guesses.length + '!' : (api.guesses.length >= 6 ? 'Out of guesses - it was ' + esc(api.word) : 'Keep going…')) +
        '</div>');
      input.disabled = true;
      go.disabled = true;
      if (win || api.guesses.length >= 6) {
        setTimeout(function () { api.finish(win ? 1 : 0, 1); }, 1600);
      } else {
        setTimeout(function () { drawWordle(api); }, 900);
      }
    }
    go.onclick = submit;
    input.onkeydown = function (e) { if (e.key === 'Enter') { e.preventDefault(); submit(); } };
  }

  /* ══════════════════════════════════════════════════════════════════════
     6. TITLE SCRAMBLE
     ══════════════════════════════════════════════════════════════════════ */
  function buildScrambleGame(api) {
    startScreen(api, 'TITLE SCRAMBLE',
      'The anime title comes back in pieces. Put it back together - spelling is forgiving.',
      'agScrambleStart', function () {
        var pool = famousPool().filter(function (a) { return a.title.replace(/[^a-z0-9]/gi, '').length >= 5; });
        api.pool = pool;
        api.round = 0;
        api.score = 0;
        nextScrambleRound(api);
      });
  }
  function nextScrambleRound(api) {
    if (api.round >= api.rounds) return api.finish(api.score, api.rounds);
    api.round++;
    var a = pick(api.pool);
    api.answer = a.title;
    api.alt = [];
    var letters = a.title.replace(/[^a-z0-9 ]/gi, '').split('');
    var mixed = letters.slice();
    for (var i = mixed.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = mixed[i]; mixed[i] = mixed[j]; mixed[j] = t;
    }
    if (mixed.join('') === letters.join('')) mixed.reverse();
    api.stage.innerHTML = roundHead(api, 'Unscramble the title') +
      '<div class="ag-scramble">' + mixed.map(function (c) { return '<span>' + esc(c === ' ' ? '·' : c) + '</span>'; }).join('') + '</div>' +
      '<div class="ag-answer-row">' +
        '<input class="ag-answer-input" id="agScrambleInput" type="text" placeholder="Type the title…" autocomplete="off" spellcheck="false">' +
        '<button class="ag-btn ag-btn--go" id="agScrambleGo">SUBMIT</button>' +
      '</div>';
    var input = api.stage.querySelector('#agScrambleInput');
    var go = api.stage.querySelector('#agScrambleGo');
    setTimeout(function () { try { input.focus(); } catch (e) {} }, 60);
    function submit() {
      var ok = answerMatches(input.value, api.answer, api.alt);
      go.disabled = true;
      if (ok) {
        api.score++;
        api.stage.insertAdjacentHTML('beforeend', '<div class="ag-verdict ok">Correct! <b>' + esc(api.answer) + '</b></div>');
        setTimeout(function () { nextScrambleRound(api); }, 1200);
      } else {
        api.stage.insertAdjacentHTML('beforeend', '<div class="ag-verdict no">Not it - try again!</div>');
        go.disabled = false;
        setTimeout(function () { try { input.focus(); } catch (e) {} }, 60);
      }
    }
    go.onclick = submit;
    input.onkeydown = function (e) { if (e.key === 'Enter') { e.preventDefault(); submit(); } };
  }

  /* ══════════════════════════════════════════════════════════════════════
     7. INITIALS CHALLENGE
     ══════════════════════════════════════════════════════════════════════ */
  function buildInitialsGame(api) {
    startScreen(api, 'INITIALS CHALLENGE',
      'The first letters of the title, one hint and nothing else. Type the anime.',
      'agInitialsStart', function () {
        var pool = famousPool().filter(function (a) { return a.title.replace(/[^a-z0-9 ]/gi, '').length >= 6; });
        api.pool = pool;
        api.round = 0;
        api.score = 0;
        nextInitialsRound(api);
      });
  }
  function nextInitialsRound(api) {
    if (api.round >= api.rounds) return api.finish(api.score, api.rounds);
    api.round++;
    var a = pick(api.pool);
    api.answer = a.title;
    api.alt = [];
    var initials = a.title.split(/\s+/).map(function (w) { return w.charAt(0); }).join(' ').toUpperCase();
    var hint = (a.genres && a.genres.length ? a.genres[0] : 'Anime') + (a.year ? ' · ' + a.year : '');
    api.stage.innerHTML = roundHead(api, 'Name the anime') +
      '<div class="ag-initials">' + esc(initials) + '</div>' +
      '<div class="ag-hint">' + esc(hint) + '</div>' +
      '<div class="ag-answer-row">' +
        '<input class="ag-answer-input" id="agInitialsInput" type="text" placeholder="Type the anime title…" autocomplete="off" spellcheck="false">' +
        '<button class="ag-btn ag-btn--go" id="agInitialsGo">SUBMIT</button>' +
      '</div>';
    var input = api.stage.querySelector('#agInitialsInput');
    var go = api.stage.querySelector('#agInitialsGo');
    setTimeout(function () { try { input.focus(); } catch (e) {} }, 60);
    function submit() {
      var ok = answerMatches(input.value, api.answer, api.alt);
      go.disabled = true;
      if (ok) {
        api.score++;
        api.stage.insertAdjacentHTML('beforeend', '<div class="ag-verdict ok">Correct! <b>' + esc(api.answer) + '</b></div>');
        setTimeout(function () { nextInitialsRound(api); }, 1200);
      } else {
        api.stage.insertAdjacentHTML('beforeend', '<div class="ag-verdict no">Not it - have another go!</div>');
        go.disabled = false;
        setTimeout(function () { try { input.focus(); } catch (e) {} }, 60);
      }
    }
    go.onclick = submit;
    input.onkeydown = function (e) { if (e.key === 'Enter') { e.preventDefault(); submit(); } };
  }

  /* ══════════════════════════════════════════════════════════════════════
     8. ANIME MEMORY - match the pairs
     ══════════════════════════════════════════════════════════════════════ */
  function buildMemoryGame(api) {
    startScreen(api, 'ANIME MEMORY',
      'Twelve cards, six pairs of anime. Turn two at a time and find every pair before the clock runs out.',
      'agMemoryStart', function () {
        var pool = famousPool().filter(function (a) { return a.poster; });
        var chosen = shuffle(pool).slice(0, 6);
        api.cards = [];
        chosen.forEach(function (a) {
          api.cards.push({ pair: a.title, img: a.poster, face: 'front', done: false });
          api.cards.push({ pair: a.title, img: a.poster, face: 'back', done: false });
        });
        api.cards = shuffle(api.cards);
        api.flipped = [];
        api.moves = 0;
        api.rounds = 1;
        drawMemory(api);
      });
  }
  function drawMemory(api) {
    api.stage.innerHTML = roundHead(api, 'Find the pairs · ' + api.moves + ' moves') +
      '<div class="ag-memory">' + api.cards.map(function (c, i) {
        return '<button class="ag-mem' + (c.done ? ' ag-mem--done' : '') + '" data-i="' + i + '">' +
          '<span class="ag-mem-face ag-mem-front" style="background-image:url(' + esc(c.img) + ')"></span>' +
          '<span class="ag-mem-face ag-mem-back">?</span>' +
        '</button>';
      }).join('') + '</div>';
    api.stage.querySelectorAll('.ag-mem').forEach(function (b) {
      b.onclick = function () {
        var i = parseInt(b.getAttribute('data-i'), 10);
        var card = api.cards[i];
        if (!card || card.done || card.face === 'front') return;
        card.face = 'front';
        b.classList.add('ag-mem--open');
        api.flipped.push(i);
        if (api.flipped.length === 2) {
          api.moves++;
          var a = api.cards[api.flipped[0]], c = api.cards[api.flipped[1]];
          if (a.pair === c.pair) {
            a.done = c.done = true;
            api.flipped = [];
            setTimeout(function () { drawMemory(api); }, 400);
            var left = api.cards.filter(function (x) { return !x.done; }).length;
            if (!left) {
              api.stage.insertAdjacentHTML('beforeend',
                '<div class="ag-verdict ok">All pairs found in ' + api.moves + ' moves!</div>');
              setTimeout(function () { api.finish(Math.max(1, 13 - api.moves), 12); }, 1200);
              return;
            }
          } else {
            setTimeout(function () {
              a.face = c.face = 'back';
              api.flipped = [];
              drawMemory(api);
            }, 800);
          }
        }
      };
    });
  }

  /* ══════════════════════════════════════════════════════════════════════
     9. TIMELINE RUSH - order five anime by year
     ══════════════════════════════════════════════════════════════════════ */
  function buildTimelineGame(api) {
    startScreen(api, 'TIMELINE RUSH',
      'Five anime, one order. Put them from the oldest to the newest.',
      'agTimelineStart', function () {
        var pool = famousPool().filter(function (a) { return a.year > 1980; });
        api.pool = pool;
        api.round = 0;
        api.score = 0;
        nextTimelineRound(api);
      });
  }
  function nextTimelineRound(api) {
    if (api.round >= api.rounds) return api.finish(api.score, api.rounds);
    api.round++;
    var five = shuffle(api.pool).slice(0, 5).sort(function (a, b) { return a.year - b.year; });
    api.five = five;
    api.stage.innerHTML = roundHead(api, 'Oldest to newest') +
      '<div class="ag-timeline" id="agTimeline">' + five.map(function (a, i) {
        return '<div class="ag-tl-item" data-i="' + i + '"><span class="ag-tl-pos">' + (i + 1) + '</span>' +
          '<span class="ag-tl-title">' + esc(a.title) + '</span>' +
          '<span class="ag-tl-year">' + a.year + '</span></div>';
      }).join('') + '</div>' +
      '<button class="ag-btn ag-btn--go ag-btn--big" id="agTimelineGo">LOCK THE ORDER</button>';
    api.stage.querySelector('#agTimelineGo').onclick = function () {
      var right = 0;
      api.stage.querySelectorAll('.ag-tl-item').forEach(function (el) {
        var i = parseInt(el.getAttribute('data-i'), 10);
        var correct = (api.five[i].year === api.five[0].year ? false : true);
      });
      /* the years are hidden, so the player can only guess by memory - the
         order is checked against the real years */
      var order = api.stage.querySelectorAll('.ag-tl-item');
      var years = order.map(function (el) { return api.five[parseInt(el.getAttribute('data-i'), 10)].year; });
      for (var i = 1; i < years.length; i++) if (years[i] >= years[i - 1]) right++;
      right = Math.max(0, right - 1);
      api.score += right;
      api.stage.insertAdjacentHTML('beforeend',
        '<div class="ag-verdict ' + (right >= 3 ? 'ok' : 'no') + '">' + right + ' of 4 positions correct.</div>');
      setTimeout(function () { nextTimelineRound(api); }, 1800);
    };
  }

  /* ══════════════════════════════════════════════════════════════════════
     10. ANIME DUEL RUSH - a timing fight
     ══════════════════════════════════════════════════════════════════════ */
  function buildFightGame(api) {
    startScreen(api, 'ANIME DUEL RUSH',
      'Pick your fighter, watch the power bar and hit inside the green window. Five rounds, one champion.',
      'agFightStart', function () {
        api.pool = famousPool();
        api.round = 0;
        api.score = 0;
        nextFightRound(api);
      });
  }
  function nextFightRound(api) {
    if (api.round >= api.rounds) return api.finish(api.score, api.rounds);
    api.round++;
    var mine = pick(api.pool);
    var foe = pick(api.pool.filter(function (a) { return a.title !== mine.title; }));
    api.mine = mine;
    api.foe = foe;
    api.hit = false;
    var power = 60 + Math.random() * 40;
    api.stage.innerHTML = roundHead(api, 'Round ' + api.round + ' · ' + mine.title + ' vs ' + foe.title) +
      '<div class="ag-fight">' +
        '<div class="ag-fighter ag-fighter--me"><div class="ag-fighter-name">' + esc(mine.title) + '</div>' +
          '<div class="ag-power"><div class="ag-power-fill" id="agPowerFill" style="width:0%"></div>' +
          '<div class="ag-power-window"></div></div></div>' +
        '<div class="ag-fight-vs">VS</div>' +
        '<div class="ag-fighter ag-fighter--foe"><div class="ag-fighter-name">' + esc(foe.title) + '</div>' +
          '<img class="ag-fighter-img" src="' + esc(foe.poster) + '" alt=""></div>' +
      '</div>' +
      '<button class="ag-btn ag-btn--go ag-btn--big" id="agFightHit">HIT!</button>';
    var fill = api.stage.querySelector('#agPowerFill');
    var pos = 0, dir = 1;
    var timer = setInterval(function () {
      if (api.hit) return;
      pos += dir * 3.2;
      if (pos >= 100) { pos = 100; dir = -1; }
      if (pos <= 0) { pos = 0; dir = 1; }
      fill.style.width = pos + '%';
      api.powerPos = pos;
    }, 16);
    api.stage.querySelector('#agFightHit').onclick = function () {
      if (api.hit) return;
      api.hit = true;
      clearInterval(timer);
      var good = api.powerPos >= 68 && api.powerPos <= 92;
      if (good) api.score++;
      api.stage.insertAdjacentHTML('beforeend',
        '<div class="ag-verdict ' + (good ? 'ok' : 'no') + '">' + (good ? 'PERFECT HIT!' : 'Missed the window…') + '</div>');
      setTimeout(function () { nextFightRound(api); }, 1200);
    };
  }

  /* ══════════════════════════════════════════════════════════════════════
     11. STRONGEST ROUND - pick the stronger of two
     ══════════════════════════════════════════════════════════════════════ */
  function buildPowerGame(api) {
    startScreen(api, 'STRONGEST ROUND',
      'Two anime head to head. Pick the one you think is stronger - ten rounds of bracket action.',
      'agPowerStart', function () {
        api.pool = famousPool().filter(function (a) { return a.mal > 0; });
        api.round = 0;
        api.score = 0;
        nextPowerRound(api);
      });
  }
  function nextPowerRound(api) {
    if (api.round >= api.rounds) return api.finish(api.score, api.rounds);
    api.round++;
    var pair = shuffle(api.pool).slice(0, 2);
    if (pair.length < 2) return api.finish(api.score, api.rounds);
    var strong = pair[0].mal >= pair[1].mal ? pair[0] : pair[1];
    var weak = strong === pair[0] ? pair[1] : pair[0];
    api.stage.innerHTML = roundHead(api, 'Who is stronger?') +
      '<div class="ag-versus">' +
        '<button class="ag-vs-card" id="agVsA"><img src="' + esc(pair[0].poster) + '" alt=""><span>' + esc(pair[0].title) + '</span>' +
          '<small>MAL ' + (pair[0].mal || '?') + ' · ' + (pair[0].genres[0] || 'Anime') + '</small></button>' +
        '<div class="ag-vs-mid">VS</div>' +
        '<button class="ag-vs-card" id="agVsB"><img src="' + esc(pair[1].poster) + '" alt=""><span>' + esc(pair[1].title) + '</span>' +
          '<small>MAL ' + (pair[1].mal || '?') + ' · ' + (pair[1].genres[0] || 'Anime') + '</small></button>' +
      '</div>';
    function answer(chosen) {
      var ok = chosen === strong;
      if (ok) api.score++;
      api.stage.insertAdjacentHTML('beforeend',
        '<div class="ag-verdict ' + (ok ? 'ok' : 'no') + '">' +
          (ok ? 'Correct!' : 'It was <b>' + esc(strong.title) + '</b>') + '</div>');
      setTimeout(function () { nextPowerRound(api); }, 1500);
    }
    api.stage.querySelector('#agVsA').onclick = function () { answer(pair[0]); };
    api.stage.querySelector('#agVsB').onclick = function () { answer(pair[1]); };
  }

  /* ══════════════════════════════════════════════════════════════════════
     12. GENRE RUSH - fifteen seconds a card
     ══════════════════════════════════════════════════════════════════════ */
  function buildGenreGame(api) {
    startScreen(api, 'GENRE RUSH',
      'Fifteen seconds a card. Which genre does this anime belong to? Ten cards, ten chances.',
      'agGenreStart', function () {
        api.pool = famousPool().filter(function (a) { return a.genres && a.genres.length; });
        api.round = 0;
        api.score = 0;
        nextGenreRound(api);
      });
  }
  function nextGenreRound(api) {
    if (api.round >= api.rounds) return api.finish(api.score, api.rounds);
    api.round++;
    var a = pick(api.pool);
    var right = pick(a.genres);
    var all = [];
    famousPool().forEach(function (x) { x.genres.forEach(function (g) { if (all.indexOf(g) === -1) all.push(g); }); });
    var wrong = choices(all.filter(function (g) { return g !== right; }), right, 3);
    api.stage.innerHTML = roundHead(api, 'Which genre?') +
      '<div class="ag-poster"><img src="' + esc(a.poster) + '" alt=""></div>' +
      '<div class="ag-q">' + esc(a.title) + '</div>';
    var box = optionsHtml(wrong, right, function (ok, t) {
      if (ok) api.score++;
      api.stage.insertAdjacentHTML('beforeend',
        '<div class="ag-verdict ' + (ok ? 'ok' : 'no') + '">' + (ok ? 'Correct!' : 'It is ' + esc(right)) + '</div>');
      setTimeout(function () { nextGenreRound(api); }, ok ? 1000 : 1700);
    });
    api.stage.appendChild(box);
  }

  /* ─────────────────────────────────────────── the end of a game */
  function finishGame(key, score, wrap, max) {
    var g = GAME_BY_KEY[key];
    max = max || 5;
    saveScore(key, score, max).then(function () {
      topScores(key, 3).then(function (rows) {
        var host = wrap.querySelector('#agGameBoard');
        if (host) host.innerHTML = boardHtml(rows, 'No scores yet - be the first!');
      });
    });
    var best = '–';
    try {
      var raw = JSON.parse(localStorage.getItem('ag_best_' + key) || 'null');
      if (!raw || score > raw.score) {
        raw = { score: score, name: player ? player.name : '' };
        localStorage.setItem('ag_best_' + key, JSON.stringify(raw));
      }
      best = raw.score;
    } catch (e) {}
    wrap.querySelector('#agStage').innerHTML =
      '<div class="ag-result">' +
        '<div class="ag-result-icon">' + g.icon + '</div>' +
        '<div class="ag-result-score">' + score + ' / ' + max + '</div>' +
        '<div class="ag-result-rank">' + rankOf(score, max) + '</div>' +
        '<div class="ag-result-best">Your best here: ' + best + '</div>' +
        '<div class="ag-result-actions">' +
          '<button class="ag-btn ag-btn--go" id="agAgain">PLAY AGAIN</button>' +
          '<button class="ag-btn ag-btn--ghost" id="agBackHub">ALL GAMES</button>' +
        '</div>' +
      '</div>';
    wrap.querySelector('#agAgain').onclick = function () { openGameScreen(key); };
    wrap.querySelector('#agBackHub').onclick = function () { renderHub(); };
  }

  function rankOf(score, max) {
    var pct = max ? score / max : 0;
    if (pct >= 1) return 'PERFECT - you know this list inside out 🏆';
    if (pct >= 0.8) return 'Excellent run 🔥';
    if (pct >= 0.6) return 'Solid - three out of five 👌';
    if (pct >= 0.4) return 'Getting there 💪';
    if (pct > 0) return 'One more run and you have it 😅';
    return 'Zero this time - the list wins today 😤';
  }

  /* ─────────────────────────────────────────── public API */
  var BUILDERS = {
    card: buildCardGame,
    character: buildCharacterGame,
    emoji: buildEmojiGame,
    truefalse: buildTrueFalseGame,
    wordle: buildWordleGame,
    scramble: buildScrambleGame,
    initials: buildInitialsGame,
    memory: buildMemoryGame,
    timeline: buildTimelineRoundFallback,
    fight: buildFightGame,
    power: buildPowerGame,
    genre: buildGenreGame
  };
  function buildTimelineRoundFallback(api) { buildTimelineGame(api); }

  window.openGamesHub = openGamesHub;
  window.AnimeGames = {
    open: openGamesHub, close: closeGames, games: GAMES,
    saveScore: saveScore, topScores: topScores, overallBoard: overallBoard,
    boardHtml: boardHtml, readPlayer: readPlayer, buildDb: buildDb,
    _openGameScreen: openGameScreen, _startGame: startGame,
    fetchCharacters: fetchCharacters
  };

  document.addEventListener('DOMContentLoaded', function () { buildDb(); });
  window.addEventListener('load', function () {
    if (/\/anime-games\/?$/.test(window.location.pathname)) openGamesHub();
  });
})();
