/* =====================================================================
   TIER LIST MAKER  —  rebuilt
   Drag or tap titles into tiers, add your own anime, export a clean PNG.
   No auto ranking. Works on phones and desktops.
   ===================================================================== */
(function () {
  'use strict';

  var LS_KEY = 'tier_v2';
  var PALETTE = ['#ff4d7d', '#ff9f43', '#ffd93d', '#4dd4ac', '#7a8cff', '#b388ff', '#00d4ff'];
  var state = {
    tiers: { S: [], A: [], B: [], C: [], D: [] },
    names: { S: 'S', A: 'A', B: 'B', C: 'C', D: 'D' },
    order: ['S', 'A', 'B', 'C', 'D'],
    custom: {}
  };
  var cards = {};
  var overlay = null, picker = null, saveTimer = null, readOnly = false, undoStack = [];
  var SITE_BASE = (function () {
    var s = document.currentScript;
    return s && s.src ? s.src.replace(/[^/]*$/, '') : './';
  })();

  function $(sel, root) { return (root || document).querySelector(sel); }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function colorFor(t, i) {
    var fixed = { S: '#ff4d7d', A: '#ff9f43', B: '#ffd93d', C: '#4dd4ac', D: '#7a8cff' };
    return fixed[t] || PALETTE[Math.max(0, i || 0) % PALETTE.length];
  }

  /* ---------- data ---------- */
  function readCards() {
    cards = {};
    Array.prototype.forEach.call(document.querySelectorAll('#grid .card'), function (card) {
      var n = card.querySelector('.number'), t = card.querySelector('.title');
      var img = card.querySelector('.poster-wrap img');
      if (!n || !t) return;
      var id = String(n.textContent || '').replace(/\D/g, '');
      if (!id) return;
      cards[id] = { title: t.textContent.trim(), poster: img ? img.getAttribute('src') : '' };
    });
    Object.keys(state.custom || {}).forEach(function (id) {
      cards[id] = state.custom[id];
    });
  }
  function defaultState() {
    return { tiers: { S: [], A: [], B: [], C: [], D: [] },
      names: { S: 'S', A: 'A', B: 'B', C: 'C', D: 'D' },
      order: ['S', 'A', 'B', 'C', 'D'], custom: {} };
  }
  function normalize(raw) {
    var out = defaultState();
    if (!raw || typeof raw !== 'object') return out;
    out.order = Array.isArray(raw.order) && raw.order.length ? raw.order.slice() : out.order;
    out.names = raw.names && typeof raw.names === 'object' ? raw.names : out.names;
    out.custom = raw.custom && typeof raw.custom === 'object' ? raw.custom : {};
    out.tiers = {};
    out.order.forEach(function (t) { out.tiers[t] = []; });
    var source = raw.tiers || raw;
    Object.keys(source).forEach(function (t) {
      if (!out.tiers[t] || !Array.isArray(source[t])) return;
      out.tiers[t] = source[t].filter(function (id) {
        return id != null && cards[String(id)];
      }).map(String);
    });
    out.tiers[out.order[0]] = out.tiers[out.order[0]] || [];
    return out;
  }
  function save() {
    try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch (e) {}
  }
  function snapshot() { return JSON.stringify(state); }
  function pushUndo() {
    undoStack.push(snapshot());
    if (undoStack.length > 30) undoStack.shift();
  }
  function undo() {
    if (readOnly || !undoStack.length) return;
    state = JSON.parse(undoStack.pop());
    readCards();
    save(); render();
    toast('Undone');
  }

  function toast(msg) {
    var t = document.createElement('div');
    t.className = 'tl2-toast';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(function () { t.classList.add('show'); }, 20);
    setTimeout(function () { t.classList.remove('show'); setTimeout(function () { t.remove(); }, 300); }, 2200);
  }

  /* ---------- actions ---------- */
  function assignedSet() {
    var set = {};
    state.order.forEach(function (t) {
      (state.tiers[t] || []).forEach(function (id) { set[id] = t; });
    });
    return set;
  }
  function assign(id, tier) {
    if (readOnly || !cards[id]) return;
    pushUndo();
    state.order.forEach(function (t) {
      state.tiers[t] = (state.tiers[t] || []).filter(function (x) { return x !== id; });
    });
    if (tier && state.tiers[tier]) state.tiers[tier].push(id);
    save(); render();
  }
  function addTier() {
    if (readOnly) return;
    pushUndo();
    var key = 't' + Date.now().toString(36);
    state.order.push(key);
    state.tiers[key] = [];
    state.names[key] = 'Tier ' + (state.order.length);
    save(); render();
  }
  function removeTier(t) {
    if (readOnly || state.order.length < 2 || (state.tiers[t] || []).length) return;
    pushUndo();
    state.order = state.order.filter(function (x) { return x !== t; });
    delete state.tiers[t]; delete state.names[t];
    save(); render();
  }
  function renameTier(t) {
    if (readOnly) return;
    var tag = $('.tl2-tag[data-tier="' + t + '"]', overlay);
    if (!tag) return;
    var input = document.createElement('input');
    input.className = 'tl2-tier-input';
    input.maxLength = 16;
    input.value = state.names[t] || t;
    tag.textContent = '';
    tag.appendChild(input);
    input.focus(); input.select();
    var done = false;
    function commit() {
      if (done) return; done = true;
      var v = input.value.trim();
      if (v) { pushUndo(); state.names[t] = v; save(); }
      render();
    }
    input.addEventListener('blur', commit);
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); commit(); }
      else if (e.key === 'Escape') { done = true; render(); }
    });
  }
  function addCustom(title, poster) {
    if (readOnly) return;
    title = String(title || '').trim();
    if (!title) { toast('Enter a title first'); return; }
    pushUndo();
    var id = 'c' + Date.now().toString(36);
    state.custom[id] = { title: title, poster: String(poster || '').trim() };
    cards[id] = state.custom[id];
    save(); render();
    toast(title + ' added');
  }

  /* ---------- render ---------- */
  function chip(id, tier) {
    var c = cards[id] || { title: '#' + id, poster: '' };
    return '<button type="button" class="tl2-chip' + (tier ? ' tl2-chip--in' : '') + '" draggable="' + (!readOnly) +
      '" data-id="' + esc(id) + '" title="' + esc(c.title) + '">' +
      (c.poster ? '<img src="' + esc(c.poster) + '" alt="" loading="lazy">' : '<span class="tl2-chip-emoji">🎴</span>') +
      '<span>' + esc(c.title) + '</span></button>';
  }
  function renderPool() {
    var pool = $('.tl2-pool', overlay);
    var count = $('.tl2-pool-count', overlay);
    if (!pool) return;
    var q = ($('#tl2Search', overlay) || {}).value || '';
    q = String(q).trim().toLowerCase();
    var assigned = assignedSet();
    var ids = Object.keys(cards).filter(function (id) {
      return !assigned[id] && (!q || String(cards[id].title).toLowerCase().indexOf(q) > -1);
    });
    if (count) count.textContent = ids.length + ' unranked';
    pool.innerHTML = ids.length
      ? ids.map(function (id) { return chip(id, null); }).join('')
      : '<div class="tl2-empty">' + (q ? 'No title matches your search.' : 'Everything is ranked 🎉') + '</div>';
  }
  function renderTiers() {
    var host = $('.tl2-tiers', overlay);
    if (!host) return;
    host.innerHTML = state.order.map(function (t, i) {
      var col = colorFor(t, i);
      var items = state.tiers[t] || [];
      return '<div class="tl2-row" style="--tl:' + col + '">' +
        '<button type="button" class="tl2-tag" data-tier="' + esc(t) + '" title="Rename tier">' +
          '<span>' + esc((state.names[t] || t).slice(0, 6)) + '</span>' +
          (!readOnly && state.order.length > 1 && !items.length
            ? '<i class="tl2-tag-x" data-remove="' + esc(t) + '" title="Remove tier">×</i>' : '') +
        '</button>' +
        '<div class="tl2-drop" data-tier="' + esc(t) + '">' +
          (items.length ? items.map(function (id) { return chip(id, t); }).join('')
            : '<span class="tl2-hint">drop a title here</span>') +
        '</div>' +
      '</div>';
    }).join('') +
      (readOnly ? '' : '<button type="button" class="tl2-addtier" data-act="addtier">+ Add tier</button>');
  }
  function render() {
    renderPool();
    renderTiers();
    var banner = $('.tl2-readonly', overlay);
    if (banner) banner.hidden = !readOnly;
  }

  /* ---------- picker (tap to assign) ---------- */
  function closePicker() { if (picker) { picker.hidden = true; } }
  function openPicker(chipEl) {
    if (readOnly) return;
    if (!picker) {
      picker = document.createElement('div');
      picker.className = 'tl2-pick';
      picker.hidden = true;
      document.body.appendChild(picker);
    }
    var id = chipEl.getAttribute('data-id');
    var current = null;
    state.order.forEach(function (t) { if ((state.tiers[t] || []).indexOf(id) > -1) current = t; });
    picker.innerHTML = state.order.map(function (t, i) {
      return '<button type="button" style="--tl:' + colorFor(t, i) + '" data-tier="' + esc(t) + '">' +
        esc((state.names[t] || t).slice(0, 2)) + '</button>';
    }).join('') + '<button type="button" class="tl2-pick-none" data-tier="none">Remove</button>';
    var r = chipEl.getBoundingClientRect();
    picker.style.left = Math.min(window.innerWidth - 180, Math.max(8, r.left)) + 'px';
    picker.style.top = Math.min(window.innerHeight - 160, r.bottom + 6) + 'px';
    picker.hidden = false;
    picker.onclick = function (e) {
      var b = e.target.closest('button');
      if (!b) return;
      assign(id, b.getAttribute('data-tier') === 'none' ? null : b.getAttribute('data-tier'));
      closePicker();
    };
  }

  /* ---------- PNG export ---------- */
  function proxied(src) {
    if (!src) return src;
    if (/^data:/.test(src) || /anilist\.co|media-amazon\.com|myanimelist\.net/.test(src)) return src;
    return 'https://wsrv.nl/?url=' + encodeURIComponent(src);
  }
  function tryLoad(src, ms) {
    return new Promise(function (resolve) {
      if (!src) return resolve(null);
      var img = new Image(), done = false;
      img.crossOrigin = 'anonymous';
      var t = setTimeout(function () { if (!done) { done = true; resolve(null); } }, ms || 4500);
      img.onload = function () { if (done) return; done = true; clearTimeout(t); resolve(img); };
      img.onerror = function () { if (done) return; done = true; clearTimeout(t); resolve(null); };
      img.src = src;
    });
  }
  function loadImage(src) {
    if (!src) return Promise.resolve(null);
    return tryLoad(src, 3500).then(function (img) { return img || tryLoad(proxied(src), 5500); });
  }
  async function exportPng() {
    var W = 1200, rowH = 190, headH = 178, footH = 70;
    var H = headH + rowH * state.order.length + footH;
    var cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    var ctx = cv.getContext('2d');

    /* banner drawn directly on the canvas so it is ALWAYS visible */
    var banner = ctx.createLinearGradient(0, 0, W, headH);
    banner.addColorStop(0, '#120a28');
    banner.addColorStop(0.55, '#2b1246');
    banner.addColorStop(1, '#0d0620');
    ctx.fillStyle = banner;
    ctx.fillRect(0, 0, W, headH);
    ctx.fillStyle = 'rgba(0,240,255,.75)';
    ctx.fillRect(0, headH - 4, W, 4);
    ctx.fillStyle = '#00f0ff';
    ctx.font = '900 54px Orbitron, sans-serif';
    ctx.textAlign = 'left';
    ctx.shadowColor = 'rgba(0,240,255,.65)'; ctx.shadowBlur = 20;
    ctx.fillText('MY ANIME TIER LIST', 52, 88);
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(215,230,255,.85)';
    ctx.font = '600 26px Rajdhani, sans-serif';
    ctx.fillText("Fardin's Anime Hub", 54, 130);
    /* decorative badge instead of an external image that may fail to load */
    ctx.save();
    ctx.translate(W - 110, 88);
    ctx.strokeStyle = '#ffd700'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(0, 0, 48, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#ffd700';
    ctx.font = '900 46px Orbitron, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('✦', 0, 16);
    ctx.restore();

    var ids = [];
    state.order.forEach(function (t) {
      (state.tiers[t] || []).slice(0, 6).forEach(function (id) { ids.push(id); });
    });
    var imgMap = {};
    await Promise.all(ids.map(function (id) {
      return loadImage((cards[id] || {}).poster).then(function (img) { imgMap[id] = img; });
    }));

    state.order.forEach(function (t, i) {
      var y = headH + i * rowH;
      var col = colorFor(t, i);
      ctx.fillStyle = col;
      ctx.shadowColor = col; ctx.shadowBlur = 14;
      ctx.fillRect(44, y + 8, 124, rowH - 26);
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#0b0412';
      ctx.font = '900 42px Orbitron, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(String(state.names[t] || t).slice(0, 5), 106, y + rowH / 2 + 14);
      ctx.textAlign = 'left';
      ctx.fillStyle = 'rgba(255,255,255,.045)';
      ctx.fillRect(184, y + 8, W - 228, rowH - 26);
      ctx.strokeStyle = 'rgba(255,255,255,.09)';
      ctx.strokeRect(184, y + 8, W - 228, rowH - 26);
      var items = (state.tiers[t] || []).slice(0, 6);
      items.forEach(function (id, k) {
        var cx = 198 + (k % 3) * 320;
        var cy = y + 20 + Math.floor(k / 3) * 80;
        var c = cards[id] || { title: '#' + id, poster: '' };
        var img = imgMap[id];
        if (img) {
          ctx.save();
          ctx.beginPath(); ctx.rect(cx, cy, 54, 70); ctx.clip();
          ctx.drawImage(img, cx, cy, 54, 70);
          ctx.restore();
        } else {
          ctx.fillStyle = 'rgba(255,255,255,.09)';
          ctx.fillRect(cx, cy, 54, 70);
          ctx.fillStyle = 'rgba(255,255,255,.4)';
          ctx.font = '600 24px Rajdhani, sans-serif';
          ctx.textAlign = 'center'; ctx.fillText('?', cx + 27, cy + 44); ctx.textAlign = 'left';
        }
        ctx.strokeStyle = 'rgba(255,255,255,.25)';
        ctx.strokeRect(cx, cy, 54, 70);
        ctx.fillStyle = 'rgba(255,255,255,.94)';
        ctx.font = '600 18px Rajdhani, sans-serif';
        var txt = String(c.title || '').slice(0, 24);
        if (String(c.title || '').length > 24) txt = txt.slice(0, 23) + '…';
        ctx.fillText(txt, cx + 64, cy + 24);
        ctx.fillStyle = 'rgba(255,200,220,.6)';
        ctx.font = '500 13px Rajdhani, sans-serif';
        ctx.fillText('NO. ' + id, cx + 64, cy + 45);
      });
    });

    ctx.fillStyle = 'rgba(215,230,255,.55)';
    ctx.font = '600 18px Rajdhani, sans-serif';
    ctx.fillText('fardinsenpai.github.io/my-anime-list', 48, H - 22);

    var a = document.createElement('a');
    a.download = 'anime-tier-list.png';
    a.href = cv.toDataURL('image/png');
    document.body.appendChild(a); a.click(); a.remove();
    toast('PNG saved');
  }

  /* ---------- shell ---------- */
  function build() {
    var el = document.createElement('div');
    el.className = 'tl2-overlay';
    el.innerHTML =
      '<div class="tl2-panel">' +
        '<header class="tl2-head">' +
          '<div class="tl2-brand">✦ TIER LIST MAKER</div>' +
          '<div class="tl2-tools">' +
            '<button type="button" data-act="undo" title="Undo">↶ Undo</button>' +
            '<button type="button" data-act="export" title="Download PNG">⬇ PNG</button>' +
            '<button type="button" data-act="add" title="Add your own anime">＋ Anime</button>' +
            '<button type="button" data-act="close" title="Close">✕</button>' +
          '</div>' +
        '</header>' +
        '<div class="tl2-readonly" hidden>This is a shared tier list — tap “Copy it” to make your own.</div>' +
        '<div class="tl2-addform" hidden>' +
          '<input id="tl2NewTitle" placeholder="Anime title" maxlength="60">' +
          '<input id="tl2NewPoster" placeholder="Image URL (optional)" maxlength="300">' +
          '<button type="button" id="tl2AddGo">Add</button>' +
        '</div>' +
        '<input class="tl2-search" id="tl2Search" placeholder="Search unranked titles…">' +
        '<div class="tl2-body">' +
          '<section class="tl2-pool-wrap">' +
            '<div class="tl2-pool-label">UNRANKED <b class="tl2-pool-count">0 unranked</b></div>' +
            '<div class="tl2-pool"></div>' +
          '</section>' +
          '<section class="tl2-tiers"></section>' +
        '</div>' +
        '<footer class="tl2-foot">Drag a title into a tier — or tap it and choose a tier. Tap a tier name to rename it.</footer>' +
      '</div>';
    document.body.appendChild(el);
    overlay = el;

    $('#tl2Search', el).addEventListener('input', renderPool);
    $('#tl2AddGo', el).addEventListener('click', function () {
      addCustom($('#tl2NewTitle', el).value, $('#tl2NewPoster', el).value);
      $('#tl2NewTitle', el).value = ''; $('#tl2NewPoster', el).value = '';
      $('.tl2-addform', el).hidden = true;
    });

    el.addEventListener('click', function (e) {
      if (e.target === el) { close(); return; }
      var act = e.target.closest('[data-act]');
      if (act) {
        var a = act.getAttribute('data-act');
        if (a === 'close') close();
        else if (a === 'undo') undo();
        else if (a === 'export') exportPng();
        else if (a === 'addtier') addTier();
        else if (a === 'add') { var f = $('.tl2-addform', el); f.hidden = !f.hidden; if (!f.hidden) $('#tl2NewTitle', el).focus(); }
        return;
      }
      var x = e.target.closest('.tl2-tag-x');
      if (x) { e.stopPropagation(); removeTier(x.getAttribute('data-remove')); return; }
      var tag = e.target.closest('.tl2-tag');
      if (tag) { renameTier(tag.getAttribute('data-tier')); return; }
      var c = e.target.closest('.tl2-chip');
      if (c) { openPicker(c); return; }
    });

    el.addEventListener('dragstart', function (e) {
      var c = e.target.closest('.tl2-chip');
      if (!c || readOnly) return;
      e.dataTransfer.setData('text/plain', c.getAttribute('data-id'));
      e.dataTransfer.effectAllowed = 'move';
      c.classList.add('tl2-dragging');
    });
    el.addEventListener('dragend', function () {
      Array.prototype.forEach.call(el.querySelectorAll('.tl2-dragging'), function (n) { n.classList.remove('tl2-dragging'); });
      Array.prototype.forEach.call(el.querySelectorAll('.tl2-drop.tl2-over'), function (n) { n.classList.remove('tl2-over'); });
    });
    el.addEventListener('dragover', function (e) {
      var d = e.target.closest('.tl2-drop');
      if (!d) return;
      e.preventDefault();
      Array.prototype.forEach.call(el.querySelectorAll('.tl2-drop.tl2-over'), function (n) { if (n !== d) n.classList.remove('tl2-over'); });
      d.classList.add('tl2-over');
    });
    el.addEventListener('dragleave', function (e) {
      var d = e.target.closest('.tl2-drop');
      if (d) d.classList.remove('tl2-over');
    });
    el.addEventListener('drop', function (e) {
      var d = e.target.closest('.tl2-drop');
      if (!d) return;
      e.preventDefault(); d.classList.remove('tl2-over');
      var id = e.dataTransfer.getData('text/plain');
      if (id) assign(id, d.getAttribute('data-tier'));
    });
  }

  function open() {
    if (overlay) { overlay.classList.add('show'); return; }
    readCards();
    try {
      var raw = JSON.parse(localStorage.getItem(LS_KEY) || 'null');
      if (raw) state = normalize(raw);
    } catch (e) {}
    var hash = location.hash || '';
    if (hash.indexOf('#tier=') === 0) {
      try {
        var code = hash.slice(6);
        state = normalize(JSON.parse(decodeURIComponent(escape(atob(code)))));
        readOnly = true;
      } catch (e) { readOnly = false; }
    }
    build();
    readCards();
    state = normalize(state);
    render();
    requestAnimationFrame(function () { overlay.classList.add('show'); });
    document.addEventListener('click', function (e) {
      if (picker && !picker.hidden && !e.target.closest('.tl2-pick') && !e.target.closest('.tl2-chip')) closePicker();
    }, true);
    document.addEventListener('keydown', function (e) {
      if (!overlay || !overlay.classList.contains('show')) return;
      if (e.key === 'Escape') close();
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); }
    });
  }
  function close() {
    closePicker();
    if (overlay) overlay.classList.remove('show');
    if (/\/tier-list\/?$/.test(location.pathname)) {
      try { history.pushState(null, '', SITE_BASE + 'home'); } catch (e) {}
    }
  }

  window.TierList = { open: open, close: close, state: function () { return state; } };
})();
