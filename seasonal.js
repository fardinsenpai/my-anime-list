(function () {
  'use strict';

  var ENDPOINT = 'https://graphql.anilist.co';
  var LS_KEY = 'airing_cache_v1';
  var TTL = 30 * 60 * 1000;
  var mounted = false;
  var loading = false;

  var QUERY = 'query { Page(page: 1, perPage: 30) { media(type: ANIME, status: RELEASING, sort: POPULARITY_DESC) { ' +
    'id title { romaji english } coverImage { large } siteUrl averageScore ' +
    'nextAiringEpisode { airingAt episode timeUntilAiring } } } }';

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function readCache() {
    try {
      var c = JSON.parse(localStorage.getItem(LS_KEY) || 'null');
      if (!c || !Array.isArray(c.rows)) return null;
      return c;
    } catch (e) { return null; }
  }

  function writeCache(rows) {
    try { localStorage.setItem(LS_KEY, JSON.stringify({ at: Date.now(), rows: rows })); } catch (e) {}
  }

  function formatWhen(ts) {
    var d = new Date(ts * 1000);
    var now = new Date();
    var sameDay = d.toDateString() === now.toDateString();
    var tomorrow = new Date(now.getTime() + 86400000);
    var isTomorrow = d.toDateString() === tomorrow.toDateString();
    var time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (sameDay) return 'Today · ' + time;
    if (isTomorrow) return 'Tomorrow · ' + time;
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' · ' + time;
  }

  function countdown(seconds) {
    var s = Math.max(0, parseInt(seconds, 10) || 0);
    var d = Math.floor(s / 86400);
    var h = Math.floor((s % 86400) / 3600);
    var m = Math.floor((s % 3600) / 60);
    if (d > 0) return 'in ' + d + 'd ' + h + 'h';
    if (h > 0) return 'in ' + h + 'h ' + m + 'm';
    return 'in ' + Math.max(1, m) + 'm';
  }

  function normalize(media) {
    return (media || [])
      .filter(function (m) { return m && m.nextAiringEpisode && m.title; })
      .map(function (m) {
        return {
          id: m.id,
          title: (m.title.english || m.title.romaji || '').trim(),
          cover: m.coverImage && m.coverImage.large ? m.coverImage.large : '',
          url: m.siteUrl || ('https://anilist.co/anime/' + m.id),
          score: m.averageScore || 0,
          at: m.nextAiringEpisode.airingAt,
          ep: m.nextAiringEpisode.episode,
          until: m.nextAiringEpisode.timeUntilAiring
        };
      })
      .sort(function (a, b) { return a.at - b.at; })
      .slice(0, 20);
  }

  function fetchAiring() {
    return fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ query: QUERY })
    }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(function (j) {
      var rows = normalize(j && j.data && j.data.Page ? j.data.Page.media : []);
      if (rows.length) writeCache(rows);
      return rows;
    });
  }

  function ensureShell() {
    if (mounted) return $('airingSection');
    var grid = $('grid');
    if (!grid || !grid.parentNode) return null;
    // sit above the genre pills, directly under the counters
    var anchor = document.querySelector('.filter-section') || $('apRail') || grid;
    var sec = document.createElement('section');
    sec.id = 'airingSection';
    sec.className = 'sn-section';
    sec.hidden = true;
    sec.innerHTML =
      '<div class="sn-head">' +
        '<span class="sn-title"><span class="sn-dot"></span>Airing Now</span>' +
        '<span class="sn-sub">next episodes · <span id="snZone"></span></span>' +
        '<a class="sn-refresh" href="javascript:void(0)" id="snRefresh" title="Refresh">⟳</a>' +
      '</div>' +
      '<div class="sn-track-wrap">' +
        '<button class="sn-nav sn-prev" id="snPrev" type="button" aria-label="Scroll left">‹</button>' +
        '<div class="sn-track" id="snTrack"></div>' +
        '<button class="sn-nav sn-next" id="snNext" type="button" aria-label="Scroll right">›</button>' +
      '</div>';
    anchor.parentNode.insertBefore(sec, anchor);
    var zone = $('snZone');
    if (zone) {
      try { zone.textContent = Intl.DateTimeFormat().resolvedOptions().timeZone || 'local time'; } catch (e) { zone.textContent = 'local time'; }
    }
    var refresh = $('snRefresh');
    if (refresh) refresh.addEventListener('click', function (e) { e.preventDefault(); render(true); });
    var prev = $('snPrev'), next = $('snNext');
    if (prev) prev.addEventListener('click', function () { var t = $('snTrack'); if (t) t.scrollTo({ left: Math.max(0, t.scrollLeft - 260), behavior: 'instant' }); });
    if (next) next.addEventListener('click', function () { var t = $('snTrack'); if (t) t.scrollTo({ left: t.scrollLeft + 260, behavior: 'instant' }); });

    /* drag-to-scroll with the cursor */
    (function enableDragScroll() {
      var track = $('snTrack');
      if (!track) return;
      var isDown = false, startX = 0, scrollLeft = 0, moved = false;
      track.addEventListener('mousedown', function (e) {
        if (e.button !== 0) return;
        isDown = true; moved = false;
        startX = e.pageX - track.offsetLeft;
        scrollLeft = track.scrollLeft;
        track.classList.add('sn-dragging');
      });
      document.addEventListener('mousemove', function (e) {
        if (!isDown) return;
        e.preventDefault();
        var x = e.pageX - track.offsetLeft;
        var walk = (x - startX);
        if (Math.abs(walk) > 4) moved = true;
        track.scrollLeft = scrollLeft - walk;
      });
      document.addEventListener('mouseup', function () { if (!isDown) return; isDown = false; track.classList.remove('sn-dragging'); setTimeout(function () { moved = false; }, 0); });
      track.addEventListener('mouseleave', function () { /* keep dragging until mouseup */ });
      // prevent link clicks after a drag
      track.addEventListener('click', function (e) {
        if (moved) { e.preventDefault(); e.stopPropagation(); moved = false; }
      }, true);
    })();
    mounted = true;
    return sec;
  }

  function renderCard(item) {
    return '<article class="sn-card" data-id="' + item.id + '">' +
      '<a class="sn-cover" href="' + esc(item.url) + '" target="_blank" rel="noopener noreferrer">' +
        (item.cover ? '<img src="' + esc(item.cover) + '" alt="" loading="lazy"/>' : '<span class="sn-ph">📺</span>') +
        '<span class="sn-ep">EP ' + item.ep + '</span>' +
      '</a>' +
      '<div class="sn-name" title="' + esc(item.title) + '">' + esc(item.title) + '</div>' +
      '<div class="sn-when">' + esc(formatWhen(item.at)) + '</div>' +
      '<div class="sn-meta"><span class="sn-cd">' + countdown(item.until) + '</span>' +
        '<button class="sn-ask" type="button" title="Ask the AI about this anime">🧠</button></div>' +
    '</article>';
  }

  function isMainPage() {
    var p = (location.pathname || '').toLowerCase();
    return p === '/' || p === '' || p.endsWith('/index.html') || p.endsWith('/my-anime-list') || p.endsWith('/my-anime-list/') || p.endsWith('/home');
  }
  function shouldShow() {
    if (!isMainPage()) return false;
    if (document.documentElement.classList.contains('subpage') || document.body.classList.contains('subpage')) return false;
    if (document.body.classList.contains('duel-mode-active')) return false;
    var box = $('searchBox');
    if (box && String(box.value || '').trim() !== '') return false;
    return true;
  }
  function paint(rows) {
    var sec = ensureShell();
    if (!sec) return;
    var track = $('snTrack');
    if (!rows.length || !shouldShow()) { sec.hidden = true; return; }
    sec.hidden = false;
    track.innerHTML = rows.map(renderCard).join('');
  }

  function render(force) {
    var cached = readCache();
    if (cached && cached.rows && cached.rows.length) paint(cached.rows);
    var fresh = cached && (Date.now() - cached.at) < TTL && !force;
    if (fresh || loading) return;
    loading = true;
    fetchAiring().then(function (rows) {
      if (rows.length) paint(rows);
    }).catch(function () {
      if (cached && cached.rows) paint(cached.rows);
    }).then(function () { loading = false; });
  }

  /* ask the AI about a card */
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('.sn-ask');
    if (!b) return;
    e.preventDefault();
    var card = b.closest('.sn-card');
    var name = card ? (card.querySelector('.sn-name') || {}).textContent : '';
    if (!name) return;
    var box = $('chatBox');
    if (box && !box.classList.contains('open') && typeof window.toggleChat === 'function') {
      try { window.toggleChat(); } catch (err) {}
    }
    setTimeout(function () {
      if (typeof window.quickAction === 'function') window.quickAction('Tell me about ' + name + ' — is it worth watching?');
    }, 280);
  });

  function recomputeVisibility() {
    var sec = $('airingSection');
    if (!sec) return;
    if (!shouldShow()) { sec.hidden = true; return; }
    if (sec.querySelector('.sn-card')) sec.hidden = false;
  }
  document.addEventListener('input', function (e) {
    if (e.target && e.target.id === 'searchBox') recomputeVisibility();
  });
  var mo = new MutationObserver(function () { recomputeVisibility(); });
  try { mo.observe(document.body, { attributes: true, attributeFilter: ['class'] }); } catch (e) {}
  function boot() {
    if (readCache()) render(false);
    // wait for the list/grid to exist, then fetch in the background
    var tries = 0;
    (function tick() {
      if (!ensureShell()) {
        if (tries++ < 40) return setTimeout(tick, 200);
        return;
      }
      render(false);
    })();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  window.AiringNow = { refresh: function () { render(true); }, recompute: recomputeVisibility };
})()
