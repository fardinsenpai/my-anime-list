/* ══════════════════════════════════════════════════════════════════════
   ANIME SEARCH SUGGESTIONS
   Any text box can ask for anime: type and the list of the site's own cards
   comes back as live suggestions. Pick one and the box empties again so the
   visitor can keep typing (in the games the pick is submitted straight
   away, because the answer IS the title).
   ══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var index = [];          /* [{title, poster, id}] */
  var openBox = null;
  var owner = null;

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /* the list comes from the cards on the page - the same data the site shows */
  function buildIndex() {
    if (index.length) return index;
    var cards = document.querySelectorAll('#grid .card');
    Array.prototype.forEach.call(cards, function (c) {
      var t = c.querySelector('.title');
      var title = t ? String(t.textContent || '').trim() : '';
      if (!title) return;
      var img = c.querySelector('.poster-wrap img');
      var b = c.querySelector('.badge');
      index.push({
        title: title,
        lower: title.toLowerCase(),
        poster: img ? img.getAttribute('src') : '',
        id: b ? String(b.textContent || '').replace(/\D/g, '') : ''
      });
    });
    return index;
  }

  /* the admin can add extra titles that are not cards yet */
  function extraTitles(cb) {
    fetch('anime-ratings.json', { cache: 'force-cache' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        var out = [];
        try {
          Object.keys(j || {}).forEach(function (k) {
            var e = j[k];
            if (e && e.title && !out.some(function (x) { return x.title === e.title; })) out.push({ title: e.title, lower: e.title.toLowerCase(), poster: '', id: k });
          });
        } catch (e) {}
        cb(out);
      })
      .catch(function () { cb([]); });
  }

  function score(item, q) {
    var t = item.lower;
    if (t === q) return 0;
    if (t.indexOf(q) === 0) return 1;
    var word = t.split(' ').some(function (w) { return w.indexOf(q) === 0; });
    if (word) return 2;
    if (t.indexOf(q) > -1) return 3;
    /* a light fuzzy match: every letter of the query in order */
    var i = 0;
    for (var j = 0; j < t.length && i < q.length; j++) if (t[j] === q[i]) i++;
    if (i === q.length && q.length > 1) return 4;
    return 99;
  }

  function matches(q) {
    var list = buildIndex().map(function (it) { return { it: it, s: score(it, q) }; })
      .filter(function (x) { return x.s < 99; })
      .sort(function (a, b) { return a.s - b.s || a.it.title.length - b.it.title.length; })
      .slice(0, 8).map(function (x) { return x.it; });
    return list;
  }

  function close() {
    if (openBox && openBox.parentNode) openBox.parentNode.removeChild(openBox);
    openBox = null;
    owner = null;
  }

  function draw(input, list) {
    close();
    owner = input;
    var box = document.createElement('div');
    box.className = 'as-box';
    list.forEach(function (it) {
      var row = document.createElement('button');
      row.type = 'button';
      row.className = 'as-item';
      row.innerHTML =
        (it.poster ? '<img class="as-poster" src="' + esc(it.poster) + '" alt="">' : '<span class="as-poster as-poster--none">🎴</span>') +
        '<span class="as-title">' + esc(it.title) + '</span>' +
        (it.id ? '<span class="as-num">#' + esc(it.id) + '</span>' : '');
      row.onclick = function () {
        var pickTitle = it.title;
        close();
        /* the box empties after a pick - the games submit it right away */
        input.value = pickTitle;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        /* the pick has to be visible for the field that filters on input */
        if (opts && opts.clear === false) input.value = pickTitle;
        if (input.getAttribute('data-search-submit') === '1') {
          var btn = document.getElementById(input.getAttribute('data-search-submit'));
          if (btn) btn.click();
        }
        /* the box empties after a pick - unless the field wants to keep it
           (the admin search filters while you type) */
        var clearIt = (opts && opts.clear === false) ? false : true;
        if (input.getAttribute('data-search-clear') === '0') clearIt = false;
        if (clearIt) input.value = '';
        input.dispatchEvent(new Event('change', { bubbles: true }));
      };
      box.appendChild(row);
    });
    if (!list.length) {
      var none = document.createElement('div');
      none.className = 'as-empty';
      none.textContent = 'No anime matches that yet';
      box.appendChild(none);
    }
    document.body.appendChild(box);
    var r = input.getBoundingClientRect();
    box.style.left = Math.round(r.left) + 'px';
    box.style.top = Math.round(r.bottom + 6) + 'px';
    box.style.width = Math.round(Math.max(r.width, 260)) + 'px';
    openBox = box;
  }

  function attach(input, opts) {
    if (!input || input.getAttribute('data-search-on')) return;
    input.setAttribute('data-search-on', '1');
    opts = opts || {};
    function refresh() {
      var q = String(input.value || '').trim().toLowerCase();
      if (q.length < 1) { close(); return; }
      draw(input, matches(q));
    }
    input.addEventListener('input', refresh);
    input.addEventListener('focus', refresh);
    input.addEventListener('blur', function () { setTimeout(close, 180); });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { close(); input.blur(); }
    });
  }

  document.addEventListener('click', function (e) {
    if (openBox && !openBox.contains(e.target) && e.target !== owner) close();
  });

  window.addEventListener('scroll', function () { close(); }, true);

  window.AnimeSearch = {
    attach: attach,
    matches: matches,
    index: buildIndex,
    extra: extraTitles
  };

  document.addEventListener('DOMContentLoaded', function () {
    /* the main search box of the site */
    var main = document.getElementById('searchBox');
    if (main) attach(main, {});
  });
})();
