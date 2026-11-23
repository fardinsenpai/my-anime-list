/* =====================================================================
   INTERACTIVE COLORED STICKMEN  (Desktop Mate style)
   ---------------------------------------------------------------------
   Lightweight Canvas 2D stickmen with:
     - 5s startup delay, 2 stickmen by default
     - 11 random entry animations (full stickman + props)
     - idle/social behaviors (sit, sleep, look up/down, spar)
     - exit animations with goodbye messages
     - sidebar: Count, Size (4 levels), Custom color, Hide/Show
   ===================================================================== */
(function () {
  'use strict';

  var COLORS = ['#ff4d4d', '#3ddc84', '#ff9f43', '#4da6ff', '#ffd93d'];
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
  var LS_KEY = 'stickmen_cfg_v4';

  var canvas = null, ctx = null;
  var stickmen = [];
  var raf = null;
  var cfg = { count: 5, colors: COLORS.slice(0, 5), size: 2 };
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
      x: 80 + i * 60,
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
      homeX: 80 + i * 60,
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

  /* ---------- entry animation drawing ---------- */
  /* Draws a full stickman body at origin with given pose. Props drawn by caller. */
  function drawBody(col, pose, sizeScale, phase) {
    phase = phase || 0;
    ctx.save();
    ctx.scale(sizeScale, sizeScale);
    /* head */
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.arc(0, -38, 9, 0, Math.PI * 2); ctx.fill();
    /* eyes */
    if (pose === 'sleep') {
      ctx.strokeStyle = '#000'; ctx.lineWidth = 1.3; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(-5, -40); ctx.lineTo(-1, -40); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(1, -40); ctx.lineTo(5, -40); ctx.stroke();
    } else if (pose === 'shocked' || pose === 'peek') {
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(-3, -40, 2.6, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(3, -40, 2.6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#000';
      ctx.beginPath(); ctx.arc(-3, -40, 1.3, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(3, -40, 1.3, 0, Math.PI * 2); ctx.fill();
    } else if (pose === 'dead') {
      ctx.strokeStyle = '#000'; ctx.lineWidth = 1.4; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(-5, -42); ctx.lineTo(-1, -38); ctx.moveTo(-1, -42); ctx.lineTo(-5, -38); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(1, -42); ctx.lineTo(5, -38); ctx.moveTo(5, -42); ctx.lineTo(1, -38); ctx.stroke();
    } else {
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(-3, -40, 2.2, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(3, -40, 2.2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#000';
      ctx.beginPath(); ctx.arc(-3, -40, 1.1, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(3, -40, 1.1, 0, Math.PI * 2); ctx.fill();
    }
    /* mouth */
    ctx.strokeStyle = '#000'; ctx.lineWidth = 1.3; ctx.lineCap = 'round';
    ctx.beginPath();
    if (pose === 'happy' || pose === 'laugh') { ctx.arc(0, -35, 4, 0.2, Math.PI - 0.2); }
    else if (pose === 'sad' || pose === 'dead') { ctx.arc(0, -30, 4, Math.PI + 0.2, Math.PI * 2 - 0.2); }
    else if (pose === 'angry') { ctx.moveTo(-4, -33); ctx.lineTo(4, -33); }
    else if (pose === 'sleep') { ctx.arc(0, -33, 1.6, 0, Math.PI * 2); }
    else if (pose === 'shocked') { ctx.arc(0, -32, 3, 0, Math.PI * 2); }
    else if (pose === 'cough') { ctx.moveTo(-3, -33); ctx.lineTo(3, -31); }
    else { ctx.moveTo(-3, -33); ctx.lineTo(3, -33); }
    ctx.stroke();

    /* body */
    ctx.strokeStyle = col; ctx.lineWidth = 2.6;
    if (pose === 'fall' || pose === 'tumble') {
      ctx.beginPath(); ctx.moveTo(-12, -29); ctx.lineTo(12, -8); ctx.stroke();
    } else if (pose === 'sit') {
      ctx.beginPath(); ctx.moveTo(0, -29); ctx.lineTo(0, -12); ctx.stroke();
    } else {
      ctx.beginPath(); ctx.moveTo(0, -29); ctx.lineTo(0, -8); ctx.stroke();
    }

    /* arms */
    if (pose === 'climb') {
      ctx.beginPath(); ctx.moveTo(0, -24); ctx.lineTo(-14, -34); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, -24); ctx.lineTo(14, -34); ctx.stroke();
    } else if (pose === 'sit') {
      ctx.beginPath(); ctx.moveTo(0, -22); ctx.lineTo(-11, -6); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, -22); ctx.lineTo(11, -6); ctx.stroke();
    } else if (pose === 'rubhead') {
      ctx.beginPath(); ctx.moveTo(0, -24); ctx.lineTo(-6, -36); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, -24); ctx.lineTo(12, -18); ctx.stroke();
    } else if (pose === 'scratchhead') {
      var sw = Math.sin(phase * 12) * 2;
      ctx.beginPath(); ctx.moveTo(0, -24); ctx.lineTo(-4 + sw, -38); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, -24); ctx.lineTo(12, -18); ctx.stroke();
    } else if (pose === 'shocked' || pose === 'peek') {
      ctx.beginPath(); ctx.moveTo(0, -24); ctx.lineTo(-14, -20); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, -24); ctx.lineTo(14, -20); ctx.stroke();
    } else if (pose === 'fall' || pose === 'tumble') {
      ctx.beginPath(); ctx.moveTo(-12, -22); ctx.lineTo(-20, -30); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-12, -22); ctx.lineTo(-4, -12); ctx.stroke();
    } else if (pose === 'cough') {
      ctx.beginPath(); ctx.moveTo(0, -22); ctx.lineTo(-8, -14); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, -22); ctx.lineTo(8, -14); ctx.stroke();
    } else {
      var as = Math.sin(phase * 4) * 0.6;
      ctx.beginPath(); ctx.moveTo(0, -22); ctx.lineTo(-12, -16 + as * 8); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, -22); ctx.lineTo(12, -16 - as * 8); ctx.stroke();
    }

    /* legs */
    if (pose === 'sit') {
      ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(-11, -2); ctx.lineTo(-11, 12); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(11, -2); ctx.lineTo(11, 12); ctx.stroke();
    } else if (pose === 'fall' || pose === 'tumble') {
      ctx.beginPath(); ctx.moveTo(-12, -8); ctx.lineTo(-22, 0); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-12, -8); ctx.lineTo(-4, 4); ctx.stroke();
    } else if (pose === 'climb') {
      ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(-10, 4); ctx.lineTo(-6, 14); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(10, 4); ctx.lineTo(6, 14); ctx.stroke();
    } else {
      var ls = Math.sin(phase * 4) * 0.8;
      ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(-8 + ls * 6, 12); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(8 - ls * 6, 12); ctx.stroke();
    }
    ctx.restore();
  }

  function drawEntry(s, sizeScale) {
    var e = s.entry;
    if (!e) return false;
    var t = e.t;
    var col = s.color;
    var groundY = window.innerHeight - 40;
    var topY = -50;
    var sy = groundY; /* stickman y (canvas px) */
    ctx.save();

    /* helper: draw props at pixel scale (unscaled) */
    function prop(fn) { ctx.save(); var inv = 1 / (s.scale * sizeScale); ctx.scale(inv, inv); fn(); ctx.restore(); }

    if (e.type === 'rope') {
      /* rope drops, stickman climbs, signals, rope retracts */
      var ropeTop = -120;
      var ropeBot;
      if (t < 0.25) {
        ropeBot = topY + (groundY - topY) * (t / 0.25) * 0.3;
      } else if (t < 0.7) {
        ropeBot = groundY;
      } else {
        ropeBot = groundY - (groundY - topY) * ((t - 0.7) / 0.3);
      }
      sy = (t < 0.25) ? (topY + (groundY - topY) * (t / 0.25) * 0.3) : (t < 0.7 ? groundY : groundY);
      /* stickman climbs: y descends 0.25-0.7 */
      if (t >= 0.25 && t < 0.7) {
        var pt = (t - 0.25) / 0.45;
        sy = topY + (groundY - topY) * pt;
      }
      prop(function () {
        ctx.strokeStyle = '#8b5a2b'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(s.x, ropeTop); ctx.lineTo(s.x, Math.max(ropeTop, ropeBot)); ctx.stroke();
      });
      ctx.translate(s.x, sy);
      var pose = (t >= 0.7 && t < 0.85) ? 'shocked' : 'climb';
      drawBody(col, pose, s.scale * sizeScale, t);
      if (t >= 0.7 && t < 0.85) {
        /* signal up: arm wave already in shocked; bubble */
        if (s.bubbleTimer <= 0) { s.bubble = 'up!'; s.bubbleTimer = 40; }
      }
    } else if (e.type === 'ladder') {
      var ladderX = s.x;
      /* ladder drops 0-0.2, climb 0.2-0.6, nod 0.6-0.75, climb up 0.75-1 */
      var ly;
      if (t < 0.2) { ly = topY; }
      else if (t < 0.6) { var pt = (t - 0.2) / 0.4; ly = topY + (groundY - topY) * pt; }
      else if (t < 0.75) { ly = groundY; }
      else { var pt2 = (t - 0.75) / 0.25; ly = groundY - (groundY - topY) * pt2; }
      sy = ly;
      prop(function () {
        ctx.strokeStyle = '#8b5a2b'; ctx.lineWidth = 2;
        var lx = s.x;
        var top = topY, bot = groundY;
        ctx.beginPath(); ctx.moveTo(lx - 8, top); ctx.lineTo(lx - 8, bot); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(lx + 8, top); ctx.lineTo(lx + 8, bot); ctx.stroke();
        for (var i = 0; i < 7; i++) {
          var ry = top + (bot - top) * (i / 6);
          ctx.beginPath(); ctx.moveTo(lx - 8, ry); ctx.lineTo(lx + 8, ry); ctx.stroke();
        }
      });
      ctx.translate(s.x, sy);
      var lpose = (t >= 0.6 && t < 0.75) ? 'happy' : 'climb';
      drawBody(col, lpose, s.scale * sizeScale, t);
    } else if (e.type === 'heli') {
      /* helicopter lowers 0-0.7, lands, flies off right 0.7-1 */
      var hy;
      if (t < 0.7) { hy = topY + (groundY - topY) * (t / 0.7); }
      else { hy = groundY; }
      sy = hy;
      var hx = (t >= 0.7) ? s.x + (t - 0.7) / 0.3 * 200 : s.x;
      var heliY = hy - 22;
      var heliX = (t >= 0.7) ? hx : s.x;
      prop(function () {
        ctx.fillStyle = '#888'; ctx.beginPath(); ctx.arc(heliX, heliY, 6, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#666'; ctx.lineWidth = 1;
        var spin = t * 20;
        ctx.save(); ctx.translate(heliX, heliY); ctx.rotate(spin);
        ctx.beginPath(); ctx.moveTo(-14, 0); ctx.lineTo(14, 0); ctx.stroke();
        ctx.restore();
        /* string */
        ctx.strokeStyle = '#999'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(heliX, heliY + 6); ctx.lineTo(hx, hy - 10); ctx.stroke();
      });
      ctx.translate(hx, sy);
      drawBody(col, (t >= 0.7) ? 'shocked' : 'stand', s.scale * sizeScale, t);
      if (t >= 0.85) { ctx.globalAlpha = 1 - (t - 0.85) * 6.67; }
    } else if (e.type === 'swing') {
      /* swing drops 0-0.25, lowers 0.25-0.7, disembark 0.7-0.85, swing retracts 0.85-1 */
      var swingY;
      if (t < 0.25) { swingY = topY; }
      else if (t < 0.7) { var pt = (t - 0.25) / 0.45; swingY = topY + (groundY - topY) * pt; }
      else { swingY = groundY; }
      sy = (t < 0.7) ? swingY : groundY;
      var seatY = swingY + 4;
      prop(function () {
        ctx.strokeStyle = '#8b5a2b'; ctx.lineWidth = 2;
        var top = topY;
        ctx.beginPath(); ctx.moveTo(s.x - 10, top); ctx.lineTo(s.x - 10, seatY); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(s.x + 10, top); ctx.lineTo(s.x + 10, seatY); ctx.stroke();
        ctx.fillStyle = '#8b5a2b'; ctx.fillRect(s.x - 12, seatY - 3, 24, 6);
      });
      ctx.translate(s.x, sy);
      var spose = (t < 0.7) ? 'sit' : 'stand';
      drawBody(col, spose, s.scale * sizeScale, t);
    } else if (e.type === 'failrope') {
      /* rope 0-0.3 climb, snap 0.3-0.45 fall, rub 0.45-0.7, fix 0.7-1 */
      var fy;
      if (t < 0.3) { fy = topY + (groundY - topY) * (t / 0.3); }
      else if (t < 0.45) { fy = groundY; }
      else { fy = groundY; }
      sy = fy;
      if (t < 0.3) {
        prop(function () {
          ctx.strokeStyle = '#8b5a2b'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(s.x, topY); ctx.lineTo(s.x, fy); ctx.stroke();
        });
      } else if (t < 0.45) {
        /* snapped rope dangling */
        prop(function () {
          ctx.strokeStyle = '#8b5a2b'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(s.x, topY); ctx.lineTo(s.x, topY + 40); ctx.stroke();
        });
      }
      ctx.translate(s.x, sy);
      var fpose = (t < 0.3) ? 'climb' : (t < 0.45) ? 'fall' : (t < 0.7) ? 'rubhead' : 'stand';
      drawBody(col, fpose, s.scale * sizeScale, t);
      if (t >= 0.45 && t < 0.7 && s.bubbleTimer <= 0) { s.bubble = 'ouch!'; s.bubbleTimer = 40; }
    } else if (e.type === 'parachute') {
      /* descend 0-0.7, snag 0.7-0.8, thud 0.8-0.9, scratch 0.9-1 */
      var py;
      if (t < 0.7) { py = topY + (groundY - topY) * (t / 0.7); }
      else { py = groundY; }
      sy = py;
      var snag = (t >= 0.7 && t < 0.8);
      var chuteY = py - 30 - (snag ? 10 : 0);
      prop(function () {
        ctx.fillStyle = snag ? 'rgba(255,255,255,.5)' : 'rgba(255,255,255,.85)';
        ctx.beginPath(); ctx.arc(s.x, chuteY, 22, Math.PI, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#ccc'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(s.x - 22, chuteY); ctx.lineTo(s.x, py - 10); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(s.x + 22, chuteY); ctx.lineTo(s.x, py - 10); ctx.stroke();
      });
      ctx.translate(s.x, sy);
      var ppose = (t < 0.7) ? 'stand' : (t < 0.8) ? 'shocked' : (t < 0.9) ? 'fall' : 'scratchhead';
      drawBody(col, ppose, s.scale * sizeScale, t);
      if (t >= 0.8 && t < 0.9 && s.bubbleTimer <= 0) { s.bubble = 'thud!'; s.bubbleTimer = 30; }
    } else if (e.type === 'bungee') {
      /* bungee: drop with bounce, 2-3 bounces */
      var by2 = topY + (groundY - topY) * Math.min(1, t * 1.4);
      var bounce = Math.sin(t * Math.PI * 5) * 40 * (1 - t);
      by2 = Math.min(groundY, by2 + bounce * (t > 0.3 ? 0.5 : 1));
      if (t > 0.85) by2 = groundY;
      sy = by2;
      prop(function () {
        ctx.strokeStyle = '#ff4d7d'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(s.x, topY); ctx.lineTo(s.x, by2); ctx.stroke();
      });
      ctx.translate(s.x, sy);
      drawBody(col, (Math.abs(bounce) > 5) ? 'shocked' : 'stand', s.scale * sizeScale, t);
    } else if (e.type === 'slipslide') {
      /* ramp 0-1, slide then slip midway, tumble */
      var rampTop = topY, rampBot = groundY;
      prop(function () {
        ctx.fillStyle = '#8b5a2b';
        ctx.beginPath();
        ctx.moveTo(s.x - 80, rampTop + 20);
        ctx.lineTo(s.x + 80, rampBot);
        ctx.lineTo(s.x + 80, rampBot + 8);
        ctx.lineTo(s.x - 80, rampTop + 28);
        ctx.closePath();
        ctx.fill();
      });
      var sx;
      if (t < 0.4) {
        sx = s.x - 60 + 120 * (t / 0.4);
        sy = rampTop + 20 + (rampBot - rampTop - 20) * (t / 0.4);
      } else if (t < 0.6) {
        sx = s.x + (t - 0.4) / 0.2 * 20;
        sy = rampTop + 20 + (rampBot - rampTop - 20) * (0.4 + (t - 0.4) / 0.2 * 0.3);
      } else {
        var pt = (t - 0.6) / 0.4;
        sx = s.x + 20 + 40 * pt;
        sy = rampTop + 20 + (rampBot - rampTop - 20) * (0.7 + pt * 0.3);
      }
      ctx.translate(sx, sy);
      var sslpose = (t < 0.4) ? 'stand' : (t < 0.6) ? 'fall' : 'tumble';
      drawBody(col, sslpose, s.scale * sizeScale, t);
      if (t >= 0.4 && t < 0.6 && s.bubbleTimer <= 0) { s.bubble = 'whoa!'; s.bubbleTimer = 30; }
    } else if (e.type === 'smoke') {
      /* smoke puff 0-0.3, emerge 0.3-1 coughing */
      sy = groundY;
      prop(function () {
        var alpha = (t < 0.3) ? 0.7 : Math.max(0, 0.7 - (t - 0.3) * 1.0);
        ctx.fillStyle = 'rgba(200,200,200,' + alpha + ')';
        ctx.beginPath(); ctx.arc(s.x, groundY - 20, 28, 0, Math.PI * 2); ctx.fill();
        if (t < 0.3) {
          ctx.fillStyle = 'rgba(255,255,255,.5)';
          ctx.beginPath(); ctx.arc(s.x - 8, groundY - 30, 12, 0, Math.PI * 2); ctx.fill();
          ctx.beginPath(); ctx.arc(s.x + 10, groundY - 25, 10, 0, Math.PI * 2); ctx.fill();
        }
      });
      if (t >= 0.3) {
        ctx.translate(s.x, groundY);
        drawBody(col, (t < 0.5) ? 'cough' : 'shocked', s.scale * sizeScale, t);
      }
    } else if (e.type === 'jetpack') {
      /* rockets down 0-0.7, lands off-balance 0.7-0.85, soot 0.85-1 */
      var jy;
      if (t < 0.7) { jy = topY + (groundY - topY) * (t / 0.7); }
      else { jy = groundY; }
      sy = jy;
      prop(function () {
        ctx.fillStyle = '#ff6b35';
        ctx.beginPath(); ctx.arc(s.x, jy + 14, 5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(255,100,0,.6)';
        ctx.beginPath(); ctx.arc(s.x, jy + 20, 8, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(120,120,120,.5)';
        ctx.beginPath(); ctx.arc(s.x - 6, jy + 26, 4, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(s.x + 5, jy + 28, 3, 0, Math.PI * 2); ctx.fill();
      });
      ctx.translate(s.x, sy);
      var jpose = (t < 0.7) ? 'shocked' : (t < 0.85) ? 'fall' : 'rubhead';
      drawBody(col, jpose, s.scale * sizeScale, t);
      if (t >= 0.85 && s.bubbleTimer <= 0) { s.bubble = 'soot!'; s.bubbleTimer = 40; }
    } else if (e.type === 'peekpop') {
      /* peek 0-0.4, check 0.4-0.6, hop in 0.6-1 */
      sy = groundY;
      var peekX = s.x - 60;
      prop(function () {
        /* edge/card */
        ctx.fillStyle = '#7a8cff';
        ctx.fillRect(peekX - 6, groundY - 60, 12, 60);
      });
      if (t < 0.4) {
        ctx.translate(peekX, groundY);
        /* only head peeking */
        ctx.save(); ctx.scale(s.scale * sizeScale, s.scale * sizeScale);
        ctx.fillStyle = col; ctx.beginPath(); ctx.arc(0, -38, 9, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(-3, -40, 2.2, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.arc(3, -40, 2.2, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(-3, -40, 1.1, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.arc(3, -40, 1.1, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      } else if (t < 0.6) {
        ctx.translate(peekX, groundY);
        drawBody(col, 'shocked', s.scale * sizeScale, t);
        if (s.bubbleTimer <= 0) { s.bubble = 'clear?'; s.bubbleTimer = 40; }
      } else {
        var hop = 1 - (t - 0.6) / 0.4;
        var hx2 = peekX + (s.x - peekX) * ((t - 0.6) / 0.4);
        var hy2 = groundY - Math.sin((t - 0.6) / 0.4 * Math.PI) * 40;
        sy = hy2;
        ctx.translate(hx2, hy2);
        drawBody(col, 'happy', s.scale * sizeScale, t);
      }
    }

    s.y = sy;
    ctx.restore();
    return true;
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
        if (s.entry.t >= 1) { s.entry.done = true; s.entry = null; s.onGround = true; s.y = groundY; s.state = 'happy'; s.stateTimer = 60; }
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

  function drawStickman(s) {
    var sizeScale = SIZE_SCALE[cfg.size] || 1.0;
    if (s.entry && !s.entry.done) {
      drawEntry(s, sizeScale);
      return;
    }
    ctx.save();
    ctx.translate(s.x, s.y);
    if (s.dead) { ctx.rotate(Math.PI / 2); }
    ctx.scale(s.scale * sizeScale, s.scale * sizeScale);
    var col = s.color;

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
    if (s.state === 'happy' || s.state === 'laugh') { ctx.arc(0, -35, 4, 0.2, Math.PI - 0.2); }
    else if (s.state === 'sad' || s.dead) { ctx.arc(0, -30, 4, Math.PI + 0.2, Math.PI * 2 - 0.2); }
    else if (s.state === 'angry') { ctx.moveTo(-4, -33); ctx.lineTo(4, -33); }
    else if (s.state === 'sleep') { ctx.arc(0, -33, 1.6, 0, Math.PI * 2); }
    else { ctx.moveTo(-3, -33); ctx.lineTo(3, -33); }
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

    /* spar swords */
    if (s.state === 'spar' && !s.dead) {
      var mateS = nearestOther(s);
      if (mateS && Math.abs(mateS.x - s.x) < 70) {
        ctx.save();
        ctx.strokeStyle = '#c0c0c0'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(s.x, s.y - 24); ctx.lineTo((s.x + mateS.x) / 2, (s.y + mateS.y) / 2 - 30); ctx.stroke();
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
        '<div class="sm-palette" id="smPalette" style="display:none">' +
          '<input type="color" id="smColorPicker" value="' + (cfg.colors[0] || '#ff4d4d') + '">' +
          '<button type="button" class="sm-done" id="smColorDone">Done</button>' +
        '</div>' +
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

    var palette = document.getElementById('smPalette');
    var doneBtn = document.getElementById('smColorDone');
    if (customBtn && palette) {
      customBtn.addEventListener('click', function () {
        palette.style.display = (palette.style.display === 'none' ? 'flex' : 'none');
      });
    }
    if (doneBtn && colorPicker) {
      doneBtn.addEventListener('click', function () {
        var newColor = colorPicker.value;
        cfg.colors.push(newColor);
        if (cfg.colors.length > 10) cfg.colors.shift();
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
            stickmen.forEach(function (s, k) { if (k % cfg.colors.length === i) s.color = cfg.colors[i]; });
          }
        });
        li.querySelector('.sm-ctrl-colors').insertBefore(swatch, customBtn);
        stickmen.forEach(function (s) { if (Math.random() < 0.4) s.color = newColor; });
        if (palette) palette.style.display = 'none';
      });
    }

    var visible = true;
    toggle.addEventListener('click', function () {
      visible = !visible;
      if (visible) {
        if (!suppressed) { mountCanvas(); initStickmen(); }
        toggle.textContent = 'Hide Stickmen';
        var sidebar = document.getElementById('sideMenu') || document.querySelector('.sidemenu, .side-nav, nav.side-nav');
        if (sidebar && sidebar.classList.contains('open')) sidebar.classList.remove('open');
        var overlay = document.getElementById('menuOverlay');
        if (overlay && overlay.classList.contains('open')) overlay.classList.remove('open');
      } else {
        /* exit animations */
        exiting = true;
        stickmen.forEach(function (s) {
          s.exiting = true;
          s.exitT = 0;
          var r = Math.random();
          if (r < 0.34) { s.exitMsg = 'bye'; s.bubble = 'Bye!'; }
          else if (r < 0.67) { s.exitMsg = 'heli'; s.bubble = 'Flying off!'; }
          else { s.exitMsg = 'swing'; s.bubble = 'Wheee!'; }
          s.bubbleTimer = 120;
        });
        toggle.textContent = 'Show Stickmen';
        setTimeout(function () {
          unmount();
          exiting = false;
        }, 1500);
        var sidebar2 = document.getElementById('sideMenu') || document.querySelector('.sidemenu, .side-nav, nav.side-nav');
        if (sidebar2 && sidebar2.classList.contains('open')) sidebar2.classList.remove('open');
        var overlay2 = document.getElementById('menuOverlay');
        if (overlay2 && overlay2.classList.contains('open')) overlay2.classList.remove('open');
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
