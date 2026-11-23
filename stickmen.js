/* =====================================================================
   INTERACTIVE COLORED STICKMEN  (Desktop Mate style)
   ---------------------------------------------------------------------
   Lightweight Canvas 2D stickmen that:
     - spawn from under the top bar and hop between cards
     - show laugh / jump / run / angry / sad / happy / sleep / sit /
       cooperate states, reacting to user activity with speech bubbles
     - click once or twice for a reaction, a third click "kills" it
     - are draggable anywhere and can step off-screen before returning
   Sidebar controls let visitors tweak colours, count and behaviour.
   ===================================================================== */
(function () {
  'use strict';

  var COLORS = ['#ff4d7d', '#4dd4ac', '#7a8cff', '#ffd93d', '#ff9f43', '#b388ff'];
  var STATES = ['happy', 'run', 'jump', 'laugh', 'angry', 'sad', 'sleep', 'sit', 'cooperate'];
  var BUBBLES = {
    happy: ['hi!', 'yay!', ':D', 'nice!'],
    laugh: ['haha!', 'lol', 'XD', 'hehe'],
    jump: ['boing!', 'up!', 'wheee'],
    run: ['zoom!', 'fast!', 'go go'],
    angry: ['grr!', 'hmph!', 'ugh'],
    sad: ['...', 'oh', ':(', 'meh'],
    sleep: ['Zzz', 'zZz', 'zzZ'],
    sit: ['*sit*', 'phew', 'resting'],
    cooperate: ['team!', 'together!', 'high five!']
  };
  var CLICK1 = ['hey!', "what's up?", 'yo!', 'sup?', 'hola!'];
  var CLICK2 = ['stop poking!', 'again?!', 'ouch!', 'hey!', 'not again!'];
  var LS_KEY = 'stickmen_cfg_v2';

  var canvas = null, ctx = null;
  var stickmen = [];
  var raf = null;
  var cfg = { count: 2, colors: COLORS.slice(0, 2), speed: 1, gravity: 0.6 };
  var drag = null;
  var mouse = { x: -1000, y: -1000 };
  /* The game page carries its own two permanent stickmen (the green timer one
     in the header and the red skip one at the bottom), so the wandering crowd
     is parked there and brought back everywhere else. */
  var suppressed = false;

  function loadCfg() {
    try {
      var c = JSON.parse(localStorage.getItem(LS_KEY) || 'null');
      if (c) {
        if (typeof c.count === 'number') cfg.count = c.count;
        if (Array.isArray(c.colors) && c.colors.length) cfg.colors = c.colors;
        if (typeof c.speed === 'number') cfg.speed = c.speed;
      }
    } catch (e) {}
  }
  function saveCfg() {
    try { localStorage.setItem(LS_KEY, JSON.stringify(cfg)); } catch (e) {}
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
      dead: false,
      clicks: 0,
      _downX: 0, _downY: 0, _downT: 0, _moved: false,
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
      var opts = BUBBLES[state] || ['...'];
      s.bubble = opts[Math.floor(Math.random() * opts.length)];
      s.bubbleTimer = 90;
    }
  }

  function nearestOther(s) {
    var best = null, bd = Infinity;
    for (var i = 0; i < stickmen.length; i++) {
      var o = stickmen[i];
      if (o === s || o.dead) continue;
      var d = Math.abs(o.x - s.x) + Math.abs(o.y - s.y);
      if (d < bd) { bd = d; best = o; }
    }
    return best;
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
      /* dead stickmen just lie there */
      if (s.dead) {
        s.vy += 0.5;
        s.y += s.vy;
        if (s.y >= groundY) { s.y = groundY; s.vy = 0; }
        if (s.bubbleTimer > 0) s.bubbleTimer--;
        return;
      }

      s.stateTimer--;
      if (s.stateTimer <= 0) {
        var ns = STATES[Math.floor(Math.random() * STATES.length)];
        setState(s, ns);
      }
      if (s.bubbleTimer > 0) s.bubbleTimer--;

      var sp = cfg.speed;
      if (s.state === 'run') { s.vx = (Math.random() > 0.5 ? 1 : -1) * (1.5 + Math.random()) * sp; }
      else if (s.state === 'happy') { s.vx *= 0.9; s.vy = -3 * Math.sin(s.legPhase); }
      else if (s.state === 'jump') { if (s.onGround) { s.vy = -8 * sp; s.onGround = false; } s.vx *= 0.95; }
      else if (s.state === 'laugh') { s.vx *= 0.8; }
      else if (s.state === 'angry') { s.vx = (Math.random() > 0.5 ? 1 : -1) * 2.5 * sp; }
      else if (s.state === 'sad') { s.vx *= 0.92; }
      else if (s.state === 'sleep' || s.state === 'sit') { s.vx *= 0.8; }
      else if (s.state === 'cooperate') {
        /* walk toward a friend; when close, greet them */
        var mate = nearestOther(s);
        if (mate) {
          var dx = mate.x - s.x;
          if (Math.abs(dx) > 46) { s.vx += (dx > 0 ? 0.28 : -0.28) * sp; s.vx = Math.max(-3, Math.min(3, s.vx)); }
          else {
            s.vx *= 0.8;
            if (Math.random() < 0.02) {
              s.bubble = (BUBBLES.cooperate)[Math.floor(Math.random() * BUBBLES.cooperate.length)];
              s.bubbleTimer = 70;
            }
          }
        } else { s.vx *= 0.9; }
      }

      /* gravity */
      s.vy += 0.5;
      s.x += s.vx;
      s.y += s.vy;

      if (s.y >= groundY) { s.y = groundY; s.vy = 0; s.onGround = true; }
      if (s.y < topBarH) { s.y = topBarH; s.vy = Math.abs(s.vy) * 0.5; }
      if (s.x < -30) { s.x = -30; s.vx = Math.abs(s.vx) + 0.5; }
      if (s.x > window.innerWidth + 30) { s.x = window.innerWidth + 30; s.vx = -Math.abs(s.vx) - 0.5; }

      if (s.target && !s.dragging) {
        var tdx = s.target.x - s.x;
        if (Math.abs(tdx) < 5) { s.target = null; }
        else { s.vx += (tdx > 0 ? 0.3 : -0.3) * sp; s.vx = Math.max(-3, Math.min(3, s.vx)); }
      } else if (Math.random() < 0.005 && targets.length) {
        s.target = targets[Math.floor(Math.random() * targets.length)];
      }

      s.vx *= 0.96;
      s.legPhase += Math.abs(s.vx) * 0.15 + 0.05;
      s.armPhase += 0.1;
    });
  }

  function drawEyes(s) {
    /* returns nothing; draws eyes according to state */
    if (s.state === 'sleep') {
      /* closed eyes */
      ctx.strokeStyle = '#000'; ctx.lineWidth = 1.3; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(-5, -40); ctx.lineTo(-1, -40); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(1, -40); ctx.lineTo(5, -40); ctx.stroke();
      return;
    }
    if (s.dead) {
      /* X eyes */
      ctx.strokeStyle = '#000'; ctx.lineWidth = 1.4; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(-5, -42); ctx.lineTo(-1, -38); ctx.moveTo(-1, -42); ctx.lineTo(-5, -38); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(1, -42); ctx.lineTo(5, -38); ctx.moveTo(5, -42); ctx.lineTo(1, -38); ctx.stroke();
      return;
    }
    /* normal open eyes */
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(-3, -40, 2.2, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(3, -40, 2.2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.arc(-3, -40, 1.1, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(3, -40, 1.1, 0, Math.PI * 2); ctx.fill();
  }

  function drawStickman(s) {
    ctx.save();
    ctx.translate(s.x, s.y);
    if (s.dead) { ctx.rotate(Math.PI / 2); } /* lie down */
    ctx.scale(s.scale, s.scale);
    var col = s.color;

    /* head */
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.arc(0, -38, 9, 0, Math.PI * 2); ctx.fill();
    drawEyes(s);

    /* mouth by state */
    ctx.strokeStyle = '#000'; ctx.lineWidth = 1.3; ctx.lineCap = 'round';
    ctx.beginPath();
    if (s.state === 'happy' || s.state === 'laugh') {
      ctx.arc(0, -35, 4, 0.2, Math.PI - 0.2);
    } else if (s.state === 'sad' || s.dead) {
      ctx.arc(0, -30, 4, Math.PI + 0.2, Math.PI * 2 - 0.2);
    } else if (s.state === 'angry') {
      ctx.moveTo(-4, -33); ctx.lineTo(4, -33);
    } else if (s.state === 'sleep') {
      /* small snore 'o' */
      ctx.arc(0, -33, 1.6, 0, Math.PI * 2);
    } else {
      ctx.moveTo(-3, -33); ctx.lineTo(3, -33);
    }
    ctx.stroke();

    /* body */
    ctx.strokeStyle = col; ctx.lineWidth = 2.6;
    ctx.beginPath(); ctx.moveTo(0, -29); ctx.lineTo(0, -8); ctx.stroke();

    /* arms */
    var armSwing = Math.sin(s.armPhase) * 0.6;
    if (s.state === 'sit') {
      /* arms resting on knees */
      ctx.beginPath(); ctx.moveTo(0, -22); ctx.lineTo(-11, -6); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, -22); ctx.lineTo(11, -6); ctx.stroke();
    } else if (s.state === 'sleep') {
      /* arms folded / down */
      ctx.beginPath(); ctx.moveTo(0, -22); ctx.lineTo(-9, -10); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, -22); ctx.lineTo(9, -10); ctx.stroke();
    } else {
      ctx.beginPath(); ctx.moveTo(0, -22); ctx.lineTo(-12, -16 + armSwing * 8); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, -22); ctx.lineTo(12, -16 - armSwing * 8); ctx.stroke();
    }

    /* legs */
    var legSwing = Math.sin(s.legPhase) * 0.8;
    if (s.state === 'sit') {
      /* sitting: thighs forward, shins down */
      ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(-11, -2); ctx.lineTo(-11, 12); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(11, -2); ctx.lineTo(11, 12); ctx.stroke();
    } else if (s.state === 'sleep' || s.dead) {
      /* legs straight-ish while lying / resting */
      ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(-7, 12); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(7, 12); ctx.stroke();
    } else {
      ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(-8 + legSwing * 6, 12); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(8 - legSwing * 6, 12); ctx.stroke();
    }

    ctx.restore();

    /* little heart when cooperating close to a mate */
    if (s.state === 'cooperate' && !s.dead) {
      var mate = nearestOther(s);
      if (mate && Math.abs(mate.x - s.x) < 60) {
        ctx.save();
        ctx.fillStyle = 'rgba(255,110,150,.9)';
        var hx = (s.x + mate.x) / 2, hy = s.y - 78;
        ctx.beginPath();
        ctx.moveTo(hx, hy + 4);
        ctx.bezierCurveTo(hx - 6, hy - 4, hx - 12, hy + 4, hx, hy + 12);
        ctx.bezierCurveTo(hx + 12, hy + 4, hx + 6, hy - 4, hx, hy + 4);
        ctx.fill();
        ctx.restore();
      }
    }

    /* bubble */
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
      if (ctx.roundRect) { ctx.roundRect(bx, by, bw, 22, 8); }
      else { ctx.rect(bx, by, bw, 22); }
      ctx.fill(); ctx.stroke();
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

  /* a quick tap = a reaction; a 3rd tap kills it */
  function handleClick(s) {
    if (s.dead) return;
    s.clicks++;
    if (s.clicks === 1) {
      s.bubble = CLICK1[Math.floor(Math.random() * CLICK1.length)];
      s.bubbleTimer = 80;
      setState(s, 'happy');
    } else if (s.clicks === 2) {
      s.bubble = CLICK2[Math.floor(Math.random() * CLICK2.length)];
      s.bubbleTimer = 80;
      setState(s, 'angry');
    } else if (s.clicks >= 3) {
      s.dead = true;
      s.state = 'dead';
      s.bubble = '...';
      s.bubbleTimer = 140;
      s.vx = 0; s.vy = 0;
    }
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

    canvas.style.pointerEvents = 'none';
    document.addEventListener('mousedown', function (e) {
      var mx = e.clientX, my = e.clientY;
      for (var i = stickmen.length - 1; i >= 0; i--) {
        var s = stickmen[i];
        var dx = mx - s.x, dy = my - s.y;
        if (Math.sqrt(dx * dx + dy * dy) < 28 * s.scale) {
          drag = s; s.dragging = true;
          s._downX = mx; s._downY = my; s._downT = Date.now(); s._moved = false;
          canvas.style.cursor = 'grabbing';
          e.preventDefault();
          break;
        }
      }
    });
    window.addEventListener('mousemove', function (e) {
      mouse.x = e.clientX; mouse.y = e.clientY;
      if (drag) {
        if (Math.abs(e.clientX - drag._downX) > 6 || Math.abs(e.clientY - drag._downY) > 6) drag._moved = true;
        drag.x = e.clientX; drag.y = e.clientY;
      }
    });
    window.addEventListener('mouseup', function () {
      if (drag) {
        var wasClick = !drag._moved && (Date.now() - drag._downT) < 350;
        drag.dragging = false;
        var s = drag; drag = null;
        canvas.style.cursor = 'grab';
        if (wasClick) handleClick(s);
      }
    });
  }

  function unmount() {
    if (raf) cancelAnimationFrame(raf);
    raf = null;
    if (canvas && canvas.parentNode) canvas.parentNode.removeChild(canvas);
    canvas = null; ctx = null;
  }

  /* park the crowd while a game screen is up, restore it when the visitor
     leaves - resume still honours a count of 0, so it never overrides the
     sidebar control. */
  function suppress() {
    suppressed = true;
    unmount();
  }
  function resume() {
    suppressed = false;
    if (cfg.count > 0 && !canvas) { mountCanvas(); initStickmen(); }
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
      if (cfg.count === 0 || suppressed) { unmount(); } else { if (!canvas) mountCanvas(); initStickmen(); }
    }
    countInp.addEventListener('input', rebuild);
    speedInp.addEventListener('input', rebuild);

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
      if (visible) { if (!suppressed) { mountCanvas(); initStickmen(); } toggle.textContent = 'Hide Stickmen'; }
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

  window.Stickmen = { mount: mountCanvas, unmount: unmount, init: initStickmen, suppress: suppress, resume: resume };
})();
