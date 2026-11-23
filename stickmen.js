/* =====================================================================
   INTERACTIVE COLORED STICKMEN  (Desktop Mate style)
   ---------------------------------------------------------------------
   Lightweight Canvas 2D stickmen with:
     - 5s startup delay, 2 stickmen by default
     - 11 random entry animations
     - idle/social behaviors (sit, sleep, look up/down, spar)
     - exit animations with goodbye messages
     - sidebar: Count, Size (4 levels), Custom color, Hide/Show
   ===================================================================== */
(function () {
  'use strict';

  var COLORS = ['#ff4d7d', '#4dd4ac', '#7a8cff', '#ffd93d', '#ff9f43', '#b388ff'];
  var ENTRY_TYPES = ['rope','ladder','heli','swing','failrope','parachute','bungee','slipslide','smoke','jetpack','peekpop'];
  var IDLE_STATES = ['happy','run','jump','laugh','angry','sad','sleep','sit','cooperate','lookup','lookdown','spar'];
  var BUBBLES = {
    happy: ['hi!', 'yay!', ':D', 'nice!'],
    laugh: ['haha!', 'lol', 'XD', 'hehe'],
    jump: ['boing!', 'up!', 'wheee'],
    run: ['zoom!', 'fast!', 'go go'],
    angry: ['grr!', 'hmph!', 'ugh'],
    sad: ['...', 'oh', ':(', 'meh'],
    sleep: ['Zzz', 'zZz', 'zzZ'],
    sit: ['*sit*', 'phew', 'resting'],
    cooperate: ['team!', 'together!', 'high five!'],
    lookup: ['up there!', 'oh?'],
    lookdown: ['down here', 'hmm'],
    spar: ['hiya!', 'en garde!', 'clash!']
  };
  var CLICK1 = ['hey!', "what's up?", 'yo!', 'sup?', 'hola!'];
  var CLICK2 = ['stop poking!', 'again?!', 'ouch!', 'hey!', 'not again!'];
  var GOODBYE = ['Bye!', 'See ya!', 'Later!', 'Ciao!', 'Adios!'];
  var LS_KEY = 'stickmen_cfg_v3';

  var canvas = null, ctx = null;
  var stickmen = [];
  var raf = null;
  var cfg = { count: 2, colors: COLORS.slice(0, 2), size: 2 };
  var drag = null;
  var mouse = { x: -1000, y: -1000 };
  var suppressed = false;
  var started = false;
  var exiting = false;

  var SIZE_SCALE = { 1: 0.7, 2: 1.0, 3: 1.3, 4: 1.6 };

  function loadCfg() {
    try {
      var c = JSON.parse(localStorage.getItem(LS_KEY) || 'null');
      if (c) {
        if (typeof c.count === 'number') cfg.count = c.count;
        if (Array.isArray(c.colors) && c.colors.length) cfg.colors = c.colors;
        if (typeof c.size === 'number') cfg.size = c.size;
      }
    } catch (e) {}
  }
  function saveCfg() {
    try { localStorage.setItem(LS_KEY, JSON.stringify(cfg)); } catch (e) {}
  }

  function makeStickman(i, entryType) {
    var col = cfg.colors[i % cfg.colors.length];
    return {
      x: 60 + i * 40,
      y: -60,
      vx: (Math.random() - 0.5) * 2,
      vy: 0,
      color: col,
      state: 'happy',
      stateTimer: 60 + Math.random() * 120,
      bubble: null,
      bubbleTimer: 0,
      target: null,
      dragging: false,
      onGround: false,
      dead: false,
      clicks: 0,
      _downX: 0, _downY: 0, _downT: 0, _moved: false,
      legPhase: Math.random() * Math.PI * 2,
      armPhase: Math.random() * Math.PI * 2,
      scale: 0.9 + Math.random() * 0.2,
      homeX: 60 + i * 40,
      entry: { type: entryType || ENTRY_TYPES[Math.floor(Math.random() * ENTRY_TYPES.length)], t: 0, done: false },
      exiting: false,
      exitT: 0,
      exitMsg: null,
      prop: null
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
      if (o === s || o.dead || o.exiting) continue;
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
      if (s.dead) {
        s.vy += 0.5;
        s.y += s.vy;
        if (s.y >= groundY) { s.y = groundY; s.vy = 0; }
        if (s.bubbleTimer > 0) s.bubbleTimer--;
        return;
      }

      /* exiting animation */
      if (s.exiting) {
        s.exitT += 0.02;
        if (s.exitT >= 1) {
          s.dead = true;
          s.state = 'dead';
          s.vy = 0;
          s.vx = 0;
          if (s.bubbleTimer > 0) s.bubbleTimer--;
          return;
        }
        if (s.bubbleTimer > 0) s.bubbleTimer--;
        return;
      }

      /* entry animation */
      if (s.entry && !s.entry.done) {
        s.entry.t += 0.015;
        if (s.entry.t >= 1) { s.entry.done = true; s.entry = null; s.onGround = true; s.y = groundY; }
        if (s.bubbleTimer > 0) s.bubbleTimer--;
        return;
      }

      s.stateTimer--;
      if (s.stateTimer <= 0) {
        var ns = IDLE_STATES[Math.floor(Math.random() * IDLE_STATES.length)];
        setState(s, ns);
      }
      if (s.bubbleTimer > 0) s.bubbleTimer--;

      var sp = 1.0;
      if (s.state === 'run') { s.vx = (Math.random() > 0.5 ? 1 : -1) * (1.5 + Math.random()) * sp; }
      else if (s.state === 'happy') { s.vx *= 0.9; s.vy = -3 * Math.sin(s.legPhase); }
      else if (s.state === 'jump') { if (s.onGround) { s.vy = -8 * sp; s.onGround = false; } s.vx *= 0.95; }
      else if (s.state === 'laugh') { s.vx *= 0.8; }
      else if (s.state === 'angry') { s.vx = (Math.random() > 0.5 ? 1 : -1) * 2.5 * sp; }
      else if (s.state === 'sad') { s.vx *= 0.92; }
      else if (s.state === 'sleep' || s.state === 'sit') { s.vx *= 0.8; }
      else if (s.state === 'cooperate') {
        var mate = nearestOther(s);
        if (mate) {
          var dx = mate.x - s.x;
          if (Math.abs(dx) > 46) { s.vx += (dx > 0 ? 0.28 : -0.28) * sp; s.vx = Math.max(-3, Math.min(3, s.vx)); }
          else { s.vx *= 0.8; if (Math.random() < 0.02) { s.bubble = (BUBBLES.cooperate)[Math.floor(Math.random() * BUBBLES.cooperate.length)]; s.bubbleTimer = 70; } }
        } else { s.vx *= 0.9; }
      }
      else if (s.state === 'lookup') { s.vx *= 0.85; }
      else if (s.state === 'lookdown') { s.vx *= 0.85; }
      else if (s.state === 'spar') {
        var mate2 = nearestOther(s);
        if (mate2) {
          var dx2 = mate2.x - s.x;
          if (Math.abs(dx2) > 50) { s.vx += (dx2 > 0 ? 0.35 : -0.35) * sp; s.vx = Math.max(-3, Math.min(3, s.vx)); }
          else { s.vx *= 0.8; if (Math.random() < 0.03) { s.bubble = (BUBBLES.spar)[Math.floor(Math.random() * BUBBLES.spar.length)]; s.bubbleTimer = 60; } }
        } else { s.vx *= 0.9; }
      }

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
    if (s.state === 'sleep') {
      ctx.strokeStyle = '#000'; ctx.lineWidth = 1.3; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(-5, -40); ctx.lineTo(-1, -40); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(1, -40); ctx.lineTo(5, -40); ctx.stroke();
      return;
    }
    if (s.dead) {
      ctx.strokeStyle = '#000'; ctx.lineWidth = 1.4; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(-5, -42); ctx.lineTo(-1, -38); ctx.moveTo(-1, -42); ctx.lineTo(-5, -38); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(1, -42); ctx.lineTo(5, -38); ctx.moveTo(5, -42); ctx.lineTo(1, -38); ctx.stroke();
      return;
    }
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(-3, -40, 2.2, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(3, -40, 2.2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.arc(-3, -40, 1.1, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(3, -40, 1.1, 0, Math.PI * 2); ctx.fill();
  }

  function drawEntry(s) {
    var e = s.entry;
    if (!e) return false;
    var t = e.t;
    var col = s.color;
    ctx.save();
    ctx.translate(s.x, 0);
    var groundY = window.innerHeight - 40;
    var y = groundY * (1 - t) * 0.3 - 60 + groundY * t * 0.8;
    s.y = groundY;
    ctx.translate(0, y);

    if (e.type === 'rope') {
      ctx.strokeStyle = '#8b5a2b'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(0, -200); ctx.lineTo(0, 0); ctx.stroke();
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(0, -38, 9, 0, Math.PI * 2); ctx.fill();
      if (t > 0.8) { ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, -22); ctx.lineTo(-12, -30); ctx.stroke(); }
    } else if (e.type === 'ladder') {
      ctx.strokeStyle = '#8b5a2b'; ctx.lineWidth = 2;
      for (var i = 0; i < 5; i++) { ctx.beginPath(); ctx.moveTo(-8, -180 + i * 40); ctx.lineTo(8, -180 + i * 40); ctx.stroke(); }
      ctx.beginPath(); ctx.moveTo(-8, -200); ctx.lineTo(-8, 0); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(8, -200); ctx.lineTo(8, 0); ctx.stroke();
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(0, -38, 9, 0, Math.PI * 2); ctx.fill();
    } else if (e.type === 'heli') {
      ctx.fillStyle = '#888'; ctx.beginPath(); ctx.arc(0, -55, 6, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#666'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(-12, -55); ctx.lineTo(12, -55); ctx.stroke();
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(0, -38, 9, 0, Math.PI * 2); ctx.fill();
      if (t > 0.9) { ctx.globalAlpha = 1 - (t - 0.9) * 10; }
    } else if (e.type === 'swing') {
      ctx.strokeStyle = '#8b5a2b'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(-10, -200); ctx.lineTo(-10, 0); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(10, -200); ctx.lineTo(10, 0); ctx.stroke();
      ctx.fillStyle = '#8b5a2b'; ctx.fillRect(-12, -4, 24, 6);
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(0, -38, 9, 0, Math.PI * 2); ctx.fill();
    } else if (e.type === 'failrope') {
      if (t < 0.4) {
        ctx.strokeStyle = '#8b5a2b'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(0, -200); ctx.lineTo(0, 0); ctx.stroke();
        ctx.fillStyle = col; ctx.beginPath(); ctx.arc(0, -38, 9, 0, Math.PI * 2); ctx.fill();
      } else {
        ctx.fillStyle = col; ctx.beginPath(); ctx.arc(0, -38, 9, 0, Math.PI * 2); ctx.fill();
        if (t < 0.7) { ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(0, -20, 12, 0, Math.PI); ctx.stroke(); }
      }
    } else if (e.type === 'parachute') {
      ctx.fillStyle = 'rgba(255,255,255,.8)'; ctx.beginPath(); ctx.arc(0, -60, 20, Math.PI, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#ccc'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(-20, -60); ctx.lineTo(0, -38); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(20, -60); ctx.lineTo(0, -38); ctx.stroke();
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(0, -38, 9, 0, Math.PI * 2); ctx.fill();
      if (t > 0.85) { ctx.globalAlpha = 0.7; }
    } else if (e.type === 'bungee') {
      var bounce = Math.sin(t * Math.PI * 4) * 30 * (1 - t);
      ctx.strokeStyle = '#ff4d7d'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(0, -200); ctx.lineTo(0, bounce - 40); ctx.stroke();
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(0, bounce - 58, 9, 0, Math.PI * 2); ctx.fill();
    } else if (e.type === 'slipslide') {
      ctx.fillStyle = '#8b5a2b'; ctx.fillRect(-60, 0, 120, 8);
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(t * 80 - 40, -38, 9, 0, Math.PI * 2); ctx.fill();
    } else if (e.type === 'smoke') {
      if (t < 0.3) {
        ctx.fillStyle = 'rgba(200,200,200,.6)'; ctx.beginPath(); ctx.arc(0, -30, 25, 0, Math.PI * 2); ctx.fill();
      } else {
        ctx.fillStyle = col; ctx.beginPath(); ctx.arc(0, -38, 9, 0, Math.PI * 2); ctx.fill();
        if (t < 0.5) { ctx.fillStyle = 'rgba(200,200,200,.4)'; ctx.beginPath(); ctx.arc(0, -30, 15, 0, Math.PI * 2); ctx.fill(); }
      }
    } else if (e.type === 'jetpack') {
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(0, -38, 9, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ff6b35'; ctx.beginPath(); ctx.arc(0, -25, 4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,100,0,.6)'; ctx.beginPath(); ctx.arc(0, -20, 6, 0, Math.PI * 2); ctx.fill();
    } else if (e.type === 'peekpop') {
      if (t < 0.5) {
        ctx.fillStyle = col; ctx.beginPath(); ctx.arc(-20, -38, 9, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(-23, -40, 2.2, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(-17, -40, 2.2, 0, Math.PI * 2); ctx.fill();
      } else {
        ctx.fillStyle = col; ctx.beginPath(); ctx.arc(0, -38, 9, 0, Math.PI * 2); ctx.fill();
      }
    }

    ctx.restore();
    return true;
  }

  function drawStickman(s) {
    var sizeScale = SIZE_SCALE[cfg.size] || 1.0;
    ctx.save();
    ctx.translate(s.x, s.y);
    if (s.dead) { ctx.rotate(Math.PI / 2); }
    ctx.scale(s.scale * sizeScale, s.scale * sizeScale);
    var col = s.color;

    if (s.entry && !s.entry.done) {
      if (drawEntry(s)) { ctx.restore(); return; }
    }

    if (s.exiting) {
      var et = s.exitT;
      ctx.globalAlpha = 1 - et;
      if (s.exitMsg === 'heli') {
        ctx.fillStyle = '#888'; ctx.beginPath(); ctx.arc(0, -55 - et * 80, 6, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#666'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(-12, -55 - et * 80); ctx.lineTo(12, -55 - et * 80); ctx.stroke();
      }
      if (s.exitMsg === 'swing') {
        ctx.strokeStyle = '#8b5a2b'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(-10, -200 + et * 200); ctx.lineTo(-10, -et * 200); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(10, -200 + et * 200); ctx.lineTo(10, -et * 200); ctx.stroke();
      }
      if (s.exitMsg === 'bye') {
        ctx.translate(et * 100, 0);
      }
    }

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
    if (s.state === 'sit' || s.state === 'sleep') {
      ctx.beginPath(); ctx.moveTo(0, -22); ctx.lineTo(-11, -6); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, -22); ctx.lineTo(11, -6); ctx.stroke();
    } else {
      ctx.beginPath(); ctx.moveTo(0, -22); ctx.lineTo(-12, -16 + armSwing * 8); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, -22); ctx.lineTo(12, -16 - armSwing * 8); ctx.stroke();
    }

    /* legs */
    var legSwing = Math.sin(s.legPhase) * 0.8;
    if (s.state === 'sit' || s.state === 'sleep') {
      ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(-11, -2); ctx.lineTo(-11, 12); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(11, -2); ctx.lineTo(11, 12); ctx.stroke();
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

    /* goodbye message */
    if (s.exiting && s.exitMsg === 'bye' && s.bubble) {
      ctx.save();
      ctx.font = 'bold 13px "Rajdhani", sans-serif';
      var gtxt = s.bubble;
      var gbw = ctx.measureText(gtxt).width + 14;
      var gbx = s.x - gbw / 2, gby = s.y - 60;
      ctx.fillStyle = 'rgba(255,255,255,.92)';
      ctx.strokeStyle = col;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      if (ctx.roundRect) { ctx.roundRect(gbx, gby, gbw, 22, 8); }
      else { ctx.rect(gbx, gby, gbw, 22); }
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = col;
      ctx.textAlign = 'center';
      ctx.fillText(gtxt, s.x, gby + 15);
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

  function handleClick(s) {
    if (s.dead || s.exiting) return;
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
        if (Math.sqrt(dx * dx + dy * dy) < 28 * s.scale * (SIZE_SCALE[cfg.size] || 1)) {
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
          '<label>Size <input type="range" min="1" max="4" value="' + cfg.size + '" id="smSize"></label>' +
          '<span id="smSizeVal">Level ' + cfg.size + '</span>' +
        '</div>' +
        '<div class="sm-ctrl-row sm-ctrl-colors">' +
          cfg.colors.map(function (c, i) { return '<button class="sm-color" data-i="' + i + '" style="background:' + c + '"></button>'; }).join('') +
          '<button class="sm-color sm-color--custom" id="smCustomColor" title="Custom color">+</button>' +
        '</div>' +
        '<input type="color" id="smColorPicker" style="display:none">' +
        '<button type="button" class="sm-toggle" id="smToggle">Hide Stickmen</button>' +
      '</div>';
    sideNav.appendChild(li);

    var countInp = document.getElementById('smCount');
    var countVal = document.getElementById('smCountVal');
    var sizeInp = document.getElementById('smSize');
    var sizeVal = document.getElementById('smSizeVal');
    var toggle = document.getElementById('smToggle');
    var customBtn = document.getElementById('smCustomColor');
    var colorPicker = document.getElementById('smColorPicker');

    function rebuild() {
      cfg.count = parseInt(countInp.value, 10);
      cfg.size = parseInt(sizeInp.value, 10);
      countVal.textContent = cfg.count;
      sizeVal.textContent = 'Level ' + cfg.size;
      saveCfg();
      if (cfg.count === 0 || suppressed) { unmount(); } else { if (!canvas) mountCanvas(); initStickmen(); }
    }
    countInp.addEventListener('input', rebuild);
    sizeInp.addEventListener('input', rebuild);

    li.querySelectorAll('.sm-color').forEach(function (btn) {
      if (btn.id === 'smCustomColor') return;
      btn.addEventListener('click', function () {
        var i = parseInt(btn.getAttribute('data-i'), 10);
        var idx = COLORS.indexOf(cfg.colors[i]) + 1;
        cfg.colors[i] = COLORS[idx % COLORS.length];
        btn.style.background = cfg.colors[i];
        saveCfg();
        stickmen.forEach(function (s, k) { if (k % cfg.colors.length === i) s.color = cfg.colors[i]; });
      });
    });

    if (customBtn && colorPicker) {
      customBtn.addEventListener('click', function () { colorPicker.click(); });
      colorPicker.addEventListener('input', function () {
        var newColor = colorPicker.value;
        cfg.colors.push(newColor);
        if (cfg.colors.length > 8) cfg.colors.shift();
        saveCfg();
        /* add a new color swatch */
        var swatch = document.createElement('button');
        swatch.className = 'sm-color';
        swatch.style.background = newColor;
        swatch.addEventListener('click', function () {
          var i = cfg.colors.indexOf(newColor);
          if (i >= 0) {
            var idx = COLORS.indexOf(cfg.colors[i]) + 1;
            cfg.colors[i] = COLORS[idx % COLORS.length] || newColor;
            swatch.style.background = cfg.colors[i];
            saveCfg();
          }
        });
        li.querySelector('.sm-ctrl-colors').insertBefore(swatch, customBtn);
        stickmen.forEach(function (s) { if (Math.random() < 0.3) s.color = newColor; });
      });
    }

    var visible = true;
    toggle.addEventListener('click', function () {
      visible = !visible;
      if (visible) {
        if (!suppressed) { mountCanvas(); initStickmen(); }
        toggle.textContent = 'Hide Stickmen';
        /* close sidebar immediately */
        var sidebar = document.querySelector('.side-nav, nav.side-nav');
        if (sidebar && sidebar.classList.contains('open')) sidebar.classList.remove('open');
      } else {
        /* exit animations */
        exiting = true;
        stickmen.forEach(function (s) {
          s.exiting = true;
          s.exitT = 0;
          s.exitMsg = GOODBYE[Math.floor(Math.random() * GOODBYE.length)];
          var r = Math.random();
          if (r < 0.33) s.exitMsg = 'bye';
          else if (r < 0.66) s.exitMsg = 'heli';
          else s.exitMsg = 'swing';
          s.bubble = GOODBYE[Math.floor(Math.random() * GOODBYE.length)];
          s.bubbleTimer = 120;
        });
        toggle.textContent = 'Show Stickmen';
        setTimeout(function () {
          unmount();
          exiting = false;
        }, 1500);
        /* close sidebar immediately */
        var sidebar2 = document.querySelector('.side-nav, nav.side-nav');
        if (sidebar2 && sidebar2.classList.contains('open')) sidebar2.classList.remove('open');
      }
    });
  }

  function boot() {
    loadCfg();
    if (cfg.count > 0) {
      setTimeout(function () {
        if (!suppressed) { mountCanvas(); initStickmen(); }
        started = true;
      }, 5000);
    }
    mountControls();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  window.Stickmen = { mount: mountCanvas, unmount: unmount, init: initStickmen, suppress: suppress, resume: resume };
})();
