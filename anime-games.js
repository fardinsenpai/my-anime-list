/* ══════════════════════════════════════════════════════════════════════
   ANIME WEB GAMES
   Fourteen games built from the site's own list (and from AniList for the
   character art), so the hub works offline too.

   Every game asks a signed-in visitor for a player name once, keeps the
   score locally and only sends it to Supabase when it breaks into the top
   three of that game.
   ══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* Where this file itself was served from. Captured while the tag is still
     being parsed, because after that document.currentScript is gone - it is
     what keeps relative data fetches working when a deep link has already
     pushed the path to /games/<name>. */
  var SITE_BASE = (function () {
    var s = document.currentScript;
    if (s && s.src) return s.src.replace(/[^/]*$/, '');
    return './';
  })();

  var SUPABASE_URL = 'https://ldzlefdklcgvqcbqibtt.supabase.co';
  var SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxkemxlZmRrbGNndnFjYnFpYnR0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEwMzk1OTAsImV4cCI6MjA5NjYxNTU5MH0.X3TGuLIpjrnPXMgCv4ZKIIjB6pItPgkdebf4JPdhuYs';
  var SCORES = 'game_scores';
  var PLAYERS = 'game_players';
  var PLAYER_KEY = 'game_player_v1';

  var db = null;
  var player = null;
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

  /* True or False is only a game when the truth is split down the middle.
     The facts file is mostly true statements, so shuffling it and taking ten
     used to hand the player a run of nearly all TRUE claims. This builder
     draws half TRUE and half FALSE from two separate pools and only then
     shuffles the round. */
  function balancedFactRound(all, n) {
    n = n || 10;
    var truths = [], lies = [], seen = {};
    (all || []).forEach(function (f) {
      if (!f || !f[0]) return;
      var key = String(f[0]).trim().toLowerCase();
      if (seen[key]) return;
      seen[key] = 1;
      (f[1] ? truths : lies).push(f);
    });
    var wantFalse = Math.ceil(n / 2);
    var out = lies.length
      ? shuffle(lies.slice()).slice(0, Math.min(wantFalse, lies.length))
      : [];
    var wantTrue = n - out.length;
    out = out.concat(shuffle(truths.slice()).slice(0, Math.min(wantTrue, truths.length)));
    /* a tiny pool could still leave the round short — top it up from either side */
    if (out.length < n) {
      var rest = shuffle(truths.concat(lies).filter(function (f) { return out.indexOf(f) === -1; }));
      out = out.concat(rest.slice(0, n - out.length));
    }
    return shuffle(out);
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
  function answerMatches(input, accepted, alt) {
    var a = norm(input);
    if (!a) return false;
    var list = [accepted].concat(alt || []);
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
    { key: 'wordle', title: 'Guess the Title', icon: '🟩', tag: 'WORD',
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
      desc: 'Fifteen seconds a card. Which genre does this anime belong to?' },
    { key: 'arcade', title: 'Action Arcade', icon: '🕹️', tag: 'ITCH.IO',
      desc: 'Real action and anime games from itch.io, playable right here. Some come with their source code.' }
  ];
  /* every game gets a drawn logo instead of an emoji */
  var GAME_ICONS = {
    quest: '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="16" cy="16" r="12"/><circle cx="16" cy="16" r="6"/><path d="M13.6 12.6a2.6 2.6 0 1 1 3.4 2.5c-.7.5-1 1-1 1.8"/><circle cx="16" cy="21" r=".9" fill="currentColor" stroke="none"/></svg>',
    tournament: '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 4h14v6a7 7 0 0 1-14 0z"/><path d="M9 6H6v2a4 4 0 0 0 4 4"/><path d="M23 6h3v2a4 4 0 0 1-4 4"/><path d="M16 17v5"/><path d="M11 26h10"/><path d="M13 22h6"/></svg>',
    card: '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="7" width="13" height="18" rx="2.5"/><path d="M8 12h5M8 16h3.5"/><circle cx="22" cy="20" r="5.5"/><path d="M26 24l3 3"/></svg>',
    character: '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="16" cy="9.5" r="5"/><path d="M6 27a10 10 0 0 1 20 0"/><path d="M12.5 12c1 1.8 6 1.8 7 0" opacity=".5"/></svg>',
    emoji: '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="16" cy="16" r="12"/><path d="M10.5 19.5a6.5 6.5 0 0 0 11 0"/><circle cx="12" cy="12.5" r="1.4" fill="currentColor" stroke="none"/><circle cx="20" cy="12.5" r="1.4" fill="currentColor" stroke="none"/></svg>',
    truefalse: '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M16 5v21"/><path d="M7 9h18"/><path d="M6 9l-2.5 7h5z"/><path d="M26 9l-2.5 7h5z"/><path d="M11 26h10"/></svg>',
    wordle: '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="5" width="11" height="11" rx="2"/><rect x="17" y="5" width="11" height="11" rx="2" fill="currentColor" opacity=".28"/><rect x="4" y="18" width="11" height="11" rx="2"/><rect x="17" y="18" width="11" height="11" rx="2"/></svg>',
    scramble: '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9h7M6 9l3.5 3.5"/><path d="M26 9h-7M26 9l-3.5 3.5"/><path d="M6 23h7M6 23l3.5-3.5"/><path d="M26 23h-7M26 23l-3.5-3.5"/></svg>',
    initials: '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 23l4-14 4 14"/><path d="M7.2 18h5.6"/><path d="M18 23V9h3a4 4 0 0 1 0 8h-3"/></svg>',
    memory: '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="8" width="12" height="16" rx="2.5"/><rect x="16" y="8" width="12" height="16" rx="2.5"/></svg>',
    timeline: '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="16" cy="16" r="12"/><path d="M16 9v7l5 3"/></svg>',
    fight: '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M19 3L9 15h6l-3 10 11-13h-6z"/><path d="M6 24l3 3M26 24l-3 3"/></svg>',
    power: '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 10v12M23 10v12M12 16h8"/><path d="M5 11v10M27 11v10"/></svg>',
    genre: '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 14L14 4l12 12-10 10z"/><circle cx="11.5" cy="10.5" r="1.7" fill="currentColor" stroke="none"/></svg>',
    arcade: '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="12" width="25" height="16" rx="4"/><path d="M12 16v4M10 18h4"/><circle cx="21" cy="18" r="2.6"/></svg>'
  };

  var GAME_BY_KEY = {};
  GAMES.forEach(function (g) { GAME_BY_KEY[g.key] = g; });

  /* how to play - the same block on every game */
  var HOWTO = {
    quest: ['Pick the anime you want to be quizzed on.', 'Choose a difficulty and start.', 'Answer 10 questions - each right answer is a point.', 'Your rank (F to SSS) and certificate are yours.'],
    tournament: ['Pick the genre for your bracket.', 'Draft your roster - the stronger the pick, the better.', 'The bracket is simulated round by round.', 'The last one standing is the champion.'],
    card: ['You start with 10 points and one very hard clue.', 'Type the title and press SUBMIT whenever you are sure.', 'Need another clue? It costs points (-1, -1.5, -2, -2.5).', 'A wrong answer costs 2 points and shows the answer.'],
    character: ['A portrait appears as a dark silhouette.', 'Type the character name - spelling is forgiving.', 'A wrong guess shows you who it was.', 'Five characters, one point each.'],
    emoji: ['Three emoji stand in for a series.', 'Type the anime title.', 'A wrong guess shows you the answer.', 'Five rounds, five points.'],
    truefalse: ['Read the statement carefully.', 'Decide whether it is TRUE or FALSE.', 'Half of the statements are lies.', 'Ten statements, one point each.'],
    wordle: ['Guess the title in six tries.', 'Green means the letter is right and in place.', 'Yellow means the letter is in the title somewhere else.', 'Grey means it is not in the title at all.'],
    scramble: ['The title comes back in pieces.', 'Type the title in the right order.', 'A wrong guess shows you the answer.', 'Five rounds, five points.'],
    initials: ['You get the first letters and one hint.', 'Type the full anime title.', 'A wrong guess shows you the answer.', 'Five rounds, five points.'],
    memory: ['Twelve cards, six pairs of anime.', 'Turn two cards at a time.', 'Find every pair in as few moves as you can.', 'The fewer moves, the higher the score.'],
    timeline: ['Five anime, no years shown.', 'Put them from the oldest to the newest.', 'Lock the order when you are sure.', 'Each correct position is a point.'],
    fight: ['Pick your fighter for the round.', 'Watch the power bar and press HIT in the green window.', 'A perfect hit scores, a miss does not.', 'Five rounds, one champion.'],
    power: ['Two anime face each other.', 'Pick the one you think is stronger.', 'A wrong pick shows you who really wins.', 'Ten rounds of bracket action.'],
    genre: ['A poster appears with no title.', 'Pick the genre it belongs to.', 'A wrong pick shows you the genre.', 'Ten cards, ten chances.']
  };

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

  /* the board of one game */
  function topScores(gameKey, limit) {
    var n = limit || 3;
    var q = SCORES + '?select=*&game_key=eq.' + encodeURIComponent(gameKey) +
      '&order=score.desc,played_at.asc&limit=' + (n + 10);
    return sb(q, { method: 'GET' }).then(function (res) { return res.ok ? res.json() : []; })
      .catch(function () { return []; })
      .then(function (rows) {
        return readRemoved().then(function (rm) {
          return (rows || []).filter(function (r) { return !isRemoved(r, rm); }).slice(0, n);
        });
      });
  }
  /* only a score that breaks into the top three is sent to the cloud */
  function saveScore(gameKey, score, maxScore) {
    if (!player) return Promise.resolve(false);
    return readSession().then(function (sess) {
      var uid = (sess && sess.user && sess.user.id) || player.id;
      if (!uid || String(uid).indexOf('u-') === 0) return false;
      return topScores(gameKey, 3).then(function (rows) {
      var best = rows.length ? (rows[rows.length - 1].score || 0) : 0;
      if (rows.length >= 3 && score <= best) return false;   /* not good enough for the board */
        var row = {
          user_id: uid, user_name: player.name, avatar: player.avatar || '',
          game_key: gameKey, score: score, max_score: maxScore || 5,
          played_at: new Date().toISOString()
        };
        return sb(SCORES + '?on_conflict=user_id,game_key', {
          method: 'POST',
          headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
          body: JSON.stringify(row)
        }).then(function (res) { return res.ok; }).catch(function () { return false; });
      });
    });
  }
  function allScores() {
    return sb(SCORES + '?select=*&order=score.desc&limit=200', { method: 'GET' })
      .then(function (res) { return res.ok ? res.json() : []; }).catch(function () { return []; });
  }
  function overallBoard() {
    return readRemoved().then(function (rm) {
      return allScores().then(function (rows) {
      var byUser = {};
      rows.forEach(function (r) {
        if (!r || !r.user_id || isRemoved(r, rm)) return;
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
    });
  }
  /* mode 'player' removes a player from the whole board, mode 'row'
     removes a single score of one game */
  function boardHtml(rows, emptyText, mode) {
    if (!rows || !rows.length) return '<div class="ag-board-empty">' + esc(emptyText || 'No scores yet - be the first!') + '</div>';
    return rows.map(function (r, i) {
      var medal = ['🥇', '🥈', '🥉'][i] || ('#' + (i + 1));
      var av = r.avatar
        ? '<img class="ag-board-ava" src="' + esc(r.avatar) + '" alt="">'
        : '<span class="ag-board-ava ag-board-ava--none">' + esc((r.name || '?').charAt(0).toUpperCase()) + '</span>';
      var del = agAdmin
        ? '<button class="ag-board-del" data-ag-del="' + (mode === 'player' ? 'player' : 'row') +
          '" data-ag-id="' + esc(String(r.id)) + '" title="Remove this result" aria-label="Remove this result">✕</button>'
        : '';
      return '<div class="ag-board-row">' +
        '<span class="ag-board-rank">' + medal + '</span>' + av +
        '<span class="ag-board-name">' + esc(r.name || r.user_name || 'Player') + '</span>' +
        '<span class="ag-board-score">' + (r.score != null ? r.score : (r.points != null ? r.points : 0)) + '</span>' +
        del +
        '</div>';
    }).join('');
  }

  /* ─────────────────────────────────────────── the name gate */
  function askPlayerName(cb) {
    /* the visitor is already signed in: never ask again */
    var saved = readPlayer();
    if (saved && saved.id) { player = saved; cb(); return; }
    signedIn().then(function (ok) {
      if (!ok) {
        openGate('Sign in to play', 'The games keep a leaderboard with your name, so you need to sign in first.', null, function () {
          if (typeof toast === 'function') toast('Sign in to play the games', 'err');
        });
        return;
      }
      openGate('Confirm your player name', 'This name goes on the leaderboards. You only have to do it once.', profileName(), function (name) {
        var p = { id: 'u-' + ((window.AUTH_USER && window.AUTH_USER.id) || 'local'), name: name, avatar: profileAvatar() };
        try { if (window.AUTH_USER && window.AUTH_USER.id) p.id = window.AUTH_USER.id; } catch (e) {}
        writePlayer(p);
        player = p;
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
    ['pointerdown', 'touchstart', 'click'].forEach(function (ev) {
      input.addEventListener(ev, function () { setTimeout(function () { try { input.focus(); } catch (e) {} }, 0); });
    });
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

  /* ─────────────────────────────────────────── the board keeper (admin)
     The same idea as the Hot Takes admin: tap the heading three times, type
     the PIN and every score on the board grows a remove button.

     How a result leaves the board
     The games table has no rule that lets anybody delete a row - the cloud
     would answer "nothing happened" and keep the score. So the board
     keeper writes a small marker in the admin log (the very table the panel
     writes its commits to) and every board leaves those results out. No key
     and no database work is needed for that. If the owner ever adds a
     delete rule to the table, the panel sees that the row really went and
     leaves the marker alone. */
  var AG_ADMIN_PIN = '112233';
  var agAdmin = false;
  var agGameKey = '';
  var REMOVED_K = 'games-score-removed';

  /* a short word on screen - the site already has a toast */
  function agSay(title, msg, type) {
    if (typeof showToast === 'function') showToast(title, msg, type);
  }
  function whenText(ts) {
    if (!ts) return '';
    var d = new Date(ts);
    if (isNaN(d.getTime())) return '';
    var mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()];
    return d.getDate() + ' ' + mon + ' ' + d.getFullYear();
  }

  /* ── the markers ────────────────────────────────────────────────────── */
  function readRemoved() {
    var out = { ids: {}, users: {}, games: {}, list: [] };
    return fetch(SUPABASE_URL + '/rest/v1/commit_log?select=id,t,d&k=eq.' + REMOVED_K + '&order=t.desc&limit=200', {
      headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY }
    }).then(function (res) { return res.ok ? res.json() : []; })
      .catch(function () { return []; })
      .then(function (rows) {
        (rows || []).forEach(function (r) {
          var d = String(r.d || '');
          var m = /^([a-z]+):(.+)$/.exec(d);
          if (!m) return;
          out.list.push({ id: r.id, d: d });
          if (m[1] === 'id') out.ids[m[2]] = true;
          else if (m[1] === 'user') out.users[m[2]] = true;
          else if (m[1] === 'game') out.games[m[2]] = true;
        });
        return out;
      });
  }
  function writeMarker(kind, value) {
    return fetch(SUPABASE_URL + '/rest/v1/commit_log', {
      method: 'POST',
      headers: {
        apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY,
        'Content-Type': 'application/json', Prefer: 'return=minimal'
      },
      body: JSON.stringify({ t: new Date().toISOString(), k: REMOVED_K, ok: true, d: kind + ':' + value })
    }).then(function (res) { return res.ok; }).catch(function () { return false; });
  }
  function undoMarker(id) {
    return fetch(SUPABASE_URL + '/rest/v1/commit_log?id=eq.' + encodeURIComponent(id), {
      method: 'DELETE',
      headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY }
    }).then(function (res) { return res.ok; }).catch(function () { return false; });
  }
  /* a result is out of the board when a marker says so */
  function isRemoved(r, rm) {
    if (!r || !rm) return false;
    if (r.id != null && rm.ids[String(r.id)]) return true;
    if (r.user_id && rm.users[String(r.user_id)]) return true;
    if (r.id != null && rm.users[String(r.id)]) return true;
    if (r.game_key && rm.games[String(r.game_key)]) return true;
    return false;
  }
  function removedLabel(d) {
    if (d.indexOf('user:') === 0) return 'the whole player ' + d.slice(5);
    if (d.indexOf('game:') === 0) {
      var k = d.slice(5);
      return 'every score of ' + (GAME_BY_KEY[k] ? GAME_BY_KEY[k].title : k);
    }
    return 'score #' + d.slice(3);
  }

  /* ── the removals ─────────────────────────────────────────────────────
     A real delete is tried first - when the table has the rule for it the
     row is gone for good. Otherwise the marker takes the result off the
     board, and the panel says so instead of pretending. */
  function removalLanded(res) {
    if (!res || !res.ok) return false;
    return res.json().then(function (rows) {
      return Array.isArray(rows) && rows.length > 0;
    }).catch(function () { return false; });
  }
  function removeScoreRow(id) {
    return sb(SCORES + '?id=eq.' + encodeURIComponent(id), { method: 'DELETE' })
      .then(removalLanded)
      .then(function (landed) { return landed ? true : writeMarker('id', id); })
      .catch(function () { return writeMarker('id', id); });
  }
  function removePlayerRows(userId) {
    return sb(SCORES + '?user_id=eq.' + encodeURIComponent(userId), { method: 'DELETE' })
      .then(removalLanded)
      .then(function (landed) { return landed ? true : writeMarker('user', userId); })
      .catch(function () { return writeMarker('user', userId); });
  }
  function wipeGameRows(gameKey) {
    return sb(SCORES + '?game_key=eq.' + encodeURIComponent(gameKey), { method: 'DELETE' })
      .then(removalLanded)
      .then(function (landed) { return landed ? true : writeMarker('game', gameKey); })
      .catch(function () { return writeMarker('game', gameKey); });
  }

  /* ── the PIN box - the same six digits as the Hot Takes admin ───────── */
  function agAskPin(onOk) {
    var old = document.getElementById('agPinOverlay');
    if (old && old.parentNode) old.parentNode.removeChild(old);
    var m = el('div', 'ag-gate');
    m.id = 'agPinOverlay';
    m.innerHTML =
      '<div class="ag-gate-box">' +
        '<div class="ag-gate-title">BOARD KEEPER · ADMIN</div>' +
        '<p class="ag-gate-note">Type the admin PIN to unlock the remove buttons on the leaderboards.</p>' +
        '<label class="ag-gate-label">Admin PIN</label>' +
        '<input class="ag-gate-input" id="agPinInput" type="password" inputmode="numeric" maxlength="6" autocomplete="off" placeholder="······">' +
        '<div class="ag-pin-err" id="agPinErr"></div>' +
        '<div class="ag-gate-actions">' +
          '<button class="ag-btn ag-btn--go" id="agPinOk">Unlock</button>' +
          '<button class="ag-btn ag-btn--ghost" id="agPinCancel">Cancel</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(m);
    var input = m.querySelector('#agPinInput');
    var err = m.querySelector('#agPinErr');
    var ok = m.querySelector('#agPinOk');
    var cancel = m.querySelector('#agPinCancel');
    function close() { if (m.parentNode) m.remove(); }
    function submit() {
      var v = String(input.value || '').replace(/\D/g, '');
      if (v === AG_ADMIN_PIN) {
        close();
        try { onOk(); } catch (e) { if (window.console) console.error('board keeper:', e); }
        return;
      }
      err.textContent = v ? 'WRONG PIN - TRY AGAIN' : 'ENTER THE 6-DIGIT PIN';
      input.value = '';
      input.focus();
    }
    ok.onclick = submit;
    cancel.onclick = close;
    input.onkeydown = function (e) { if (e.key === 'Enter') { e.preventDefault(); submit(); } };
    input.oninput = function () {
      err.textContent = '';
      input.value = input.value.replace(/\D/g, '').slice(0, 6);
      if (input.value.length === 6) submit();
    };
    m.addEventListener('click', function (e) { if (e.target === m) close(); });
    setTimeout(function () { try { input.focus(); } catch (e) {} }, 60);
  }

  function setAgAdmin(on) {
    agAdmin = !!on;
    agSay(agAdmin ? 'Board keeper unlocked' : 'Board keeper locked',
      agAdmin ? 'The remove buttons are on the leaderboards.' : 'The leaderboards are back to normal.',
      agAdmin ? undefined : 'warning');
    if (agGameKey) refreshBoards(); else renderHub();
  }
  function wireAgAdminUnlock(titleEl) {
    if (!titleEl) return;
    var clicks = 0, timer = null;
    titleEl.style.cursor = 'pointer';
    titleEl.title = 'Tap three times for the admin tools';
    titleEl.addEventListener('click', function () {
      clicks++;
      if (clicks === 3) {
        clicks = 0;
        clearTimeout(timer);
        if (agAdmin) setAgAdmin(false);
        else agAskPin(function () { setAgAdmin(true); });
      } else {
        clearTimeout(timer);
        timer = setTimeout(function () { clicks = 0; }, 500);
      }
    });
  }

  /* every score on the cloud, grouped by game, and what was removed */
  function renderAdminList() {
    var host = document.getElementById('agAdminList');
    if (!host) return;
    readRemoved().then(function (rm) {
      return allScores().then(function (rows) {
        if (!host.isConnected) return;
        var removedHtml = rm.list.length
          ? '<div class="ag-admin-group ag-admin-group--removed">' +
              '<div class="ag-admin-game"><span>REMOVED RESULTS</span></div>' +
              rm.list.map(function (m) {
                return '<div class="ag-admin-row">' +
                  '<span class="ag-admin-name">' + esc(removedLabel(m.d)) + '</span>' +
                  '<button class="ag-admin-undo" data-ag-undo="' + esc(String(m.id)) + '">UNDO</button>' +
                '</div>';
              }).join('') +
            '</div>'
          : '';
        if (!rows || !rows.length) {
          host.innerHTML = removedHtml || '<div class="ag-board-empty">The board is empty - there is nothing to remove.</div>';
          return;
        }
        var byGame = {};
        rows.forEach(function (r) {
          var k = r.game_key || 'other';
          (byGame[k] = byGame[k] || []).push(r);
        });
        var keys = Object.keys(byGame).sort(function (a, b) { return a.localeCompare(b); });
        host.innerHTML = removedHtml + keys.map(function (k) {
          var g = GAME_BY_KEY[k];
          var title = g ? g.title : k;
          var list = byGame[k].slice().sort(function (a, b) { return (b.score || 0) - (a.score || 0); });
          return '<div class="ag-admin-group">' +
            '<div class="ag-admin-game"><span>' + esc(title) + '</span>' +
              '<button class="ag-admin-wipe" data-ag-wipe="' + esc(k) + '">WIPE</button></div>' +
            list.map(function (r) {
              var gone = isRemoved(r, rm);
              return '<div class="ag-admin-row' + (gone ? ' ag-admin-row--gone' : '') + '">' +
                '<span class="ag-board-ava ag-board-ava--none">' + esc((r.user_name || '?').charAt(0).toUpperCase()) + '</span>' +
                '<span class="ag-admin-name">' + esc(r.user_name || 'Player') + '</span>' +
                '<span class="ag-admin-when">' + esc(whenText(r.played_at)) + '</span>' +
                '<span class="ag-board-score">' + (r.score || 0) + '</span>' +
                (gone
                  ? '<span class="ag-admin-gone">REMOVED</span>'
                  : '<button class="ag-board-del" data-ag-del="row" data-ag-id="' + esc(String(r.id)) + '" title="Remove this result" aria-label="Remove this result">✕</button>') +
              '</div>';
            }).join('') +
          '</div>';
        }).join('');
      });
    });
  }

  /* the boards are read from the cloud again after a removal */
  function refreshBoards() {
    var overall = document.getElementById('agOverallBoard');
    if (overall) {
      overallBoard().then(function (rows) {
        if (!overall.isConnected) return;
        overall.innerHTML = boardHtml(rows, 'No scores yet - play a game and claim the top!', 'player');
      });
    }
    var gb = document.getElementById('agGameBoard');
    if (gb && agGameKey) {
      topScores(agGameKey, 3).then(function (rows) {
        if (!gb.isConnected) return;
        gb.innerHTML = boardHtml(rows, 'No scores yet - be the first!', 'row');
      });
    }
    if (agAdmin) renderAdminList();
  }

  /* one click on the boards removes a result - the handler lives on the
     document, so a board that is re-drawn keeps working */
  document.addEventListener('click', function (e) {
    var t = e.target;
    if (!t || !t.closest || !agAdmin) return;
    var undo = t.closest('[data-ag-undo]');
    if (undo) {
      e.preventDefault();
      var mid = undo.getAttribute('data-ag-undo');
      undo.disabled = true;
      undoMarker(mid).then(function (ok) {
        agSay(ok ? 'Result is back' : 'Could not undo that',
          ok ? 'That score is on the board again.' : 'The cloud refused the request.',
          ok ? undefined : 'warning');
        refreshBoards();
      });
      return;
    }
    var wipe = t.closest('[data-ag-wipe]');
    if (wipe) {
      e.preventDefault();
      var wk = wipe.getAttribute('data-ag-wipe');
      var wg = GAME_BY_KEY[wk];
      var wname = wg ? wg.title : wk;
      if (!window.confirm('Remove EVERY score of "' + wname + '"? The whole board of that game goes.')) return;
      wipe.disabled = true;
      wipeGameRows(wk).then(function (ok) {
        agSay(ok ? 'Game cleared' : 'Could not clear that game',
          ok ? 'Every score of ' + wname + ' is off the board.'
             : 'Nothing changed. Try again in a moment.',
          ok ? undefined : 'warning');
        refreshBoards();
      });
      return;
    }
    var del = t.closest('[data-ag-del]');
    if (del) {
      e.preventDefault();
      var kind = del.getAttribute('data-ag-del');
      var id = del.getAttribute('data-ag-id');
      del.disabled = true;
      var job = kind === 'player' ? removePlayerRows(id) : removeScoreRow(id);
      job.then(function (ok) {
        agSay(ok ? 'Result removed' : 'Nothing changed',
          ok ? (kind === 'player' ? 'That player is off the board.' : 'That score is off the board.')
             : 'The board did not change. Try again in a moment.',
          ok ? undefined : 'warning');
        refreshBoards();
      });
    }
  });

  /* ─────────────────────────────────────────── the hub */
  /* the games are a page of the site - the same place as the quest */
  function gamesHost() {
    return document.getElementById('gamesHubBody');
  }

  function openGamesHub() {
    if (typeof closeMenu === 'function') closeMenu();
    if (typeof closeFloatingOverlays === 'function') { try { closeFloatingOverlays(); } catch (e) {} }
    var ids = ['analysisContainer', 'topSecretsContainer', 'hotTakesContainer', 'topFiveDropdown', 'animeQuestContainer'];
    ids.forEach(function (id) {
      var e = document.getElementById(id);
      if (e) e.style.display = 'none';
    });
    /* the games are a page of their own - the home content steps aside */
    if (typeof hideAllSections === 'function') {
      try { hideAllSections(); } catch (e) {}
    }
    /* the big collection title belongs to the collection - the games page
       has its own heading, and goHome brings this one back */
    var siteTitle = document.querySelector('.header h1');
    if (siteTitle) siteTitle.style.display = 'none';
    var page = document.getElementById('gamesHubContainer');
    if (page) page.style.display = 'block';
    try { history.pushState(null, '', 'anime-games'); } catch (e) {}
    renderHub();
    try { window.scrollTo({ top: 0, behavior: 'auto' }); } catch (e) {}
  }

  function closeGames() {
    agGameKey = '';
    try { if (window.Stickmen && window.Stickmen.resume) window.Stickmen.resume(); } catch (e) {}
    /* opening the games hides the home content (the grid, the search, the
       counters). closing them has to put all of that back - goHome does
       exactly that, and it is the same road the sidebar's Home takes. */
    if (typeof goHome === 'function') {
      try { goHome(); return; } catch (e) { if (window.console) console.error('games close:', e); }
    }
    var page = document.getElementById('gamesHubContainer');
    if (page) page.style.display = 'none';
    try { history.pushState(null, '', 'home'); } catch (e) {}
  }
  function renderHub() {
    var page = document.getElementById('gamesHubContainer');
    /* goHome() parks this container with an inline display:none - make sure
       coming back to the list can never land on a blank screen */
    if (page) page.style.display = 'block';
    var host = gamesHost();
    if (!host) return;
    /* back on the game list the wandering crowd comes back - only the game
       screen itself parks them, because that is where the two live ones are */
    try { if (window.Stickmen && window.Stickmen.resume) window.Stickmen.resume(); } catch (e) {}
    stopTimer();
    host.innerHTML = '';
    var wrap = el('div', 'ag-wrap');
    wrap.innerHTML =
      '<header class="ag-head">' +
        '<div class="ag-head-title" id="agMainTitle">Anime Games to Play:</div>' +
        (agAdmin ? '<div class="ag-admin-badge" id="agAdminBadge">BOARD KEEPER ON - TAP TO LOCK</div>' : '') +
        '<div class="ag-head-sub">' + GAMES.length + ' games built from Fardin\'s own list - play, score, climb the board.</div>' +
        '<button class="ag-howto-btn" id="agHowtoBtn" title="How to Play" aria-label="How to Play">(?)</button>' +
        '<button class="ag-close" id="agHubClose" aria-label="Close">✕</button>' +
      '</header>' +
      '<div class="ag-howto ag-howto--hub" id="agHowtoBlock" hidden>' +
        '<div class="ag-howto-title">HOW TO PLAY</div>' +
        '<ol class="ag-howto-list">' +
          '<li>Sign in and confirm your player name once.</li>' +
          '<li>Pick a game - every one of them explains itself before you start.</li>' +
          '<li>Only a score that breaks into the top three is saved to the cloud.</li>' +
        '</ol>' +
        '<div class="ag-howto-duel"><span class="ag-duel-vs">VS</span><span class="ag-duel-text"><b>Duel games</b> \u2014 play against the bot or invite your friends. The same board works for all of them.</span></div>' +
      '</div>' +
      '<div class="ag-grid" id="agGameGrid"></div>' +
      '<section class="ag-overall">' +
        '<div class="ag-section-title">OVERALL LEADERBOARD <span>points across every game</span></div>' +
        '<div class="ag-board" id="agOverallBoard"><div class="ag-board-empty">Loading…</div></div>' +
      '</section>' +
      (agAdmin ?
        '<section class="ag-admin">' +
          '<div class="ag-section-title">BOARD KEEPER <span>admin - remove any result</span></div>' +
          '<div class="ag-admin-note">Every score on the cloud. The cross removes one result, WIPE empties a whole game.</div>' +
          '<div class="ag-admin-list" id="agAdminList"><div class="ag-board-empty">Loading…</div></div>' +
        '</section>' : '');
    host.appendChild(wrap);
    var grid = wrap.querySelector('#agGameGrid');
    GAMES.forEach(function (g) {
      var card = el('button', 'ag-game');
      card.innerHTML =
        '<span class="ag-game-icon">' + (GAME_ICONS[g.key] || g.icon) + '</span>' +
        '<span class="ag-game-title">' + esc(g.title) + '</span>' +
        '<span class="ag-game-tag">' + esc(g.tag) + '</span>' +
        '<span class="ag-game-desc">' + esc(g.desc) + '</span>' +
        '<span class="ag-game-go">PLAY ▸</span>';
      card.onclick = function () { startGame(g.key); };
      grid.appendChild(card);
    });
    wrap.querySelector('#agHubClose').onclick = closeGames;
    /* three taps on the heading open the board keeper */
    wireAgAdminUnlock(wrap.querySelector('#agMainTitle'));
    /* how-to-play toggle button */
    var howtoBtn = wrap.querySelector('#agHowtoBtn');
    var howtoBlock = wrap.querySelector('#agHowtoBlock');
    if (howtoBtn && howtoBlock) {
      howtoBtn.onclick = function() {
        howtoBlock.hidden = !howtoBlock.hidden;
        howtoBtn.classList.toggle('active', !howtoBlock.hidden);
      };
    }
    /* main title click reloads */
    var mainTitle = wrap.querySelector('#agMainTitle');
    if (mainTitle) {
      mainTitle.style.cursor = 'pointer';
      mainTitle.title = 'Click to reload';
      mainTitle.addEventListener('click', function() { location.reload(); });
    }
    var badge = wrap.querySelector('#agAdminBadge');
    if (badge) badge.onclick = function () { setAgAdmin(false); };
    if (agAdmin) renderAdminList();
    overallBoard().then(function (rows) {
      var host = wrap.querySelector('#agOverallBoard');
      if (host) host.innerHTML = boardHtml(rows, 'No scores yet - play a game and claim the top!', 'player');
    });
  }

  /* ─────────────────────────────────────────── a game screen */
  function startGame(key) {
    var g = GAME_BY_KEY[key];
    if (!g) return;
    askPlayerName(function () {
      if (key === 'quest') {
        var b = document.getElementById('animeQuestBtn');
        if (b) b.click();
        return;
      }
      if (key === 'tournament') {
        if (typeof window.openTournament === 'function') window.openTournament();
        return;
      }
      openGameScreen(key);
    });
  }

  /* A permanent stickman drawn as SVG so it can sit inside the layout at any
     size - same proportions as the canvas crowd (head r9 at y-38, torso to
     y-8, limbs to y12) so the two styles read as the same character.
       mode 'sit'  -> the green one perched on a ledge above the score
       mode 'head' -> just the head, for the verdict on the result screen */
  function stickSvg(tone, extraCls, mode) {
    var col = tone === 'red' ? '#ef4444' : tone === 'green' ? '#22ff88' : '#4dd4ac';
    var mouth = tone === 'red'
      ? 'M -4 -33 Q 0 -27 4 -33'      /* red one grins wide - it wants you to skip */
      : 'M -4 -35 Q 0 -29 4 -35';
    var sit = mode === 'sit', head = mode === 'head';
    var vb = head ? '-15 -52 30 30' : sit ? '-46 -54 74 78' : '-20 -56 40 78';
    var body = '', ledge = '';
    if (sit) {
      /* seated on the score bar: torso leaning back, one hand propped on
         the bar behind, the other resting on the knee, both shins dangling
         over the bar's top edge */
      body =
        '<path class="ag-stick-torso" d="M0 -29 L-9 -13" stroke="' + col + '" stroke-width="2.6" fill="none" stroke-linecap="round"/>' +
        '<path class="ag-stick-arm-left" d="M-2 -25 L-18 -13" stroke="' + col + '" stroke-width="2.4" fill="none" stroke-linecap="round"/>' +
        '<path class="ag-stick-arm-right" d="M-3 -25 L7 -19" stroke="' + col + '" stroke-width="2.4" fill="none" stroke-linecap="round"/>' +
        '<path class="ag-stick-leg-front" d="M-9 -13 L-24 -11 M-24 -11 L-24 7 M-24 7 L-29 7" stroke="' + col + '" stroke-width="2.4" fill="none" stroke-linecap="round"/>' +
        '<path class="ag-stick-leg-back" d="M-9 -13 L-17 -9 M-17 -9 L-17 9 M-17 9 L-12 9" stroke="' + col + '" stroke-width="2.4" fill="none" stroke-linecap="round"/>';
      /* no drawn shelf - the stickman sits on the score bar itself, legs
         hanging over its top edge */
      // solid ground base under the red standing stickman (skip mode)
      if (mode === 'skip') {
        ledge += '<path class="ag-ground" d="M-24 14 L24 14" fill="none" stroke="' + col + '" stroke-width="2" stroke-opacity=".9" stroke-linecap="round"/>' +
                  '<path class="ag-ground-ticks" d="M-24 14 L-24 18 M-12 14 L-12 18 M0 14 L0 18 M12 14 L12 18 M24 14 L24 18" fill="none" stroke="' + col + '" stroke-width="1" stroke-opacity=".5" stroke-linecap="round"/>';
      }
    } else if (!head) {
      body =
        '<path class="ag-stick-torso" d="M0 -29 L0 -8" stroke="' + col + '" stroke-width="2.6" fill="none" stroke-linecap="round"/>' +
        '<path class="ag-stick-arms" d="M0 -22 L-12 -16 M0 -22 L12 -16" stroke="' + col + '" stroke-width="2.4" fill="none" stroke-linecap="round"/>' +
        '<path class="ag-stick-legs" d="M0 -8 L-8 12 M0 -8 L8 12" stroke="' + col + '" stroke-width="2.4" fill="none" stroke-linecap="round"/>';
      /* a solid digital ground line so the standing stickman doesn't float */
      if (mode === 'skip') {
        ledge =
          '<path class="ag-ground" d="M-24 14 L24 14" fill="none" stroke="' + col + '" stroke-width="2" stroke-opacity=".9" stroke-linecap="round"/>' +
          '<path class="ag-ground-ticks" d="M-24 14 L-24 18 M-12 14 L-12 18 M0 14 L0 18 M12 14 L12 18 M24 14 L24 18" fill="none" stroke="' + col + '" stroke-width="1" stroke-opacity=".5" stroke-linecap="round"/>';
      }
    }
    return '<svg class="ag-stick ' + (extraCls || '') + '" viewBox="' + vb + '" role="img" aria-hidden="true" focusable="false">' +
      '<g class="ag-stick-g">' +
        '<circle class="ag-stick-head" cx="0" cy="-38" r="9" fill="' + col + '"/>' +
        '<g class="ag-stick-eyes">' +
          '<circle cx="-3.2" cy="-40" r="2.3" fill="#fff"/><circle cx="3.2" cy="-40" r="2.3" fill="#fff"/>' +
          '<circle cx="-3.2" cy="-40" r="1.15" fill="#111"/><circle cx="3.2" cy="-40" r="1.15" fill="#111"/>' +
        '</g>' +
        '<path class="ag-stick-mouth" d="' + mouth + '" fill="none" stroke="#111" stroke-width="1.3" stroke-linecap="round"/>' +
        body +
      '</g>' + ledge + '</svg>';
  }

  function openGameScreen(key) {
    var g = GAME_BY_KEY[key];
    var host = gamesHost();
    if (!host) return;
    agGameKey = key;
    try { history.pushState({game:key}, '', '/my-anime-list/games/' + encodeURIComponent(key)); } catch (e) {}
    /* scroll to top so game starts at the top */
    try { window.scrollTo({ top: 0, behavior: 'auto' }); } catch (e) { window.scrollTo(0, 0); }
    /* the two permanent stickmen below replace the wandering crowd here */
    try { if (window.Stickmen && window.Stickmen.suppress) window.Stickmen.suppress(); } catch (e) {}
    stopTimer();
    host.innerHTML = '';
    var wrap = el('div', 'ag-wrap ag-wrap--game');
    wrap.innerHTML =
      '<div class="ag-shell"><div class="ag-shell-in">' +
      '<header class="ag-head ag-head--game' + (g.key === 'initials' ? '' : ' ag-head--no-ap') + '">' +
        (g.key === 'initials' ? '<span class="ag-head-badge" id="agHeadBadge">AP</span>' : '') +
        '<div class="ag-head-title">' + (GAME_ICONS[g.key] || g.icon) + ' <span>' + esc(g.title) + '</span></div>' +
        '<button class="ag-close" id="agGameClose" aria-label="Back">✕</button>' +
      '</header>' +
      '<div class="ag-play" id="agPlay">' +
        '<div class="ag-hud" id="agHud" hidden>' +
          /* the green one perches on the top edge of the score side */
          '<span class="ag-hud-perch">' + stickSvg('green', 'ag-stick--sit', 'sit') + '</span>' +
          /* the live timer lives in a neon thought bubble beside its head */
          '<span class="ag-thought" aria-live="off">' +
            '<span class="ag-thought-bubble" id="agHudTime">0:00</span>' +
            '<span class="ag-thought-dots" aria-hidden="true"><i></i><i></i><i></i></span>' +
          '</span>' +
          '<div class="ag-hud-row">' +
            '<div class="ag-hud-cell"><span class="ag-hud-k">ROUND:</span>' +
              '<b class="ag-hud-v" id="agHudRound">02 / 05</b></div>' +
            '<div class="ag-hud-cell ag-hud-cell--score">' +
              '<span class="ag-hud-k">SCORE:</span>' +
              '<b class="ag-hud-v ag-hud-v--score" id="agHudScore">0</b>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div class="ag-qtype" id="agQType" hidden></div>' +
        '<div class="ag-stage ag-qbox" id="agStage"></div>' +
        '<div class="ag-inrow" id="agInRow" hidden></div>' +
        '<div class="ag-skip" id="agSkipRow" role="button" tabindex="0" hidden>' +
          '<span class="ag-skip-stick">' + stickSvg('red', 'ag-stick--skip', 'skip') + '</span>' +
          '<span class="ag-skip-txt">Don\'t Know? <b>Skip here…</b></span>' +
        '</div>' +
        '<div class="ag-next-row" id="agNextRow" hidden>' +
          '<button type="button" class="ag-btn ag-btn--go ag-next-btn" id="agNextRound">NEXT ▸</button>' +
        '</div>' +
      '</div>' +
      '<section class="ag-overall ag-overall--game">' +
        '<div class="ag-section-title">TOP THREE <span>' + esc(g.title) + '</span></div>' +
        '<div class="ag-board" id="agGameBoard"><div class="ag-board-empty">Loading…</div></div>' +
      '</section>' +
      '</div></div>';
    host.appendChild(wrap);
    wrap.querySelector('#agGameClose').onclick = function () { stopTimer(); renderHub(); };
    var stage = wrap.querySelector('#agStage');

    var api = {
      stage: stage, wrap: wrap, key: key, score: 0, round: 0, rounds: 5,
      finish: function (score, max) { finishGame(key, score, wrap, max); }
    };

    /* the skip strip: the text and the red stickman are the same button */
    var skipRow = wrap.querySelector('#agSkipRow');
    if (skipRow) {
      skipRow.onclick = function () { doSkip(api); };
      skipRow.onkeydown = function (e) {
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') { e.preventDefault(); doSkip(api); }
      };
    }

    topScores(key, 3).then(function (rows) {
      var host = wrap.querySelector('#agGameBoard');
      if (host) host.innerHTML = boardHtml(rows, 'No scores yet - be the first!', 'row');
    });

    var builder = BUILDERS[key];
    if (builder) builder(api);
  }

  /* ─────────────────────── the permanent play chrome (header / timer / skip) */
  var _timerId = null, _timerFrom = 0;
  function stopTimer() {
    if (_timerId) { clearInterval(_timerId); _timerId = null; }
  }
  function fmtTime(ms) {
    var s = Math.max(0, Math.floor(ms / 1000));
    var m = Math.floor(s / 60);
    return m + ':' + String(s % 60).padStart(2, '0');
  }
  function startTimer() {
    stopTimer();
    _timerFrom = Date.now();
    var out = document.getElementById('agHudTime');
    if (out) out.textContent = '0:00';
    _timerId = setInterval(function () {
      var t = document.getElementById('agHudTime');
      if (t) t.textContent = fmtTime(Date.now() - _timerFrom);
      else stopTimer();
    }, 1000);
  }
  function elapsedMs() { return _timerFrom ? Date.now() - _timerFrom : 0; }

  /* The first round of a game flips the start screen into the real layout:
     the HUD, question type, input row and skip strip appear, and the timer
     begins. Called from roundHead(), which every builder already runs first. */
  function ensurePlayChrome(api) {
    if (api._chrome) return;
    api._chrome = true;
    var play = api.wrap && api.wrap.querySelector('#agPlay');
    if (!play) return;
    ['agHud', 'agQType', 'agInRow', 'agSkipRow'].forEach(function (id) {
      var n = play.querySelector('#' + id);
      if (n) n.hidden = false;
    });
    play.classList.add('ag-play--live');
    /* the leaderboard only belongs on the hub and result screen - hide it
       while a round is live so the play area fits without scrolling */
    var overall = api.wrap && api.wrap.querySelector('.ag-overall--game');
    if (overall) overall.hidden = true;
    startTimer();
  }

  /* Skip: the red strip (text or stickman) gives up the round. Input games
     hand it to their own submit path so the answer still comes back through
     wrongAnswer(); the rest register api._onSkip themselves. */
  function doSkip(api) {
    if (api._skipLock) return;
    api._skipLock = true;
    if (typeof api._onSkip === 'function') { api._onSkip(); return; }
    skipVerdict(api, api._answerText || 'a tricky one', null);
  }

  /* "LOL It's <Answer> Next (3s)" - Next advances at once, the (3s) counts
     down and fires it if the player does not press it. */
  function skipVerdict(api, answerText, nextFn) {
    var box = api.stage;
    box.insertAdjacentHTML('beforeend',
      '<div class="ag-verdict ag-verdict--skip no">LOL It\'s <b>' + esc(answerText) + '</b> ' +
        '<button type="button" class="ag-btn ag-btn--go ag-next-btn" id="agNextRound">Next ' +
        '<span class="ag-next-cd" id="agNextCd">(3s)</span></button></div>');
    revealFeedback(api);
    var btn = box.querySelector('#agNextRound');
    var cd = box.querySelector('#agNextCd');
    var left = 3, done = false;
    /* advance() performs the actual round transition; go() is the guarded
       user entry point. The auto-tick calls advance() directly because
       go() bails when `done` is already true - calling go() from the tick
       (which sets done=true first) would never advance and stall on 1s. */
    function advance() {
      clearInterval(tick);
      api._nextClicked = true;
      if (typeof nextFn === 'function') nextFn(api);
      else if (typeof api._onNext === 'function') api._onNext(api);
    }
    function go() {
      if (done) return;
      done = true;
      advance();
    }
    var tick = setInterval(function () {
      left--;
      if (left <= 0) {
        if (!done) { done = true; advance(); }
      } else if (cd) {
        cd.textContent = '(' + left + 's)';
      }
    }, 1000);
    if (btn) btn.onclick = go;
    /* only the single inline Next button in the verdict - the extra
       persistent bottom-right NEXT button stays hidden */
    var nextRow = document.querySelector('#agNextRow');
    if (nextRow) nextRow.hidden = true;
  }


  /* ─────────────────────────────────────────── shared bits */
  /* The round bar moved into the permanent header, so this no longer returns
     markup - it drives the HUD and the question-type strip instead and lets
     the builder's own content fill the centre box on its own. Every builder
     already opens a round with this call, which makes it the right place to
     flip the start screen into the play layout. */
  function roundHead(api, label, extra) {
    ensurePlayChrome(api);
    api._skipLock = false;
    api._onSkip = null;
    if (api.answer) api._answerText = api.answer;
    /* hide the persistent NEXT button when a new round begins */
    var nextRow = document.querySelector('#agNextRow');
    if (nextRow) nextRow.hidden = true;
    api._nextClicked = false;
    var play = api.wrap && api.wrap.querySelector('#agPlay');
    if (play) {
      var r = play.querySelector('#agHudRound');
      if (r) r.textContent = String(api.round).padStart(2, '0') + ' / ' + String(api.rounds).padStart(2, '0');
      var s = play.querySelector('#agHudScore');
      if (s) s.textContent = api.score;
      var q = play.querySelector('#agQType');
      if (q) {
        if (!label) {
          /* the initials game puts its prompt inside the puzzle box instead */
          q.innerHTML = '';
          q.hidden = true;
        } else {
          q.innerHTML = esc(label) +
            (extra ? '<span class="ag-qtype-pts">POINTS <b>' + extra + '</b></span>' : '');
          q.hidden = false;
        }
      }
    }
    return '';
  }
  function howToBlock(key) {
    var steps = HOWTO[key] || [];
    return '<div class="ag-howto">' +
      '<div class="ag-howto-title">HOW TO PLAY</div>' +
      '<ol class="ag-howto-list">' + steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') + '</ol>' +
      '<div class="ag-howto-duel"><span class="ag-duel-vs">VS</span><span class="ag-duel-text"><b>Duel games</b> \u2014 play against the bot or invite your friends. The same board works for all of them.</span></div>' +
    '</div>';
  }
  function startScreen(api, key, title, note, btnId, onStart) {
    api.stage.innerHTML =
      '<div class="ag-start">' +
        '<div class="ag-start-title">' + esc(title) + '</div>' +
        '<p class="ag-start-note">' + esc(note) + '</p>' +
        howToBlock(key) +
        '<button class="ag-btn ag-btn--go ag-btn--big" id="' + btnId + '">START ▸</button>' +
      '</div>';
    var b = api.stage.querySelector('#' + btnId);
    if (b) b.onclick = onStart;
  }
  /* the answer box: no auto focus, tap or click to open the keyboard, empty
     submits are ignored. It now lives in the permanent input row under the
     centre box with the placeholder the brief asks for, and the search
     suggestion list stays attached exactly as before (Guess the Character
     turns it off with opts.search === false because it wants a person's
     name, not an anime title). The old inline skip button is gone - the red
     strip at the bottom is the skip now. */
  function answerRow(api, id, placeholder, onSubmit, withSkip, opts) {
    opts = opts || {};
    var host = (api.wrap && api.wrap.querySelector('#agInRow')) || api.stage;
    host.innerHTML =
      '<div class="ag-answer-row">' +
        '<input class="ag-answer-input" id="' + id + '" type="text" placeholder="My Guess" autocomplete="off" spellcheck="false" enterkeyhint="go" aria-label="My Guess">' +
        '<button class="ag-btn ag-btn--go" id="' + id + 'Go">SUBMIT</button>' +
      '</div>';
    var input = host.querySelector('#' + id);
    var go = host.querySelector('#' + id + 'Go');
    /* the anime search suggests the titles of the list. A pick fills the box
       and the player presses SUBMIT (it must never empty the box behind them).
       The opts object travels along: it carries exclude, which keeps the
       answer itself out of the suggestion list, and search:false, which
       Guess the Character uses because it wants a person's name, not an
       anime title. */
    if (window.AnimeSearch && input && opts.search !== false) {
      window.AnimeSearch.attach(input, opts);
    }
    ['pointerdown', 'touchstart', 'click'].forEach(function (ev) {
      input.addEventListener(ev, function () {
        setTimeout(function () { try { input.focus(); } catch (e) {} }, 0);
      });
    });
    function submit() {
      var v = String(input.value || '').trim();
      if (!v) {
        input.classList.add('ag-answer-empty');
        setTimeout(function () { input.classList.remove('ag-answer-empty'); }, 700);
        return;
      }
      go.disabled = true;
      input.disabled = true;
      onSubmit(v);
    }
    go.onclick = submit;
    input.onkeydown = function (e) { if (e.key === 'Enter') { e.preventDefault(); submit(); } };
    if (withSkip) {
      api._onSkip = function () {
        api._skipped = true;
        go.disabled = true;
        input.disabled = true;
        onSubmit(null);
      };
    }
    return input;
  }
  /* how long a verdict stays on screen before the next round:
     long enough to read the answer, short enough to keep the game moving */
  var HOLD_RIGHT = 1900;
  var HOLD_WRONG = 3800;

  /* On phones the keyboard can shrink the viewport and hide a verdict that
     sits at the bottom of the centre box. Pull the latest feedback into view
     so it always shows above the input field / keyboard. */
  function revealFeedback(api) {
    var wrap = api && api.wrap;
    if (!wrap) return;
    setTimeout(function () {
      var verdicts = wrap.querySelectorAll('.ag-stage .ag-verdict');
      var v = verdicts.length ? verdicts[verdicts.length - 1] : null;
      if (!v) return;
      try { v.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
      catch (e) { try { v.scrollIntoView(); } catch (e2) {} }
    }, 60);
  }

  /* a wrong answer shows the right one and moves on; a skip shows it through
     the "LOL It's <Answer> Next (3s)" strip, where Next is a real button. */
  function wrongAnswer(api, right, nextFn) {
    if (api._skipped) {
      api._skipped = false;
      skipVerdict(api, right, nextFn);
      return;
    }
    api.stage.insertAdjacentHTML('beforeend',
      '<div class="ag-verdict no">Nope - it was <b>' + esc(right) + '</b></div>');
    revealFeedback(api);
    /* show the persistent NEXT button so the player can advance manually */
    var nextRow = document.querySelector('#agNextRow');
    api._nextClicked = false;
    if (nextRow) {
      nextRow.hidden = false;
      var persistentBtn = nextRow.querySelector('#agNextRound');
      if (persistentBtn) {
        persistentBtn.onclick = function () {
          if (api._nextClicked) return;
          api._nextClicked = true;
          nextFn(api);
        };
      }
    }
    setTimeout(function () {
      if (api._nextClicked) return;
      /* auto-advance if player hasn't clicked NEXT */
      nextFn(api);
    }, HOLD_WRONG);
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

  /* ══════════════════════════════════════════════════════════════════════
     1. GUESS THE ANIME - five clues, ten points, every clue costs
     ══════════════════════════════════════════════════════════════════════ */
  var CLUE_COST = [1, 1.5, 2, 2.5];

  function buildCardGame(api) {
    var clues = (window.GUESS_CLUES || {});
    var names = Object.keys(clues);
    startScreen(api, 'card', 'GUESS THE ANIME',
      'Ten points to start. Reveal a clue, answer what you can - each extra clue costs points, and the first one is nearly impossible.',
      'agCardStart', function () {
        api.names = names;
        api.round = 0;
        api.score = 0;
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
    drawClue(api);
  }

  function drawClue(api) {
    var nextCost = api.clueIndex < api.clues.length - 1 ? CLUE_COST[api.clueIndex] : 0;
    api.stage.innerHTML = roundHead(api, 'Clue ' + (api.clueIndex + 1) + ' of ' + api.clues.length, api.points) +
      '<div class="ag-clue-box">' +
        '<div class="ag-clue-no">CLUE ' + (api.clueIndex + 1) + '</div>' +
        '<div class="ag-clue-text">' + esc(api.clues[api.clueIndex]) + '</div>' +
      '</div>';
    answerRow(api, 'agCardInput', 'Type the anime title…', function (v) {
      var ok = answerMatches(v, api.answer, api.alt);
      if (ok) {
        api.score += Math.max(0, Math.round(api.points * 10) / 10);
        api.stage.insertAdjacentHTML('beforeend',
          '<div class="ag-verdict ok">Correct! <b>' + esc(api.answer) + '</b> - ' + api.points + ' points banked ⚡</div>');
        setTimeout(function () { nextCardRound(api); }, HOLD_RIGHT);
      } else {
        api.points = Math.max(0, api.points - 2);
        wrongAnswer(api, api.answer, nextCardRound);
      }
    }, true, { exclude: api.answer });
    if (nextCost) {
      api.stage.insertAdjacentHTML('beforeend',
        '<button class="ag-next-clue" id="agNextClue">NEXT CLUE <b>-' + nextCost + ' points</b></button>');
      api.stage.querySelector('#agNextClue').onclick = function () {
        api.points = Math.max(0, api.points - nextCost);
        api.clueIndex++;
        drawClue(api);
      };
    } else {
      api.stage.insertAdjacentHTML('beforeend', '<div class="ag-last-clue">This is the last clue.</div>');
    }
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
                out.push({ name: e.node.name.full, anime: anime, role: e.role || '', img: e.node.image.large });
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
    startScreen(api, 'character', 'GUESS THE CHARACTER',
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
      '</div>';
    answerRow(api, 'agCharInput', 'Type the character name…', function (v) {
      var ok = answerMatches(v, api.answer, api.alt);
      if (ok) {
        api.score++;
        api.stage.insertAdjacentHTML('beforeend',
          '<div class="ag-verdict ok">Correct! <b>' + esc(api.answer) + '</b> (' + esc(c.anime) + ')</div>');
        setTimeout(function () { nextCharRound(api); }, HOLD_RIGHT);
      } else {
        wrongAnswer(api, api.answer + ' (' + c.anime + ')', nextCharRound);
      }
    }, true, { search: false });
  }

  /* ══════════════════════════════════════════════════════════════════════
     3. EMOJI ANIME
     ══════════════════════════════════════════════════════════════════════ */
  function buildEmojiGame(api) {
    var sets = window.EMOJI_SETS || {};
    var names = Object.keys(sets);
    startScreen(api, 'emoji', 'EMOJI ANIME',
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
    var genre = '';
    var year = '';
    var cardNum = null;
    Array.prototype.forEach.call(document.querySelectorAll('#grid .card'), function (c) {
      var t = c.querySelector('.title');
      if (t && t.textContent.trim() === title && cardNum === null) {
        var n = c.querySelector('.number');
        cardNum = n ? n.textContent.replace(/\D/g, '') : null;
      }
    });
    if (cardNum && window.ANIME_GENRES) {
      /* ANIME_GENRES[...].nums is a Set of numbers while the card number we
         just scraped is a string, so match through has()/indexOf() either way */
      var cn = parseInt(cardNum, 10);
      Object.keys(window.ANIME_GENRES).forEach(function (k) {
        var nums = window.ANIME_GENRES[k] && window.ANIME_GENRES[k].nums;
        if (k === 'All' || !nums) return;
        var hit = typeof nums.has === 'function' ? nums.has(cn)
          : (typeof nums.indexOf === 'function' ? nums.indexOf(cn) > -1 : false);
        if (hit && !genre) genre = k;
      });
    }
    var r = (window.RATING_DATA && cardNum) ? window.RATING_DATA[cardNum] : null;
    if (r && r.season) { var m = String(r.season).match(/(19|20)\d{2}/); if (m) year = m[0]; }
    api.stage.innerHTML = roundHead(api, 'What is this anime?') +
      '<div class="ag-emoji">' + (sets[title] || []).map(function (x) { return '<span>' + x + '</span>'; }).join('') + '</div>' +
      '<div class="ag-emoji-meta">' + (genre ? '<span class="ag-emoji-genre">' + esc(genre) + '</span>' : '') + (year ? '<span class="ag-emoji-year">' + year + '</span>' : '') + '</div>';
    answerRow(api, 'agEmojiInput', 'Type the anime title…', function (v) {
      var ok = answerMatches(v, api.answer, api.alt);
      if (ok) {
        api.score++;
        api.stage.insertAdjacentHTML('beforeend', '<div class="ag-verdict ok">Correct! <b>' + esc(api.answer) + '</b></div>');
        setTimeout(function () { nextEmojiRound(api); }, HOLD_RIGHT);
      } else {
        wrongAnswer(api, api.answer, nextEmojiRound);
      }
    }, true, { exclude: api.answer });
  }

  /* ══════════════════════════════════════════════════════════════════════
     4. TRUE OR FALSE
     ══════════════════════════════════════════════════════════════════════ */
  function buildTrueFalseGame(api) {
    var facts = window.TF_FACTS || [];
    startScreen(api, 'truefalse', 'TRUE OR FALSE',
      'Ten statements - exactly five are true and five are lies. Read carefully and call it.',
      'agTfStart', function () {
        api.facts = balancedFactRound(facts, 10);
        api.round = 0;
        api.score = 0;
        /* ten statements, not the default five: the round builder hands back
           exactly five truths and five lies, so the whole set has to be played
           or the "five and five" promise on the start screen is a lie too. */
        api.rounds = 10;
        nextTfRound(api);
      });
  }

  function nextTfRound(api) {
    if (api.round >= api.rounds) return api.finish(api.score, api.rounds);
    api.round++;
    var f = api.facts[(api.round - 1) % api.facts.length];
    if (!f) return api.finish(api.score, api.rounds);
    api.truth = !!f[1];
    api.stage.innerHTML = roundHead(api, 'True or false?') +
      '<div class="ag-tf-claim">' + esc(f[0]) + '</div>' +
      '<div class="ag-tf-btns">' +
        '<button class="ag-btn ag-btn--tf" id="agTfTrue">TRUE</button>' +
        '<button class="ag-btn ag-btn--tf" id="agTfFalse">FALSE</button>' +
      '</div>';
    /* the red strip skips: it gives the call away through the LOL line */
    api._answerText = api.truth ? 'TRUE' : 'FALSE';
    api._onSkip = function () { skipVerdict(api, api._answerText, nextTfRound); };
    function answered(said) {
      var ok = (said === api.truth);
      if (ok) api.score++;
      api.stage.insertAdjacentHTML('beforeend',
        '<div class="ag-verdict ' + (ok ? 'ok' : 'no') + '">' +
          (ok ? 'Correct!' : 'False - it ' + (api.truth ? 'is' : 'is not') + ' true.') + '</div>');
      if (!ok) {
        var nextRow = document.querySelector('#agNextRow');
        if (nextRow) {
          nextRow.hidden = false;
          var persistentBtn = nextRow.querySelector('#agNextRound');
          if (persistentBtn) {
            persistentBtn.onclick = function () {
              if (api._nextClicked) return;
              api._nextClicked = true;
              nextTfRound(api);
            };
          }
        }
      }
      setTimeout(function () {
        if (api._nextClicked) return;
        nextTfRound(api);
      }, ok ? HOLD_RIGHT : HOLD_WRONG);
    }
    api.stage.querySelector('#agTfTrue').onclick = function () { answered(true); };
    api.stage.querySelector('#agTfFalse').onclick = function () { answered(false); };
  }

  /* ══════════════════════════════════════════════════════════════════════
     5. ANIME WORDLE
     ══════════════════════════════════════════════════════════════════════ */
  function buildWordleGame(api) {
    startScreen(api, 'wordle', 'GUESS THE TITLE',
      'Six guesses at the anime title. Green means the letter is in the right place, yellow means it is in the title somewhere else.',
      'agWordleStart', function () {
        var pool = famousPool().filter(function (a) {
          var t = a.title.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
          return t.length >= 4 && t.length <= 16 && a.title.indexOf('(') === -1 && a.title.indexOf(':') === -1;
        });
        if (pool.length < 10) pool = famousPool();
        var picked = pick(pool);
        api.answer = picked.title;
        api.alt = [];
        /* the word is the title without any punctuation - the tiles and the
           guess always use the same letters, so the length always matches */
        api.word = picked.title.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
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
      '<div class="ag-wordle">' + rows + '</div>';
    answerRow(api, 'agWordleInput', 'Type the title...', function (v) {
      var g = norm(v);
      if (!g) return;
      var letters = g.replace(/ /g, '');
      var want = api.word.replace(/ /g, '');
      if (letters.length !== want.length) {
        api.stage.insertAdjacentHTML('beforeend',
          '<div class="ag-verdict no">Wrong number of letters - the title has ' + want.length + '.</div>');
        return;
      }
      api.guesses.push(g);
      var win = g === api.word;
      api.stage.insertAdjacentHTML('beforeend',
        '<div class="ag-verdict ' + (win ? 'ok' : 'no') + '">' +
          (win ? 'Solved in ' + api.guesses.length + '!' :
            (api.guesses.length >= 6 ? 'Out of guesses - it was ' + esc(api.answer) : 'Keep going...')) +
        '</div>');
      if (win || api.guesses.length >= 6) {
        setTimeout(function () { api.finish(win ? 1 : 0, 1); }, HOLD_WRONG);
      } else {
        setTimeout(function () { drawWordle(api); }, 900);
      }
    });
  }


  function buildScrambleGame(api) {
    startScreen(api, 'scramble', 'TITLE SCRAMBLE',
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
      '<div class="ag-scramble">' + mixed.map(function (c) { return '<span>' + esc(c === ' ' ? '·' : c) + '</span>'; }).join('') + '</div>';
    answerRow(api, 'agScrambleInput', 'Type the title…', function (v) {
      var ok = answerMatches(v, api.answer, api.alt);
      if (ok) {
        api.score++;
        api.stage.insertAdjacentHTML('beforeend', '<div class="ag-verdict ok">Correct! <b>' + esc(api.answer) + '</b></div>');
        setTimeout(function () { nextScrambleRound(api); }, HOLD_RIGHT);
      } else {
        wrongAnswer(api, api.answer, nextScrambleRound);
      }
    }, true, { exclude: api.answer });
  }

  /* ══════════════════════════════════════════════════════════════════════
     7. INITIALS CHALLENGE
     ══════════════════════════════════════════════════════════════════════ */
  function buildInitialsGame(api) {
    startScreen(api, 'initials', 'INITIALS CHALLENGE',
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
    var initialsDisplay = initials.split(' ').join(' _ ') + ' _';
    var hint = (a.genres && a.genres.length ? a.genres[0] : 'Anime') + (a.year ? ' • ' + a.year : '');
    api.stage.innerHTML = roundHead(api, '') +
      '<div class="ag-initials">' + esc(initialsDisplay) + '</div>' +
      '<div class="ag-genre-year">' + esc(hint) + '</div>' +
      '<div class="ag-prompt">What is the Anime name?</div>';
    answerRow(api, 'agInitialsInput', 'Type the anime title…', function (v) {
      var ok = answerMatches(v, api.answer, api.alt);
      if (ok) {
        api.score++;
        api.stage.insertAdjacentHTML('beforeend', '<div class="ag-verdict ok">Correct! <b>' + esc(api.answer) + '</b></div>');
        setTimeout(function () { nextInitialsRound(api); }, HOLD_RIGHT);
      } else {
        wrongAnswer(api, api.answer, nextInitialsRound);
      }
    }, true, { exclude: api.answer });
  }

  /* ══════════════════════════════════════════════════════════════════════
     8. ANIME MEMORY
     ══════════════════════════════════════════════════════════════════════ */
  function buildMemoryGame(api) {
    startScreen(api, 'memory', 'ANIME MEMORY',
      'Twelve cards, six pairs of anime. Turn two at a time and find every pair in as few moves as you can.',
      'agMemoryStart', function () {
        var pool = famousPool().filter(function (a) { return a.poster; });
        var chosen = shuffle(pool).slice(0, 6);
        api.cards = [];
        chosen.forEach(function (a) {
          api.cards.push({ pair: a.title, img: a.poster, face: 'back', done: false });
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
    var left = api.cards.filter(function (x) { return !x.done; }).length / 2;
    api.stage.innerHTML = roundHead(api, 'Find the pairs') +
      '<div class="ag-memstats">MOVES <b id="agMemMoves">' + api.moves + '</b> · PAIRS LEFT <b id="agMemLeft">' + left + '</b></div>' +
      '<div class="ag-memory">' + api.cards.map(function (c, i) {
        return '<button class="ag-mem' + (c.done ? ' ag-mem--done' : '') + (c.face === 'front' ? ' ag-mem--open' : '') + '" data-i="' + i + '">' +
          '<span class="ag-mem-face ag-mem-front" style="background-image:url(' + esc(c.img) + ')"></span>' +
          '<span class="ag-mem-face ag-mem-back">?</span>' +
        '</button>';
      }).join('') + '</div>';
    /* the red strip skips: it names the pairs still hidden and ends the run */
    var open = api.cards.filter(function (x) { return !x.done; }).map(function (x) { return x.pair; });
    var uniq = open.filter(function (v, i) { return open.indexOf(v) === i; });
    api._answerText = uniq.length ? uniq.join(', ') : 'all six pairs';
    api._onSkip = function () {
      api.cards.forEach(function (c) { c.done = true; });
      skipVerdict(api, api._answerText, function (a) { a.finish(Math.max(1, 13 - a.moves), 12); });
    };
    api.stage.querySelectorAll('.ag-mem').forEach(function (b) {
      b.onclick = function () {
        var i = parseInt(b.getAttribute('data-i'), 10);
        var card = api.cards[i];
        if (!card || card.done || card.face === 'front' || api.flipped.length >= 2) return;
        card.face = 'front';
        b.classList.add('ag-mem--open');
        api.flipped.push(i);
        if (api.flipped.length < 2) return;
        api.moves++;
        var a = api.cards[api.flipped[0]], c = api.cards[api.flipped[1]];
        var movesEl = api.stage.querySelector('#agMemMoves');
        if (movesEl) movesEl.textContent = api.moves;
        if (a.pair === c.pair) {
          a.done = c.done = true;
          api.flipped = [];
          setTimeout(function () { drawMemory(api); }, 450);
          if (!api.cards.some(function (x) { return !x.done; })) {
            api.stage.insertAdjacentHTML('beforeend',
              '<div class="ag-verdict ok">All ' + (api.cards.length / 2) + ' pairs found in ' + api.moves + ' moves!</div>');
            setTimeout(function () { api.finish(Math.max(1, 13 - api.moves), 12); }, 1400);
          }
        } else {
          var b0 = api.stage.querySelector('.ag-mem[data-i="' + api.flipped[0] + '"]');
          var b1 = api.stage.querySelector('.ag-mem[data-i="' + api.flipped[1] + '"]');
          if (b0) b0.classList.add('ag-mem--shake');
          if (b1) b1.classList.add('ag-mem--shake');
          setTimeout(function () {
            a.face = 'back';
            c.face = 'back';
            api.flipped = [];
            drawMemory(api);
          }, 700);
        }
      };
    });
  }


  function buildTimelineGame(api) {
    startScreen(api, 'timeline', 'TIMELINE RUSH',
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
    var five = shuffle(api.pool).slice(0, 5);
    api.order = five.slice();
    api.five = five.slice().sort(function (x, y) { return x.year - y.year; });
    api.stage.innerHTML = roundHead(api, 'Oldest to newest') +
      '<div class="ag-tl-hint">Move the anime with the arrows, oldest first - then lock the order.</div>' +
      '<div class="ag-timeline" id="agTimeline"></div>' +
      '<button class="ag-btn ag-btn--go ag-btn--big" id="agTimelineGo">LOCK THE ORDER</button>';
    /* the red strip skips: it hands over the right order through the LOL line */
    api._answerText = api.five.map(function (a) { return a.title + ' (' + a.year + ')'; }).join(' → ');
    api._onSkip = function () { skipVerdict(api, api._answerText, nextTimelineRound); };
    drawTimeline(api);
    api.stage.querySelector('#agTimelineGo').onclick = function () {
      var years = api.order.map(function (a) { return a.year; });
      var right = 0;
      for (var i = 1; i < years.length; i++) if (years[i] > years[i - 1]) right++;
      api.score += right;
      api.stage.insertAdjacentHTML('beforeend',
        '<div class="ag-verdict ' + (right >= 3 ? 'ok' : 'no') + '">' + right + ' of 4 positions correct.</div>');
      api.stage.querySelectorAll('.ag-tl-item').forEach(function (el2) {
        var y = api.order[parseInt(el2.getAttribute('data-i'), 10)].year;
        var tag = el2.querySelector('.ag-tl-year');
        if (tag) tag.textContent = y;
      });
      setTimeout(function () { nextTimelineRound(api); }, HOLD_RIGHT);
    };
  }

  function drawTimeline(api) {
    var host = api.stage.querySelector('#agTimeline');
    if (!host) return;
    host.innerHTML = api.order.map(function (a, i) {
      return '<div class="ag-tl-item" data-i="' + i + '">' +
        '<button class="ag-tl-move" data-dir="-1" title="Move up">&#9650;</button>' +
        '<span class="ag-tl-pos">' + (i + 1) + '</span>' +
        '<span class="ag-tl-title">' + esc(a.title) + '</span>' +
        '<span class="ag-tl-year">?</span>' +
        '<button class="ag-tl-move" data-dir="1" title="Move down">&#9660;</button>' +
        '</div>';
    }).join('');
    host.querySelectorAll('.ag-tl-move').forEach(function (b) {
      b.onclick = function () {
        var dir = parseInt(b.getAttribute('data-dir'), 10);
        var i = parseInt(b.parentNode.getAttribute('data-i'), 10);
        var j = i + dir;
        if (j < 0 || j >= api.order.length) return;
        var tmp = api.order[i];
        api.order[i] = api.order[j];
        api.order[j] = tmp;
        drawTimeline(api);
      };
    });
  }


  function buildFightGame(api) {
    startScreen(api, 'fight', 'ANIME DUEL RUSH',
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
      setTimeout(function () { nextFightRound(api); }, good ? HOLD_WRONG : HOLD_WRONG);
    };
    /* the red strip skips: the answer is landing inside the green window */
    api._answerText = 'a hit between 68% and 92% power';
    api._onSkip = function () {
      clearInterval(timer);
      skipVerdict(api, api._answerText, nextFightRound);
    };
  }

  /* ══════════════════════════════════════════════════════════════════════
     11. STRONGEST ROUND
     ══════════════════════════════════════════════════════════════════════ */
  function buildPowerGame(api) {
    startScreen(api, 'power', 'STRONGEST ROUND',
      'Two anime face each other. Pick the one you think is stronger - ten rounds of bracket action.',
      'agPowerStart', function () {
        api.pool = famousPool();
        api.round = 0;
        api.score = 0;
        /* the real MAL scores come from the site's own ratings file */
        api.mal = {};
        var load = (typeof loadRatings === 'function') ? loadRatings() : Promise.resolve(null);
        load.then(function (db) {
          if (db) {
            Object.keys(db).forEach(function (k) {
              if (db[k] && db[k].title && db[k].malScore) api.mal[db[k].title] = db[k].malScore;
            });
          }
          nextPowerRound(api);
        });
      });
  }


  function nextPowerRound(api) {
    if (api.round >= api.rounds) return api.finish(api.score, api.rounds);
    api.round++;
    var scored = api.pool.map(function (a) {
      return { a: a, m: api.mal && api.mal[a.title] ? api.mal[a.title] : 0 };
    }).filter(function (x) { return x.m > 0; });
    if (scored.length < 2) scored = api.pool.map(function (a) { return { a: a, m: 0 }; });
    var pair = shuffle(scored).slice(0, 2);
    if (pair.length < 2) return api.finish(api.score, api.rounds);
    var strong = (pair[0].m && pair[1].m) ? (pair[0].m >= pair[1].m ? pair[0] : pair[1]) : pick(pair);
    api.stage.innerHTML = roundHead(api, 'Who is stronger?') +
      '<div class="ag-versus">' +
        '<button class="ag-vs-card" id="agVsA"><img src="' + esc(pair[0].a.poster) + '" alt=""><span>' + esc(pair[0].a.title) + '</span>' +
          '<small>' + esc((pair[0].a.genres && pair[0].a.genres[0]) || 'Anime') + '</small></button>' +
        '<div class="ag-vs-mid">VS</div>' +
        '<button class="ag-vs-card" id="agVsB"><img src="' + esc(pair[1].a.poster) + '" alt=""><span>' + esc(pair[1].a.title) + '</span>' +
          '<small>' + esc((pair[1].a.genres && pair[1].a.genres[0]) || 'Anime') + '</small></button>' +
      '</div>';
    /* the red strip skips and names the stronger one */
    api._answerText = strong.a.title;
    api._onSkip = function () { skipVerdict(api, api._answerText, nextPowerRound); };
    function answer(chosen) {
      var ok = chosen === strong;
      if (ok) api.score++;
      api.stage.insertAdjacentHTML('beforeend',
        '<div class="ag-verdict ' + (ok ? 'ok' : 'no') + '">' +
          (ok ? 'Correct!' : 'It was <b>' + esc(strong.a.title) + '</b>') + '</div>');
      setTimeout(function () { nextPowerRound(api); }, HOLD_RIGHT);
    }
    api.stage.querySelector('#agVsA').onclick = function () { answer(pair[0]); };
    api.stage.querySelector('#agVsB').onclick = function () { answer(pair[1]); };
  }


  function buildGenreGame(api) {
    startScreen(api, 'genre', 'GENRE RUSH',
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
    var box = optionsHtml(wrong, right, function (ok) {
      if (ok) api.score++;
      api.stage.insertAdjacentHTML('beforeend',
        '<div class="ag-verdict ' + (ok ? 'ok' : 'no') + '">' + (ok ? 'Correct!' : 'It is ' + esc(right)) + '</div>');
      setTimeout(function () { nextGenreRound(api); }, ok ? HOLD_RIGHT : HOLD_WRONG);
    });
    api.stage.appendChild(box);
    /* the red strip skips and names the genre */
    api._answerText = right;
    api._onSkip = function () { skipVerdict(api, right, nextGenreRound); };
  }

  /* ─────────────────────────────────────────── the end of a game */
  function finishGame(key, score, wrap, max) {
    var g = GAME_BY_KEY[key];
    max = max || 5;
    var saved = false;
    saveScore(key, score, max).then(function (ok) {
      saved = ok;
      return topScores(key, 3);
    }).then(function (rows) {
      var host = wrap.querySelector('#agGameBoard');
      if (host) host.innerHTML = boardHtml(rows, 'No scores yet - be the first!', 'row');
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
    /* the run clock stops here; the time is shown to the player only and is
       never part of what saveScore() sends up, so the board stays a score board */
    stopTimer();
    /* the run is over - the board is allowed back on the result screen */
    var overall = wrap.querySelector('.ag-overall--game');
    if (overall) overall.hidden = false;
    var total = fmtTime(elapsedMs());
    var verdict = rankOf(score, max);
    wrap.querySelector('#agStage').innerHTML =
      '<div class="ag-result">' +
        '<div class="ag-result-head">' +
          '<div class="ag-result-bubble">' + esc(verdict) + '</div>' +
        '</div>' +
        '<div class="ag-result-icon">' + (GAME_ICONS[g.key] || g.icon) + '</div>' +
        '<div class="ag-result-score">' + score + ' / ' + max + '</div>' +
        '<div class="ag-result-time">TOTAL TIME <b>' + total + '</b></div>' +
        '<div class="ag-result-best">Your best here: ' + best + '</div>' +
        '<div class="ag-saved-note" id="agSavedNote">Checking the board…</div>' +
        '<div class="ag-result-actions">' +
          '<button class="ag-btn ag-btn--go" id="agAgain">PLAY AGAIN</button>' +
          '<button class="ag-btn ag-btn--ghost" id="agBackHub">ALL GAMES</button>' +
        '</div>' +
      '</div>';
    setTimeout(function () {
      var note = wrap.querySelector('#agSavedNote');
      if (note) {
        note.textContent = saved
          ? '🏆 Saved to the cloud - you are in the top three!'
          : 'Kept on this device - only a top three score reaches the cloud.';
        note.className = 'ag-saved-note ' + (saved ? 'ag-saved-note--yes' : '');
      }
    }, 900);
    wrap.querySelector('#agAgain').onclick = function () { openGameScreen(key); };
    wrap.querySelector('#agBackHub').onclick = function () { renderHub(); };
  }

  function rankOf(score, max) {
    var pct = max ? score / max : 0;
    if (pct >= 1) return 'PERFECT - you know this list inside out 🏆';
    if (pct >= 0.8) return 'Excellent run 🔥';
    if (pct >= 0.6) return 'Solid work 👌';
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
    timeline: buildTimelineGame,
    fight: buildFightGame,
    power: buildPowerGame,
    genre: buildGenreGame,
    arcade: buildArcadeGame
  };

  /* the itch.io arcade - the games are fetched into itch-games.json */
  function buildArcadeGame(api) {
    api.stage.innerHTML = '<div class="ag-start"><div class="ag-start-title">Loading the arcade...</div></div>';
    fetch(SITE_BASE + 'itch-games.json?v=20261112a', { cache: 'no-cache' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        var list = (j && j.games) || [];
        if (!list.length) {
          api.stage.innerHTML = '<div class="ag-start"><div class="ag-start-title">No arcade games yet</div>' +
            '<p class="ag-start-note">The arcade list is built by scripts/fetch-itch-games.js. Run it and push the result.</p></div>';
          return;
        }
        api.games = list;
        api.pick = 0;
        drawArcade(api);
      })
      .catch(function () {
        api.stage.innerHTML = '<div class="ag-start"><div class="ag-start-title">The arcade is offline</div>' +
          '<p class="ag-start-note">The game list could not be loaded. Try again when you are online.</p></div>';
      });
  }

  function drawArcade(api) {
    var g = api.games[api.pick % api.games.length];
    api.round = api.pick + 1;
    api.rounds = api.games.length;
    api.stage.innerHTML = roundHead(api, 'Game ' + (api.pick + 1) + ' of ' + api.games.length) +
      '<div class="ag-arcade">' +
        '<div class="ag-arcade-head">' +
          '<a class="ag-arcade-title" href="' + esc(g.url) + '" target="_blank" rel="noopener">' + esc(g.title) + '</a>' +
          (g.source ? '<span class="ag-arcade-src">SOURCE CODE</span>' : '<span class="ag-arcade-tag">' + esc(g.tag || 'itch.io') + '</span>') +
        '</div>' +
        '<p class="ag-arcade-desc">' + esc(g.desc || '') + '</p>' +
        '<div class="ag-arcade-frame"><iframe src="' + esc(g.embed) + '" width="100%" height="520" frameborder="0" scrolling="no" allowfullscreen></iframe></div>' +
        '<div class="ag-arcade-actions">' +
          '<button class="ag-btn ag-btn--go" id="agArcadeNext">NEXT GAME</button>' +
          '<a class="ag-btn ag-btn--ghost" href="' + esc(g.url) + '" target="_blank" rel="noopener">OPEN ON ITCH.IO</a>' +
        '</div>' +
      '</div>';
    api.stage.querySelector('#agArcadeNext').onclick = function () {
      api.pick++;
      drawArcade(api);
    };
    /* the red strip skips this cabinet and moves to the next one */
    api._answerText = g.title;
    api._onSkip = function () {
      api.pick++;
      skipVerdict(api, api._answerText, drawArcade);
    };
  }

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
