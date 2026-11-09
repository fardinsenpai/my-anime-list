/* ══════════════════════════════════════════════════════════════════════
   guide-mascot.js — full-screen 3D tour guide (desktop-mascot style)

   A transparent WebGL canvas is laid over the whole page. The character
   stands on the bottom edge of the screen, walks toward whatever the tour
   is highlighting, points at it with her arm, and the tour bubble is
   anchored above her head by projecting the head bone to screen space.

   • If a real model is dropped in (assets/guide/alisa.vrm / .glb) it is
     loaded and used instead of the built-in figure.
   • Otherwise a toon-shaded chibi Alisa is built from three.js geometry.
   • Nothing loads until the tour starts (createGuide() is imported on
     demand from script.js), and rendering stops when the tour closes.
   ══════════════════════════════════════════════════════════════════════ */

const MODEL_CANDIDATES = [
  './Komi%20Shouko.vrm',
  'assets/guide/alisa.vrm',
  'assets/guide/alisa.glb'
];

const FOV = 26;

export async function createGuide(hooks = {}) {
  const THREE = await import('three');

  /* ── canvas + renderer ─────────────────────────────────────────────── */
  const canvas = document.createElement('canvas');
  canvas.className = 'guide-mascot-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.appendChild(canvas);

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      powerPreference: 'high-performance'
    });
  } catch (err) {
    canvas.remove();
    throw err;
  }
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 120);
  camera.position.set(0, 0, 10);

  /* ── light ─────────────────────────────────────────────────────────── */
  scene.add(new THREE.HemisphereLight(0xffffff, 0x2a2f45, 1.15));
  const key = new THREE.DirectionalLight(0xfff2d8, 2.1);
  key.position.set(2.4, 5, 4.2);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x8fd6ff, 1.25);
  rim.position.set(-3.5, 2.5, -2.5);
  scene.add(rim);

  /* toon ramp — three flat bands */
  const rampData = new Uint8Array([70, 150, 245]);
  const gradientMap = new THREE.DataTexture(rampData, rampData.length, 1, THREE.RedFormat);
  gradientMap.minFilter = THREE.NearestFilter;
  gradientMap.magFilter = THREE.NearestFilter;
  gradientMap.generateMipmaps = false;
  gradientMap.needsUpdate = true;

  const toon = (color, extra) => new THREE.MeshToonMaterial(Object.assign({ color, gradientMap }, extra || {}));

  /* ── the figure ────────────────────────────────────────────────────── */
  const SKIN = 0xffdfcb;
  const HAIR = 0xe9dfc2;
  const HAIR_D = 0xd2c5a2;
  const NAVY = 0x2c3350;
  const NAVY_L = 0x3b466c;
  const SHIRT = 0xf7f4ec;
  const RED = 0xb8323f;
  const TIGHTS = 0x272c3e;
  const SHOE = 0x4a3227;

  const root = new THREE.Group();
  scene.add(root);

  const body = new THREE.Group();
  root.add(body);

  /* shadow puddle */
  const shadowTex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(64, 64, 4, 64, 64, 62);
    grd.addColorStop(0, 'rgba(0,0,0,0.42)');
    grd.addColorStop(0.55, 'rgba(0,0,0,0.18)');
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(0.95, 0.5),
    new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.004;
  root.add(shadow);

  /* legs */
  const legGeo = new THREE.CapsuleGeometry(0.058, 0.4, 6, 12);
  const shoeGeo = new THREE.BoxGeometry(0.125, 0.07, 0.2);
  const legL = new THREE.Group();
  const legR = new THREE.Group();
  [legL, legR].forEach((leg, i) => {
    leg.position.set(i === 0 ? 0.095 : -0.095, 0.6, 0);
    const limb = new THREE.Mesh(legGeo, toon(TIGHTS));
    limb.position.y = -0.24;
    leg.add(limb);
    const shoe = new THREE.Mesh(shoeGeo, toon(SHOE));
    shoe.position.set(0, -0.52, 0.035);
    leg.add(shoe);
    body.add(leg);
  });

  /* skirt */
  const skirt = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.3, 26, 1, true), toon(NAVY));
  skirt.position.y = 0.66;
  body.add(skirt);
  const skirtTrim = new THREE.Mesh(new THREE.TorusGeometry(0.295, 0.012, 6, 26), toon(NAVY_L));
  skirtTrim.rotation.x = Math.PI / 2;
  skirtTrim.position.y = 0.52;
  body.add(skirtTrim);

  /* torso */
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.155, 0.24, 8, 18), toon(NAVY));
  torso.position.y = 0.97;
  body.add(torso);

  const shirt = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.27, 0.03), toon(SHIRT));
  shirt.position.set(0, 1.0, 0.135);
  body.add(shirt);

  [-1, 1].forEach((s) => {
    const lapel = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.2, 0.02), toon(NAVY_L));
    lapel.position.set(s * 0.075, 1.05, 0.15);
    lapel.rotation.z = s * 0.3;
    body.add(lapel);
  });

  const ribbonGeo = new THREE.ConeGeometry(0.055, 0.11, 6);
  [-1, 1].forEach((s) => {
    const wing = new THREE.Mesh(ribbonGeo, toon(RED));
    wing.position.set(s * 0.05, 1.13, 0.165);
    wing.rotation.z = s * 1.25;
    body.add(wing);
  });
  const knot = new THREE.Mesh(new THREE.SphereGeometry(0.03, 12, 10), toon(0x8f1f2c));
  knot.position.set(0, 1.13, 0.175);
  body.add(knot);

  const pin = new THREE.Mesh(new THREE.SphereGeometry(0.016, 10, 8), toon(0xe8b23a));
  pin.position.set(-0.1, 1.085, 0.16);
  body.add(pin);

  /* arms */
  const armGeo = new THREE.CapsuleGeometry(0.043, 0.4, 6, 10);
  const handGeo = new THREE.SphereGeometry(0.048, 12, 10);
  const armL = new THREE.Group();
  const armR = new THREE.Group();
  [armL, armR].forEach((arm, i) => {
    arm.position.set(i === 0 ? 0.205 : -0.205, 1.08, 0);
    const sleeve = new THREE.Mesh(armGeo, toon(NAVY));
    sleeve.position.y = -0.22;
    arm.add(sleeve);
    const hand = new THREE.Mesh(handGeo, toon(SKIN));
    hand.position.y = -0.5;
    arm.add(hand);
    const finger = new THREE.Mesh(new THREE.ConeGeometry(0.024, 0.11, 6), toon(SKIN));
    finger.position.y = -0.58;
    finger.rotation.x = Math.PI;
    arm.add(finger);
    body.add(arm);
  });

  /* pointing stick + fingertip glow (only while pointing).
     The stick extends her reach so the tip clearly lands on the option she
     is explaining; the glow rides on the stick tip. */
  const glowTex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 31);
    grd.addColorStop(0, 'rgba(255,240,170,0.95)');
    grd.addColorStop(0.35, 'rgba(255,209,102,0.55)');
    grd.addColorStop(1, 'rgba(255,209,102,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
  }));
  glow.scale.setScalar(0.32);
  glow.position.set(0, -0.995, 0);

  const pointer = new THREE.Group();
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.009, 0.5, 8), toon(0x8a6134));
  stick.position.y = -0.72;
  pointer.add(stick);
  const stickTip = new THREE.Mesh(new THREE.SphereGeometry(0.028, 10, 8), toon(0xffd166));
  stickTip.position.y = -0.975;
  pointer.add(stickTip);
  pointer.add(glow);
  pointer.visible = false;
  armL.add(pointer);

  /* neck */
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.058, 0.1, 12), toon(SKIN));
  neck.position.y = 1.21;
  body.add(neck);

  /* head group pivots at the neck so it can look around */
  const head = new THREE.Group();
  head.position.y = 1.29;
  body.add(head);

  const headSphere = new THREE.Mesh(new THREE.SphereGeometry(0.3, 32, 26), toon(SKIN));
  headSphere.position.y = 0.17;
  headSphere.scale.set(1, 0.96, 0.93);
  head.add(headSphere);

  /* hair: back volume + cap */
  const backHair = new THREE.Mesh(new THREE.SphereGeometry(0.315, 28, 24), toon(HAIR_D));
  backHair.position.set(0, 0.18, -0.035);
  backHair.scale.set(1.02, 1.04, 1);
  head.add(backHair);

  const cap = new THREE.Mesh(
    new THREE.SphereGeometry(0.307, 32, 20, 0, Math.PI * 2, 0, Math.PI * 0.56),
    toon(HAIR)
  );
  cap.position.y = 0.18;
  cap.scale.set(1.03, 0.98, 1.02);
  head.add(cap);

  /* bangs — six soft spikes across the forehead */
  const bangGeo = new THREE.ConeGeometry(0.07, 0.26, 7);
  for (let i = 0; i < 7; i++) {
    const a = -0.9 + (i * 1.8) / 6;               // fan across the brow
    const bang = new THREE.Mesh(bangGeo, toon(i % 2 ? HAIR : HAIR_D));
    bang.position.set(Math.sin(a) * 0.23, 0.35, Math.cos(a) * 0.285 + 0.008);
    bang.rotation.set(Math.PI + 0.1, a * 0.25, a * 0.42);
    bang.scale.set(1, 1, 0.7);
    head.add(bang);
  }

  /* long side locks */
  const lockGeo = new THREE.CylinderGeometry(0.05, 0.016, 0.56, 10);
  [-1, 1].forEach((s) => {
    const lock = new THREE.Mesh(lockGeo, toon(HAIR));
    lock.position.set(s * 0.272, -0.11, 0.03);
    lock.rotation.z = s * 0.09;
    lock.rotation.x = 0.05;
    head.add(lock);
  });

  /* ahoge */
  const ahoge = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.19, 6), toon(HAIR));
  ahoge.position.set(0.03, 0.52, 0.02);
  ahoge.rotation.z = -0.5;
  ahoge.rotation.x = -0.25;
  head.add(ahoge);

  /* face */
  const eyeGeo = new THREE.SphereGeometry(0.07, 16, 14);
  const eyes = [];
  [-1, 1].forEach((s) => {
    const eye = new THREE.Mesh(eyeGeo, toon(0x4a8ee8));
    eye.position.set(s * 0.108, 0.14, 0.245);
    eye.scale.set(0.95, 1.3, 0.36);
    head.add(eye);
    eyes.push(eye);

    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.042, 12, 10), toon(0x12294d));
    pupil.position.set(s * 0.108, 0.137, 0.262);
    pupil.scale.set(0.9, 1.2, 0.28);
    head.add(pupil);

    const glint = new THREE.Mesh(new THREE.SphereGeometry(0.016, 8, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    glint.position.set(s * 0.086, 0.178, 0.272);
    head.add(glint);

    const brow = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.011, 0.008), toon(0xb9a888));
    brow.position.set(s * 0.105, 0.245, 0.256);
    brow.rotation.z = s * 0.1;
    head.add(brow);

    const blush = new THREE.Mesh(
      new THREE.CircleGeometry(0.032, 16),
      new THREE.MeshBasicMaterial({ color: 0xff9aa8, transparent: true, opacity: 0.42 })
    );
    blush.position.set(s * 0.165, 0.105, 0.238);
    blush.rotation.y = s * 0.45;
    head.add(blush);
  });

  const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.006, 8, 16, Math.PI), toon(0xc26666));
  mouth.position.set(0, 0.085, 0.272);
  mouth.rotation.z = Math.PI;
  head.add(mouth);

  /* bubble anchor above the head */
  const headAnchor = new THREE.Object3D();
  headAnchor.position.set(0, 0.5, 0.02);
  head.add(headAnchor);

  /* ── state ─────────────────────────────────────────────────────────── */
  const state = {
    visible: false,
    targetX: 0,
    targetY: 0,        // feet height she is walking toward
    rootY: 0,          // current feet height (before bob/hop)
    side: -1,
    point: new THREE.Vector3(0, 1.4, 0),
    pointing: false,
    walk: 0,
    phase: 0,
    hopT: 0,
    spawn: 1,
    greetT: 0,         // >0 while she waves hello
    bubbleH: 240,
    rect: null,
    model: null,
    rig: null,
    modelPointer: null
  };

  const baseQuatR = new THREE.Quaternion();
  const tmpV = new THREE.Vector3();
  const tmpV2 = new THREE.Vector3();
  const tmpV3 = new THREE.Vector3();
  const tmpQ = new THREE.Quaternion();
  const tmpQ2 = new THREE.Quaternion();
  const tmpE = new THREE.Euler();
  const DOWN = new THREE.Vector3(0, -1, 0);
  const HOP = 0.5;

  let visH = 4.5;
  let visW = 4.5;
  let maxX = 1.8;
  let baseY = -2.2;
  let raf = null;
  let last = 0;
  let clock = 0;
  let blinkT = 0;
  let nextBlink = 2.4;

  function layout() {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    camera.aspect = vw / vh;
    camera.position.z = vw < 768 ? 11.9 : (vh < 620 ? 11.2 : 9.9);
    camera.updateProjectionMatrix();

    visH = 2 * Math.tan((FOV / 2) * Math.PI / 180) * camera.position.z;
    visW = visH * camera.aspect;
    maxX = Math.max(0.4, visW / 2 - 0.55);
    baseY = -visH / 2 + 0.05;

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, vw < 768 ? 1.35 : 1.6));
    renderer.setSize(vw, vh, false);

    if (!state.visible) { state.rootY = baseY; state.targetY = baseY; }
    if (state.rect) aimAt(state.rect);
  }

  function pxToWorldX(px) {
    return (px / window.innerWidth - 0.5) * visW;
  }
  function pxToWorldY(py) {
    return (0.5 - py / window.innerHeight) * visH;
  }

  function aimAt(rect, side, opts) {
    state.rect = rect;
    if (side != null) state.side = side;
    if (opts) {
      if (opts.bubbleH) state.bubbleH = opts.bubbleH;
      if (opts.greet != null) state.greetT = opts.greet ? 2.8 : 0;
    }
    if (!rect) { state.pointing = false; return; }
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;

    /* Horizontal: stand beside the target, not on top of it. On phones she
       swaps to the opposite edge so sidebar names stay readable. */
    let standX;
    if (vw < 768) {
      standX = state.side < 0 ? vw * 0.24 : vw * 0.76;
    } else {
      const off = Math.min(300, vw * 0.24);
      standX = cx + (state.side < 0 ? -off : off);
    }
    state.targetX = Math.max(-maxX, Math.min(maxX, pxToWorldX(standX)));

    /* Vertical: she can walk up and down as well. On phones the bubble is
       pinned to the top, so she may climb until her head sits under it. On
       desktop the bubble rides above her head, so the climb is capped to
       keep that bubble below the top strip of the page. */
    const charHpx = 1.79 / visH * vh;
    const bubbleH = state.bubbleH || 240;
    const maxFeet = vh - 8;
    let feet;
    if (vw < 768) {
      const minFeet = Math.min(maxFeet, Math.max(vh - 210, 76 + bubbleH + 16 + charHpx));
      const wantFeet = cy + charHpx * 0.5;
      feet = Math.min(maxFeet, Math.max(minFeet, wantFeet));
    } else {
      /* How far up she may climb without the bubble sliding over the
         highlighted target (or off the top of the page). */
      const spaceUp = Math.max(0, maxFeet - (rect.bottom + 10 + bubbleH + 18 + charHpx));
      const maxUp = Math.max(0, maxFeet - (110 + bubbleH + 18 + charHpx));
      const t = Math.max(0, Math.min(1, (vh * 0.6 - cy) / (vh * 0.6)));
      feet = maxFeet - Math.min(spaceUp, maxUp) * t;
    }
    state.targetY = pxToWorldY(feet);
    state.targetY = Math.max(-visH / 2 + 0.02, Math.min(visH / 2 - 1.84, state.targetY));

    state.point.set(pxToWorldX(cx), pxToWorldY(cy), 0.06);
    state.pointing = true;
    state.hopT = HOP;
  }

  /* ── per-frame simulation ──────────────────────────────────────────── */
  function tick(dt) {
    if (!state.visible) return;
    clock += dt;

    /* spawn pop */
    if (state.spawn < 1) {
      state.spawn = Math.max(0, Math.min(1, state.spawn + dt * 3.4));
      const e = 1 - Math.pow(1 - state.spawn, 3);
      root.scale.setScalar(0.7 + e * 0.3);
    } else {
      root.scale.setScalar(1);
    }

    /* walk toward the highlighted element — on both axes */
    const dx = state.targetX - root.position.x;
    const dy = state.targetY - state.rootY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const wantWalk = dist > 0.015 ? 1 : 0;
    state.walk += (wantWalk - state.walk) * Math.min(1, dt * 8);
    if (dist > 0.004) {
      const step = Math.min(dist, 2.5 * dt);
      root.position.x += (dx / dist) * step;
      state.rootY += (dy / dist) * step;
      state.phase += dt * 10.5;
      root.position.x = Math.max(-maxX, Math.min(maxX, root.position.x));
    } else {
      state.phase += dt * 3;
    }

    /* legs + free arm swing */
    const swing = Math.sin(state.phase) * 0.55 * state.walk;
    legL.rotation.x = swing;
    legR.rotation.x = -swing;

    /* body bob + breathing */
    const bob = Math.abs(Math.sin(state.phase)) * 0.024 * state.walk;
    const breath = Math.sin(clock * 1.5) * 0.004 * (1 - state.walk);
    let hopY = 0;
    if (state.hopT > 0) {
      state.hopT = Math.max(0, state.hopT - dt);
      hopY = Math.sin((1 - state.hopT / HOP) * Math.PI) * 0.11;
    }
    root.position.y = state.rootY + bob + breath + hopY;

    /* lean into the walk, idle sway when still */
    root.rotation.y = Math.sin(clock * 0.55) * 0.05 * (1 - state.walk) +
      Math.max(-0.22, Math.min(0.22, dx * 0.55));

    /* look at the target */
    const lookX = Math.max(-0.45, Math.min(0.45, (state.point.x - root.position.x) * 0.5));
    const lookY = Math.max(-0.22, Math.min(0.22, (state.point.y - (state.rootY + 1.46)) * 0.22));
    head.rotation.y += (lookX - head.rotation.y) * Math.min(1, dt * 5);
    head.rotation.x += (-lookY - head.rotation.x) * Math.min(1, dt * 5);

    /* greeting wave, then normal pointing */
    const armK = 1 - Math.pow(0.0005, dt);
    tmpE.set(-swing * 0.7, 0, 0);
    tmpQ2.setFromEuler(tmpE);
    if (state.greetT > 0) {
      state.greetT = Math.max(0, state.greetT - dt);
      /* right arm (screen left) raised high, hand waving */
      tmpE.set(0.18, 0, -2.24 - Math.sin(clock * 9) * 0.32);
      armR.quaternion.slerp(tmpQ2.setFromEuler(tmpE), armK);
      tmpE.set(-swing * 0.7, 0, 0);
      armL.quaternion.slerp(tmpQ2.setFromEuler(tmpE), armK);
      pointer.visible = false;
      glow.visible = false;
    } else if (state.pointing) {
      const useLeft = state.point.x >= root.position.x;
      const pArm = useLeft ? armL : armR;
      const oArm = useLeft ? armR : armL;
      tmpV.copy(state.point);
      body.worldToLocal(tmpV);
      tmpV.sub(pArm.position);
      /* Chibi arms are short: bias the arm outward and forward so the hand
         and the pointer stick stay visible beside her face instead of
         vanishing behind her head. */
      tmpV.x += useLeft ? 0.35 : -0.35;
      tmpV.z += 0.5;
      tmpV.normalize();
      tmpQ.setFromUnitVectors(DOWN, tmpV);
      pArm.quaternion.slerp(tmpQ, armK);
      oArm.quaternion.slerp(tmpQ2, armK);
      if (pointer.parent !== pArm) pArm.add(pointer);
      pointer.visible = true;
      glow.visible = true;
    } else {
      armL.quaternion.slerp(tmpQ2, armK);
      armR.quaternion.slerp(tmpQ2, armK);
      pointer.visible = false;
      glow.visible = false;
    }

    /* real model: pose the arms and keep the pointer stick in the hand */
    if (state.model) poseModel();
    if (state.modelPointer && state.rig) {
      const useLeft = state.point.x >= root.position.x;
      const hand = useLeft ? state.rig.handL : state.rig.handR;
      if (state.pointing && state.greetT <= 0) {
        hand.getWorldPosition(tmpV2);
        state.modelPointer.position.copy(tmpV2);
        tmpV3.copy(state.point).sub(tmpV2);
        if (tmpV3.lengthSq() > 1e-6) {
          tmpV3.normalize();
          tmpQ.setFromUnitVectors(DOWN, tmpV3);
          state.modelPointer.quaternion.copy(tmpQ);
        }
        state.modelPointer.visible = true;
      } else {
        state.modelPointer.visible = false;
      }
    }

    /* blink */
    if (clock > nextBlink) {
      blinkT = 0.13;
      nextBlink = clock + 2.4 + Math.random() * 3.4;
    }
    let lid = 1;
    if (blinkT > 0) {
      blinkT -= dt;
      lid = 0.12;
    }
    eyes.forEach((eye) => {
      eye.scale.y = 1.25 * lid;
    });

    /* bubble anchor → screen */
    if (hooks.onAnchor) {
      camera.updateMatrixWorld();
      headAnchor.getWorldPosition(tmpV);
      tmpV.project(camera);
      hooks.onAnchor(
        (tmpV.x * 0.5 + 0.5) * window.innerWidth,
        (-tmpV.y * 0.5 + 0.5) * window.innerHeight
      );
    }
  }

  /* Draw one frame immediately — used on show/step so the character and
     the bubble appear at once even before the first rAF tick. */
  function renderNow(dt) {
    tick(dt == null ? 0.016 : dt);
    renderer.render(scene, camera);
  }

  function frame(now) {
    raf = requestAnimationFrame(frame);
    if (!state.visible) return;
    /* rAF timestamps can be slightly behind performance.now() on the first
       frame after show() — never let dt go negative or the walk runs away. */
    const raw = (now - last) / 1000;
    const dt = Math.min(0.05, raw > 0 ? raw : 0.016);
    last = now;
    tick(dt);
    renderer.render(scene, camera);
  }

  function show() {
    if (state.visible) return;
    state.visible = true;
    state.spawn = 0;
    state.hopT = HOP;
    layout();
    state.rootY = baseY;
    state.targetY = baseY;
    state.greetT = 0;
    root.position.y = baseY;
    state.targetX = Math.max(-maxX, Math.min(maxX, state.targetX));
    last = performance.now();
    document.body.classList.add('tour-mascot-on');
    renderNow(0.016);
    if (!raf) raf = requestAnimationFrame(frame);
  }

  function hide() {
    state.visible = false;
    document.body.classList.remove('tour-mascot-on');
    if (raf) { cancelAnimationFrame(raf); raf = null; }
  }

  /* ── optional real model (VRM loads as glTF) ───────────────────────── */
  function normalizeModel(obj, isVrm, isVrm1) {
    const box = new THREE.Box3().setFromObject(obj);
    const size = box.getSize(new THREE.Vector3());
    if (!isFinite(size.y) || size.y <= 0) return;
    const s = 1.72 / size.y;
    obj.scale.setScalar(s);
    box.setFromObject(obj);
    obj.position.y -= box.min.y;
    obj.position.x -= (box.min.x + box.max.x) / 2;
    obj.position.z -= (box.min.z + box.max.z) / 2;
    /* VRM0 faces -Z; VRM1 faces +Z (same as our camera). */
    if (isVrm && !isVrm1) obj.rotation.y = Math.PI;
  }

  /* ── real-model arm posing (VRM files have no animation clips) ─────── */
  const IDLE_L = new THREE.Vector3(0.38, -0.92, 0.08).normalize();
  const IDLE_R = new THREE.Vector3(-0.38, -0.92, 0.08).normalize();
  const poseDir = new THREE.Vector3();

  function findBone(model, re) {
    let out = null;
    model.traverse((n) => { if (!out && n.isBone && re.test(n.name)) out = n; });
    return out;
  }

  function setupRig(model) {
    const armL = findBone(model, /(L_?UpperArm|leftUpperArm)$/i);
    const armR = findBone(model, /(R_?UpperArm|rightUpperArm)$/i);
    if (!armL || !armR) return;
    state.rig = {
      armL: armL,
      armR: armR,
      handL: findBone(model, /(L_?Hand|leftHand)$/i) || armL,
      handR: findBone(model, /(R_?Hand|rightHand)$/i) || armR
    };
  }

  /* Rotate an upper-arm bone so the whole arm points along `dir` (world). */
  function aimArm(arm, hand, dir) {
    arm.getWorldPosition(tmpV2);
    hand.getWorldPosition(tmpV3);
    tmpV3.sub(tmpV2);
    if (tmpV3.lengthSq() < 1e-6) return;
    tmpV3.normalize();
    tmpQ.setFromUnitVectors(tmpV3, dir);
    arm.getWorldQuaternion(tmpQ2);
    tmpQ2.premultiply(tmpQ);
    arm.parent.getWorldQuaternion(tmpQ);
    tmpQ.invert();
    arm.quaternion.copy(tmpQ.multiply(tmpQ2));
  }

  function poseModel() {
    const rig = state.rig;
    if (!rig) return;
    root.updateMatrixWorld(true);
    let dirL = IDLE_L;
    let dirR = IDLE_R;
    if (state.greetT > 0) {
      const w = Math.sin(clock * 9) * 0.16;
      dirR = poseDir.set(-0.55 + w, 0.8, 0.16).normalize();
    } else if (state.pointing) {
      const useLeft = state.point.x >= root.position.x;
      const arm = useLeft ? rig.armL : rig.armR;
      arm.getWorldPosition(tmpV2);
      poseDir.copy(state.point).sub(tmpV2);
      if (poseDir.lengthSq() > 1e-6) {
        poseDir.normalize();
        if (useLeft) dirL = poseDir; else dirR = poseDir;
      }
    }
    aimArm(rig.armL, rig.handL, dirL);
    aimArm(rig.armR, rig.handR, dirR);
    root.updateMatrixWorld(true);
  }

  async function tryModel() {
    let url = null;
    window.__guideModelPhase = 'head';
    for (let i = 0; i < MODEL_CANDIDATES.length; i++) {
      try {
        const res = await fetch(MODEL_CANDIDATES[i], { method: 'HEAD' });
        if (res.ok) { url = MODEL_CANDIDATES[i]; break; }
      } catch (e) { /* keep looking */ }
    }
    window.__guideModelUrl = url;
    if (!url) { window.__guideModelPhase = 'none'; return; }
    try {
      window.__guideModelPhase = 'import';
      const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
      window.__guideModelPhase = 'load';
      const gltf = await new Promise((resolve, reject) => {
        new GLTFLoader().load(url, resolve, undefined, reject);
      });
      window.__guideModelPhase = 'loaded';
      const model = gltf.scene;
      const isVrm = /\.vrm($|\?)/i.test(url);
      const ext = (gltf.parser && gltf.parser.json && gltf.parser.json.extensions) || {};
      normalizeModel(model, isVrm, !!ext.VRMC_vrm);
      model.traverse((n) => {
        if (n.isMesh && n.material) {
          n.material.side = THREE.FrontSide;
          n.frustumCulled = false;
        }
      });
      body.add(model);
      body.children.forEach((c) => {
        if (c !== model && c !== shadow) c.visible = false;
      });
      state.model = model;
      setupRig(model);

      /* A real model can hold the pointer stick too: a world-space stick
         that starts at the pointing hand and aims at the highlighted
         option. */
      if (state.rig) {
        const mp = new THREE.Group();
        const L = 0.62;
        const st = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.009, L, 8), toon(0x8a6134));
        st.position.y = -L / 2;
        mp.add(st);
        const tp = new THREE.Mesh(new THREE.SphereGeometry(0.026, 10, 8), toon(0xffd166));
        tp.position.y = -L;
        mp.add(tp);
        const g2 = new THREE.Sprite(glow.material.clone());
        g2.scale.setScalar(0.34);
        g2.position.y = -L;
        mp.add(g2);
        mp.visible = false;
        scene.add(mp);
        state.modelPointer = mp;
      }

      if (hooks.onModel) hooks.onModel(url);
      window.__guideModelPhase = 'ok';
    } catch (e) {
      window.__guideModelPhase = 'error';
      window.__guideModelError = String(e && (e.message || e));
      window.__guideModelStack = String(e && e.stack || '').slice(0, 1200);
      /* keep the built-in figure */
    }
  }

  /* ── resize + visibility ───────────────────────────────────────────── */
  layout();
  window.addEventListener('resize', layout, { passive: true });
  window.addEventListener('orientationchange', layout, { passive: true });
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
      if (raf) { cancelAnimationFrame(raf); raf = null; }
    } else if (state.visible && !raf) {
      last = performance.now();
      raf = requestAnimationFrame(frame);
    }
  });

  /* check for a dropped-in model after first paint, never on page load */
  setTimeout(tryModel, 1200);

  const api = {
    show: show,
    hide: hide,
    setStep: function (rect, side, opts) {
      aimAt(rect || null, side, opts);
      if (state.visible) renderNow(0.016);
    },
    wave: function () { state.greetT = 2.8; },
    celebrate: function () { state.hopT = HOP; state.spawn = Math.min(state.spawn, 0.75); },
    headScreen: function () {
      camera.updateMatrixWorld();
      headAnchor.getWorldPosition(tmpV);
      tmpV.project(camera);
      return {
        x: (tmpV.x * 0.5 + 0.5) * window.innerWidth,
        y: (-tmpV.y * 0.5 + 0.5) * window.innerHeight
      };
    },
    hasModel: function () { return !!state.model; },
    debug: function () {
      headAnchor.getWorldPosition(tmpV);
      return {
        rootY: root.position.y,
        rootX: root.position.x,
        rootBaseY: state.rootY,
        targetY: state.targetY,
        greetT: state.greetT,
        pointerVis: pointer.visible,
        hasModel: !!state.model,
        modelPointerVis: !!(state.modelPointer && state.modelPointer.visible),
        camZ: camera.position.z,
        visH: visH,
        baseY: baseY,
        vw: window.innerWidth,
        vh: window.innerHeight,
        visible: state.visible,
        scale: root.scale.x,
        headWorld: { x: tmpV.x, y: tmpV.y, z: tmpV.z },
        pointing: state.pointing,
        point: [state.point.x, state.point.y, state.point.z],
        armLq: [armL.quaternion.x, armL.quaternion.y, armL.quaternion.z, armL.quaternion.w],
        armLpos: [armL.position.x, armL.position.y, armL.position.z],
        armLworld: (function () {
          var v = new THREE.Vector3();
          armL.getWorldPosition(v);
          return [v.x, v.y, v.z];
        })(),
        glowVis: glow.visible
      };
    }
  };

  window.__guideMascot = api;
  return api;
}
