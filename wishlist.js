/* ══════════════════════════════════════════════════════════════════════
   💖 WISH LIST  +  📢 FIRST-WATCH NOTICE
   ----------------------------------------------------------------------
   • A heart sits on every card (where the share button used to be). Only a
     signed-in account can save, and the rows are tied to that account's
     Supabase user id — the same identity behind an email or phone login.
   • The panel has two lists: MY LIST (private) and FARDIN'S LIST (public,
     owner_kind = 'admin'). Each list has four sections in the order the
     owner asked for: AVAILABLE → ONGOING → PENDING → RE-WATCH.
   • Everything is written to the `wishlist` table when it exists. A local
     copy is kept first so the UI never waits on the network and still works
     before the SQL is run.
   • The first outbound watch click shows a one-time "use Brave / uBlock
     Origin" notice, with "do not show it again" and "I understood it".
   ══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ── config ─────────────────────────────────────────────────────── */
  var SUPABASE_URL = 'https://ldzlefdklcgvqcbqibtt.supabase.co';
  var SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxkemxlZmRrbGNndnFjYnFpYnR0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEwMzk1OTAsImV4cCI6MjA5NjYxNTU5MH0.X3TGuLIpjrnPXMgCv4ZKIIjB6pItPgkdebf4JPdhuYs';

  /* The GitHub login(s) whose list is public. Change this if the handle
     ever changes — the SQL policy below uses the same value. */
  var ADMIN_HANDLES = ['fardinsenpai'];
  /* Optional extra admin identities (emails). Empty by default. */
  var ADMIN_EMAILS = [];

  var STATUSES = [
    { id: 'available', label: 'AVAILABLE', icon: '✅' },
    { id: 'ongoing',   label: 'ONGOING',   icon: '▶️' },
    { id: 'pending',   label: 'PENDING',   icon: '⏳' },
    { id: 'rewatch',   label: 'RE-WATCH',  icon: '🔁' }
  ];

  var CACHE_KEY   = 'wl_cache_v1';
  var NOTICE_KEY  = 'wl_watch_notice_v1';   // '1' = never show again
  var NOTICE_SEEN = 'wl_watch_notice_seen_v1';

  var HEART_SVG =
    '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" ' +
    'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21.2l7.8-7.8 1-1a5.5 5.5 0 0 0 0-7.8z"/></svg>';

  var WL = {
    me: null,       // { id, name, avatar, handle, email, isAdmin }
    rows: [],       // visible rows (mine + admin)
    view: 'me',
    loading: null,
    loadedAt: 0     // first successful cloud sync (deferred boot)
  };
  var chooserEl = null;
  var toastEl = null;
  var toastTimer = null;

  /* ── tiny helpers ───────────────────────────────────────────────── */
  function $(id) { return document.getElementById(id); }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function signedIn() {
    return !!(window.AUTH_USER && window.AUTH_USER.id);
  }

  function statusMeta(id) {
    for (var i = 0; i < STATUSES.length; i++) if (STATUSES[i].id === id) return STATUSES[i];
    return STATUSES[0];
  }
  function statusLabel(id) { return statusMeta(id).label; }
  function statusIcon(id) { return statusMeta(id).icon; }

  function toast(msg) {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.className = 'wl-toast';
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    requestAnimationFrame(function () { toastEl.classList.add('show'); });
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('show'); }, 2800);
  }

  /* ── auth session ───────────────────────────────────────────────── */
  function readSession() {
    return new Promise(function (resolve) {
      try {
        var c = (typeof window.authClient === 'function') ? window.authClient() : null;
        if (!c) return resolve(null);
        c.auth.getSession().then(function (r) {
          resolve(r && r.data ? r.data.session : null);
        }).catch(function () { resolve(null); });
      } catch (e) { resolve(null); }
    });
  }

  function sessionToken() {
    return readSession().then(function (s) {
      return (s && s.access_token) || '';
    });
  }

  function setMe(session) {
    var u = session && session.user;
    if (!u) {
      /* Fall back to the site's own cached identity so a slow session read
         does not make a signed-in visitor look signed out. */
      if (window.AUTH_USER && window.AUTH_USER.id) {
        WL.me = {
          id: window.AUTH_USER.id,
          name: window.AUTH_USER.name || '',
          avatar: window.AUTH_USER.avatar || '',
          handle: '',
          email: String(window.AUTH_USER.email || '').toLowerCase(),
          isAdmin: false
        };
      } else {
        WL.me = null;
      }
      return;
    }
    var m = u.user_metadata || {};
    var handle = String(m.user_name || m.preferred_username || '').toLowerCase();
    var email = String(u.email || '').toLowerCase();
    WL.me = {
      id: u.id,
      name: String(m.full_name || m.name || m.user_name || window.AUTH_USER && window.AUTH_USER.name || '').toUpperCase(),
      avatar: m.avatar_url || m.picture || '',
      handle: handle,
      email: email,
      isAdmin: ADMIN_HANDLES.indexOf(handle) > -1 || ADMIN_EMAILS.indexOf(email) > -1
    };
  }

  /* ── Supabase REST ──────────────────────────────────────────────── */
  function api(path, opts) {
    opts = opts || {};
    return sessionToken().then(function (token) {
      var headers = Object.assign({
        apikey: SUPABASE_KEY,
        Authorization: 'Bearer ' + (token || SUPABASE_KEY),
        'Content-Type': 'application/json',
        Prefer: 'return=representation'
      }, opts.headers || {});
      return fetch(SUPABASE_URL + '/rest/v1/' + path, Object.assign({}, opts, { headers: headers }));
    });
  }

  function fetchVisible() {
    var q = 'wishlist?select=*&order=created_at.desc';
    if (WL.me) q += '&or=(user_id.eq.' + WL.me.id + ',owner_kind.eq.admin)';
    else q += '&owner_kind=eq.admin';
    return api(q).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
  }

  /* ── local cache ────────────────────────────────────────────────── */
  function persist() {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(WL.rows)); } catch (e) {}
  }
  function restore() {
    try {
      var a = JSON.parse(localStorage.getItem(CACHE_KEY) || '[]');
      if (Array.isArray(a)) WL.rows = a;
    } catch (e) {}
  }

  /* ── row lookups ────────────────────────────────────────────────── */
  function myRow(num) {
    if (!WL.me) return null;
    for (var i = 0; i < WL.rows.length; i++) {
      var r = WL.rows[i];
      if (r.user_id === WL.me.id && String(r.anime_num) === String(num)) return r;
    }
    return null;
  }
  function rowsFor(view) {
    if (view === 'admin') {
      return WL.rows.filter(function (r) { return r.owner_kind === 'admin'; });
    }
    if (!WL.me) return [];
    return WL.rows.filter(function (r) { return r.user_id === WL.me.id; });
  }

  /* ── load / sync ────────────────────────────────────────────────── */
  function loadAll() {
    if (WL.loading) return WL.loading;
    WL.loading = readSession().then(function (session) {
      setMe(session);
      if (WL.me) {
        WL.rows = WL.rows.filter(function (r) {
          return r.owner_kind === 'admin' || r.user_id === WL.me.id;
        });
      } else {
        WL.rows = WL.rows.filter(function (r) { return r.owner_kind === 'admin'; });
      }
      renderNow();                                   // paint the cache instantly
      return fetchVisible().then(function (rows) {
        if (Array.isArray(rows)) { WL.rows = rows; persist(); }
        WL.loadedAt = Date.now();
        setSync('ok');
      }).catch(function () {
        setSync('warn');
      });
    }).catch(function () {}).then(function () {
      WL.loading = null;
      renderNow();
    });
    return WL.loading;
  }

  function renderNow() {
    paintPanel();
    paintHearts();
  }

  /* ── save / remove ──────────────────────────────────────────────── */
  function saveRow(info, status) {
    if (!WL.me) return;
    var row = {
      user_id: WL.me.id,
      owner_kind: WL.me.isAdmin ? 'admin' : 'user',
      owner_name: WL.me.name || '',
      owner_avatar: WL.me.avatar || '',
      anime_num: String(info.num),
      title: String(info.title || ''),
      poster: String(info.poster || ''),
      status: status
    };

    /* optimistic local write */
    var replaced = false;
    for (var i = 0; i < WL.rows.length; i++) {
      if (WL.rows[i].user_id === row.user_id && String(WL.rows[i].anime_num) === row.anime_num) {
        WL.rows[i] = Object.assign({}, WL.rows[i], row);
        replaced = true;
        break;
      }
    }
    if (!replaced) {
      row.created_at = new Date().toISOString();
      WL.rows.unshift(row);
    }
    persist();
    paintHearts();

    api('wishlist?on_conflict=user_id,anime_num', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify(row)
    }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      toast('💖 Saved to ' + statusLabel(status));
      return loadAll();
    }).catch(function () {
      toast('⚠️ Saved on this device — cloud sync needs the wishlist table');
    });
  }

  function removeRow(num) {
    if (!WL.me) return;
    WL.rows = WL.rows.filter(function (r) {
      return !(r.user_id === WL.me.id && String(r.anime_num) === String(num));
    });
    persist();
    paintHearts();

    api('wishlist?user_id=eq.' + WL.me.id + '&anime_num=eq.' + encodeURIComponent(num), {
      method: 'DELETE'
    }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      renderNow();
      return loadAll();
    }).catch(function () {
      toast('⚠️ Removed here — cloud sync needs the wishlist table');
    });
  }

  /* ── card data + hearts ─────────────────────────────────────────── */
  function cardInfo(card) {
    var numEl = card.querySelector('.number');
    var num = numEl ? numEl.textContent.replace(/\D/g, '') : '';
    var titleEl = card.querySelector('.title') || card.querySelector('.back-title');
    var img = card.querySelector('.poster-wrap img');
    return {
      num: num,
      title: titleEl ? titleEl.textContent.trim() : '',
      poster: img ? (img.getAttribute('src') || '') : ''
    };
  }

  function paintHearts() {
    Array.prototype.forEach.call(document.querySelectorAll('#grid .card'), function (card) {
      var heart = card.querySelector('.wl-heart');
      if (!heart) return;
      var info = cardInfo(card);
      var row = myRow(info.num);
      if (row) {
        heart.classList.add('on');
        heart.title = 'In your wish list — ' + statusLabel(row.status);
        heart.setAttribute('aria-pressed', 'true');
      } else {
        heart.classList.remove('on');
        heart.title = 'Add ' + info.title + ' to your wish list';
        heart.setAttribute('aria-pressed', 'false');
      }
    });
  }

  /* vii) Hearts are created only when a card gets near the viewport. Building
     291 buttons at boot was measurable on weak phones; this makes it ~8. */
  var heartIO = null;

  function addHeart(card) {
    if (card.querySelector('.wl-heart')) return;
    var wrap = card.querySelector('.poster-wrap');
    if (!wrap) return;
    var info = cardInfo(card);
    if (!info.num) return;

    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'wl-heart';
    b.setAttribute('aria-label', 'Save ' + info.title + ' to your wish list');
    b.innerHTML = HEART_SVG;
    b.addEventListener('click', function (e) {
      e.stopPropagation();
      e.preventDefault();
      openChooser(card, info, b);
    });
    wrap.appendChild(b);

    var row = myRow(info.num);
    if (row) {
      b.classList.add('on');
      b.title = 'In your wish list — ' + statusLabel(row.status);
      b.setAttribute('aria-pressed', 'true');
    }
  }

  function injectHearts() {
    var cards = Array.prototype.slice.call(document.querySelectorAll('#grid .card'));

    if (!('IntersectionObserver' in window)) {
      cards.forEach(addHeart);
      paintHearts();
      return;
    }

    if (!heartIO) {
      heartIO = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (!en.isIntersecting) return;
          heartIO.unobserve(en.target);
          addHeart(en.target);
        });
      }, { rootMargin: '320px 0px' });
    }

    cards.forEach(function (card) {
      if (card.querySelector('.wl-heart')) return;
      heartIO.observe(card);
    });

    // a handful of hearts exist even before the observer reports
    cards.slice(0, 12).forEach(addHeart);
  }

  /* ── status chooser popover ─────────────────────────────────────── */
  function closeChooser() {
    if (chooserEl && chooserEl.parentNode) chooserEl.parentNode.removeChild(chooserEl);
    chooserEl = null;
    document.removeEventListener('click', onDocClick);
  }
  function onDocClick(e) {
    if (chooserEl && !chooserEl.contains(e.target)) closeChooser();
  }

  function openChooser(card, info, anchor) {
    closeChooser();

    if (!signedIn() && !WL.me) {
      toast('Sign in to save anime to your wish list 💖');
      setTimeout(function () {
        if (typeof window.openLoginPage === 'function') window.openLoginPage();
      }, 450);
      return;
    }
    /* a session exists but the identity has not finished loading yet */
    if (!WL.me) {
      loadAll().then(function () { openChooser(card, info, anchor); });
      return;
    }

    var saved = myRow(info.num);
    var pop = document.createElement('div');
    pop.className = 'wl-chooser';
    pop.innerHTML =
      '<div class="wl-chooser-head">' + esc(info.title) + '</div>' +
      STATUSES.map(function (s) {
        return '<button type="button" class="wl-choice' + (saved && saved.status === s.id ? ' on' : '') + '" data-st="' + s.id + '">' +
          '<span class="wl-choice-ic">' + s.icon + '</span><span>' + s.label + '</span></button>';
      }).join('') +
      (saved ? '<button type="button" class="wl-choice wl-choice-del" data-del="1">🗑 Remove from wish list</button>' : '');

    document.body.appendChild(pop);
    chooserEl = pop;

    /* place it under the heart, nudged back onto the screen */
    var r = anchor.getBoundingClientRect();
    var w = 210;
    var left = Math.min(window.innerWidth - w - 8, Math.max(8, r.right - w));
    var top = r.bottom + 8;
    if (top + pop.offsetHeight > window.innerHeight - 8) {
      top = Math.max(8, r.top - pop.offsetHeight - 8);
    }
    pop.style.left = left + 'px';
    pop.style.top = top + 'px';

    pop.addEventListener('click', function (e) {
      var b = e.target.closest('.wl-choice');
      if (!b) return;
      e.stopPropagation();
      e.preventDefault();
      if (b.dataset.del) {
        removeRow(info.num);
        closeChooser();
        return;
      }
      saveRow(info, b.dataset.st);
      closeChooser();
    });

    /* attach after this click finishes so it cannot close itself */
    setTimeout(function () { document.addEventListener('click', onDocClick); }, 0);
  }

  /* ── panel ──────────────────────────────────────────────────────── */
  function syncTabs() {
    Array.prototype.forEach.call(document.querySelectorAll('.wl-tab'), function (b) {
      b.classList.toggle('on', b.dataset.wlView === WL.view);
    });
  }

  /* ── window chrome (sync pill, counts, user chip, maximize, drag) ── */
  function setSync(state) {
    var el = $('wlSync');
    if (!el) return;
    el.classList.remove('ok', 'warn');
    if (state === 'ok') {
      el.classList.add('ok');
      el.textContent = 'SYNCED';
    } else if (state === 'warn') {
      el.classList.add('warn');
      el.textContent = 'LOCAL ONLY';
    } else {
      el.textContent = 'LOCAL';
    }
  }

  function paintCounts() {
    var me = rowsFor('me').length;
    var admin = rowsFor('admin').length;
    var a = document.querySelector('[data-wl-count="me"]');
    var b = document.querySelector('[data-wl-count="admin"]');
    if (a) a.textContent = me;
    if (b) b.textContent = admin;
  }

  function paintUser() {
    var el = $('wlUser');
    if (!el) return;
    var name = WL.me
      ? (WL.me.name || WL.me.email || 'SIGNED IN')
      : 'GUEST';
    el.classList.toggle('on', !!WL.me);
    el.innerHTML = '<span class="wl-user-dot"></span><span>' + esc(name) + '</span>';
  }

  function paintChrome() {
    paintCounts();
    paintUser();
  }

  var dragState = null;

  function panelEl() {
    return document.querySelector('.wl-panel');
  }

  function resetDrag() {
    var panel = panelEl();
    if (!panel) return;
    panel.style.transform = '';
    panel.dataset.dx = '0';
    panel.dataset.dy = '0';
  }

  function toggleMax() {
    var panel = panelEl();
    if (!panel) return;
    panel.classList.toggle('maxed');
    resetDrag();
  }

  function wireChrome() {
    var chrome = $('wlChrome');
    var panel = panelEl();
    if (!chrome || !panel) return;

    chrome.addEventListener('pointerdown', function (e) {
      if (e.target.closest('button')) return;
      if (window.matchMedia('(max-width: 700px)').matches) return;
      if (panel.classList.contains('maxed')) return;
      dragState = {
        sx: e.clientX,
        sy: e.clientY,
        dx: parseFloat(panel.dataset.dx || '0'),
        dy: parseFloat(panel.dataset.dy || '0'),
        id: e.pointerId
      };
      panel.classList.add('dragging');
      try { chrome.setPointerCapture(e.pointerId); } catch (err) {}
      e.preventDefault();
    });

    chrome.addEventListener('pointermove', function (e) {
      if (!dragState || e.pointerId !== dragState.id) return;
      var rect = panel.getBoundingClientRect();
      var maxX = Math.max(0, (window.innerWidth - rect.width) / 2 - 8);
      var maxY = Math.max(0, (window.innerHeight - rect.height) / 2 - 8);
      var ndx = Math.max(-maxX, Math.min(maxX, dragState.dx + (e.clientX - dragState.sx)));
      var ndy = Math.max(-maxY, Math.min(maxY, dragState.dy + (e.clientY - dragState.sy)));
      panel.dataset.dx = ndx;
      panel.dataset.dy = ndy;
      panel.style.transform = 'translate(' + ndx + 'px,' + ndy + 'px)';
    });

    function endDrag(e) {
      if (!dragState) return;
      if (e && e.pointerId !== dragState.id) return;
      dragState = null;
      panel.classList.remove('dragging');
      try { chrome.releasePointerCapture(e.pointerId); } catch (err) {}
    }
    chrome.addEventListener('pointerup', endDrag);
    chrome.addEventListener('pointercancel', endDrag);
    chrome.addEventListener('dblclick', function (e) {
      if (e.target.closest('button')) return;
      toggleMax();
    });

    window.addEventListener('resize', function () {
      resetDrag();
      if (window.matchMedia('(max-width: 700px)').matches) {
        panel.classList.remove('maxed');
      }
    });
  }

  function itemHTML(row) {
    var editable = !!(WL.me && row.user_id === WL.me.id);
    var moved = STATUSES.map(function (s) {
      return '<option value="' + s.id + '"' + (s.id === row.status ? ' selected' : '') + '>' + s.label + '</option>';
    }).join('');
    return '<article class="wl-item" data-num="' + esc(row.anime_num) + '">' +
      '<div class="wl-thumb">' +
        (row.poster ? '<img src="' + esc(row.poster) + '" alt="" loading="lazy">' : '<div class="wl-thumb-ph">🎬</div>') +
        '<span class="wl-badge">' + statusIcon(row.status) + '</span>' +
      '</div>' +
      '<div class="wl-item-main">' +
        '<div class="wl-item-title" title="' + esc(row.title) + '">' + esc(row.title) + '</div>' +
        (editable
          ? '<select class="wl-move" aria-label="Move ' + esc(row.title) + '">' + moved + '</select>'
          : '<div class="wl-item-owner">' + esc(row.owner_name || 'Fardin') + '</div>') +
      '</div>' +
      (editable ? '<button class="wl-remove" type="button" aria-label="Remove ' + esc(row.title) + '">✕</button>' : '') +
    '</article>';
  }

  function paintPanel() {
    var body = $('wlBody');
    if (!body) return;

    syncTabs();
    paintChrome();

    var sub = $('wlSub');
    if (sub) {
      sub.textContent = WL.view === 'admin'
        ? "Fardin's public wish list — saved from his GitHub account. Everyone can browse it."
        : 'Only you can see this list — saved to your account.';
    }

    if (WL.view === 'me' && !WL.me) {
      body.innerHTML =
        '<div class="wl-empty">' +
          '<div class="wl-empty-ic">🔒</div>' +
          '<p>Sign in to start your own wish list.</p>' +
          '<button class="wl-btn" id="wlLoginBtn" type="button">Log in / Create account</button>' +
          '<p class="wl-empty-note">Fardin\'s list is open to everyone — switch to the second tab.</p>' +
        '</div>';
      var lb = $('wlLoginBtn');
      if (lb) lb.onclick = function () {
        closePanel();
        if (typeof window.openLoginPage === 'function') window.openLoginPage();
      };
      return;
    }

    var list = rowsFor(WL.view);
    if (!list.length) {
      body.innerHTML = WL.view === 'admin'
        ? '<div class="wl-empty"><div class="wl-empty-ic">⭐</div><p>Fardin has not added anything yet.</p></div>'
        : '<div class="wl-empty"><div class="wl-empty-ic">💖</div><p>Your list is empty.</p>' +
          '<p class="wl-empty-note">Tap the <b>heart</b> on any anime card to add it here.</p></div>';
      return;
    }

    body.innerHTML = STATUSES.map(function (s) {
      var rows = list.filter(function (r) { return r.status === s.id; });
      var head = '<h3 class="wl-sec-h">' +
        '<span class="wl-sec-ic">' + s.icon + '</span>' + s.label +
        '<span class="wl-sec-count">' + rows.length + '</span></h3>';
      var inner = rows.length
        ? '<div class="wl-grid">' + rows.map(itemHTML).join('') + '</div>'
        : '<div class="wl-sec-empty">Nothing here yet</div>';
      return '<section class="wl-sec" data-st="' + s.id + '">' + head + inner + '</section>';
    }).join('');
  }

  function openPanel() {
    var ov = $('wlOverlay');
    if (!ov) return;
    /* Always land on MY LIST. The session read is async, so on the very
       first open it used to fall through to Fardin's public list; keep the
       view on 'me' and repaint once the account is known. */
    WL.view = 'me';
    resetDrag();
    syncTabs();
    ov.hidden = false;
    document.body.classList.add('wl-open');
    paintPanel();
    loadAll().then(function () { syncTabs(); paintPanel(); });
  }

  function closePanel() {
    var ov = $('wlOverlay');
    if (ov) ov.hidden = true;
    document.body.classList.remove('wl-open');
    resetDrag();
    closeChooser();
  }

  function jumpToCard(num) {
    closePanel();
    var cards = document.querySelectorAll('#grid .card');
    for (var i = 0; i < cards.length; i++) {
      if (cardInfo(cards[i]).num === String(num)) {
        var card = cards[i];
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setTimeout(function () {
          card.classList.remove('show-servers');
          card.classList.add('flipped');
        }, 520);
        return;
      }
    }
  }

  /* ── wire the wish list UI ──────────────────────────────────────── */
  function wireWishlist() {
    var btn = $('wishlistBtn');
    if (btn) btn.addEventListener('click', function (e) {
      e.preventDefault();
      /* the sidebar must not stay open behind the panel */
      if (typeof closeMenu === 'function') closeMenu();
      if (typeof closeFloatingOverlays === 'function') { try { closeFloatingOverlays(); } catch (err) {} }
      openPanel();
    });

    var close = $('wlClose');
    if (close) close.addEventListener('click', closePanel);

    var max = $('wlMax');
    if (max) max.addEventListener('click', toggleMax);

    wireChrome();

    var ov = $('wlOverlay');
    if (ov) ov.addEventListener('click', function (e) {
      if (e.target === ov) closePanel();
    });

    var tabs = $('wlTabs');
    if (tabs) tabs.addEventListener('click', function (e) {
      var t = e.target.closest('.wl-tab');
      if (!t) return;
      WL.view = t.dataset.wlView || 'me';
      syncTabs();
      paintPanel();
    });

    var body = $('wlBody');
    if (body) {
      body.addEventListener('click', function (e) {
        var rm = e.target.closest('.wl-remove');
        if (rm) {
          e.stopPropagation();
          removeRow(rm.closest('.wl-item').dataset.num);
          return;
        }
        if (e.target.closest('.wl-move')) return;
        var item = e.target.closest('.wl-item');
        if (item) jumpToCard(item.dataset.num);
      });

      body.addEventListener('change', function (e) {
        var sel = e.target.closest('.wl-move');
        if (!sel) return;
        var num = sel.closest('.wl-item').dataset.num;
        var row = myRow(num);
        if (row) saveRow({ num: row.anime_num, title: row.title, poster: row.poster }, sel.value);
      });
    }

    var add = $('wlAddLink');
    if (add) add.addEventListener('click', function () { closePanel(); });

    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      if (chooserEl) { closeChooser(); return; }
      if (ov && !ov.hidden) closePanel();
    });

    /* keep the panel + hearts in step with sign-in / sign-out */
    document.addEventListener('fardin:auth-changed', function () {
      loadAll().then(function () {
        syncTabs();
        paintPanel();
        paintHearts();
      });
    });

    /* cards the admin panel adds later, or a home re-shuffle */
    var grid = $('grid');
    if (grid && window.MutationObserver) {
      var t = null;
      new MutationObserver(function () {
        clearTimeout(t);
        t = setTimeout(injectHearts, 120);
      }).observe(grid, { childList: true, subtree: true });
    }
  }

  /* ══════════════════════════════════════════════════════════════════
     📢 FIRST-WATCH NOTICE
     ══════════════════════════════════════════════════════════════════ */
  function isMobileDevice() {
    try {
      if (/Mobi|Android|iPhone|iPad|iPod|Opera Mini|IEMobile|Mobile/i.test(navigator.userAgent)) return true;
      return !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches && window.innerWidth < 900);
    } catch (e) { return false; }
  }

  function noticeSuppressed() {
    try { return localStorage.getItem(NOTICE_KEY) === '1'; } catch (e) { return false; }
  }

  function openNotice(url) {
    var ov = $('wnOverlay');
    if (!ov) { if (url) window.open(url, '_blank', 'noopener'); return; }

    var mob = isMobileDevice();
    var badge = $('wnBadge');
    var title = $('wnTitle');
    var text  = $('wnText');
    var link  = $('wnLink');

    if (badge) badge.textContent = mob ? '📱' : '🖥️';
    if (title) title.textContent = mob ? 'You are on a mobile' : 'You are on a PC';
    if (text) {
      text.innerHTML = mob
        ? 'Please download the <b>Brave browser</b> to watch anime. It blocks pop-up ads out of the box and is much lighter on your phone.'
        : 'Please use <b>uBlock Origin</b> to block all ads before you open these sites. It is free and keeps every streaming page clean.';
    }
    if (link) {
      link.href = mob ? 'https://brave.com/download/' : 'https://ublockorigin.com/';
      link.textContent = mob ? 'Get Brave Browser ↗' : 'Get uBlock Origin ↗';
    }

    var dont = $('wnDont');
    var understood = $('wnUnderstand');
    var ok = $('wnOk');
    if (dont) dont.checked = true;             // "first time" by default
    if (understood) understood.checked = false;
    if (ok) ok.disabled = true;

    ov.hidden = false;
    ov.dataset.url = url || '';
    try { if (ok) ok.focus(); } catch (e) {}
  }

  function wireNotice() {
    var ov = $('wnOverlay');
    if (!ov || ov.dataset.wired) return;
    ov.dataset.wired = '1';

    var understood = $('wnUnderstand');
    var ok = $('wnOk');
    var dont = $('wnDont');
    var cancel = $('wnCancel');
    var close = $('wnClose');

    if (understood && ok) {
      understood.addEventListener('change', function () { ok.disabled = !understood.checked; });
    }

    function hide() { ov.hidden = true; }

    if (ok) ok.addEventListener('click', function () {
      var url = ov.dataset.url || '';
      try {
        localStorage.setItem(NOTICE_SEEN, '1');
        localStorage.setItem(NOTICE_KEY, (dont && dont.checked) ? '1' : '0');
      } catch (e) {}
      hide();
      if (url) window.open(url, '_blank', 'noopener');
    });

    if (cancel) cancel.addEventListener('click', hide);
    if (close) close.addEventListener('click', hide);
    ov.addEventListener('click', function (e) { if (e.target === ov) hide(); });
  }

  /* Capture the click before the grid's own handler can open the site. */
  function wireWatchNotice() {
    document.addEventListener('click', function (e) {
      var site = e.target && e.target.closest ? e.target.closest('.csite') : null;
      if (!site) return;
      if (noticeSuppressed()) return;          // let the normal handler open it
      e.preventDefault();
      e.stopPropagation();
      openNotice(site.getAttribute('data-url') || '');
    }, true);
  }

  /* ── boot ───────────────────────────────────────────────────────── */
  function boot() {
    restore();
    wireWishlist();
    wireNotice();
    wireWatchNotice();
    injectHearts();
    // v) the cloud round-trip can wait — the local cache already painted
    // every heart. Opening the window still syncs instantly.
    setTimeout(function () { if (!WL.loadedAt) loadAll(); }, 20000);
  }

  /* small public surface (also handy for the admin panel and manual testing) */
  window.__wishlist = {
    state: WL,
    load: loadAll,
    open: openPanel,
    close: closePanel,
    paint: paintPanel,
    hearts: injectHearts,
    paintHearts: paintHearts,
    save: saveRow,
    remove: removeRow
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
