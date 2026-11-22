(function () {
  'use strict';

  var SUPABASE_URL = 'https://ldzlefdklcgvqcbqibtt.supabase.co';
  var SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxkemxlZmRrbGNndnFjYnFpYnR0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEwMzk1OTAsImV4cCI6MjA5NjYxNTU5MH0.X3TGuLIpjrnPXMgCv4ZKIIjB6pItPgkdebf4JPdhuYs';
  var LS_KEY = 'tier_v1';
  var PALETTE = ['#ff4d7d', '#ff9f43', '#ffd93d', '#4dd4ac', '#7a8cff', '#b388ff', '#ff6b9d', '#00d4ff', '#7cffcb'];

  var state = { tiers: {}, names: {}, order: [] };
  var cards = {};
  var overlay = null;
  var picker = null;
  var saveTimer = null;
  var me = null;
  var history = [];
  var readOnly = false;

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>\"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function colorFor(tier) {
    var i = state.order.indexOf(tier);
    if (i < 0) i = 0;
    // keep the classic S/A/B/C/D colours for the first five
    var classic = { S: '#ff4d7d', A: '#ff9f43', B: '#ffd93d', C: '#4dd4ac', D: '#7a8cff' };
    if (classic[tier]) return classic[tier];
    return PALETTE[i % PALETTE.length];
  }

  /* ---- data ---- */
  function readCards() {
    cards = {};
    Array.prototype.forEach.call(document.querySelectorAll('#grid .card'), function (card) {
      var n = card.querySelector('.number');
      var t = card.querySelector('.title');
      var img = card.querySelector('.poster-wrap img');
      if (!n || !t) return;
      var id = n.textContent.replace(/\D/g, '');
      if (!id) return;
      cards[id] = { title: t.textContent.trim(), poster: img ? img.getAttribute('src') : '' };
    });
  }

  function defaultState() {
    return { tiers: { S: [], A: [], B: [], C: [], D: [] }, names: { S: 'S', A: 'A', B: 'B', C: 'C', D: 'D' }, order: ['S', 'A', 'B', 'C', 'D'] };
  }

  function normalize(raw) {
    // legacy: { S:[], A:[], ... }
    if (raw && !raw.tiers && (Array.isArray(raw.S) || Array.isArray(raw.A))) {
      var b = defaultState();
      ['S', 'A', 'B', 'C', 'D'].forEach(function (t) {
        if (Array.isArray(raw[t])) b.tiers[t] = raw[t].map(String).filter(function (id) { return cards[id]; });
      });
      return b;
    }
    var s = defaultState();
    if (raw && raw.tiers && typeof raw.tiers === 'object') {
      s.tiers = {};
      s.names = {};
      s.order = Array.isArray(raw.order) && raw.order.length ? raw.order.slice() : ['S', 'A', 'B', 'C', 'D'];
      s.order.forEach(function (t) {
        s.tiers[t] = Array.isArray(raw.tiers[t]) ? raw.tiers[t].map(String).filter(function (id) { return cards[id]; }) : [];
        s.names[t] = (raw.names && raw.names[t]) ? String(raw.names[t]).slice(0, 18) : t;
      });
    }
    // ensure every tier has a colour slot
    s.order.forEach(function (t) { if (!s.tiers[t]) s.tiers[t] = []; if (!s.names[t]) s.names[t] = t; });
    return s;
  }

  function assignedSet() {
    var s = {};
    state.order.forEach(function (t) { state.tiers[t].forEach(function (id) { s[id] = t; }); });
    return s;
  }

  /* ---- history / undo ---- */
  function snapshot() { return JSON.parse(JSON.stringify(state)); }
  function pushHistory() {
    history.push(snapshot());
    if (history.length > 30) history.shift();
  }
  function undo() {
    if (!history.length || readOnly) return;
    state = history.pop();
    save(); render();
  }

  /* ---- persistence ---- */
  function saveLocal() {
    try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch (e) {}
  }
  function readSession() {
    return new Promise(function (resolve) {
      try {
        var c = (typeof window.authClient === 'function') ? window.authClient() : null;
        if (!c) return resolve(null);
        c.auth.getSession().then(function (r) { resolve(r && r.data ? r.data.session : null); })
          .catch(function () { resolve(null); });
      } catch (e) { resolve(null); }
    });
  }
  function api(path, opts, token) {
    opts = opts || {};
    return fetch(SUPABASE_URL + '/rest/v1/' + path, Object.assign({}, opts, {
      headers: Object.assign({
        apikey: SUPABASE_KEY,
        Authorization: 'Bearer ' + (token || SUPABASE_KEY),
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal'
      }, opts.headers || {})
    }));
  }
  function save() {
    saveLocal();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      readSession().then(function (s) {
        if (!s || !s.access_token || !s.user) return;
        me = s.user.id;
        api('tier_lists?on_conflict=user_id', {
          method: 'POST',
          body: JSON.stringify({ user_id: me, data: state })
        }, s.access_token).catch(function () {});
      });
    }, 900);
  }
  function pull() {
    readSession().then(function (s) {
      if (!s || !s.access_token || !s.user) return;
      me = s.user.id;
      api('tier_lists?select=data&user_id=eq.' + encodeURIComponent(me), {}, s.access_token)
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (rows) {
          if (!rows || !rows.length || !rows[0].data) return;
          var cloud = normalize(rows[0].data);
          var localCount = state.order.reduce(function (n, t) { return n + (state.tiers[t] || []).length; }, 0);
          if (!localCount) { state = cloud; render(); }
        }).catch(function () {});
    });
  }

  /* ---- share / read-only ---- */
  function encodeState() {
    try { return btoa(unescape(encodeURIComponent(JSON.stringify(state)))); } catch (e) { return ''; }
  }
  function decodeState(str) {
    try { return normalize(JSON.parse(decodeURIComponent(escape(atob(str))))); } catch (e) { return null; }
  }
  function shareLink() {
    var code = encodeState();
    if (!code) return;
    var url = location.origin + location.pathname + '#tier=' + code;
    var done = function () { toast('Link copied - anyone can view this board'); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(done).catch(function () { fallbackCopy(url, done); });
    } else {
      fallbackCopy(url, done);
    }
  }
  function fallbackCopy(url, done) {
    try {
      var ta = document.createElement('textarea');
      ta.value = url;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      var ok = document.execCommand('copy');
      ta.remove();
      if (ok) { done(); return; }
    } catch (e) {}
    toast('Copy this link: ' + url);
  }
  function toast(msg) {
    var t = document.createElement('div');
    t.className = 'tl-toast';
    t.textContent = msg;
    document.body.appendChild(t);
    requestAnimationFrame(function () { t.classList.add('show'); });
    setTimeout(function () { t.classList.remove('show'); setTimeout(function () { t.remove(); }, 260); }, 2200);
  }

  /* ---- actions ---- */
  function assign(id, tier) {
    if (readOnly) return;
    pushHistory();
    state.order.forEach(function (t) { state.tiers[t] = (state.tiers[t] || []).filter(function (x) { return x !== id; }); });
    if (tier && state.tiers[tier]) state.tiers[tier].push(id);
    save(); render();
  }
  function autoRank() {
    if (readOnly) return;
    pushHistory();
    state.order.forEach(function (t) { state.tiers[t] = []; });
    Object.keys(cards).forEach(function (id) {
      var r = window.RATING_DATA && window.RATING_DATA[id];
      var score = r ? (parseInt(r.rating, 10) || 0) : 0;
      var tier;
      if (state.order.length === 1) tier = state.order[0];
      else if (score >= 90) tier = state.order[0];
      else if (score >= 80) tier = state.order[Math.min(1, state.order.length - 1)];
      else if (score >= 70) tier = state.order[Math.min(2, state.order.length - 1)];
      else if (score >= 60) tier = state.order[Math.min(3, state.order.length - 1)];
      else tier = state.order[state.order.length - 1];
      state.tiers[tier].push(id);
    });
    save(); render();
    toast('Auto-ranked by site ratings');
  }
  function addTier() {
    if (readOnly) return;
    pushHistory();
    var key = 't' + Date.now().toString(36);
    state.order.push(key);
    state.tiers[key] = [];
    state.names[key] = 'Tier ' + state.order.length;
    save(); render();
  }
  function removeTier(tier) {
    if (readOnly) return;
    if ((state.tiers[tier] || []).length) { toast('Move its titles out first'); return; }
    if (state.order.length <= 1) { toast('Keep at least one tier'); return; }
    pushHistory();
    state.order = state.order.filter(function (k) { return k !== tier; });
    delete state.tiers[tier]; delete state.names[tier];
    save(); render();
  }
  var renaming = false;
  function renameTier(tier) {
    if (readOnly || renaming) return;
    var tag = overlay && overlay.querySelector('.tl-tag[data-tier="' + tier + '"]');
    if (!tag) return;
    renaming = true;
    var cur = state.names[tier];
    tag.innerHTML = '';
    var inp = document.createElement('input');
    inp.type = 'text';
    inp.className = 'tl-tier-input';
    inp.value = cur;
    inp.maxLength = 18;
    tag.appendChild(inp);
    setTimeout(function () { try { inp.focus(); inp.select(); } catch (e) {} }, 0);
    function commit() {
      if (!renaming) { return; }
      renaming = false;
      var v = (inp.value || '').trim() || cur;
      state.names[tier] = v.slice(0, 18);
      pushHistory(); save(); render();
    }
    function cancel() { renaming = false; render(); }
    inp.addEventListener('blur', commit, { once: true });
    inp.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); inp.blur(); }
      if (e.key === 'Escape') { inp.value = cur; inp.blur(); }
    });
  }

  /* ---- render ---- */
  function chip(id, tier) {
    var c = cards[id] || { title: '#' + id, poster: '' };
    return '<button class="tl-chip' + (tier ? ' tl-chip--in' : '') + '" type="button" draggable="' + (!readOnly) + '" data-id="' + esc(id) + '" title="' + esc(c.title) + '">' +
      (c.poster ? '<img src="' + esc(c.poster) + '" alt="" loading="lazy"/>' : '') +
      '<span>' + esc(c.title) + '</span>' +
    '</button>';
  }
  function renderPool() {
    var pool = $('tlPool');
    if (!pool) return;
    var used = assignedSet();
    var q = String(($('tlSearch') || {}).value || '').trim().toLowerCase();
    var ids = Object.keys(cards).filter(function (id) {
      if (used[id]) return false;
      if (q && (cards[id].title || '').toLowerCase().indexOf(q) === -1) return false;
      return true;
    });
    pool.innerHTML = ids.length
      ? ids.map(function (id) { return chip(id, null); }).join('')
      : '<div class="tl-pool-empty">' + (q ? 'No unranked title matches.' : 'Everything is ranked') + '</div>';
    var cnt = $('tlPoolCount');
    if (cnt) cnt.textContent = ids.length + ' title' + (ids.length === 1 ? '' : 's');
  }
  function renderTiers() {
    var host = $('tlTiers');
    if (!host) return;
    var html = state.order.map(function (t) {
      var col = colorFor(t);
      var items = (state.tiers[t] || []).map(function (id) { return chip(id, t); }).join('');
      var canRemove = !readOnly && (state.tiers[t] || []).length === 0 && state.order.length > 1;
      return '<div class="tl-row" data-tier="' + esc(t) + '" style="--tl:' + col + '">' +
        '<div class="tl-tag" role="button" tabindex="0" data-tier="' + esc(t) + '" title="Click to rename">' + esc(state.names[t]) + (canRemove ? '<span class="tl-tag-x" data-remove="' + esc(t) + '">×</span>' : '') + '</div>' +
        '<div class="tl-drop" data-tier="' + esc(t) + '">' +
          (items || '<span class="tl-hint">drop here</span>') +
        '</div>' +
      '</div>';
    }).join('');
    if (!readOnly) html += '<button type="button" class="tl-addtier" id="tlAddTier">+ Add tier</button>';
    host.innerHTML = html;
    var add = $('tlAddTier');
    if (add) add.addEventListener('click', addTier);
  }
  function render() {
    renderPool();
    renderTiers();
    // read-only banner
    var banner = overlay && overlay.querySelector('.tl-readonly');
    if (banner) banner.hidden = !readOnly;
  }

  /* ---- actions wiring ---- */
  function assign(id, tier) {
    if (readOnly) return;
    pushHistory();
    state.order.forEach(function (t) { state.tiers[t] = (state.tiers[t] || []).filter(function (x) { return x !== id; }); });
    if (tier && state.tiers[tier]) state.tiers[tier].push(id);
    save(); render();
  }

  /* ---- export ---- */
  function loadImage(src) {
    return new Promise(function (resolve) {
      if (!src) return resolve(null);
      var img = new Image();
      img.crossOrigin = 'anonymous';
      var done = false;
      var t = setTimeout(function () { if (!done) { done = true; resolve(null); } }, 4000);
      img.onload = function () { if (done) return; done = true; clearTimeout(t); resolve(img); };
      img.onerror = function () { if (done) return; done = true; clearTimeout(t); resolve(null); };
      img.src = src;
    });
  }
  function loadImage(src) {
    return new Promise(function (resolve) {
      if (!src) return resolve(null);
      var img = new Image();
      img.crossOrigin = 'anonymous';
      var done = false;
      var t = setTimeout(function () { if (!done) { done = true; resolve(null); } }, 5000);
      img.onload = function () { if (done) return; done = true; clearTimeout(t); resolve(img); };
      img.onerror = function () { if (done) return; done = true; clearTimeout(t); resolve(null); };
      img.src = src;
    });
  }
  async function exportPng() {
    var W = 1080, rowH = 200, H = 150 + rowH * state.order.length + 90;
    var cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    var ctx = cv.getContext('2d');

    // sakura-themed background
    var bg = ctx.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, '#1a0a24'); bg.addColorStop(0.5, '#2d1140'); bg.addColorStop(1, '#0d0418');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

    // sakura petals
    var petals = [
      [120, 90, 14, 0.35], [340, 60, 10, 0.28], [720, 110, 16, 0.32], [980, 70, 12, 0.25],
      [200, 300, 13, 0.22], [560, 260, 11, 0.3], [900, 320, 15, 0.26], [150, 520, 12, 0.24],
      [480, 480, 14, 0.28], [820, 500, 11, 0.22], [1020, 460, 13, 0.3], [60, 700, 10, 0.2],
      [400, 720, 15, 0.25], [760, 700, 12, 0.28], [1000, 740, 11, 0.22], [300, 900, 14, 0.24],
      [650, 920, 12, 0.26], [950, 900, 10, 0.2]
    ];
    petals.forEach(function (p) {
      ctx.save(); ctx.translate(p[0], p[1]); ctx.rotate(Math.random() * Math.PI);
      ctx.fillStyle = 'rgba(255, 182, 210, ' + p[3] + ')';
      ctx.beginPath(); ctx.ellipse(0, 0, p[2], p[2] * 0.6, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    });

    // title in sky color
    ctx.fillStyle = '#87ceeb';
    ctx.font = '900 52px "Orbitron", "Segoe UI", sans-serif';
    ctx.textAlign = 'left';
    ctx.shadowColor = 'rgba(135, 206, 235, 0.6)'; ctx.shadowBlur = 18;
    ctx.fillText('MY ANIME TIER LIST', 48, 84);
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(207, 228, 255, .85)';
    ctx.font = '600 24px "Rajdhani", "Segoe UI", sans-serif';
    ctx.fillText("Fardin's Anime Hub", 50, 118);

    // logo top-right
    var logo = await loadImage('logo.png');
    if (logo) { ctx.drawImage(logo, W - 140, 20, 110, 110); }

    // preload all posters for this board
    var allIds = [];
    state.order.forEach(function (t) { (state.tiers[t] || []).slice(0, 6).forEach(function (id) { allIds.push(id); }); });
    var imgMap = {};
    await Promise.all(allIds.map(function (id) {
      var c = cards[id] || {};
      return loadImage(c.poster).then(function (img) { imgMap[id] = img; });
    }));

    // rows
    var y0 = 150;
    state.order.forEach(function (t, i) {
      var col = colorFor(t);
      var y = y0 + i * rowH;
      // tier tag
      ctx.fillStyle = col;
      ctx.shadowColor = col; ctx.shadowBlur = 16;
      ctx.fillRect(44, y, 112, rowH - 28);
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#0b0412';
      ctx.font = '900 40px "Orbitron", "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(String(state.names[t]).slice(0, 4), 100, y + rowH / 2 + 8);
      ctx.textAlign = 'left';

      // drop zone bg
      ctx.fillStyle = 'rgba(255,255,255,.05)';
      ctx.fillRect(166, y, W - 206, rowH - 28);
      ctx.strokeStyle = 'rgba(255,255,255,.08)';
      ctx.strokeRect(166, y, W - 206, rowH - 28);

      var items = (state.tiers[t] || []).slice(0, 6);
      items.forEach(function (id, k) {
        var col2 = k % 3, row = Math.floor(k / 3);
        var cx = 180 + col2 * 300;
        var cy = y + 14 + row * 82;
        var c = cards[id] || { title: '#' + id, poster: '' };
        // poster thumbnail
        var img = imgMap[id];
        if (img) {
          ctx.save();
          ctx.beginPath();
          ctx.rect(cx, cy, 52, 68);
          ctx.clip();
          ctx.drawImage(img, cx, cy, 52, 68);
          ctx.restore();
          // border
          ctx.strokeStyle = 'rgba(255,255,255,.25)';
          ctx.strokeRect(cx, cy, 52, 68);
        } else {
          ctx.fillStyle = 'rgba(255,255,255,.08)';
          ctx.fillRect(cx, cy, 52, 68);
          ctx.fillStyle = 'rgba(255,255,255,.3)';
          ctx.font = '600 20px "Rajdhani", sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('?', cx + 26, cy + 40);
          ctx.textAlign = 'left';
        }
        // title
        ctx.fillStyle = 'rgba(255,255,255,.92)';
        ctx.font = '600 17px "Rajdhani", "Segoe UI", sans-serif';
        var txt = (c.title || '').length > 22 ? (c.title || '').slice(0, 21) + '...' : (c.title || '');
        ctx.fillText(txt, cx + 60, cy + 22);
        ctx.fillStyle = 'rgba(255,179,205,.55)';
        ctx.font = '500 13px "Rajdhani", "Segoe UI", sans-serif';
        ctx.fillText('NO. ' + id, cx + 60, cy + 42);
      });
      if (!items.length) {
        ctx.fillStyle = 'rgba(255,255,255,.25)';
        ctx.font = '600 20px "Rajdhani", "Segoe UI", sans-serif';
        ctx.fillText('—', 184, y + 52);
      }
    });

    // footer
    ctx.fillStyle = 'rgba(207, 228, 255, .55)';
    ctx.font = '600 18px "Rajdhani", "Segoe UI", sans-serif';
    ctx.fillText('fardinsenpai.github.io/my-anime-list', 48, H - 24);

    var a = document.createElement('a');
    a.download = 'anime-tier-list.png';
    a.href = cv.toDataURL('image/png');
    document.body.appendChild(a); a.click(); a.remove();
  }  /* ---- shell ---- */
  function build() {
    overlay = document.createElement('div');
    overlay.className = 'tl-overlay';
    overlay.hidden = true;
    overlay.innerHTML =
      '<div class="tl-panel" role="dialog" aria-modal="true" aria-label="Tier list maker">' +
        '<div class="tl-head">' +
          '<div class="tl-dots" aria-hidden="true"><span class="d1"></span><span class="d2"></span><span class="d3"></span></div>' +
          '<span class="tl-title">🅢 Tier List Maker</span>' +
          '<div class="tl-tools">' +
            '<button type="button" class="tl-tool" data-act="undo" title="Undo">↶ Undo</button>' +
            '<button type="button" class="tl-tool" data-act="autorank" title="Auto-rank by site ratings">⚡ Auto-rank</button>' +
            '<button type="button" class="tl-tool" data-act="share" title="Copy share link">↗ Share</button>' +
            '<button type="button" class="tl-tool" data-act="export">⬇ PNG</button>' +
            '<button type="button" class="tl-tool" data-act="reset">Reset</button>' +
            '<button type="button" class="tl-tool tl-x" data-act="close" aria-label="Close">✕</button>' +
          '</div>' +
        '</div>' +
        '<div class="tl-readonly" hidden>Read-only view — <button type="button" data-act="copy">Make a copy</button></div>' +
        '<div class="tl-search"><input id="tlSearch" type="text" placeholder="Filter titles still unranked…" autocomplete="off" spellcheck="false"/></div>' +
        '<div class="tl-body">' +
          '<div class="tl-pool-wrap">' +
            '<div class="tl-pool-label"><span>UNRANKED POOL</span><b id="tlPoolCount"></b></div>' +
            '<div class="tl-pool" id="tlPool"></div>' +
          '</div>' +
          '<div class="tl-tiers" id="tlTiers"></div>' +
          '<p class="tl-foot">Drag a title into a tier — or tap it and pick a letter. Click a tier letter to rename it.</p>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);

    overlay.querySelector('#tlSearch').addEventListener('input', renderPool);

    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) return close();
      var act = e.target.closest('[data-act]');
      if (act) {
        var a = act.getAttribute('data-act');
        if (a === 'close') close();
        if (a === 'export') exportPng();
        if (a === 'reset') { pushHistory(); state = defaultState(); save(); render(); }
        if (a === 'undo') undo();
        if (a === 'autorank') autoRank();
        if (a === 'share') shareLink();
        if (a === 'copy') { readOnly = false; var b = overlay.querySelector('.tl-readonly'); if (b) b.hidden = true; toast('Editing enabled'); }
        return;
      }
      var tagX = e.target.closest('.tl-tag-x');
      if (tagX) { e.stopPropagation(); removeTier(tagX.getAttribute('data-remove')); return; }
      var tag = e.target.closest('.tl-tag');
      if (tag) { renameTier(tag.getAttribute('data-tier')); return; }
      var c = e.target.closest('.tl-chip');
      if (c) { if (!readOnly) openPicker(c); return; }
    });

    /* drag & drop */
    overlay.addEventListener('dragstart', function (e) {
      if (readOnly) { e.preventDefault(); return; }
      var c = e.target.closest('.tl-chip');
      if (!c) return;
      e.dataTransfer.setData('text/plain', c.getAttribute('data-id'));
      e.dataTransfer.effectAllowed = 'move';
      c.classList.add('tl-dragging');
    });
    overlay.addEventListener('dragend', function (e) {
      var c = e.target.closest('.tl-chip');
      if (c) c.classList.remove('tl-dragging');
      Array.prototype.forEach.call(overlay.querySelectorAll('.tl-over'), function (el) { el.classList.remove('tl-over'); });
    });
    overlay.addEventListener('dragover', function (e) {
      var drop = e.target.closest('.tl-drop');
      if (!drop) return;
      e.preventDefault();
      drop.classList.add('tl-over');
    });
    overlay.addEventListener('dragleave', function (e) {
      var drop = e.target.closest('.tl-drop');
      if (drop) drop.classList.remove('tl-over');
    });
    overlay.addEventListener('drop', function (e) {
      var drop = e.target.closest('.tl-drop');
      if (!drop) return;
      e.preventDefault();
      drop.classList.remove('tl-over');
      var id = e.dataTransfer.getData('text/plain');
      if (id && cards[id]) assign(id, drop.getAttribute('data-tier'));
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && overlay && !overlay.hidden) close();
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && overlay && !overlay.hidden) { e.preventDefault(); undo(); }
    });

    document.addEventListener('click', function (e) {
      if (!picker || picker.hidden) return;
      if (e.target.closest && (e.target.closest('.tl-pick') || e.target.closest('.tl-chip'))) return;
      picker.hidden = true;
    }, true);
    window.addEventListener('scroll', function () { if (picker) picker.hidden = true; }, { passive: true });
    window.addEventListener('resize', function () { if (picker) picker.hidden = true; });
  }

  function openPicker(chipEl) {
    if (readOnly) return;
    if (!picker) {
      picker = document.createElement('div');
      picker.className = 'tl-pick';
      picker.hidden = true;
      document.body.appendChild(picker);
      picker.addEventListener('click', function (e) {
        var b = e.target.closest('[data-tier]');
        if (!b) return;
        var id = picker.dataset.id;
        assign(id, b.getAttribute('data-tier') === 'none' ? null : b.getAttribute('data-tier'));
        picker.hidden = true;
      });
    }
    picker.dataset.id = chipEl.getAttribute('data-id');
    picker.innerHTML = state.order.map(function (t) {
      return '<button type="button" data-tier="' + esc(t) + '" style="--tl:' + colorFor(t) + '">' + esc(state.names[t].slice(0, 2)) + '</button>';
    }).join('') + '<button type="button" data-tier="none" class="tl-pick-none">Remove</button>';
    picker.hidden = false;
    var r = chipEl.getBoundingClientRect();
    var w = 260, h = 60;
    picker.style.left = Math.min(Math.max(8, r.left), window.innerWidth - w - 8) + 'px';
    var top = r.bottom + 6;
    if (top + h > window.innerHeight - 8) top = Math.max(8, r.top - h - 6);
    picker.style.top = top + 'px';
  }

  function open() {
    if (!overlay) build();
    readCards();
    // read-only from URL?
    var m = location.hash.match(/tier=([^&]+)/);
    if (m) {
      var dec = decodeState(m[1]);
      if (dec) { state = dec; readOnly = true; history = []; }
    } else {
      readOnly = false;
      try {
        var raw = JSON.parse(localStorage.getItem(LS_KEY) || 'null');
        state = normalize(raw);
      } catch (e) { state = normalize(null); }
    }
    overlay.hidden = false;
    document.body.classList.add('aw-lock');
    document.documentElement.classList.add('aw-lock');
    render();
    if (!readOnly) pull();
    requestAnimationFrame(function () { overlay.classList.add('show'); });
    var ro = overlay.querySelector('.tl-readonly');
    if (ro) ro.hidden = !readOnly;
  }
  function close() {
    if (!overlay) return;
    if (picker) picker.hidden = true;
    overlay.classList.remove('show');
    overlay.hidden = true;
    document.body.classList.remove('aw-lock');
    document.documentElement.classList.remove('aw-lock');
  }

  /* ---- entry ---- */
  function mountNav() {
    var btn = $('tierNavBtn');
    if (!btn || btn.getAttribute('data-bound') === '1') return;
    btn.setAttribute('data-bound', '1');
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      if (typeof closeMenu === 'function') closeMenu();
      if (typeof closeFloatingOverlays === 'function') { try { closeFloatingOverlays(); } catch (err) {} }
      open();
    });
  }
  function boot() {
    mountNav();
    window.TierList = { open: open, close: close, state: function () { return state; } };
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})()
