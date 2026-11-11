/* ══════════════════════════════════════════════════════════════════════
   ANIME WEB GAMES
   A hub of anime games: Anime Quest, Anime Tournament, Guess the Anime
   Card, Guess the Anime Character, Emoji Anime, True or False,
   Guess the Year and the Logo Quiz.

   Every game is built from the site's own data (cards, genres, studios,
   ratings, dub file), so the hub works offline too.
   Signed-in visitors confirm a player name once; the scores go to Supabase
   and every game shows its own top three.
   ══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var SUPABASE_URL = 'https://ldzlefdklcgvqcbqibtt.supabase.co';
  var SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxkemxlZmRrbGNndnFjYnFpYnR0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEwMzk1OTAsImV4cCI6MjA5NjYxNTU5MH0.X3TGuLIpjrnPXMgCv4ZKIIjB6pItPgkdebf4JPdhuYs';
  var SCORES = 'game_scores';
  var PLAYERS = 'game_players';
  var PLAYER_KEY = 'game_player_v1';

  var overlay = null;
  var db = null;              /* the game database */
  var dbReady = false;
  var player = null;          /* { id, name, avatar } */
  var state = null;           /* the running game */
  var lbCache = {};

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

  /* ─────────────────────────────────────────── the game list */
  var GAMES = [
    { key: 'quest', title: 'Anime Quest', icon: '🎯', tag: 'TRIVIA',
      desc: 'Ten trivia questions about the anime you pick. Earn a rank from F to SSS and download your certificate.' },
    { key: 'tournament', title: 'Anime Tournament', icon: '🏆', tag: 'BRACKET',
      desc: 'Draft a roster, pick a genre and auto-simulate the whole bracket until a champion is crowned.' },
    { key: 'card', title: 'Guess the Anime Card', icon: '🃏', tag: 'CLUES',
      desc: 'Clues only - no poster. Name the anime. Five cards, five points, three difficulty levels.' },
    { key: 'character', title: 'Guess the Anime Character', icon: '👤', tag: 'SHADOW',
      desc: 'A face in the dark. Name the character - five rounds, five points.' },
    { key: 'emoji', title: 'Emoji Anime', icon: '😀', tag: 'EMOJIS',
      desc: 'Three little pictures stand in for a whole series. Can you read them?' },
    { key: 'truefalse', title: 'True or False', icon: '⚖️', tag: 'FACTS',
      desc: 'Ten statements about the list - half of them are lies. Spot every one.' },
    { key: 'year', title: 'Guess the Year', icon: '📅', tag: 'YEAR',
      desc: 'The poster is on screen, the year is not. Which year did it start?' },
    { key: 'logo', title: 'Anime Logo Quiz', icon: '🔤', tag: 'LOGO',
      desc: 'The title is masked letter by letter. Fill in the blanks.' }
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
        id: id,
        title: title,
        poster: img ? img.getAttribute('src') : '',
        eps: eps || 0,
        seasonText: seasonText,
        seasons: (seasonText.match(/\d+/g) || []).length,
        year: year,
        airText: r.season || '',
        genres: genresById[id] || [],
        studio: (studios[id] || [])[0] || '',
        mal: r.malScore || 0,
        rank: id
      });
    });

    /* the dub file adds one more clue and one more answer */
    fetch('anime-dubs.json', { cache: 'force-cache' }).then(function (r) {
      return r.ok ? r.json() : null;
    }).then(function (j) {
      var t = j && j.titles ? j.titles : j;
      if (!t) return;
      list.forEach(function (a) {
        var e = t[a.title];
        if (e) { a.dubHi = e.hi || ''; a.dubEn = e.en || ''; }
      });
    }).catch(function () {});

    db = list;
    dbReady = true;
    return db;
  }

  /* the anime everyone knows - used for the "pick a card" games */
  function famousPool() {
    var list = buildDb();
    var withData = list.filter(function (a) { return a.eps > 0 && a.year > 1950; });
    var top = withData.filter(function (a) { return a.id <= 120; });
    return top.length >= 20 ? top : withData;
  }

  /* characters: taken from the waifu gallery, so every one of them is an
     anime that is already on the list */
  function characterPool() {
    var out = [];
    try {
      (typeof waifus !== 'undefined' ? waifus : []).forEach(function (w) {
        if (!w || !w.name || !w.anime) return;
        out.push({ name: w.name, anime: w.anime, img: w.img, first: w.first || '' });
      });
    } catch (e) {}
    return out;
  }

  /* emoji hand-outs for the famous titles */
  var EMOJI_MAP = {
    'My Hero Academia': ['🦸', '💥', '🏫'], 'Naruto': ['🥷', '🍥', '🔥'], 'One Piece': ['🏴‍☠️', '🍖', '⚓'],
    'Naruto Shippuden': ['🥷', '🐍', '🔥'], 'Bleach': ['⚔️', '👻', '🏯'], 'Fairy Tail': ['🧚', '🔥', '🏰'],
    'Demon Slayer: Kimetsu no Yaiba': ['🗡️', '👹', '🌸'], 'Jujutsu Kaisen': ['👻', '👊', '🏯'], 'Attack on Titan': ['🧟', '🗡️', '🪂'],
    'Chainsaw Man': ['🪚', '😈', '🍬'], 'Death Note': ['📒', '💀', '✒️'], 'Hunter x Hunter': ['🎣', '⚔️', '🃏'],
    'Dragon Ball Z': ['🐉', '☄️', '🥋'], 'Fullmetal Alchemist: Brotherhood': ['⚗️', '🔥', '🪖'], 'Tokyo Revengers': ['⏰', '🩸', '🔪'],
    'Solo Leveling': ['👤', '⚔️', '🗡️'], 'Blue Lock': ['⚽', '🔥', '🏟️'], 'Sword Art Online': ['🗡️', '💎', '🎮'],
    'Haikyuu!!': ['🏐', '🏟️', '⚡'], 'Classroom of the Elite': ['🏫', '🎭', '🧠'], 'Vinland Saga': ['🪓', '⚔️', '🐺'],
    'Wind Breaker': ['🛹', '🍥', '💪'], 'Kaiju No. 8': ['👹', '🥷', '🔋'], 'Hell\'s Paradise': ['⚔️', '🗡️', '🏯'], 'Dandadan': ['👻', '🛸', '👽'],
    'Spy x Family': ['🕵️', '👨‍👩‍👧', '🐶'], 'Black Clover': ['🧙', '🌱', '📖'], 'Fire Force': ['🔥', '👨‍🚒', '⚡'], 'Mushoku Tensei Jobless Reincarnation': ['📖', '🌀', '⚔️'],
    'Frieren: Beyond Journey\'s End': ['🪄', '🗡️', '⏳'], 'The Daily Life of the Immortal King': ['♾️', '👑', '⚔️'], 'Re:Zero': ['🔁', '🐰', '💀'], 'Steins;Gate': ['⏳', '📱', '🔬'],
    'Mob Psycho 100': ['👊', '🧠', '🎭'], 'One Punch Man': ['👊', '💥', '🧢'], 'Kokkoku': ['🌙', '🐉', '🧭'], 'Rainbow': ['🌈', '⚔️', '🏳️'],
    'Code Geass': ['👑', '🤖', '♟️'], 'Death Parade': ['💀', '🎡', '⏳'], 'Erased': ['⏳', '🔪', '📓'], 'Steins': ['⏳'],
    'Your Name': ['☄️', '🏔️', '💫'], 'Suzume': ['🚪', '🐈', '🌊'], 'Violet Evergarden': ['✒️', '🤖', '💌'],
    'Komi Can\'t Communicate': ['💬', '🎧', '🩰'], 'Dandadan': ['👻', '🛸'], 'Zom 100': ['🧟', '🏠', '🎮']
  };
  var GENRE_EMOJI = {
    'Action': '⚔️', 'Adventure': '🧭', 'Comedy': '😂', 'Sports': '🏅', 'Isekai': '🌀', 'High School': '🎒',
    'Sci-Fi': '🛸', 'Dark / Horror': '🩸', 'Romcom': '💘', 'Slice of Life': '🍵', 'Historical': '📜', 'Psychological': '🧠'
  };

  function emojiFor(a) {
    var e = EMOJI_MAP[a.title];
    if (e && e.length >= 3) return e.slice(0, 3);
    var out = [];
    (a.genres || []).slice(0, 2).forEach(function (g) { if (GENRE_EMOJI[g]) out.push(GENRE_EMOJI[g]); });
    if (a.year) out.push(String(a.year));
    if (a.eps) out.push('📺');
    while (out.length < 3) out.push(pick(['✨', '🌟', '💫', '🔥', '❓']));
    return out.slice(0, 3);
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

  function signedIn() {
    return readSession().then(function (s) { return !!(s && s.user); });
  }
  function profileName() {
    var n = '';
    try {
      if (window.AUTH_USER && window.AUTH_USER.name) n = window.AUTH_USER.name;
    } catch (e) {}
    return n;
  }
  function profileAvatar() {
    var a = '';
    try {
      if (window.AUTH_USER && window.AUTH_USER.avatar) a = window.AUTH_USER.avatar;
    } catch (e) {}
    return a;
  }

  /* the confirmed player (asked once per browser) */
  function readPlayer() {
    try {
      var raw = localStorage.getItem(PLAYER_KEY);
      var p = raw ? JSON.parse(raw) : null;
      return (p && p.name) ? p : null;
    } catch (e) { return null; }
  }
  function writePlayer(p) {
    try { localStorage.setItem(PLAYER_KEY, JSON.stringify(p)); } catch (e) {}
  }

  /* ─────────────────────────────────────────── scores */
  function saveScore(gameKey, score, maxScore) {
    if (!player) return Promise.resolve(false);
    var row = {
      user_id: player.id,
      user_name: player.name,
      avatar: player.avatar || '',
      game_key: gameKey,
      score: score,
      max_score: maxScore || 5,
      played_at: new Date().toISOString()
    };
    /* one row per player per game - a new score replaces the old one */
    return sb(SCORES + '?on_conflict=user_id,game_key', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(row)
    })
      .then(function (res) {
        if (!res.ok) throw new Error('save failed');
        return true;
      })
      .catch(function () { return false; });
  }

  function topScores(gameKey, limit) {
    var q = SCORES + '?select=*&game_key=eq.' + encodeURIComponent(gameKey) +
      '&order=score.desc,played_at.asc&limit=' + (limit || 3);
    return sb(q, { method: 'GET' }).then(function (res) {
      if (!res.ok) return [];
      return res.json();
    }).catch(function () { return []; });
  }

  /* every game's board, so the overall board can be summed up */
  function allScores() {
    var q = SCORES + '?select=*&order=score.desc&limit=200';
    return sb(q, { method: 'GET' }).then(function (res) {
      if (!res.ok) return [];
      return res.json();
    }).catch(function () { return []; });
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

  /* ─────────────────────────────────────────── the username gate */
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
        var p = { id: 'u-' + (window.AUTH_USER && window.AUTH_USER.id || 'local'), name: name, avatar: profileAvatar() };
        try {
          if (window.AUTH_USER && window.AUTH_USER.id) p.id = window.AUTH_USER.id;
        } catch (e) {}
        writePlayer(p);
        player = p;
        /* remember it in the cloud too (best effort) */
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
    cancel.onclick = function () { close(); if (onOk.cancel) onOk.cancel(); };
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
    var ids = ['analysisContainer', 'topSecretsContainer', 'hotTakesContainer', 'topFiveDropdown', 'animeQuestContainer'];
    ids.forEach(function (id) {
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
        '<div class="ag-head-sub">Eight games built from Fardin\'s own list - play, score, climb the board.</div>' +
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
        if (typeof openAnimeQuest === 'function') openAnimeQuest();
        else { var b = document.getElementById('animeQuestBtn'); if (b) b.click(); }
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
      stage: stage,
      wrap: wrap,
      key: key,
      score: 0,
      round: 0,
      rounds: 5,
      used: {},          /* anime title -> clues already used */
      finish: function (score) { finishGame(key, score, wrap); }
    };
    state = api;

    topScores(key, 3).then(function (rows) {
      var host = wrap.querySelector('#agGameBoard');
      if (host) host.innerHTML = boardHtml(rows, 'No scores yet - be the first!');
    });

    if (key === 'card') buildCardGame(api);
    else if (key === 'character') buildCharacterGame(api);
    else if (key === 'emoji') buildEmojiGame(api);
    else if (key === 'truefalse') buildTrueFalseGame(api);
    else if (key === 'year') buildYearGame(api);
    else if (key === 'logo') buildLogoGame(api);
  }

  /* ── shared: the answer row + the round head */
  function roundHead(api, label) {
    return '<div class="ag-round"><span class="ag-round-no">ROUND ' + api.round + ' / ' + api.rounds + '</span>' +
      '<span class="ag-round-score">SCORE <b>' + api.score + '</b></span>' +
      '<span class="ag-round-label">' + esc(label || '') + '</span></div>';
  }

  function optionsHtml(items, correct, onPick) {
    var box = el('div', 'ag-options');
    shuffle(items).forEach(function (t) {
      var b = el('button', 'ag-option', esc(t));
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
    var out = [correct];
    var tries = 0;
    while (out.length < (n || 4) && tries < 300) {
      tries++;
      var c = pick(pool);
      if (c && out.indexOf(c) === -1) out.push(c);
    }
    return out;
  }

  /* ── Guess the Anime Card ───────────────────────────────────────── */
  var CARD_DIFF = {
    easy: { clues: 4, options: 4, label: 'Easy' },
    normal: { clues: 3, options: 4, label: 'Normal' },
    hard: { clues: 2, options: 6, label: 'Hard' }
  };

  function cluesFor(a) {
    var c = [];
    if (a.genres && a.genres.length) c.push({ k: 'genre', t: 'Genre: ' + a.genres.slice(0, 2).join(' + ') });
    if (a.year) c.push({ k: 'year', t: 'Started: ' + a.year });
    if (a.airText && a.airText !== String(a.year)) c.push({ k: 'season', t: 'Aired: ' + a.airText });
    if (a.eps) c.push({ k: 'eps', t: 'Episodes: ' + a.eps });
    if (a.seasons > 1) c.push({ k: 'seasons', t: 'Seasons: ' + a.seasons });
    if (a.studio) c.push({ k: 'studio', t: 'Studio: ' + a.studio });
    if (a.mal) c.push({ k: 'mal', t: 'MAL score: ' + Number(a.mal).toFixed(1) });
    if (a.dubHi) c.push({ k: 'dub', t: 'Hindi dub: ' + a.dubHi });
    if (a.dubEn) c.push({ k: 'dub', t: 'Official English dub' });
    c.push({ k: 'rank', t: 'Card #' + a.id + ' on the list' });
    return c;
  }

  function buildCardGame(api) {
    var pool = famousPool();
    var diff = 'normal';
    api.stage.innerHTML =
      '<div class="ag-start">' +
        '<div class="ag-start-title">GUESS THE ANIME CARD</div>' +
        '<p class="ag-start-note">Clues only - the poster stays hidden. Five cards, five points. The same anime can come back, but never with the same clue.</p>' +
        '<div class="ag-diff" id="agCardDiff"></div>' +
        '<button class="ag-btn ag-btn--go ag-btn--big" id="agCardStart">START ▸</button>' +
      '</div>';
    var diffBox = api.stage.querySelector('#agCardDiff');
    Object.keys(CARD_DIFF).forEach(function (k) {
      var b = el('button', 'ag-diff-pill' + (k === diff ? ' selected' : ''), esc(CARD_DIFF[k].label));
      b.dataset.diff = k;
      b.onclick = function () {
        diff = k;
        Array.prototype.forEach.call(diffBox.children, function (c) { c.classList.toggle('selected', c.dataset.diff === k); });
      };
      diffBox.appendChild(b);
    });
    api.stage.querySelector('#agCardStart').onclick = function () {
      api.diff = diff;
      api.pool = pool;
      api.round = 0;
      api.score = 0;
      api.used = {};
      nextCardRound(api);
    };
  }

  function nextCardRound(api) {
    if (api.round >= api.rounds) return api.finish(api.score);
    api.round++;
    var pool = api.pool;
    var a = pick(pool);
    var cfg = CARD_DIFF[api.diff] || CARD_DIFF.normal;
    var all = cluesFor(a);
    var used = api.used[a.title] || [];
    var fresh = all.filter(function (c) { return used.indexOf(c.k) === -1; });
    if (fresh.length < cfg.clues) fresh = all;
    var clueList = shuffle(fresh).slice(0, cfg.clues);
    api.used[a.title] = used.concat(clueList.map(function (c) { return c.k; }));

    api.stage.innerHTML = roundHead(api, cfg.label + ' · ' + cfg.clues + ' clues') +
      '<div class="ag-card-clues">' +
        clueList.map(function (c) { return '<div class="ag-clue">' + esc(c.t) + '</div>'; }).join('') +
      '</div>' +
      '<div class="ag-q">Which anime is this?</div>';
    var opts = optionsHtml(choices(pool.map(function (x) { return x.title; }), a.title, cfg.options), a.title, function (ok) {
      if (ok) api.score++;
      api.stage.insertAdjacentHTML('beforeend',
        '<div class="ag-verdict ' + (ok ? 'ok' : 'no') + '">' +
          (ok ? 'Correct! ' + esc(a.title) : 'It was <b>' + esc(a.title) + '</b>') +
        '</div>');
      setTimeout(function () { nextCardRound(api); }, ok ? 1100 : 1900);
    });
    api.stage.appendChild(opts);
  }

  /* ── Guess the Anime Character ─────────────────────────────────── */
  function buildCharacterGame(api) {
    api.stage.innerHTML =
      '<div class="ag-start">' +
        '<div class="ag-start-title">GUESS THE ANIME CHARACTER</div>' +
        '<p class="ag-start-note">A face in the dark. Name the character - five rounds, five points. Every character belongs to an anime on the list.</p>' +
        '<button class="ag-btn ag-btn--go ag-btn--big" id="agCharStart">START ▸</button>' +
      '</div>';
    api.stage.querySelector('#agCharStart').onclick = function () {
      api.pool = characterPool();
      api.round = 0;
      api.score = 0;
      nextCharRound(api);
    };
  }

  function nextCharRound(api) {
    if (api.round >= api.rounds) return api.finish(api.score);
    api.round++;
    var pool = api.pool.filter(function (c) { return c.img; });
    if (!pool.length) { api.stage.innerHTML = '<div class="ag-start"><div class="ag-start-title">No characters yet</div></div>'; return; }
    var c = pick(pool);
    api.stage.innerHTML = roundHead(api, 'Shadow of a character') +
      '<div class="ag-shadow">' +
        '<img src="' + esc(c.img) + '" alt="">' +
        '<div class="ag-shadow-hint">Who is this?</div>' +
      '</div>';
    var names = pool.map(function (x) { return x.name; });
    var opts = optionsHtml(choices(names, c.name, 4), c.name, function (ok) {
      if (ok) api.score++;
      api.stage.insertAdjacentHTML('beforeend',
        '<div class="ag-verdict ' + (ok ? 'ok' : 'no') + '">' +
          (ok ? 'Correct! ' + esc(c.name) + ' — ' + esc(c.anime) : 'It was <b>' + esc(c.name) + '</b> (' + esc(c.anime) + ')') +
        '</div>');
      setTimeout(function () { nextCharRound(api); }, ok ? 1100 : 1900);
    });
    api.stage.appendChild(opts);
  }

  /* ── Emoji Anime ────────────────────────────────────────────────── */
  function buildEmojiGame(api) {
    api.stage.innerHTML =
      '<div class="ag-start">' +
        '<div class="ag-start-title">EMOJI ANIME</div>' +
        '<p class="ag-start-note">Three pictures stand in for a whole series. Five rounds, five points.</p>' +
        '<button class="ag-btn ag-btn--go ag-btn--big" id="agEmojiStart">START ▸</button>' +
      '</div>';
    api.stage.querySelector('#agEmojiStart').onclick = function () {
      api.pool = famousPool();
      api.round = 0;
      api.score = 0;
      nextEmojiRound(api);
    };
  }

  function nextEmojiRound(api) {
    if (api.round >= api.rounds) return api.finish(api.score);
    api.round++;
    var a = pick(api.pool);
    var e = emojiFor(a);
    api.stage.innerHTML = roundHead(api, 'Three emojis, one anime') +
      '<div class="ag-emoji">' + e.map(function (x) { return '<span>' + x + '</span>'; }).join('') + '</div>' +
      '<div class="ag-q">Which anime is this?</div>';
    var opts = optionsHtml(choices(api.pool.map(function (x) { return x.title; }), a.title, 4), a.title, function (ok) {
      if (ok) api.score++;
      api.stage.insertAdjacentHTML('beforeend',
        '<div class="ag-verdict ' + (ok ? 'ok' : 'no') + '">' + (ok ? 'Correct! ' + esc(a.title) : 'It was <b>' + esc(a.title) + '</b>') + '</div>');
      setTimeout(function () { nextEmojiRound(api); }, ok ? 1100 : 1900);
    });
    api.stage.appendChild(opts);
  }

  /* ── True or False ─────────────────────────────────────────────── */
  function buildTrueFalseGame(api) {
    api.stage.innerHTML =
      '<div class="ag-start">' +
        '<div class="ag-start-title">TRUE OR FALSE</div>' +
        '<p class="ag-start-note">Ten statements about the list - half of them are lies. Five correct answers make a full score.</p>' +
        '<button class="ag-btn ag-btn--go ag-btn--big" id="agTfStart">START ▸</button>' +
      '</div>';
    api.stage.querySelector('#agTfStart').onclick = function () {
      api.pool = famousPool();
      api.round = 0;
      api.score = 0;
      nextTfRound(api);
    };
  }

  function statement(a) {
    var options = [];
    if (a.eps > 0) {
      var fake = a.eps + pick([-14, -9, -6, -3, 3, 6, 9, 15]);
      options.push({ t: 'has ' + a.eps + ' episodes', ok: true });
      options.push({ t: 'has ' + Math.max(1, fake) + ' episodes', ok: false });
    }
    if (a.year) {
      options.push({ t: 'started in ' + a.year, ok: true });
      options.push({ t: 'started in ' + (a.year + pick([-4, -3, -2, 2, 3, 4])), ok: false });
    }
    if (a.genres && a.genres.length) {
      var g = pick(a.genres);
      options.push({ t: 'is a ' + g + ' anime', ok: true });
      var other = pick(['Action', 'Comedy', 'Sports', 'Romcom', 'Sci-Fi', 'Isekai', 'Horror', 'Historical']);
      if (other !== g) options.push({ t: 'is a ' + other + ' anime', ok: false });
    }
    if (a.seasons > 1) {
      options.push({ t: 'has ' + a.seasons + ' seasons', ok: true });
      options.push({ t: 'has 1 season', ok: false });
    }
    if (a.mal) {
      options.push({ t: 'has a MAL score of ' + Number(a.mal).toFixed(1), ok: true });
      options.push({ t: 'has a MAL score of ' + (Number(a.mal) + 1.5).toFixed(1), ok: false });
    }
    if (!options.length) return null;
    return pick(options);
  }

  function nextTfRound(api) {
    if (api.round >= api.rounds) return api.finish(api.score);
    api.round++;
    var a = pick(api.pool);
    var st = statement(a);
    if (!st) return nextTfRound(api);
    api.stage.innerHTML = roundHead(api, 'True or false?') +
      '<div class="ag-tf">' + esc(a.title) + '</div>' +
      '<div class="ag-tf-claim">' + esc(st.t) + '</div>' +
      '<div class="ag-tf-btns">' +
        '<button class="ag-btn ag-btn--tf" id="agTfTrue">TRUE</button>' +
        '<button class="ag-btn ag-btn--tf" id="agTfFalse">FALSE</button>' +
      '</div>';
    var answered = function (said) {
      var ok = said === st.ok;
      if (ok) api.score++;
      api.stage.insertAdjacentHTML('beforeend',
        '<div class="ag-verdict ' + (ok ? 'ok' : 'no') + '">' +
          (ok ? 'Correct!' : 'False - it ' + (st.ok ? 'is' : 'is not') + ' true.') +
        '</div>');
      setTimeout(function () { nextTfRound(api); }, ok ? 1000 : 1800);
    };
    api.stage.querySelector('#agTfTrue').onclick = function () { answered(true); };
    api.stage.querySelector('#agTfFalse').onclick = function () { answered(false); };
  }

  /* ── Guess the Year ────────────────────────────────────────────── */
  function buildYearGame(api) {
    api.stage.innerHTML =
      '<div class="ag-start">' +
        '<div class="ag-start-title">GUESS THE YEAR</div>' +
        '<p class="ag-start-note">The poster is on screen, the year is not. Five rounds, five points.</p>' +
        '<button class="ag-btn ag-btn--go ag-btn--big" id="agYearStart">START ▸</button>' +
      '</div>';
    api.stage.querySelector('#agYearStart').onclick = function () {
      api.pool = famousPool().filter(function (a) { return a.year > 1980; });
      api.round = 0;
      api.score = 0;
      nextYearRound(api);
    };
  }

  function nextYearRound(api) {
    if (api.round >= api.rounds) return api.finish(api.score);
    api.round++;
    var a = pick(api.pool);
    var years = [a.year];
    var tries = 0;
    while (years.length < 4 && tries < 100) {
      tries++;
      var y = a.year + pick([-5, -4, -3, -2, 2, 3, 4, 5]);
      if (years.indexOf(y) === -1) years.push(y);
    }
    api.stage.innerHTML = roundHead(api, 'Which year did it start?') +
      '<div class="ag-poster"><img src="' + esc(a.poster) + '" alt=""></div>' +
      '<div class="ag-q">When did <b>' + esc(a.title) + '</b> start?</div>';
    var opts = optionsHtml(years.map(String), String(a.year), function (ok) {
      if (ok) api.score++;
      api.stage.insertAdjacentHTML('beforeend',
        '<div class="ag-verdict ' + (ok ? 'ok' : 'no') + '">' + (ok ? 'Correct!' : 'It started in ' + a.year) + '</div>');
      setTimeout(function () { nextYearRound(api); }, ok ? 1000 : 1800);
    });
    api.stage.appendChild(opts);
  }

  /* ── Logo Quiz ──────────────────────────────────────────────────── */
  function maskTitle(t) {
    var out = '';
    for (var i = 0; i < t.length; i++) {
      var ch = t[i];
      if (ch === ' ' || ch === '-' || ch === ':') out += ch;
      else if (i % 3 === 0) out += ch;
      else out += '＿';
    }
    return out;
  }

  function buildLogoGame(api) {
    api.stage.innerHTML =
      '<div class="ag-start">' +
        '<div class="ag-start-title">ANIME LOGO QUIZ</div>' +
        '<p class="ag-start-note">The title is masked letter by letter. Fill in the blanks - five rounds, five points.</p>' +
        '<button class="ag-btn ag-btn--go ag-btn--big" id="agLogoStart">START ▸</button>' +
      '</div>';
    api.stage.querySelector('#agLogoStart').onclick = function () {
      api.pool = famousPool();
      api.round = 0;
      api.score = 0;
      nextLogoRound(api);
    };
  }

  function nextLogoRound(api) {
    if (api.round >= api.rounds) return api.finish(api.score);
    api.round++;
    var a = pick(api.pool);
    api.stage.innerHTML = roundHead(api, 'Fill in the blanks') +
      '<div class="ag-logo">' + esc(maskTitle(a.title)) + '</div>' +
      '<div class="ag-q">Which anime is this?</div>';
    var opts = optionsHtml(choices(api.pool.map(function (x) { return x.title; }), a.title, 4), a.title, function (ok) {
      if (ok) api.score++;
      api.stage.insertAdjacentHTML('beforeend',
        '<div class="ag-verdict ' + (ok ? 'ok' : 'no') + '">' + (ok ? 'Correct!' : 'It was <b>' + esc(a.title) + '</b>') + '</div>');
      setTimeout(function () { nextLogoRound(api); }, ok ? 1000 : 1800);
    });
    api.stage.appendChild(opts);
  }

  /* ── the end of a game ──────────────────────────────────────────── */
  function finishGame(key, score, wrap) {
    var g = GAME_BY_KEY[key];
    saveScore(key, score, 5).then(function () {
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
        '<div class="ag-result-score">' + score + ' / 5</div>' +
        '<div class="ag-result-rank">' + rankOf(score) + '</div>' +
        '<div class="ag-result-best">Your best here: ' + best + '</div>' +
        '<div class="ag-result-actions">' +
          '<button class="ag-btn ag-btn--go" id="agAgain">PLAY AGAIN</button>' +
          '<button class="ag-btn ag-btn--ghost" id="agBackHub">ALL GAMES</button>' +
        '</div>' +
      '</div>';
    wrap.querySelector('#agAgain').onclick = function () { openGameScreen(key); };
    wrap.querySelector('#agBackHub').onclick = function () { renderHub(); };
  }

  function rankOf(score) {
    if (score >= 5) return 'PERFECT — you know this list inside out 🏆';
    if (score === 4) return 'Excellent — four out of five 🔥';
    if (score === 3) return 'Solid — three out of five 👌';
    if (score === 2) return 'Getting there — two out of five 💪';
    if (score === 1) return 'One right — play again and learn the list 😅';
    return 'Zero this time — the list wins today 😤';
  }

  /* ─────────────────────────────────────────── public API */
  window.openGamesHub = openGamesHub;
  window.AnimeGames = {
    open: openGamesHub,
    close: closeGames,
    games: GAMES,
    saveScore: saveScore,
    topScores: topScores,
    overallBoard: overallBoard,
    boardHtml: boardHtml,
    readPlayer: readPlayer,
    buildDb: buildDb,
    _openGameScreen: openGameScreen,
    _startGame: startGame
  };

  /* the sidebar entry */
  document.addEventListener('DOMContentLoaded', function () {
    buildDb();
  });

  /* deep link: /anime-games */
  window.addEventListener('load', function () {
    if (/\/anime-games\/?$/.test(window.location.pathname)) openGamesHub();
  });
})();
