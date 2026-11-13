/* ══════════════════════════════════════════════════════════════════════
   SITE KNOWLEDGE
   The files of this website - the cards, the genres, the ratings, the dub
   table, the on-file facts, the quest questions and the clue sets - packed
   into one place so the AI assistant can actually READ them instead of
   answering from memory.

   How it works:
     1. scripts/build-site-knowledge.js reads index.html + quest-data.js +
        game-data.js + game-data-extra.js + game-data-facts.js and writes
        site-knowledge.json (the "files" of the site in one bundle).
     2. This module loads that bundle, merges it with the live DOM (so the
        card data is never stale) and can pull out the rows that matter for
        a question.
     3. The chat injects those rows into the system prompt as a FILES READ
        block, so the answer is based on the real site data.

   It runs in the browser AND in node (the scripts/ask-knowledge.js CLI uses
   the very same retrieval code).
   ══════════════════════════════════════════════════════════════════════ */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.SiteKnowledge = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var DATA = null;      /* the parsed site-knowledge.json                */
  var ROWS = [];        /* the anime rows (live DOM in the browser)      */
  var SPECIAL = {};     /* the special card kinds                        */
  var LOADING = null;   /* the in-flight load promise                    */

  /* words that never identify a title */
  var STOP = {
    a: 1, an: 1, the: 1, of: 1, in: 1, on: 1, at: 1, to: 1, is: 1, are: 1,
    was: 1, and: 1, or: 1, for: 1, with: 1, what: 1, which: 1, who: 1, whom: 1,
    how: 1, many: 1, much: 1, does: 1, do: 1, did: 1, has: 1, have: 1, had: 1,
    me: 1, my: 1, i: 1, you: 1, your: 1, he: 1, she: 1, it: 1, they: 1, we: 1,
    tell: 1, about: 1, give: 1, show: 1, list: 1, anime: 1, show2: 1, please: 1,
    can: 1, know: 1, say: 1, said: 1, more: 1, best: 1, top: 1, good: 1, any: 1,
    was2: 1, ever: 1, this: 1, that: 1, there: 1, here: 1, and2: 1, but: 1,
    from: 1, into: 1, out: 1, up: 1, down: 1, over: 1, under: 1, again: 1,
    really: 1, actually: 1, episodes: 1, episode: 1, season: 1, seasons: 1,
    watched: 1, watch: 1, watching: 1, read: 1, manga: 1, series: 1, title: 1,
    character: 1, characters: 1, genre: 1, genres: 1, rating: 1, rated: 1,
    mal: 1, score: 1, scores: 1, story: 1, plot: 1, ending: 1, opening: 1,
    dub: 1, dubbed: 1, sub: 1, hindi: 1, english: 1, character2: 1
  };

  /* ── small helpers ──────────────────────────────────────────────── */
  function norm(s) {
    return String(s == null ? '' : s)
      .toLowerCase()
      .replace(/[^\w\s#&'-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
  function tokens(s) {
    var out = [];
    norm(s).split(' ').forEach(function (t) {
      if (!t || STOP[t]) return;
      if (t.length < 2 && !/^\d$/.test(t)) return;
      out.push(t);
    });
    return out;
  }
  function clean(s) {
    /* strips the emoji the cards carry ("📺 Season-1,2" -> "Season-1,2") */
    return String(s == null ? '' : s).replace(/^[^\w([{<]+/u, '').replace(/\s+/g, ' ').trim();
  }
  function lev(a, b) {
    if (a === b) return 0;
    if (!a.length || !b.length) return Math.max(a.length, b.length);
    var prev = [], i, j;
    for (j = 0; j <= b.length; j++) prev[j] = j;
    for (i = 1; i <= a.length; i++) {
      var cur = [i];
      for (j = 1; j <= b.length; j++) {
        cur[j] = Math.min(
          prev[j] + 1,
          cur[j - 1] + 1,
          prev[j - 1] + (a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1)
        );
      }
      prev = cur;
    }
    return prev[b.length];
  }
  function cap(str, n) {
    str = String(str == null ? '' : str);
    return str.length > n ? str.slice(0, n - 1) + '…' : str;
  }

  /* ── the special card kinds ────────────────────────────────────── */
  var DEFAULT_SPECIAL = {
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

  /* ── loading ───────────────────────────────────────────────────── */
  function load(url) {
    if (DATA) return Promise.resolve(DATA);
    if (LOADING) return LOADING;
    var target = url || 'site-knowledge.json';
    /* the default cache mode: the service worker keeps the file for
       offline use, and a hard cache request fails on some browsers */
    LOADING = fetch(target)
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { return use(j); })
      .catch(function () { return use(null); });
    return LOADING;
  }

  /* data = the parsed site-knowledge.json, rows = the live anime rows */
  function use(data, rows) {
    if (data) DATA = data;
    if (rows) ROWS = rows;
    if (DATA && DATA.specialTypes) SPECIAL = DATA.specialTypes;
    if (!SPECIAL || !Object.keys(SPECIAL).length) SPECIAL = DEFAULT_SPECIAL;
    return DATA;
  }

  function setRows(rows) { ROWS = rows || []; return ROWS; }
  function setSpecial(map) { SPECIAL = map || DEFAULT_SPECIAL; return SPECIAL; }
  function data() { return DATA; }
  function rows() { return ROWS; }

  /* ── the anime rows ────────────────────────────────────────────── */
  function rowText(row) {
    var bits = [];
    if (row.n) bits.push('#' + row.n);
    bits.push(row.title || '');
    return bits.join(' ');
  }
  function genreList(row) {
    return (row.genres || []).filter(function (g) { return g && g !== 'All'; });
  }
  function malOf(row) {
    if (row.mal != null && row.mal !== '') {
      var m = parseFloat(row.mal);
      if (isFinite(m)) return m;
    }
    if (row.ratings && row.ratings.malScore != null) {
      var m2 = parseFloat(row.ratings.malScore);
      if (isFinite(m2)) return m2;
    }
    return null;
  }
  function specialOf(row) {
    if (!row.special) return '';
    var s = SPECIAL[row.special];
    if (!s) return row.special;
    return (s.t || row.special) + ' / ' + (s.s || '');
  }

  /* ── title matching ────────────────────────────────────────────── */
  function scoreTitle(row, qn, qt) {
    var best = 0;
    var title = row.title || '';
    var tn = norm(title);
    if (!tn) return 0;

    if (qn && qn.indexOf(tn) > -1) best = Math.max(best, 120);
    else if (tn.indexOf(qn) > -1 && qn.length >= 4) best = Math.max(best, 100);

    var tt = tokens(title);
    if (tt.length && qt.length) {
      var hits = 0;
      tt.forEach(function (t) { if (qt.indexOf(t) > -1) hits++; });
      if (hits === tt.length) best = Math.max(best, 92);
      else if (hits) best = Math.max(best, Math.round(58 * hits / tt.length));
      /* one distinctive word is enough ("solo leveling" -> "solo") */
      var first = tt[0];
      if (first.length >= 4 && qt.indexOf(first) > -1) best = Math.max(best, 46);
      /* a typo still finds the show */
      for (var i = 0; i < qt.length; i++) {
        if (qt[i].length < 5) continue;
        for (var j = 0; j < tt.length; j++) {
          if (Math.abs(qt[i].length - tt[j].length) > 2) continue;
          var d = lev(qt[i], tt[j]);
          if (d <= 2) best = Math.max(best, 40);
        }
      }
    }
    /* the alternative names the clue file knows */
    (row.alt || []).forEach(function (a) {
      var an = norm(a);
      if (an && an.length >= 3 && qn.indexOf(an) > -1) best = Math.max(best, 96);
    });
    return best;
  }

  /* "anime #12", "no 12", "card 7", "12th" */
  function numberIn(question) {
    var q = String(question || '');
    var m = q.match(/#\s*(\d{1,4})/) ||
      q.match(/\banime\s*(?:no\.?|number)?\s*(\d{1,4})\b/i) ||
      q.match(/\bcard\s*(?:no\.?|number)?\s*(\d{1,4})\b/i) ||
      q.match(/\bno\.?\s*(\d{1,4})\b/i) ||
      q.match(/\b(\d{1,4})(?:st|nd|rd|th)\b/);
    if (!m) return null;
    var n = parseInt(m[1], 10);
    return isFinite(n) && n > 0 ? n : null;
  }

  /* the genre words a visitor may use */
  var GENRE_WORDS = [
    ['Action', ['action']], ['Adventure', ['adventure']], ['Comedy', ['comedy', 'funny']],
    ['Sports', ['sports', 'sport']], ['Isekai', ['isekai']],
    ['High School', ['high school', 'highschool', 'school']],
    ['Sci-Fi', ['sci-fi', 'scifi', 'sci fi', 'science fiction', 'mecha']],
    ['Dark / Horror', ['dark', 'horror', 'dark/horror']],
    ['Romcom', ['romcom', 'romance', 'romantic', 'romance comedy']],
    ['Slice of Life', ['slice of life', 'sol', 'slice-of-life']],
    ['Historical', ['historical', 'history']],
    ['Psychological', ['psychological', 'psychology', 'psych']]
  ];

  function genresIn(question) {
    var q = norm(question);
    var out = [];
    GENRE_WORDS.forEach(function (pair) {
      pair[1].forEach(function (w) {
        if (new RegExp('(^| )' + w.replace(/[-/]/g, '\\$&') + '( |$)').test(q)) {
          if (out.indexOf(pair[0]) === -1) out.push(pair[0]);
        }
      });
    });
    return out;
  }

  function isSpecialQuestion(qn) {
    return /special|legendary|epic|over powered|isekai lord|stamp|rarity|rare tier|card kind|cur cursed|curse/.test(qn) ||
      /special|legendary|epic|stamp|rarity|tier/.test(qn);
  }
  function isDubQuestion(qn) {
    return /\bdub|dubbed|dubbing|hindi|english dub|subbed|subtitle|subtitles|voice/.test(qn);
  }
  function isRatingQuestion(qn) {
    return /rating|rated|mal|score|how good|quality|better than|worth watching|best|top/.test(qn);
  }
  function isFactQuestion(qn) {
    return /true or false|true\/false|fact|statement|true fact|lie/.test(qn);
  }
  function isStatsQuestion(qn) {
    return /how many|how much|total|totals|count|number of|stats|statistics/.test(qn);
  }
  function isCharacterQuestion(qn) {
    return /character|characters|who is|who are|main character|protagonist|villain|hero/.test(qn);
  }

  /* ── the retrieval ─────────────────────────────────────────────── */
  function retrieve(question, opts) {
    opts = opts || {};
    var maxRows = opts.maxRows || 4;
    var qn = norm(question);
    var qt = tokens(question);
    var lines = [];
    var hits = [];
    var labels = {};

    /* 1. a card number in the question wins over everything */
    var num = numberIn(question);
    if (num != null) {
      ROWS.forEach(function (r) {
        if (r.n === num) { r._score = 300; hits.push(r); }
      });
    }

    /* 2. title matching */
    ROWS.forEach(function (r) {
      var s = scoreTitle(r, qn, qt);
      if (s > (r._score || 0)) r._score = s;
    });
    ROWS.forEach(function (r) { if (r._score >= 45) hits.push(r); });
    hits.sort(function (a, b) { return (b._score - a._score) || ((a.n || 0) - (b.n || 0)); });
    hits = hits.slice(0, maxRows);
    hits.forEach(function (r) { delete r._score; });

    /* 3. the card rows themselves */
    if (hits.length) {
      labels.cards = true;
      lines.push('CARD ROWS (the exact card data on the site):');
      hits.forEach(function (r) {
        var bits = [];
        if (r.n) bits.push('[anime #' + r.n + ']');
        bits.push(r.title);
        var g = genreList(r);
        if (g.length) bits.push('genres: ' + g.join(', '));
        if (r.seasons) bits.push('seasons: ' + r.seasons);
        if (r.episodes != null) bits.push('episodes: ' + r.episodes);
        var mal = malOf(r);
        if (mal != null) bits.push('MAL score: ' + mal.toFixed(1));
        if (r.ratings) {
          var extra = [];
          if (r.ratings.storyRating != null) extra.push('story ' + r.ratings.storyRating);
          if (r.ratings.characters != null) extra.push('characters ' + r.ratings.characters);
          if (r.ratings.animRating != null) extra.push('animation ' + r.ratings.animRating);
          if (r.ratings.anilist != null) extra.push('anilist ' + r.ratings.anilist);
          if (r.ratings.animePlanet != null) extra.push('animeplanet ' + r.ratings.animePlanet);
          if (extra.length) bits.push('site ratings: ' + extra.join(', '));
        }
        var sp = specialOf(r);
        if (sp) bits.push('special card: ' + sp);
        if (r.note) bits.push('note: ' + r.note);
        lines.push('- ' + bits.join(' | '));
      });
    }

    /* 4. the special cards */
    if (isSpecialQuestion(qn)) {
      labels.special = true;
      var special = ROWS.filter(function (r) { return !!r.special; });
      if (special.length) {
        lines.push('SPECIAL CARDS (the glowing kinds on the site):');
        special.forEach(function (r) {
          lines.push('- ' + (r.n ? '#' + r.n + ' ' : '') + r.title + ' -> ' + specialOf(r));
        });
      }
    }

    /* 5. the dub table */
    if (isDubQuestion(qn)) {
      labels.dub = true;
      var dub = dubRows();
      var wanted = hits.map(function (r) { return norm(r.title); });
      var dubLines = [];
      Object.keys(dub).forEach(function (k) {
        var d = dub[k] || {};
        if (!d.hi && !d.en && !d.sub) return;
        var kn = norm(k);
        var keep = !wanted.length;
        wanted.forEach(function (w) { if (w && (kn.indexOf(w) > -1 || w.indexOf(kn) > -1)) keep = true; });
        if (!keep) return;
        dubLines.push('- ' + k + ' | Hindi dub: ' + (d.hi || 'none on file') +
          ' | English dub: ' + (d.en || 'none on file') +
          ' | Subtitles: ' + (d.sub || 'Japanese audio'));
      });
      if (dubLines.length) {
        lines.push('DUB FILE (official/OTT only - "none on file" means do not guess):');
        lines = lines.concat(dubLines.slice(0, 8));
      }
    }

    /* 6. the site's own ratings - the best titles when nothing else matched */
    if (isRatingQuestion(qn) && (!hits.length || hits.length < 3)) {
      labels.best = true;
      var ranked = ROWS.filter(function (r) { return malOf(r) != null; });
      ranked.sort(function (a, b) { return malOf(b) - malOf(a); });
      lines.push('BEST ON THE SITE BY MAL SCORE:');
      ranked.slice(0, 8).forEach(function (r) {
        lines.push('- ' + (r.n ? '#' + r.n + ' ' : '') + r.title + ' (MAL ' + malOf(r).toFixed(1) + ')' +
          (r.ratings && r.ratings.storyRating != null ? ', story ' + r.ratings.storyRating : ''));
      });
    }

    /* 7. a genre question - the titles of that genre */
    var gq = genresIn(question);
    if (gq.length && (!hits.length || hits.length < 3)) {
      labels.genres = true;
      lines.push('IN THAT GENRE ON THE SITE (number = card number, MAL = site score):');
      ROWS.filter(function (r) {
        return genreList(r).some(function (g) { return gq.indexOf(g) > -1; });
      }).slice(0, 12).forEach(function (r) {
        var mal = malOf(r);
        lines.push('- ' + (r.n ? '#' + r.n + ' ' : '') + r.title +
          (mal != null ? ' (MAL ' + mal.toFixed(1) + ')' : '') +
          ' [' + genreList(r).join(', ') + ']');
      });
    }

    /* 8. the totals */
    if (isStatsQuestion(qn) || /fardin'?s list|your list|the hub|the site/.test(qn)) {
      labels.stats = true;
      var st = stats();
      lines.push('SITE TOTALS: ' + st.anime + ' anime, ' + st.seasons + ' seasons, ' + st.episodes + ' episodes.');
    }

    /* 9. the on-file facts (true/false statements) */
    if (DATA && DATA.facts && DATA.facts.length && (isFactQuestion(qn) || (qt.length && qt.length <= 6))) {
      var fq = qt.slice(0, 6);
      var picked = [];
      DATA.facts.forEach(function (f) {
        var stmt = Array.isArray(f) ? f[0] : (f && f.s) || '';
        var truth = Array.isArray(f) ? f[1] : (f && f.t);
        if (!stmt) return;
        var ft = tokens(stmt);
        var hits2 = 0;
        ft.forEach(function (t) { if (fq.indexOf(t) > -1) hits2++; });
        if (!fq.length) return;
        if (hits2 >= Math.max(1, Math.ceil(ft.length * 0.3)) || hits2 >= 2) {
          picked.push({ s: stmt, t: truth, h: hits2 });
        }
      });
      picked.sort(function (a, b) { return b.h - a.h; });
      if (picked.length) {
        labels.facts = true;
        lines.push('ON-FILE STATEMENTS (true/false - the exact statements the site stores):');
        picked.slice(0, 5).forEach(function (p) {
          lines.push('- ' + p.s + ' -> ' + (p.t ? 'TRUE' : 'FALSE'));
        });
      }
    }

    /* 10. the quest questions - the deepest on-file knowledge */
    if (DATA && DATA.qa) {
      var keys = hits.slice(0, 3).map(function (r) { return r.title; });
      var qaLines = [];
      keys.forEach(function (title) {
        var bank = DATA.qa[title] || DATA.qa[norm(title)];
        if (!bank || !bank.length) return;
        var qT = qt;
        var scored = bank.map(function (pair, i) {
          var qt2 = tokens(pair.q);
          var h = 0;
          qt2.forEach(function (t) { if (qT.indexOf(t) > -1) h++; });
          return { pair: pair, i: i, h: h };
        });
        var exact = scored.filter(function (s) { return s.h >= Math.max(1, Math.ceil(tokens(s.pair.q).length * 0.4)); });
        if (exact.length) {
          qaLines.push('ON FILE ABOUT ' + title + ':');
          exact.slice(0, 5).forEach(function (s) {
            qaLines.push('- ' + s.pair.q + ' -> ' + s.pair.a);
          });
        } else if (isCharacterQuestion(qn) || qT.length) {
          /* a broad question about the title - give the first few on file */
          var first = scored.slice(0, 3);
          if (first.length) {
            qaLines.push('ON FILE ABOUT ' + title + ':');
            first.forEach(function (s) {
              qaLines.push('- ' + s.pair.q + ' -> ' + s.pair.a);
            });
          }
        }
      });
      if (qaLines.length) {
        labels.qa = true;
        lines = lines.concat(qaLines);
      }
    }

    /* 11. the clue sets - what the site knows about the show */
    if (DATA && DATA.clues && hits.length) {
      hits.slice(0, 2).forEach(function (r) {
        var set = DATA.clues[r.title] || DATA.clues[norm(r.title)];
        if (!set || !set.length) return;
        labels.clues = true;
        lines.push('CLUES ON FILE ABOUT ' + r.title + ':');
        set.slice(0, 4).forEach(function (c) { lines.push('- ' + c); });
      });
    }

    return { lines: lines, hits: hits, labels: labels, question: String(question || '') };
  }

  /* the block that rides along in the system prompt */
  function block(question, opts) {
    opts = opts || {};
    var res = retrieve(question, opts);
    if (!res.lines.length) return '';
    var text = res.lines.join('\n');
    var max = opts.maxChars || 1200;
    if (text.length > max) text = cap(text, max);
    return 'FILES READ FROM THE WEBSITE (exact site data - use these numbers, never guess, never contradict them):\n' + text;
  }

  /* every row as plain text - the whole catalogue, for a full read */
  function catalogue(opts) {
    opts = opts || {};
    var out = [];
    ROWS.forEach(function (r) {
      var bits = [];
      if (r.n) bits.push('#' + r.n);
      bits.push(r.title);
      var g = genreList(r);
      if (g.length) bits.push('[' + g.join(', ') + ']');
      if (r.seasons) bits.push(r.seasons);
      if (r.episodes != null) bits.push(r.episodes + ' episodes');
      var mal = malOf(r);
      if (mal != null) bits.push('MAL ' + mal.toFixed(1));
      var sp = specialOf(r);
      if (sp) bits.push('special: ' + sp);
      out.push(bits.join(' | '));
    });
    return out.join('\n');
  }

  /* ── the numbers ───────────────────────────────────────────────── */
  function stats() {
    var anime = ROWS.length;
    var seasons = 0, episodes = 0;
    ROWS.forEach(function (r) {
      if (r.seasonCount) seasons += r.seasonCount;
      if (r.episodes != null) episodes += Number(r.episodes) || 0;
    });
    /* the live cards always win - the file is only the fallback */
    if (anime) return { anime: anime, seasons: seasons, episodes: episodes };
    if (DATA && DATA.stats) {
      return {
        anime: DATA.stats.anime || 0,
        seasons: DATA.stats.seasons || 0,
        episodes: DATA.stats.episodes || 0
      };
    }
    return { anime: anime, seasons: seasons, episodes: episodes };
  }

  function dubRows() {
    if (DATA && DATA.dubs) return DATA.dubs;
    if (typeof window !== 'undefined' && window.DUB_DATA) return window.DUB_DATA;
    return {};
  }

  return {
    load: load,
    use: use,
    setRows: setRows,
    setSpecial: setSpecial,
    data: data,
    rows: rows,
    retrieve: retrieve,
    block: block,
    catalogue: catalogue,
    stats: stats,
    norm: norm,
    tokens: tokens,
    clean: clean,
    DEFAULT_SPECIAL: DEFAULT_SPECIAL
  };
});
