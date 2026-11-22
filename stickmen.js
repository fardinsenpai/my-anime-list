/* =====================================================================
   INTERACTIVE COLORED STICKMEN  (Desktop Mate style)
   ---------------------------------------------------------------------
   Lightweight Canvas 2D stickmen that:
     - spawn from under the top bar and hop between cards
     - show laugh / jump / run / angry / sad / happy states
     - react to clicks and user activity with speech bubbles
     - are draggable anywhere and can step off-screen before returning
   Sidebar controls let visitors tweak colours, count and behaviour.
   ===================================================================== */
(function () {
  'use strict';

  var COLORS = ['#ff4d7d', '#4dd4ac', '#7a8cff', '#ffd93d', '#ff9f43', '#b388ff'];
  var STATES = ['happy', 'run', 'jump', 'laugh', 'angry', 'sad'];
  var BUBBLES = {
    happy: ['hi!', 'yay!', ':D', 'nice!'],
    laugh: ['haha!', 'lol', 'XD', 'hehe'],
    jump: ['boing!', 'up!', 'wheee'],
    run: ['zoom!', 'fast!', 'go go'],
    angry: ['grr!', 'hmph!', 'ugh'],
    sad: ['...', 'oh', ':(', 'meh']
  };

  var canvas = null, ctx = null;
  var stickmen = [];
  var raf = null;
  var cfg = { count: 4, colors: COLORS.slice(0, 4), speed: 1, gravity: 0.6 };
  var drag = null;
  var mouse = { x: -1000, y: -1000 };

  function loadCfg() {
    try {
      var c = JSON.parse(localStorage.getItem('stickmen_cfg_v1') || 'null');
      if (c) { cfg.count = c.count || cfg.count; cfg.colors = c.colors || cfg.colors; cfg.speed = c.speed || cfg.speed; }
    } catch (e) {}
  }
  function saveCfg() {
    try { localStorage.setItem('stickmen_cfg_v1', JSON.stringify(cfg)); } catch (e) {}
  }

  function makeStickman(i) {
    var col = cfg.colors[i % cfg.colors.length];
    return {
      x: 60 + i * 40,
      y: 60,
      vx: (Math.random() - 0.5) * 2,
      vy: 0,
      color: col,
      state: 'happy',
      stateTimer: 0,
      bubble: null,
      bubbleTimer: 0,
      target: null,
      dragging: false,
      onGround: true,
      legPhase: Math.random() * Math.PI * 2,
      armPhase: Math.random() * Math.PI * 2,
      scale: 0.9 + Math.random() * 0.2,
      homeX: 60 + i * 40
    };
  }

  function resize() {
    if (!canvas) return;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }

  function cardTargets() {
    var cards = document.querySelectorAll('#grid .card');
    var out = [];
    Array.prototype.forEach.call(cards, function (c) {
      var r = c.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) out.push({ x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height });
    });
    return out;
  }

  function initStickmen() {
    stickmen = [];
    for (var i = 0; i < cfg.count; i++) stickmen.push(makeStickman(i));
  }

  function setState(s, state) {
    s.state = state;
    s.stateTimer = 60 + Math.random() * 120;
    if (Math.random() < 0.6) {
      var opts = BUBBLES[state];
      s.bubble = opts[Math.floor(Math.random() * opts.length)];
      s.bubbleTimer = 90;
    }
  }

  function step() {
    var targets = cardTargets();
    var topBarH = 60;
    var groundY = window.innerHeight - 40;
    stickmen.forEach(function (s) {
      if (s.dragging) {
        s.x = mouse.x; s.y = mouse.y;
        s.vx = 0; s.vy = 0;
        s.legPhase += 0.05;
        return;
      }
      s.stateTimer--;
      if (s.stateTimer <= 0) {
        var ns = STATES[Math.floor(Math.random() * STATES.length)];
        setState(s, ns);
      }
      if (s.bubbleTimer > 0) s.bubbleTimer--;

      // movement based on state
      var sp = cfg.speed;
      if (s.state === 'run') { s.vx = (Math.random() > 0.5 ? 1 : -1) * (1.5 + Math.random()) * sp; }
      else if (s.state === 'happy') { s.vx *= 0.9; s.vy = -3 * Math.sin(s.legPhase); }
      else if (s.state === 'jump') { if (s.onGround) { s.vy = -8 * sp; s.onGround = false; } s.vx *= 0.95; }
      else if (s.state === 'laugh') { s.vx *= 0.8; }
      else if (s.state === 'angry') { s.vx = (Math.random() > 0.5 ? 1 : -1) * 2.5 * sp; }
      else if (s.state === 'sad') { s.vx *= 0.92; }

      // gravity
      s.vy += 0.5;
      s.x += s.vx;
      s.y += s.vy;

      // ground collision
      if (s.y >= groundY) { s.y = groundY; s.vy = 0; s.onGround = true; }
      // top bar bounce
      if (s.y < topBarH) { s.y = topBarH; s.vy = Math.abs(s.vy) * 0.5; }
      // horizontal bounds with slight off-screen
      if (s.x < -30) { s.x = -30; s.vx = Math.abs(s.vx) + 0.5; }
      if (s.x > window.innerWidth + 30) { s.x = window.innerWidth + 30; s.vx = -Math.abs(s.vx) - 0.5; }

      // hop toward a card target occasionally
      if (s.target && !s.dragging) {
        var dx = s.target.x - s.x;
        if (Math.abs(dx) < 5) { s.target = null; }
        else { s.vx += (dx > 0 ? 0.3 : -0.3) * sp; s.vx = Math.max(-3, Math.min(3, s.vx)); }
      } else if (Math.random() < 0.005 && targets.length) {
        s.target = targets[Math.floor(Math.random() * targets.length)];
      }

      // friction
      s.vx *= 0.96;
      s.legPhase += Math.abs(s.vx) * 0.15 + 0.05;
      s.armPhase += 0.1;
    });
  }

  function drawStickman(s) {
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.scale(s.scale, s.scale);
    var col = s.color;
    // head
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.arc(0, -38, 9, 0, Math.PI * 2); ctx.fill();
    // eyes
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(-3, -40, 2.2, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(3, -40, 2.2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.arc(-3, -40, 1.1, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(3, -40, 1.1, 0, Math.PI * 2); ctx.fill();
    // mouth by state
    ctx.strokeStyle = '#000'; ctx.lineWidth = 1.3; ctx.lineCap = 'round';
    ctx.beginPath();
    if (s.state === 'happy' || s.state === 'laugh') {
      ctx.arc(0, -35, 4, 0.2, Math.PI - 0.2);
    } else if (s.state === 'sad') {
      ctx.arc(0, -30, 4, Math.PI + 0.2, Math.PI * 2 - 0.2);
    } else if (s.state === 'angry') {
      ctx.moveTo(-4, -33); ctx.lineTo(4, -33);
    } else {
      ctx.moveTo(-3, -33); ctx.lineTo(3, -33);
    }
    ctx.stroke();
    // body
    ctx.strokeStyle = col; ctx.lineWidth = 2.6;
    ctx.beginPath(); ctx.moveTo(0, -29); ctx.lineTo(0, -8); ctx.stroke();
    // arms
    var armSwing = Math.sin(s.armPhase) * 0.6;
    ctx.beginPath();
    ctx.moveTo(0, -22); ctx.lineTo(-12, -16 + armSwing * 8); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, -22); ctx.lineTo(12, -16 - armSwing * 8); ctx.stroke();
    // legs
    var legSwing = Math.sin(s.legPhase) * 0.8;
    ctx.beginPath();
    ctx.moveTo(0, -8); ctx.lineTo(-8 + legSwing * 6, 12); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, -8); ctx.lineTo(8 - legSwing * 6, 12); ctx.stroke();
    ctx.restore();

    // bubble
    if (s.bubble && s.bubbleTimer > 0) {
      ctx.save();
      ctx.font = 'bold 13px "Rajdhani", sans-serif';
      var txt = s.bubble;
      var bw = ctx.measureText(txt).width + 14;
      var bx = s.x - bw / 2, by = s.y - 60;
      ctx.fillStyle = 'rgba(255,255,255,.92)';
      ctx.strokeStyle = col;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(bx, by, bw, 22, 8);
      ctx.fill(); ctx.stroke();
      // tail
      ctx.beginPath();
      ctx.moveTo(s.x - 4, by + 22); ctx.lineTo(s.x, by + 28); ctx.lineTo(s.x + 4, by + 22);
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = col;
      ctx.textAlign = 'center';
      ctx.fillText(txt, s.x, by + 15);
      ctx.restore();
    }
  }

  function draw() {
    if (!canvas) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    step();
    stickmen.forEach(drawStickman);
    raf = requestAnimationFrame(draw);
  }

  function mountCanvas() {
    if (canvas) return;
    canvas = document.createElement('canvas');
    canvas.id = 'stickmenCanvas';
    canvas.style.cssText = 'position:fixed;inset:0;z-index:9997;pointer-events:none;';
    document.body.appendChild(canvas);
    ctx = canvas.getContext('2d');
    resize();
    window.addEventListener('resize', resize);
    initStickmen();
    draw();
    // pointer events for drag
    canvas.style.pointerEvents = 'none';
    document.addEventListener('mousedown', function (e) {
      var mx = e.clientX, my = e.clientY;
      for (var i = stickmen.length - 1; i >= 0; i--) {
        var s = stickmen[i];
        var dx = mx - s.x, dy = my - s.y;
        if (Math.sqrt(dx*dx + dy*dy) < 28 * s.scale) {
          drag = s; s.dragging = true;
          canvas.style.cursor = 'grabbing';
          e.preventDefault();
          break;
        }
      }
    });
    window.addEventListener('mousemove', function (e) {
      mouse.x = e.clientX; mouse.y = e.clientY;
      if (drag) { drag.x = e.clientX; drag.y = e.clientY; }
    });
    window.addEventListener('mouseup', function () {
      if (drag) { drag.dragging = false; drag = null; canvas.style.cursor = 'grab'; }
    });
  }

  function unmount() {
    if (raf) cancelAnimationFrame(raf);
    raf = null;
    if (canvas && canvas.parentNode) canvas.parentNode.removeChild(canvas);
    canvas = null; ctx = null;
  }

  /* sidebar controls */
  function mountControls() {
    var sideNav = document.querySelector('nav.side-nav') || document.querySelector('.side-nav');
    if (!sideNav || sideNav.querySelector('#stickmenControls')) return;
    var li = document.createElement('li');
    li.id = 'stickmenControls';
    li.innerHTML =
      '<div class="sm-ctrl">' +
        '<div class="sm-ctrl-title">Stickmen</div>' +
        '<div class="sm-ctrl-row">' +
          '<label>Count <input type="range" min="0" max="8" value="' + cfg.count + '" id="smCount"></label>' +
          '<span id="smCountVal">' + cfg.count + '</span>' +
        '</div>' +
        '<div class="sm-ctrl-row">' +
          '<label>Speed <input type="range" min="0" max="3" step="0.1" value="' + cfg.speed + '" id="smSpeed"></label>' +
        '</div>' +
        '<div class="sm-ctrl-row sm-ctrl-colors">' +
          cfg.colors.map(function (c, i) { return '<button class="sm-color" data-i="' + i + '" style="background:' + c + '"></button>'; }).join('') +
        '</div>' +
        '<button type="button" class="sm-toggle" id="smToggle">Hide Stickmen</button>' +
      '</div>';
    sideNav.appendChild(li);

    var countInp = document.getElementById('smCount');
    var countVal = document.getElementById('smCountVal');
    var speedInp = document.getElementById('smSpeed');
    var toggle = document.getElementById('smToggle');

    function rebuild() {
      cfg.count = parseInt(countInp.value, 10);
      cfg.speed = parseFloat(speedInp.value);
      countVal.textContent = cfg.count;
      saveCfg();
      if (cfg.count === 0) { unmount(); } else { if (!canvas) mountCanvas(); initStickmen(); }
    }
    countInp.addEventListener('input', rebuild);
    speedInp.addEventListener('input', rebuild);

    // color cycling
    li.querySelectorAll('.sm-color').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var i = parseInt(btn.getAttribute('data-i'), 10);
        var idx = COLORS.indexOf(cfg.colors[i]) + 1;
        cfg.colors[i] = COLORS[idx % COLORS.length];
        btn.style.background = cfg.colors[i];
        saveCfg();
        stickmen.forEach(function (s, k) { if (k % cfg.colors.length === i) s.color = cfg.colors[i]; });
      });
    });

    var visible = true;
    toggle.addEventListener('click', function () {
      visible = !visible;
      if (visible) { mountCanvas(); initStickmen(); toggle.textContent = 'Hide Stickmen'; }
      else { unmount(); toggle.textContent = 'Show Stickmen'; }
    });
  }

  function boot() {
    loadCfg();
    if (cfg.count > 0) mountCanvas();
    mountControls();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  window.Stickmen = { mount: mountCanvas, unmount: unmount, init: initStickmen };
})();
