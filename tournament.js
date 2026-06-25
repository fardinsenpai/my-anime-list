/* ============================================================
   ANIME TOURNAMENT MODE  —  tournament.js
   Pick a genre + bracket size (4/8/16), auto-simulate a
   single-elimination bracket with pure-power matchups (same
   formula as the Anime Duel system) until a champion is crowned.

   Reuses (does NOT duplicate):
     - window.DuelSystem.state.animeDatabase  (roster)
     - window.ANIME_GENRES                     (genre -> Set<rank>)
     - window.DuelCalc.calcPower / getWinner   (deterministic)
   ============================================================ */

(function (window, document) {
  "use strict";
  if (window.__TOURNAMENT_LOADED__) return;
  window.__TOURNAMENT_LOADED__ = true;

  /* ---------- constants ---------- */
  var SIZES = [4, 8, 16];
  var ROUND_NAMES = {
    2: "Final",
    4: "Semi-Final",
    8: "Quarter-Final",
    16: "Round of 16"
  };
  var CHAMP_KEY = "anime_tournament_champions";
  var POSTER_FALLBACK = "🎌";

  /* ---------- state ---------- */
  var TourState = {
    roster: [],          // [{title, rank, malScore, ...}] filtered to chosen genre
    size: 8,
    genre: null,         // genre name string
    rounds: [],          // rounds[r][m] = {p1, p2, winner, loser, isDraw}
    champion: null,      // anime obj or null
    isSimulating: false,
    speed: 1,            // 1 | 2 | 'instant'
    thirdPlace: null,    // {p1, p2, winner, loser, isDraw} or null
    matchProgress: { current: 0, total: 0 },
    stats: null         // { biggestUpset, highestScore, highestScoreMatch }
  };

  var posterCache = null; // { rankInt: imgSrc }

  /* ============================================================
     UTIL
     ============================================================ */

  // Multi-strategy sidebar closer (mirrors duel-system's closeSidebar).
  function closeSidebar() {
    var s = document.getElementById("sideMenu");
    if (s) {
      ["open", "active", "show", "visible", "expanded"].forEach(function (c) {
        s.classList.remove(c);
      });
      s.classList.add("closed"); s.classList.add("hidden");
    }
    document.querySelectorAll(".menu-btn, .hamburger, .menu-toggle, [data-menu-toggle]")
      .forEach(function (b) { if (b && b.click) { try { b.click(); } catch (e) {} } });
    var back = document.querySelector(".sidebar-backdrop, .menu-overlay");
    if (back && back.click) { try { back.click(); } catch (e) {} }
  }

  function esc(s) {
    if (s == null) return "";
    return String(s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function shuffle(arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  function delay(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  // Scale timing by current speed.
  function t(baseMs) {
    if (TourState.speed === "instant") return 0;
    return Math.round(baseMs / TourState.speed);
  }

  /* ============================================================
     DATA ACCESS
     ============================================================ */

  function getAnimeDatabase() {
    var ds = window.DuelSystem && window.DuelSystem.state;
    if (ds && Array.isArray(ds.animeDatabase) && ds.animeDatabase.length) {
      return ds.animeDatabase;
    }
    return null;
  }

  // Wait (briefly) for the duel system to load its database.
  function awaitDatabase(cb, attempts) {
    attempts = attempts || 0;
    var db = getAnimeDatabase();
    if (db) return cb(db);
    if (attempts > 40) return cb(null); // ~8s max
    setTimeout(function () { awaitDatabase(cb, attempts + 1); }, 200);
  }

  // Build a rank -> poster img src map from the page grid (once).
  function getPosters() {
    if (posterCache) return posterCache;
    posterCache = {};
    document.querySelectorAll("#grid .card, .grid .card, .card").forEach(function (card) {
      var numEl = card.querySelector(".number, .badge");
      var imgEl = card.querySelector(".poster-wrap img, .card-front img, img");
      var rank = -1;
      if (numEl) {
        var m = (numEl.textContent || "").match(/\d+/);
        if (m) rank = parseInt(m[0], 10);
      }
      if (imgEl && imgEl.src && rank > 0) posterCache[rank] = imgEl.src;
    });
    return posterCache;
  }

  function posterFor(rank) {
    var p = getPosters();
    return p[rank] || null;
  }

  // Available anime count for a genre (intersect genre nums with loaded DB).
  function countForGenre(genreName) {
    var g = window.ANIME_GENRES && window.ANIME_GENRES[genreName];
    if (!g || !g.nums) return 0;
    var db = getAnimeDatabase();
    if (!db) return 0;
    var have = 0;
    g.nums.forEach(function (rank) {
      for (var i = 0; i < db.length; i++) {
        if ((db[i].rank || db[i].id || db[i].number) === rank) { have++; break; }
      }
    });
    return have;
  }

  // Filtered roster for a genre, full anime objects.
  function rosterForGenre(genreName) {
    var g = window.ANIME_GENRES && window.ANIME_GENRES[genreName];
    if (!g || !g.nums) return [];
    var db = getAnimeDatabase();
    if (!db) return [];
    var out = [];
    g.nums.forEach(function (rank) {
      for (var i = 0; i < db.length; i++) {
        var a = db[i];
        if ((a.rank || a.id || a.number) === rank) { out.push(a); break; }
      }
    });
    return out;
  }

  // Genre list sorted by available count desc, with counts.
  function genreOptions() {
    var genres = window.ANIME_GENRES;
    if (!genres) return [];
    var out = [];
    Object.keys(genres).forEach(function (name) {
      if (name === "All" || name === "Movie") return;
      var c = countForGenre(name);
      if (c > 0) out.push({ name: name, icon: genres[name].icon || "", count: c });
    });
    out.sort(function (a, b) { return b.count - a.count; });
    return out;
  }

  /* ============================================================
     PERSISTENCE  (Hall of Champions — local only)
     ============================================================ */
  function getChampions() {
    try { return JSON.parse(localStorage.getItem(CHAMP_KEY)) || []; }
    catch (e) { return []; }
  }
  function saveChampion(anime, genre, size) {
    var list = getChampions();
    list.unshift({
      title: anime.title, rank: anime.rank, genre: genre, size: size,
      date: new Date().toLocaleDateString()
    });
    if (list.length > 50) list = list.slice(0, 50);
    try { localStorage.setItem(CHAMP_KEY, JSON.stringify(list)); } catch (e) {}
  }
  function clearChampions() {
    try { localStorage.removeItem(CHAMP_KEY); } catch (e) {}
  }

  /* ============================================================
     TOAST
     ============================================================ */
  function toast(title, msg, type) {
    type = type || "info";
    var old = document.querySelector(".tourney-toast");
    if (old) old.remove();
    var el = document.createElement("div");
    el.className = "tourney-toast tourney-toast--" + type;
    var icon = type === "success" ? "✅" : type === "warning" ? "⚠️"
             : type === "error" ? "❌" : "🏆";
    el.innerHTML =
      '<div class="tourney-toast__icon">' + icon + '</div>' +
      '<div class="tourney-toast__body">' +
        '<div class="tourney-toast__title">' + esc(title) + '</div>' +
        (msg ? '<div class="tourney-toast__msg">' + esc(msg) + '</div>' : "") +
      '</div>' +
      '<button class="tourney-toast__close" aria-label="Close">✕</button>';
    document.body.appendChild(el);
    function hide() {
      el.classList.add("tourney-toast--hiding");
      setTimeout(function () { el.remove(); }, 320);
    }
    el.querySelector(".tourney-toast__close").addEventListener("click", hide);
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { el.classList.add("tourney-toast--visible"); });
    });
    setTimeout(hide, 3500);
  }

  /* ============================================================
     BRACKET MODEL
     ============================================================ */

  // Decide winner deterministically using the duel formula.
  // Draws (power diff < 0.001) tiebreak to lower rank number.
  function resolveMatch(a1, a2) {
    var calc = window.DuelCalc;
    if (!calc || !calc.calcPower) return { winner: a1, loser: a2, isDraw: false,
                                            s1: 0, s2: 0, isUpset: false };
    var s1 = calc.calcPower(a1), s2 = calc.calcPower(a2);
    var isDraw = Math.abs(s1 - s2) < 0.001;
    var winner, loser;
    if (isDraw) {
      var r1 = a1.rank || a1.id || a1.number || 0;
      var r2 = a2.rank || a2.id || a2.number || 0;
      winner = r1 <= r2 ? a1 : a2;
      loser = r1 <= r2 ? a2 : a1;
    } else {
      winner = s1 > s2 ? a1 : a2;
      loser = s1 > s2 ? a2 : a1;
    }
    var wRank = winner.rank || winner.id || 9999;
    var lRank = loser.rank || loser.id || 0;
    var isUpset = !isDraw && wRank > lRank;
    return { winner: winner, loser: loser, isDraw: isDraw, s1: s1, s2: s2, isUpset: isUpset };
  }

  // Build the rounds skeleton: rounds[0] has size/2 matches.
  // p2 slots start null (filled as winners advance).
  function buildBracket(contenders, size) {
    var seeds = shuffle(contenders.slice(0, size));
    var rounds = [];
    var matchCount = size / 2;
    var first = [];
    for (var i = 0; i < matchCount; i++) {
      first.push({
        p1: seeds[i * 2] || null,
        p2: seeds[i * 2 + 1] || null,
        winner: null, loser: null, isDraw: false, isUpset: false
      });
    }
    rounds.push(first);
    while (matchCount > 1) {
      matchCount /= 2;
      var round = [];
      for (var j = 0; j < matchCount; j++) {
        round.push({ p1: null, p2: null, winner: null, loser: null, isDraw: false, isUpset: false });
      }
      rounds.push(round);
    }
    TourState.thirdPlace = null;
    TourState.stats = null;
    TourState.matchProgress = { current: 0, total: 0 };
    return rounds;
  }

  function roundName(matchCount) {
    return ROUND_NAMES[matchCount] || ("Round (" + matchCount + ")");
  }

  /* ============================================================
     RENDER — SETUP SCREEN
     ============================================================ */

  function openTournament() {
    closeSidebar();
    history.pushState(null, '', 'tournament');
    // If duel mode is on, turn it off to avoid conflict.
    if (window.DuelSystem && window.DuelSystem.state && window.DuelSystem.state.isActive) {
      try { window.DuelSystem.toggle(); } catch (e) {}
    }
    removeOverlay();
    awaitDatabase(function (db) {
      if (!db) {
        toast("Database not ready", "Anime data is still loading — try again in a moment.", "warning");
        return;
      }
      renderSetup();
    });
  }

  function renderSetup() {
    var opts = genreOptions();
    var ov = makeShell();
    var arena = ov.querySelector(".tourney-arena");

    var genreOptsHtml = opts.map(function (g) {
      return '<option value="' + esc(g.name) + '">' +
             esc(g.name) + "  (" + g.count + " anime)</option>";
    }).join("");

    var genreCardsHtml = opts.map(function (g) {
      var icon = g.icon || '🎯';
      return '<div class="tourney-genre-card" data-genre="' + esc(g.name) + '">' +
        '<span class="tourney-genre-card__icon">' + icon + '</span>' +
        '<span class="tourney-genre-card__name">' + esc(g.name) + '</span>' +
        '<span class="tourney-genre-card__count">' + g.count + '</span>' +
      '</div>';
    }).join("");

    var sizeVisuals = {
      4:  '🏆<span>4</span><small>2 → 1</small>',
      8:  '🏆<span>8</span><small>4 → 2 → 1</small>',
      16: '🏆<span>16</span><small>8 → 4 → 2 → 1</small>'
    };

    arena.insertAdjacentHTML("beforeend",
      '<div class="tourney-setup" id="tourneySetup">' +
        '<div class="tourney-desktop-notice">💻 For the best experience, use Desktop Site mode on mobile</div>' +
        '<div class="tourney-setup__step">' +
          '<div class="tourney-setup__step-num">01</div>' +
          '<div class="tourney-setup__step-title">Choose Your Battlefield</div>' +
        '</div>' +
        '<div class="tourney-genre-grid" id="tourneyGenreGrid">' +
          genreCardsHtml +
        '</div>' +

        '<div class="tourney-setup__step">' +
          '<div class="tourney-setup__step-num">02</div>' +
          '<div class="tourney-setup__step-title">Set the Stage</div>' +
        '</div>' +
        '<div class="tourney-size-row" id="tourneySizeRow">' +
          sizeBtnHtml(4, sizeVisuals[4]) +
          sizeBtnHtml(8, sizeVisuals[8]) +
          sizeBtnHtml(16, sizeVisuals[16]) +
        '</div>' +

        '<div class="tourney-setup__bar" id="tourneyBar">' +
          '<span id="tourneyBarText">Pick a genre to begin</span>' +
          '<button class="tourney-start-btn" id="tourneyStart" disabled>⚔️ BATTLE</button>' +
        '</div>' +

        '<div class="tourney-hall-toggle">' +
          '<button id="tourneyHallBtn">🏆 Hall of Champions</button>' +
        '</div>' +
        '<div class="tourney-hall" id="tourneyHall"></div>' +
      '</div>'
    );

    showOverlay(ov);

    var genreGrid = arena.querySelector("#tourneyGenreGrid");
    var sizeRow = arena.querySelector("#tourneySizeRow");
    var barText = arena.querySelector("#tourneyBarText");
    var startBtn = arena.querySelector("#tourneyStart");
    var selectedGenre = null;

    function selectedSize() {
      var active = sizeRow.querySelector(".tourney-size-btn--active");
      return active ? parseInt(active.getAttribute("data-size"), 10) : null;
    }

    function refreshSetup() {
      var gn = selectedGenre;
      var count = gn ? countForGenre(gn) : 0;
      var sz = selectedSize();

      // Enable/disable size buttons
      SIZES.forEach(function (s) {
        var btn = sizeRow.querySelector('[data-size="' + s + '"]');
        if (!btn) return;
        var ok = count >= s;
        btn.classList.toggle("tourney-size-btn--disabled", !ok);
        if (!ok) btn.classList.remove("tourney-size-btn--active");
      });

      // Auto-pick largest size
      if (!sz && count > 0) {
        for (var i = SIZES.length - 1; i >= 0; i--) {
          if (count >= SIZES[i]) {
            var b = sizeRow.querySelector('[data-size="' + SIZES[i] + '"]');
            if (b) b.classList.add("tourney-size-btn--active");
            sz = SIZES[i];
            break;
          }
        }
      }

      // Bar text
      if (!gn) barText.textContent = "🎯 Pick a genre to begin";
      else if (count < 4) barText.textContent = "⚠️ Only " + count + " anime in " + gn + " — need at least 4";
      else if (!sz) barText.textContent = "📏 Select a bracket size";
      else barText.textContent = "✅ " + count + " anime ready · " + sz + "-player bracket";
      startBtn.disabled = !gn || !sz;
    }

    // Genre click
    genreGrid.addEventListener("click", function (e) {
      var card = e.target.closest(".tourney-genre-card");
      if (!card) return;
      genreGrid.querySelectorAll(".tourney-genre-card").forEach(function (c) {
        c.classList.remove("tourney-genre-card--active");
      });
      card.classList.add("tourney-genre-card--active");
      selectedGenre = card.getAttribute("data-genre");
      refreshSetup();
    });

    sizeRow.addEventListener("click", function (e) {
      var btn = e.target.closest(".tourney-size-btn");
      if (!btn || btn.classList.contains("tourney-size-btn--disabled")) return;
      sizeRow.querySelectorAll(".tourney-size-btn").forEach(function (b) {
        b.classList.remove("tourney-size-btn--active");
      });
      btn.classList.add("tourney-size-btn--active");
      refreshSetup();
    });

    startBtn.addEventListener("click", function () {
      var gn = selectedGenre;
      var sz = selectedSize();
      if (!gn || !sz) return;
      var roster = rosterForGenre(gn);
      if (roster.length < 4) { toast("Too few anime", gn + " needs at least 4 anime.", "error"); return; }
      if (roster.length < sz) { toast("Not enough anime", gn + " has " + roster.length + " — pick a smaller bracket.", "error"); return; }
      TourState.genre = gn;
      TourState.size = sz;
      TourState.roster = roster;
      showPickerPopup(roster, sz);
    });

    // Hall of Champions
    var hallBtn = arena.querySelector("#tourneyHallBtn");
    var hallBox = arena.querySelector("#tourneyHall");
    hallBtn.addEventListener("click", function () {
      var isOpen = hallBox.classList.toggle("tourney-hall--open");
      if (isOpen) renderHall(hallBox);
    });
  }

  function sizeBtnHtml(sz, visualHtml) {
    return '<button type="button" class="tourney-size-btn" data-size="' + sz + '">' +
           visualHtml + '</button>';
  }

  function renderHall(box) {
    var list = getChampions();
    if (!list.length) {
      box.innerHTML = '<div class="tourney-hall__title">🏆 Hall of Champions</div>' +
                      '<div class="tourney-hall__empty">No champions yet — crown your first!</div>';
      return;
    }
    var items = list.map(function (c) {
      return '<li class="tourney-hall__item">' +
               '<span>👑 ' + esc(c.title) + '</span>' +
               '<span>' + esc(c.genre) + ' · ' + c.size + ' · ' + esc(c.date) + '</span>' +
             '</li>';
    }).join("");
    box.innerHTML =
      '<div class="tourney-hall__title">🏆 Hall of Champions (' + list.length + ')</div>' +
      '<ul class="tourney-hall__list">' + items + '</ul>' +
      '<button class="tourney-hall__clear" id="tourneyHallClear">Clear history</button>';
    var clr = box.querySelector("#tourneyHallClear");
    if (clr) clr.addEventListener("click", function () {
      clearChampions(); renderHall(box); toast("Cleared", "Champion history removed.", "success");
    });
  }

  /* ============================================================
     PICKER — Select or random anime for bracket
     ============================================================ */

  function showPickerPopup(roster, size) {
    var scope = document.querySelector(".tourney-arena");
    if (!scope) return;

    // Remove any old picker
    var old = scope.querySelector(".tourney-picker-overlay");
    if (old) old.remove();

    var overlay = document.createElement("div");
    overlay.className = "tourney-picker-overlay";
    overlay.innerHTML =
      '<div class="tourney-picker-box">' +
        '<div class="tourney-picker__title">How to pick contestants?</div>' +
        '<div class="tourney-picker__sub">You need <b>' + size + '</b> anime for this bracket (' + roster.length + ' available)</div>' +
        '<div class="tourney-picker__buttons">' +
          '<button class="tourney-picker-btn tourney-picker-btn--random" id="pickerRandom">🎲 Random</button>' +
          '<button class="tourney-picker-btn tourney-picker-btn--select" id="pickerSelect">👆 Select Anime</button>' +
        '</div>' +
      '</div>';
    scope.appendChild(overlay);
    requestAnimationFrame(function () { overlay.classList.add("tourney-picker-overlay--show"); });

    overlay.querySelector("#pickerRandom").addEventListener("click", function () {
      overlay.remove();
      startTournament(roster, size);
    });

    overlay.querySelector("#pickerSelect").addEventListener("click", function () {
      overlay.remove();
      showAnimePicker(roster, size);
    });
  }

  function showAnimePicker(roster, size) {
    var scope = document.querySelector(".tourney-arena");
    if (!scope) return;

    var overlay = document.createElement("div");
    overlay.className = "tourney-picker-overlay tourney-picker-overlay--grid";
    var selected = [];
    var animArr = roster.slice();
    var searchQuery = '';
    var sortBy = 'rank'; // 'rank' | 'power' | 'mal'

    function getPower(a) {
      return (window.DuelCalc && window.DuelCalc.calcPower) ? window.DuelCalc.calcPower(a) : 0;
    }
    function getMal(a) {
      return parseFloat(a.malScore || a.mal_score || 0);
    }

    function sortedList() {
      var list = animArr.slice();
      if (searchQuery) {
        var q = searchQuery.toLowerCase();
        list = list.filter(function (a) { return (a.title || '').toLowerCase().indexOf(q) >= 0; });
      }
      list.sort(function (a, b) {
        if (sortBy === 'power') return getPower(b) - getPower(a);
        if (sortBy === 'mal') return getMal(b) - getMal(a);
        return (a.rank || a.id || 9999) - (b.rank || b.id || 9999);
      });
      return list;
    }

    function renderPicker() {
      var filtered = sortedList();
      var selSet = {};
      selected.forEach(function (a) { selSet[a.rank || a.id || a.title] = true; });

      var cardsHtml = filtered.map(function (a) {
        var key = a.rank || a.id || a.title;
        var isSel = !!selSet[key];
        var selIdx = -1;
        if (isSel) {
          for (var si = 0; si < selected.length; si++) {
            var sk2 = selected[si].rank || selected[si].id || selected[si].title;
            if (String(sk2) === key) { selIdx = si + 1; break; }
          }
        }
        var rank = a.rank || a.id || a.number || "";
        var src = posterFor(rank);
        var imgHtml = src
          ? '<img src="' + esc(src) + '" alt="' + esc(a.title) + '" loading="lazy" />'
          : '<div class="tourney-pick-card__no-img">' + POSTER_FALLBACK + '</div>';
        var isSelectedClass = isSel ? ' tourney-pick-card--selected' : '';
        return '<div class="tourney-pick-card' + isSelectedClass + '" data-key="' + esc(String(key)) + '">' +
          '<div class="card">' +
            '<div class="card-inner">' +
              '<div class="card-front">' +
                '<div class="poster-wrap">' +
                  imgHtml +
                  '<span class="badge">#' + esc(String(rank)) + '</span>' +
                '</div>' +
                '<div class="info">' +
                  '<div class="number">NO. ' + esc(String(rank)) + '</div>' +
                  '<div class="title">' + esc(a.title) + '</div>' +
                '</div>' +
              '</div>' +
            '</div>' +
          '</div>' +
          (isSel ? '<div class="tourney-pick-card__badge">' + selIdx + '</div>' : '') +
        '</div>';
      }).join("");

      var sortActive = function (s) { return sortBy === s ? ' tourney-sort-btn--active' : ''; };

      overlay.innerHTML =
        '<div class="tourney-picker-box tourney-picker-box--wide">' +
          '<div class="tourney-picker__top">' +
            '<div class="tourney-picker__title">Pick <b>' + size + '</b> anime for the bracket</div>' +
            '<div class="tourney-picker__sub">Click to select or deselect — auto-starts when you pick ' + size + '</div>' +
            '<div class="tourney-picker__controls">' +
              '<div class="tourney-picker__search-wrap">' +
                '<span class="tourney-picker__search-icon">🔍</span>' +
                '<input class="tourney-picker__search" id="pickerSearch" type="text" placeholder="Search anime..." value="' + esc(searchQuery) + '">' +
                (searchQuery ? '<button class="tourney-picker__search-clear" id="pickerSearchClear">✕</button>' : '') +
              '</div>' +
              '<div class="tourney-sort-row">' +
                '<button class="tourney-sort-btn' + sortActive('rank') + '" data-sort="rank"># Rank</button>' +
                '<button class="tourney-sort-btn' + sortActive('power') + '" data-sort="power">⚡ Power</button>' +
                '<button class="tourney-sort-btn' + sortActive('mal') + '" data-sort="mal">⭐ MAL</button>' +
              '</div>' +
            '</div>' +
          '</div>' +
          '<div class="tourney-pick-grid">' + cardsHtml + '</div>' +
          '<div class="tourney-picker__actions">' +
            '<span class="tourney-picker__count">Selected: <b>' + selected.length + '</b> / ' + size + '</span>' +
            '<span class="tourney-picker__total">' + filtered.length + ' anime</span>' +
          '</div>' +
          '<button class="tourney-picker-btn tourney-picker-btn--back" id="pickerBack">← Back</button>' +
        '</div>';

      requestAnimationFrame(function () { overlay.classList.add("tourney-picker-overlay--show"); });

      // Search input
      var searchInput = overlay.querySelector("#pickerSearch");
      if (searchInput) {
        searchInput.addEventListener("input", function () {
          searchQuery = this.value;
          renderPicker();
        });
      }
      var clearBtn = overlay.querySelector("#pickerSearchClear");
      if (clearBtn) {
        clearBtn.addEventListener("click", function () {
          searchQuery = '';
          renderPicker();
        });
      }

      // Sort buttons
      overlay.querySelectorAll(".tourney-sort-btn").forEach(function (btn) {
        btn.addEventListener("click", function () {
          sortBy = this.getAttribute("data-sort");
          renderPicker();
        });
      });

      // Card click toggles selection
      overlay.querySelectorAll(".tourney-pick-card").forEach(function (card) {
        card.addEventListener("click", function () {
          var key = card.getAttribute("data-key");
          var anime = null;
          for (var i = 0; i < animArr.length; i++) {
            var a = animArr[i];
            var ak = a.rank || a.id || a.title;
            if (String(ak) === key) { anime = a; break; }
          }
          if (!anime) return;
          var idx = -1;
          for (var j = 0; j < selected.length; j++) {
            var sk = selected[j].rank || selected[j].id || selected[j].title;
            if (String(sk) === key) { idx = j; break; }
          }
          if (idx >= 0) {
            selected.splice(idx, 1);
          } else {
            if (selected.length >= size) return;
            selected.push(anime);
          }
          // Save scroll position before re-render
          var grid = overlay.querySelector(".tourney-pick-grid");
          var scrollTop = grid ? grid.scrollTop : 0;
          renderPicker();
          requestAnimationFrame(function () {
            var g2 = overlay.querySelector(".tourney-pick-grid");
            if (g2) g2.scrollTop = scrollTop;
          });
          if (selected.length === size) {
            var ov = document.querySelector(".tourney-picker-overlay");
            if (ov) ov.remove();
            startTournament(selected, size);
          }
        });
      });

      overlay.querySelector("#pickerBack").addEventListener("click", function () {
        overlay.remove();
        showPickerPopup(TourState.roster, TourState.size);
      });
    }

    renderPicker();
    scope.appendChild(overlay);
  }

  function startTournament(roster, size) {
    TourState.roster = roster;
    TourState.rounds = buildBracket(roster, size);
    TourState.champion = null;
    TourState.isSimulating = false;
    TourState.speed = 1;
    TourState.thirdPlace = null;
    TourState.matchProgress = { current: 0, total: size }; // size matches total (incl 3rd place)
    renderBracketView();
  }

  /* ============================================================
     RENDER — BRACKET VIEW
     ============================================================ */

  function renderBracketView() {
    removeOverlay();
    var ov = makeShell();
    var arena = ov.querySelector(".tourney-arena");

    arena.insertAdjacentHTML("beforeend",
      '<div class="tourney-toolbar" id="tourneyToolbar">' +
        '<div class="tourney-toolbar__info" id="tourneyInfo">' +
          '<b>' + esc(TourState.genre) + '</b>' +
          '<span class="tourney-divider">·</span>' + TourState.size + '-bracket' +
          '<span class="tourney-divider">·</span><span id="tourneyStatus">Ready</span>' +
          '<span class="tourney-divider" id="tourneyProgDiv" style="display:none">·</span>' +
          '<span id="tourneyProgress" style="display:none"></span>' +
        '</div>' +
        '<div class="tourney-toolbar__controls">' +
          '<div class="tourney-speed" id="tourneySpeed">' +
            '<button data-speed="1" class="tourney-speed--active">1×</button>' +
            '<button data-speed="2">2×</button>' +
            '<button data-speed="instant">⏭</button>' +
          '</div>' +
          '<button class="tourney-btn tourney-btn--simulate" id="tourneySim">▶ Simulate</button>' +
          '<button class="tourney-btn tourney-btn--cyan" id="tourneyNew">🔄 New</button>' +
          '<button class="tourney-btn tourney-btn--red" id="tourneyExit">✕ Exit</button>' +
        '</div>' +
      '</div>' +
      '<div class="tourney-bracket-scroll" id="tourneyScroll">' +
        '<div class="tourney-bracket" id="tourneyBracket"></div>' +
      '</div>' +
      '<div class="tourney-champion" id="tourneyChampion"></div>'
    );

    showOverlay(ov);

    renderTree(arena);

    // wire controls
    arena.querySelector("#tourneySim").addEventListener("click", onSimulate);
    arena.querySelector("#tourneyNew").addEventListener("click", function () {
      renderSetup();
    });
    arena.querySelector("#tourneyExit").addEventListener("click", function () {
      removeOverlay();
    });
    var speedBox = arena.querySelector("#tourneySpeed");
    speedBox.addEventListener("click", function (e) {
      var b = e.target.closest("button[data-speed]");
      if (!b) return;
      speedBox.querySelectorAll("button").forEach(function (x) { x.classList.remove("tourney-speed--active"); });
      b.classList.add("tourney-speed--active");
      var v = b.getAttribute("data-speed");
      TourState.speed = v === "instant" ? "instant" : parseInt(v, 10);
    });

  }

  // Build the whole tree DOM from TourState.rounds (winners may be null).
  function renderTree(scope) {
    var root = scope.querySelector("#tourneyBracket");
    root.innerHTML = "";
    var rounds = TourState.rounds;
    var totalRounds = rounds.length;

    rounds.forEach(function (round, rIdx) {
      var col = document.createElement("div");
      col.className = "tourney-round";
      var mc = round.length;
      col.innerHTML =
        '<div class="tourney-round__label">' + esc(roundName(mc)) + '</div>' +
        '<div class="tourney-round__matches" data-round="' + rIdx + '"></div>';
      var matchesBox = col.querySelector(".tourney-round__matches");

      round.forEach(function (match, mIdx) {
        matchesBox.appendChild(renderMatch(match, rIdx, mIdx, totalRounds));
      });

      root.appendChild(col);
    });

    // Third-place match (semi-final losers)
    renderThirdPlaceMatch(root, rounds.length);
  }

  function renderThirdPlaceMatch(root, totalRounds) {
    // Always create the container if size >= 4 (totalRounds >= 2)
    if (totalRounds < 2) return;
    var existing = root.querySelector("#tourneyThirdPlace");
    if (existing) existing.remove();

    var tp = TourState.thirdPlace;
    var el = document.createElement("div");
    el.className = "tourney-third-place" + (!tp || !tp.p1 ? " tourney-third-place--pending" : "");
    el.id = "tourneyThirdPlace";

    if (!tp || !tp.p1) {
      el.innerHTML =
        '<div class="tourney-round__label">🥉 3rd Place</div>' +
        '<div class="tourney-third-place__msg">Awaiting semi-final losers…</div>';
    } else {
      var matchEl = renderMatch(tp, -1, 0, 0);
      matchEl.classList.remove("tourney-match--enter");
      el.innerHTML = '<div class="tourney-round__label">🥉 3rd Place</div>';
      el.appendChild(matchEl);
    }
    root.appendChild(el);
  }

  function renderMatch(match, rIdx, mIdx, totalRounds) {
    var el = document.createElement("div");
    el.className = "tourney-match";
    el.setAttribute("data-round", rIdx);
    el.setAttribute("data-match", mIdx);
    el.appendChild(slotEl(match.p1, match.winner, match.loser));
    el.appendChild(slotEl(match.p2, match.winner, match.loser));
    if (match.winner) {
      el.classList.add("tourney-match--done");
      if (match.isUpset) el.classList.add("tourney-match--upset");
    }
    // Staggered reveal
    if (totalRounds > 1) {
      var delayMs = (totalRounds - 1 - rIdx) * 60 + mIdx * 40;
      el.style.setProperty('--tourney-delay', delayMs + 'ms');
      el.classList.add('tourney-match--enter');
    }
    return el;
  }

  function slotEl(anime, winner, loser) {
    var slot = document.createElement("div");
    slot.className = "tourney-slot";
    if (!anime) {
      slot.classList.add("tourney-slot--empty");
      slot.innerHTML =
        '<div class="tourney-slot__thumb">?</div>' +
        '<div class="tourney-slot__body">' +
          '<div class="tourney-slot__name">Awaiting winner</div>' +
          '<div class="tourney-slot__seed">&nbsp;</div>' +
        '</div>';
      return slot;
    }
    var isWin = winner && (winner === anime ||
                 (winner && anime && (winner.rank || winner.id) === (anime.rank || anime.id)));
    if (winner) slot.classList.add(isWin ? "tourney-slot--winner" : "tourney-slot--loser");
    var rank = anime.rank || anime.id || anime.number || "";
    var power = (window.DuelCalc && window.DuelCalc.calcPower)
              ? window.DuelCalc.calcPower(anime) : "—";
    var powerFormatted = typeof power === 'number' ? power.toFixed(1) : power;
    var src = posterFor(rank);
    var thumb = src
      ? '<div class="tourney-slot__thumb"><img src="' + esc(src) + '" alt="" loading="lazy" onerror="this.parentNode.textContent=\'' + POSTER_FALLBACK + '\'"></div>'
      : '<div class="tourney-slot__thumb">' + POSTER_FALLBACK + '</div>';
    slot.innerHTML =
      thumb +
      '<div class="tourney-slot__body">' +
        '<div class="tourney-slot__name">' + esc(anime.title) + '</div>' +
        '<div class="tourney-slot__seed">#' + esc(String(rank)) + '</div>' +
      '</div>' +
      '<div class="tourney-slot__power">' + powerFormatted + '</div>';
    return slot;
  }

  /* ============================================================
     SIMULATE ENGINE (auto-play whole bracket)
     ============================================================ */

  function setStatus(scope, txt) {
    var el = scope.querySelector("#tourneyStatus");
    if (el) el.textContent = txt;
  }

  function onSimulate() {
    if (TourState.isSimulating) return;
    var scope = document.querySelector(".tourney-arena");
    if (!scope) return;
    // Already finished? restart fresh.
    if (TourState.champion) {
      TourState.rounds = buildBracket(TourState.roster, TourState.size);
      TourState.champion = null;
      TourState.thirdPlace = null;
      TourState.matchProgress = { current: 0, total: TourState.size };
      var champBox = scope.querySelector("#tourneyChampion");
      if (champBox) { champBox.classList.remove("tourney-champion--show"); champBox.innerHTML = ""; }
      var statsBox = scope.querySelector("#tourneyStats");
      if (statsBox) statsBox.remove();
      // Remove third place element
      var tpEl = scope.querySelector("#tourneyThirdPlace");
      if (tpEl) tpEl.remove();
      renderTree(scope);
    }
    runSimulation(scope);
  }

  function runSimulation(scope) {
    TourState.isSimulating = true;
    var simBtn = scope.querySelector("#tourneySim");
    var newBtn = scope.querySelector("#tourneyNew");
    if (simBtn) simBtn.disabled = true;
    if (newBtn) newBtn.disabled = true;
    setStatus(scope, "Simulating…");

    // Show match progress
    var progEl = scope.querySelector("#tourneyProgress");
    var progDiv = scope.querySelector("#tourneyProgDiv");
    if (progEl) progEl.style.display = "inline";
    if (progDiv) progDiv.style.display = "inline";

    var rounds = TourState.rounds;
    var i = 0;

    function nextRound() {
      if (i >= rounds.length) {
        // All rounds done — play third-place if needed
        if (TourState.thirdPlace && TourState.thirdPlace.p1 && TourState.thirdPlace.p2) {
          playThirdPlace(scope).then(function () { finish(scope); });
        } else {
          finish(scope);
        }
        return;
      }
      var rIdx = i;
      var round = rounds[rIdx];
      showBanner(roundName(round.length)).then(function () {
        return runRound(scope, rIdx);
      }).then(function () {
        // After semi-final round (rounds.length-2), fill third place slots
        if (rIdx === rounds.length - 2 && rounds.length >= 2) {
          fillThirdPlace(rounds, rIdx);
        }
        i++;
        nextRound();
      });
    }

    nextRound();
  }

  function fillThirdPlace(rounds, semiRoundIdx) {
    var semiRound = rounds[semiRoundIdx];
    if (!semiRound || semiRound.length < 2) return;
    var losers = [];
    semiRound.forEach(function (m) {
      if (m.loser) losers.push(m.loser);
    });
    if (losers.length < 2) return;
    TourState.thirdPlace = {
      p1: losers[0],
      p2: losers[1],
      winner: null, loser: null, isDraw: false
    };
  }

  function playThirdPlace(scope) {
    var tp = TourState.thirdPlace;
    if (!tp || !tp.p1 || !tp.p2) return Promise.resolve();
    // Update UI placeholder
    var tpEl = scope.querySelector("#tourneyThirdPlace");
    if (tpEl) {
      var matchEl = renderMatch(tp, -1, 0, 0);
      matchEl.classList.remove("tourney-match--enter");
      tpEl.innerHTML = '<div class="tourney-round__label">🥉 3rd Place</div>';
      tpEl.appendChild(matchEl);
      tpEl.classList.remove("tourney-third-place--pending");
    }
    var matchEl2 = tpEl ? tpEl.querySelector(".tourney-match") : null;
    if (matchEl2) matchEl2.classList.add("tourney-match--live");
    var clash = document.createElement("div");
    clash.className = "tourney-clash";
    if (matchEl2) matchEl2.appendChild(clash);
    return delay(t(260)).then(function () {
      if (clash) clash.classList.add("tourney-clash--flash");
      var res = resolveMatch(tp.p1, tp.p2);
      tp.winner = res.winner;
      tp.loser = res.loser;
      tp.isDraw = res.isDraw;
      tp.isUpset = res.isUpset;
      // Track stats
      trackMatchStats(res, tp.p1, tp.p2);
      TourState.matchProgress.current++;
      updateMatchProgress(scope);
      return delay(t(320));
    }).then(function () {
      if (matchEl2) {
        matchEl2.innerHTML = "";
        matchEl2.appendChild(slotEl(tp.p1, tp.winner, tp.loser));
        matchEl2.appendChild(slotEl(tp.p2, tp.winner, tp.loser));
        if (tp.isDraw) {
          var winSlot = matchEl2.querySelector(".tourney-slot--winner");
          if (winSlot) winSlot.classList.add("tourney-slot--draw");
        }
        matchEl2.classList.remove("tourney-match--live");
        matchEl2.classList.add("tourney-match--done");
        if (tp.isUpset) matchEl2.classList.add("tourney-match--upset");
      }
      return delay(t(200));
    });
  }

  function trackMatchStats(res, a1, a2) {
    if (!TourState.stats) TourState.stats = { biggestUpset: null, highestScore: -1, highestScoreMatch: null };
    if (res.isUpset) {
      var diff = Math.abs(res.s1 - res.s2);
      if (!TourState.stats.biggestUpset || diff < TourState.stats.biggestUpset.diff) {
        TourState.stats.biggestUpset = { winner: res.winner, loser: res.loser, diff: diff };
      }
    }
    var score = Math.max(res.s1, res.s2);
    if (score > TourState.stats.highestScore) {
      TourState.stats.highestScore = score;
      TourState.stats.highestScoreMatch = { a1: a1, a2: a2, s1: res.s1, s2: res.s2 };
    }
  }

  function updateMatchProgress(scope) {
    var progEl = scope.querySelector("#tourneyProgress");
    if (progEl) {
      progEl.textContent = 'Match ' + TourState.matchProgress.current + '/' + TourState.matchProgress.total;
    }
    setStatus(scope, 'Match ' + TourState.matchProgress.current + '/' + TourState.matchProgress.total);
  }

  function runRound(scope, rIdx) {
    var round = TourState.rounds[rIdx];
    var chain = Promise.resolve();
    round.forEach(function (match, mIdx) {
      chain = chain.then(function () { return playMatch(scope, rIdx, mIdx); });
    });
    return chain;
  }

  function playMatch(scope, rIdx, mIdx) {
    var match = TourState.rounds[rIdx][mIdx];
    if (!match.p1 || !match.p2) {
      return Promise.resolve();
    }
    var matchEl = scope.querySelector(
      '.tourney-match[data-round="' + rIdx + '"][data-match="' + mIdx + '"]');
    if (!matchEl) return Promise.resolve();

    // mark live
    matchEl.classList.add("tourney-match--live");
    var clash = document.createElement("div");
    clash.className = "tourney-clash";
    matchEl.appendChild(clash);

    return delay(t(260)).then(function () {
      clash.classList.add("tourney-clash--flash");
      var res = resolveMatch(match.p1, match.p2);
      match.winner = res.winner;
      match.loser = res.loser;
      match.isDraw = res.isDraw;
      match.isUpset = res.isUpset;
      // Track stats
      trackMatchStats(res, match.p1, match.p2);
      TourState.matchProgress.current++;
      updateMatchProgress(scope);
      return delay(t(320));
    }).then(function () {
      matchEl.innerHTML = "";
      matchEl.appendChild(slotEl(match.p1, match.winner, match.loser));
      matchEl.appendChild(slotEl(match.p2, match.winner, match.loser));
      if (match.isDraw) {
        var winSlot = matchEl.querySelector(".tourney-slot--winner");
        if (winSlot) winSlot.classList.add("tourney-slot--draw");
      }
      matchEl.classList.remove("tourney-match--live");
      matchEl.classList.add("tourney-match--done");
      if (match.isUpset) matchEl.classList.add("tourney-match--upset");
      advanceWinner(rIdx, mIdx, match.winner);
      return delay(t(260));
    });
  }

  // Place the winner into the correct slot of the next round.
  function advanceWinner(rIdx, mIdx, winner) {
    var next = TourState.rounds[rIdx + 1];
    if (!next) return; // final — champion handled in finish()
    var nextMIdx = Math.floor(mIdx / 2);
    var slot = (mIdx % 2 === 0) ? "p1" : "p2";
    next[nextMIdx][slot] = winner;
    // live-render the affected next-round match slot
    var scope = document.querySelector(".tourney-arena");
    if (!scope) return;
    var nextEl = scope.querySelector(
      '.tourney-match[data-round="' + (rIdx + 1) + '"][data-match="' + nextMIdx + '"]');
    if (!nextEl) return;
    var nextMatch = next[nextMIdx];
    nextEl.innerHTML = "";
    nextEl.appendChild(slotEl(nextMatch.p1, null, null));
    nextEl.appendChild(slotEl(nextMatch.p2, null, null));
  }

  function showBanner(text) {
    if (TourState.speed === "instant") return Promise.resolve();
    var el = document.createElement("div");
    el.className = "tourney-round-banner";
    el.textContent = text;
    document.body.appendChild(el);
    requestAnimationFrame(function () { el.classList.add("tourney-round-banner--show"); });
    return delay(1050).then(function () { el.remove(); });
  }

  function finish(scope) {
    var last = TourState.rounds[TourState.rounds.length - 1][0];
    TourState.champion = last.winner;
    TourState.isSimulating = false;
    var simBtn = scope.querySelector("#tourneySim");
    var newBtn = scope.querySelector("#tourneyNew");
    if (simBtn) { simBtn.disabled = false; simBtn.textContent = '🔁 Re-run'; }
    if (newBtn) newBtn.disabled = false;
    setStatus(scope, "Champion crowned!");
    // Hide progress once done
    var progEl = scope.querySelector("#tourneyProgress");
    var progDiv = scope.querySelector("#tourneyProgDiv");
    if (progEl) progEl.style.display = "none";
    if (progDiv) progDiv.style.display = "none";
    if (TourState.champion) {
      saveChampion(TourState.champion, TourState.genre, TourState.size);
      renderChampion(scope, TourState.champion);
      renderStats(scope);
      if (TourState.speed !== "instant") confettiBurst();
      toast("Champion Crowned!", (TourState.champion.title || "Unknown") + " wins the " +
            TourState.genre + " tournament!", "success");
    }
  }

  function championPathString(champ) {
    // List the opponents the champion defeated.
    var beaten = [];
    TourState.rounds.forEach(function (round) {
      round.forEach(function (m) {
        if (m.winner && champ && (m.winner.rank || m.winner.id) === (champ.rank || champ.id) && m.loser) {
          beaten.push(m.loser.title);
        }
      });
    });
    if (!beaten.length) return "";
    return beaten.join(" → ");
  }

  function renderChampion(scope, champ) {
    var box = scope.querySelector("#tourneyChampion");
    if (!box) return;
    var rank = champ.rank || champ.id || champ.number || "";
    var power = (window.DuelCalc && window.DuelCalc.calcPower)
              ? window.DuelCalc.calcPower(champ) : "—";
    var src = posterFor(rank);
    var thumb = src
      ? '<div class="tourney-champion__thumb"><img src="' + esc(src) + '" alt="" onerror="this.parentNode.textContent=\'' + POSTER_FALLBACK + '\'"></div>'
      : '<div class="tourney-champion__thumb">' + POSTER_FALLBACK + '</div>';
    var path = championPathString(champ);
    box.innerHTML =
      '<div class="tourney-champion__banner">🏆 CHAMPION 🏆</div>' +
      '<div class="tourney-champion__sub">' + esc(TourState.genre) + ' Tournament · ' + TourState.size + '-bracket</div>' +
      '<div class="tourney-champion__card">' + thumb +
        '<div class="tourney-champion__name">' + esc(champ.title) + '</div>' +
        '<div class="tourney-champion__power">POWER <b>' + power + '</b></div>' +
      '</div>' +
      (path ? '<div class="tourney-champion__path">Defeated: <b>' + esc(path) + '</b></div>' : "") +
      '<div class="tourney-champion__actions">' +
        '<button class="tourney-btn tourney-btn--simulate" id="tourneyRerun">🔁 New Draw</button>' +
        '<button class="tourney-btn tourney-btn--cyan" id="tourneyChampNew">🔄 Change Genre</button>' +
      '</div>';
    box.classList.add("tourney-champion--show");
    var rerun = box.querySelector("#tourneyRerun");
    if (rerun) rerun.addEventListener("click", onSimulate);
    var newG = box.querySelector("#tourneyChampNew");
    if (newG) newG.addEventListener("click", renderSetup);
    box.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function renderStats(scope) {
    var stats = TourState.stats;
    if (!stats) return;
    // Insert stats box after champion
    var champBox = scope.querySelector("#tourneyChampion");
    if (!champBox) return;
    var existing = scope.querySelector("#tourneyStats");
    if (existing) existing.remove();

    var parts = [];
    if (stats.biggestUpset) {
      parts.push(
        '<div class="tourney-stat">' +
          '<span class="tourney-stat__icon">⚡</span>' +
          '<div class="tourney-stat__body">' +
            '<div class="tourney-stat__label">Biggest Upset</div>' +
            '<div class="tourney-stat__value"><b>' + esc(stats.biggestUpset.winner.title) + '</b> def. <b>' + esc(stats.biggestUpset.loser.title) + '</b></div>' +
          '</div>' +
        '</div>'
      );
    }
    if (stats.highestScoreMatch && stats.highestScore > 0) {
      parts.push(
        '<div class="tourney-stat">' +
          '<span class="tourney-stat__icon">🔥</span>' +
          '<div class="tourney-stat__body">' +
            '<div class="tourney-stat__label">Highest Scoring Match (' + stats.highestScore.toFixed(1) + ')</div>' +
            '<div class="tourney-stat__value">' +
              '<b>' + esc(stats.highestScoreMatch.a1.title) + '</b> vs <b>' + esc(stats.highestScoreMatch.a2.title) + '</b>' +
              ' <span class="tourney-stat__score">' + stats.highestScoreMatch.s1.toFixed(1) + ' - ' + stats.highestScoreMatch.s2.toFixed(1) + '</span>' +
            '</div>' +
          '</div>' +
        '</div>'
      );
    }
    if (parts.length === 0) return;

    var el = document.createElement("div");
    el.className = "tourney-stats";
    el.id = "tourneyStats";
    el.innerHTML = '<div class="tourney-stats__title">📊 Tournament Recap</div>' +
      '<div class="tourney-stats__grid">' + parts.join("") + '</div>';
    // Insert after champion box
    champBox.parentNode.insertBefore(el, champBox.nextSibling);
  }

  /* ============================================================
     CONFETTI
     ============================================================ */
  function confettiBurst() {
    var colors = ["#FFD700", "#00f0ff", "#ff00aa", "#00ff88", "#aa00ff", "#ffffff"];
    var n = 70;
    for (var i = 0; i < n; i++) {
      (function (k) {
        setTimeout(function () {
          var c = document.createElement("div");
          c.className = "tourney-confetti";
          c.style.left = (Math.random() * 100) + "vw";
          c.style.background = colors[Math.floor(Math.random() * colors.length)];
          c.style.animationDuration = (2 + Math.random() * 2.2) + "s";
          c.style.transform = "rotate(" + (Math.random() * 360) + "deg)";
          if (Math.random() > 0.5) c.style.borderRadius = "50%";
          document.body.appendChild(c);
          setTimeout(function () { c.remove(); }, 4500);
        }, k * 28);
      })(i);
    }
  }

  /* ============================================================
     OVERLAY SHELL
     ============================================================ */
  function makeShell() {
    var ov = document.createElement("div");
    ov.className = "tourney-overlay";
    ov.setAttribute("role", "dialog");
    ov.setAttribute("aria-modal", "true");
    ov.innerHTML =
      '<div class="tourney-bg-effect" aria-hidden="true"></div>' +
      '<div class="tourney-arena">' +
        '<button class="tourney-close-btn" id="tourneyCloseBtn" aria-label="Close">✕</button>' +
        '<div class="tourney-header">' +
          '<div class="tourney-header__title">' +
            '<span class="tourney-header__icon">🏆</span>' +
            '<h2>CROWN CONQUEST</h2>' +
            '<span class="tourney-header__icon">🏆</span>' +
          '</div>' +
          '<div class="tourney-header__sub">Draft your roster · conquer the bracket · claim the crown</div>' +
        '</div>' +
      '</div>';
    ov.querySelector("#tourneyCloseBtn").addEventListener("click", removeOverlay);
    // backdrop click
    ov.addEventListener("click", function (e) { if (e.target === ov) removeOverlay(); });
    // escape
    function onEsc(e) {
      if (e.key === "Escape") {
        removeOverlay();
        document.removeEventListener("keydown", onEsc);
      }
    }
    document.addEventListener("keydown", onEsc);
    return ov;
  }

  function showOverlay(ov) {
    document.body.appendChild(ov);
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { ov.classList.add("tourney-overlay--visible"); });
    });
  }

  function removeOverlay() {
    TourState.isSimulating = false;
    var ov = document.querySelector(".tourney-overlay");
    if (!ov) return;
    ov.classList.add("tourney-overlay--hiding");
    var node = ov;
    setTimeout(function () { node.remove(); }, 360);
    history.replaceState(null, '', '.');
  }

  /* ============================================================
     PUBLIC API
     ============================================================ */
  window.addEventListener('popstate', function () {
    if (document.querySelector(".tourney-overlay") && !location.pathname.endsWith('/tournament')) {
      removeOverlay();
    }
  });

  window.openTournament = openTournament;
  window.TournamentState = TourState;

})(window, document);
