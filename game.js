'use strict';
// CONTRA MARIO — a Mario-style platformer armed with Contra-style weapons.
// Zero dependencies: open index.html in a browser.
(() => {
  // ---------------------------------------------------------------------------
  // Setup
  // ---------------------------------------------------------------------------
  const W = 256, H = 240, TS = 16, SCALE = 3;
  const LW = 224, LH = 15;
  const GROUND_Y = 13 * TS;

  const canvas = document.getElementById('game');
  canvas.width = W * SCALE;
  canvas.height = H * SCALE;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);

  function fit() {
    const k = Math.min(innerWidth / W, innerHeight / H);
    canvas.style.width = Math.floor(W * k) + 'px';
    canvas.style.height = Math.floor(H * k) + 'px';
  }
  addEventListener('resize', fit);
  fit();

  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const approach = (v, t, d) => (v < t ? Math.min(v + d, t) : Math.max(v - d, t));
  const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  const R = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); };

  // ---------------------------------------------------------------------------
  // Input (keyboard + gamepad)
  // ---------------------------------------------------------------------------
  const KEYMAP = {
    ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
    ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
    KeyZ: 'jump', Space: 'jump', KeyK: 'jump',
    KeyX: 'fire', KeyJ: 'fire',
    ShiftLeft: 'run', ShiftRight: 'run', KeyC: 'run', KeyL: 'run',
    Enter: 'start', KeyP: 'pause', KeyM: 'mute',
  };
  const kbHeld = {}, kbTap = {};
  addEventListener('keydown', (e) => {
    const k = KEYMAP[e.code];
    initAudio();
    if (!k) return;
    if (!kbHeld[k]) kbTap[k] = true;
    kbHeld[k] = true;
    e.preventDefault();
  });
  addEventListener('keyup', (e) => {
    const k = KEYMAP[e.code];
    if (!k) return;
    kbHeld[k] = false;
    e.preventDefault();
  });
  addEventListener('blur', () => { for (const k in kbHeld) kbHeld[k] = false; });
  addEventListener('pointerdown', () => initAudio());

  let cur = {}, last = {};
  function pollInput() {
    last = cur;
    cur = {};
    for (const k in kbHeld) if (kbHeld[k]) cur[k] = true;
    for (const k in kbTap) { cur[k] = true; delete kbTap[k]; }
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const gp of pads) {
      if (!gp) continue;
      const b = (i) => gp.buttons[i] && gp.buttons[i].pressed;
      const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
      if (b(14) || ax < -0.4) cur.left = true;
      if (b(15) || ax > 0.4) cur.right = true;
      if (b(12) || ay < -0.4) cur.up = true;
      if (b(13) || ay > 0.4) cur.down = true;
      if (b(0)) cur.jump = true;
      if (b(2) || b(1)) cur.fire = true;
      if (b(4) || b(5) || b(6) || b(7)) cur.run = true;
      if (b(9)) cur.start = true;
    }
  }
  const btn = (k) => !!cur[k];
  const btnp = (k) => !!cur[k] && !last[k];

  // ---------------------------------------------------------------------------
  // Audio (tiny WebAudio synth)
  // ---------------------------------------------------------------------------
  let AC = null, muted = false, noiseBuf = null;
  function initAudio() {
    if (!AC) {
      try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { AC = null; }
    } else if (AC.state === 'suspended') AC.resume();
  }
  function tone(f, d, type = 'square', v = 0.05, f2 = null, delay = 0) {
    if (!AC || muted) return;
    const t = AC.currentTime + delay;
    const o = AC.createOscillator(), g = AC.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + d);
    g.gain.setValueAtTime(v, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g); g.connect(AC.destination);
    o.start(t); o.stop(t + d + 0.02);
  }
  function noise(d, v = 0.08, filt = 1200, delay = 0) {
    if (!AC || muted) return;
    if (!noiseBuf) {
      noiseBuf = AC.createBuffer(1, AC.sampleRate, AC.sampleRate);
      const ch = noiseBuf.getChannelData(0);
      for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
    }
    const t = AC.currentTime + delay;
    const s = AC.createBufferSource(); s.buffer = noiseBuf;
    const f = AC.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = filt;
    const g = AC.createGain();
    g.gain.setValueAtTime(v, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    s.connect(f); f.connect(g); g.connect(AC.destination);
    s.start(t); s.stop(t + d + 0.02);
  }
  const seq = (notes, step, type = 'square', v = 0.05) =>
    notes.forEach((f, i) => tone(f, step * 1.1, type, v, null, i * step));
  const sfx = {
    jump: () => tone(220, 0.18, 'square', 0.05, 660),
    shoot: () => noise(0.06, 0.07, 3000),
    spread: () => { noise(0.1, 0.09, 2000); tone(500, 0.06, 'square', 0.03, 200); },
    laser: () => tone(1500, 0.2, 'sawtooth', 0.04, 250),
    fire: () => tone(320, 0.14, 'triangle', 0.1, 110),
    coin: () => { tone(988, 0.07, 'square', 0.05); tone(1319, 0.25, 'square', 0.05, null, 0.07); },
    bump: () => tone(130, 0.08, 'square', 0.06, 80),
    brick: () => noise(0.22, 0.14, 900),
    stomp: () => tone(420, 0.1, 'square', 0.06, 140),
    kick: () => tone(640, 0.06, 'square', 0.06, 300),
    power: () => seq([523, 659, 784, 1047, 1319], 0.06),
    weapon: () => seq([392, 523, 659, 784, 1047], 0.07),
    sprout: () => tone(200, 0.35, 'square', 0.04, 800),
    hurt: () => tone(700, 0.45, 'square', 0.05, 90),
    explode: () => noise(0.35, 0.16, 650),
    bigexplode: () => { noise(1.0, 0.22, 420); tone(90, 0.8, 'sawtooth', 0.06, 30); },
    hit: () => tone(1800, 0.03, 'square', 0.025),
    eshot: () => tone(900, 0.05, 'square', 0.02, 500),
    die: () => seq([494, 466, 440, 415, 392, 370, 349, 330], 0.12),
    oneup: () => seq([659, 784, 1319, 1047, 1175, 1568], 0.08),
    flag: () => tone(1300, 0.9, 'square', 0.04, 180),
    clear: () => seq([523, 659, 784, 1047, 784, 1047, 1319], 0.15),
    alarm: () => { for (let i = 0; i < 4; i++) { tone(880, 0.12, 'square', 0.04, null, i * 0.26); tone(660, 0.12, 'square', 0.04, null, i * 0.26 + 0.13); } },
    pause: () => { tone(660, 0.05, 'square', 0.04); tone(990, 0.08, 'square', 0.04, null, 0.06); },
    tick: () => tone(1500, 0.02, 'square', 0.02),
    hurry: () => seq([1047, 1109, 1175, 1047, 1109, 1175], 0.07),
  };

  // Original chiptune loop (A minor march), scheduled ahead on the audio clock.
  const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);
  const BASS_ROOTS = [45, 45, 41, 43, 45, 45, 41, 40];
  const LEAD = [
    69, 0, 72, 0, 76, 74, 72, 69, 71, 0, 72, 71, 69, 0, 67, 69,
    72, 0, 74, 0, 77, 76, 74, 72, 74, 0, 71, 0, 67, 0, 71, 74,
    76, 0, 76, 74, 72, 0, 69, 72, 74, 72, 71, 69, 71, 0, 72, 0,
    77, 0, 76, 0, 74, 0, 72, 74, 76, 0, 0, 0, 71, 0, 68, 0,
  ];
  const music = { on: false, step: 0, next: 0, fast: false };
  function musicUpdate() {
    if (!AC || muted || !music.on) return;
    const stepDur = music.fast ? 0.11 : 0.14;
    if (music.next < AC.currentTime) music.next = AC.currentTime + 0.05;
    while (music.next < AC.currentTime + 0.12) {
      const i = music.step % 64;
      const root = BASS_ROOTS[Math.floor(i / 8)];
      const bassPat = [0, 0, 12, 0, 7, 0, 12, 7];
      tone(midi(root + bassPat[i % 8]), stepDur * 0.9, 'triangle', 0.09, null, music.next - AC.currentTime);
      if (LEAD[i]) tone(midi(LEAD[i]), stepDur * 0.85, 'square', 0.022, null, music.next - AC.currentTime);
      if (i % 2 === 0) noise(0.03, i % 4 === 0 ? 0.04 : 0.02, i % 4 === 0 ? 300 : 6000, music.next - AC.currentTime);
      music.step++;
      music.next += stepDur;
    }
  }

  // ---------------------------------------------------------------------------
  // Level
  // ---------------------------------------------------------------------------
  const SOLID = new Set(['#', 'B', '?', 'U', 'X', '[', ']', '{', '}', 'T']);
  const CHECKPOINT_TX = 90;
  const BOSS_TX = 198;
  const FLAG_TX = 210;
  const CASTLE_TX = 214;

  let grid, contents, spawns;

  function buildLevel() {
    const g = [];
    for (let y = 0; y < LH; y++) g.push(new Array(LW).fill('.'));
    const cont = new Map();
    const sp = [];
    const set = (x, y, c) => { if (x >= 0 && x < LW && y >= 0 && y < LH) g[y][x] = c; };
    const ground = (a, b) => { for (let x = a; x <= b; x++) { set(x, 13, '#'); set(x, 14, '#'); } };
    const pipe = (x, h, piranha) => {
      const top = 13 - h;
      set(x, top, '['); set(x + 1, top, ']');
      for (let y = top + 1; y < 13; y++) { set(x, y, '{'); set(x + 1, y, '}'); }
      if (piranha) sp.push({ type: 'piranha', tx: x, ty: top });
    };
    const WEAPON_BLOCKS = { m: 'M', s: 'S', l: 'L', f: 'F', r: 'R', b: 'B' };
    const row = (x, y, s) => {
      for (let i = 0; i < s.length; i++) {
        const c = s[i];
        if (c === ' ') continue;
        if (c === 'o') { sp.push({ type: 'coin', tx: x + i, ty: y }); continue; }
        if (c === '?') { set(x + i, y, '?'); cont.set((x + i) + ',' + y, 'coin'); continue; }
        if (c === '*') { set(x + i, y, '?'); cont.set((x + i) + ',' + y, 'mush'); continue; }
        if (WEAPON_BLOCKS[c]) { set(x + i, y, '?'); cont.set((x + i) + ',' + y, WEAPON_BLOCKS[c]); continue; }
        set(x + i, y, c);
      }
    };
    const stairsUp = (x, n) => { for (let i = 0; i < n; i++) for (let j = 0; j <= i; j++) set(x + i, 12 - j, 'X'); };
    const stairsDown = (x, n) => { for (let i = 0; i < n; i++) for (let j = 0; j < n - i; j++) set(x + i, 12 - j, 'X'); };
    const e = (type, tx, ty = 12, extra = {}) => sp.push(Object.assign({ type, tx, ty }, extra));
    const turret = (tx, ty) => { set(tx, ty, 'T'); e('turret', tx, ty); };

    ground(0, 68); ground(71, 85); ground(89, 150); ground(153, 165); ground(169, LW - 1);

    // --- Section 1: tutorial run
    row(12, 9, '?');
    row(17, 9, 'B*B?B');
    row(19, 5, 'm');
    e('walker', 23);
    pipe(27, 2);
    e('walker', 33);
    pipe(37, 3);
    e('walker', 42); e('walker', 44);
    pipe(48, 4, true);
    e('captrigger', 50, 4, { weapon: 'S' });
    row(53, 9, 'BB?BB');
    row(54, 5, 'ooo');
    e('koopa', 58);
    e('soldier', 63); e('soldier', 66);

    // --- Section 2: over the first pit
    row(73, 9, 'B?B');
    row(76, 6, 'BBBBBB');
    row(77, 5, 'oooo');
    e('walker', 79); e('walker', 81);
    set(84, 12, 'X'); turret(84, 11);

    // --- Section 3: checkpoint, soldiers, pipes and pillboxes
    row(93, 9, '?l?');
    e('soldier', 98); e('soldier', 102); e('soldier', 106);
    pipe(110, 3, true);
    e('koopa', 114);
    row(117, 9, 'BBB');
    row(121, 6, 'BB*BB');
    e('captrigger', 122, 4, { weapon: 'R' });
    row(127, 9, 'f');
    for (let y = 10; y <= 12; y++) set(132, y, 'X');
    turret(132, 9);
    e('walker', 136); e('walker', 138); e('walker', 140);
    stairsUp(146, 5);
    stairsDown(153, 4);

    // --- Section 4: the final approach
    e('soldier', 160); e('koopa', 163);
    row(166, 8, 'ooo');
    e('captrigger', 170, 4, { weapon: 'B' });
    row(174, 9, '?s?');
    set(180, 12, 'X'); set(180, 11, 'X'); turret(180, 10);
    e('soldier', 185); e('soldier', 190);

    // Flag base
    set(FLAG_TX, 12, 'X');

    grid = g;
    contents = cont;
    spawns = sp;
  }

  const tileAt = (tx, ty) => (ty < 0 || ty >= LH ? '.' : tx < 0 || tx >= LW ? '#' : grid[ty][tx]);
  const solidTile = (tx, ty) => SOLID.has(tileAt(tx, ty));
  const setTile = (tx, ty, c) => { if (tx >= 0 && tx < LW && ty >= 0 && ty < LH) grid[ty][tx] = c; };

  function collideX(o) {
    const y0 = Math.floor(o.y / TS), y1 = Math.floor((o.y + o.h - 0.01) / TS);
    if (o.vx > 0) {
      const tx = Math.floor((o.x + o.w - 0.01) / TS);
      for (let ty = y0; ty <= y1; ty++) if (solidTile(tx, ty)) { o.x = tx * TS - o.w; return true; }
    } else if (o.vx < 0) {
      const tx = Math.floor(o.x / TS);
      for (let ty = y0; ty <= y1; ty++) if (solidTile(tx, ty)) { o.x = (tx + 1) * TS; return true; }
    }
    return false;
  }
  function collideY(o) {
    const x0 = Math.floor(o.x / TS), x1 = Math.floor((o.x + o.w - 0.01) / TS);
    const res = { ground: false, head: false, ty: 0 };
    if (o.vy > 0) {
      const ty = Math.floor((o.y + o.h - 0.01) / TS);
      for (let tx = x0; tx <= x1; tx++) if (solidTile(tx, ty)) { o.y = ty * TS - o.h; o.vy = 0; res.ground = true; break; }
    } else if (o.vy < 0) {
      const ty = Math.floor(o.y / TS);
      for (let tx = x0; tx <= x1; tx++) if (solidTile(tx, ty)) { o.y = (ty + 1) * TS; o.vy = 0; res.head = true; res.ty = ty; break; }
    }
    return res;
  }
  function rectSolid(r) {
    const x0 = Math.floor(r.x / TS), x1 = Math.floor((r.x + r.w - 0.01) / TS);
    const y0 = Math.floor(r.y / TS), y1 = Math.floor((r.y + r.h - 0.01) / TS);
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) if (solidTile(tx, ty)) return true;
    return false;
  }
  function moveBody(o, grav = 0.4) {
    o.vy = Math.min(o.vy + grav, 6);
    o.x += o.vx;
    const hitX = collideX(o);
    o.y += o.vy;
    const r = collideY(o);
    o.onGround = r.ground;
    return hitX;
  }

  // ---------------------------------------------------------------------------
  // Game state
  // ---------------------------------------------------------------------------
  let state = 'title', stateT = 0, frame = 0, freeze = 0;
  let game = { score: 0, coins: 0, lives: 3, checkpoint: false };
  let hiscore = 0;
  try { hiscore = +localStorage.getItem('contramario.hi') || 0; } catch (e) { /* storage unavailable */ }
  let player, ents, items, pbullets, ebullets, parts, bumps, boss;
  let cam = { x: 0 };
  let time = 400, timeTick = 0, hurried = false;
  let banner = null;

  const WEAPONS = {
    N: { name: 'RIFLE', cd: 11, spd: 4.2, max: 4 },
    M: { name: 'MACHINE GUN', cd: 6, spd: 4.6, max: 8 },
    S: { name: 'SPREAD GUN', cd: 16, spd: 3.6, max: 15 },
    L: { name: 'LASER', cd: 22, spd: 6.5, max: 2 },
    F: { name: 'FIRE GUN', cd: 14, spd: 2.6, max: 4 },
  };
  const FALCON_NAMES = { M: 'MACHINE GUN', S: 'SPREAD GUN', L: 'LASER', F: 'FIRE GUN', R: 'RAPID FIRE', B: 'BARRIER' };

  function addScore(n, x, y, label) {
    game.score += n;
    if (x !== undefined) parts.push({ kind: 'text', text: label || String(n), x, y, vy: -0.6, t: 0, life: 50 });
  }
  function addCoin() {
    game.coins++;
    game.score += 200;
    sfx.coin();
    if (game.coins >= 100) { game.coins -= 100; game.lives++; sfx.oneup(); }
  }
  function oneUp(x, y) {
    game.lives++;
    sfx.oneup();
    parts.push({ kind: 'text', text: '1UP', x, y, vy: -0.6, t: 0, life: 60 });
  }
  function showBanner(text, t = 90) { banner = { text, t }; }

  function makePlayer(tx) {
    return {
      x: tx * TS + 2, y: GROUND_Y - 15, w: 12, h: 15, vx: 0, vy: 0,
      face: 1, big: false, prone: false, onGround: true, spin: false,
      aim: { x: 1, y: 0 }, cool: 0, weapon: 'N', rapid: false,
      inv: 0, barrier: 0, coyote: 0, jumpBuf: 0, combo: 0, anim: 0,
      dying: false, dieT: 0, clear: null, hidden: false, morph: 0, morphFrom: false,
    };
  }

  function makeEnt(s) {
    const e = {
      type: s.type, x: s.tx * TS, y: s.ty * TS, w: 16, h: 16, vx: 0, vy: 0,
      hp: 1, t: 0, dead: false, active: false, flash: 0, face: -1, onGround: false,
    };
    switch (s.type) {
      case 'walker': e.vx = -0.5; break;
      case 'koopa': e.h = 24; e.y -= 8; e.vx = -0.5; e.state = 'walk'; e.shellT = 0; break;
      case 'soldier': e.h = 24; e.y -= 8; e.shootT = rand(40, 100); e.pause = 0; break;
      case 'turret': e.hp = 8; e.tx = s.tx; e.ty = s.ty; e.aim = Math.PI; e.cool = rand(40, 90); break;
      case 'piranha': e.x = s.tx * TS + 8; e.topY = s.ty * TS; e.y = e.topY; e.h = 24; e.hp = 2; e.phase = 0; e.pt = 60; break;
      case 'coin': e.w = 10; e.x += 3; e.h = 14; e.y += 1; break;
      case 'captrigger': e.weapon = s.weapon; break;
    }
    return e;
  }

  function makeBoss() {
    const x = BOSS_TX * TS;
    return {
      x, active: false, gone: false, dying: 0, t: 0, spawnT: 180,
      cannons: [
        { x: x - 16, y: 92, w: 18, h: 12, hp: 12, cool: 50, flash: 0 },
        { x: x - 16, y: 128, w: 18, h: 12, hp: 12, cool: 110, flash: 0 },
      ],
      core: { x: x - 6, y: 160, w: 22, h: 40, hp: 40, flash: 0 },
    };
  }

  function loadLevel() {
    buildLevel();
    const startTx = game.checkpoint ? CHECKPOINT_TX : 3;
    ents = spawns.filter((s) => !game.checkpoint || s.tx > CHECKPOINT_TX + 6).map(makeEnt);
    items = []; pbullets = []; ebullets = []; parts = []; bumps = [];
    boss = makeBoss();
    player = makePlayer(startTx);
    cam.x = clamp(player.x - 80, 0, LW * TS - W);
    time = 400; timeTick = 0; hurried = false; freeze = 0; banner = null;
    music.fast = false;
  }

  function newGame() {
    game = { score: 0, coins: 0, lives: 3, checkpoint: false };
    startLife();
  }
  function startLife() {
    loadLevel();
    state = 'intro';
    stateT = 0;
    music.on = false;
  }

  // ---------------------------------------------------------------------------
  // Player
  // ---------------------------------------------------------------------------
  const playerH = (p) => (p.prone ? 10 : p.big ? 27 : 15);

  function setProne(p, on) {
    if (on) {
      p.y += p.h - 10; p.h = 10; p.prone = true;
      return true;
    }
    const nh = p.big ? 27 : 15;
    const test = { x: p.x, y: p.y + p.h - nh, w: p.w, h: nh };
    if (rectSolid(test)) return false;
    p.y = test.y; p.h = nh; p.prone = false;
    return true;
  }

  function grow(p) {
    if (p.big) return;
    p.morphFrom = false;
    p.big = true;
    const nh = playerH(p);
    p.y += p.h - nh; p.h = nh;
    p.morph = 36; freeze = 36;
    sfx.power();
  }
  function shrink(p) {
    p.morphFrom = true;
    p.big = false;
    const nh = playerH(p);
    p.y += p.h - nh; p.h = nh;
    p.morph = 36; freeze = 36;
    p.inv = 150;
    sfx.hurt();
  }
  function hurtPlayer() {
    const p = player;
    if (p.inv > 0 || p.barrier > 0 || p.dying || p.clear) return;
    if (p.big) shrink(p);
    else killPlayer();
  }
  function killPlayer() {
    const p = player;
    if (p.dying) return;
    p.dying = true; p.dieT = 0; p.vy = p.y > H ? 0 : -5; p.vx = 0;
    music.on = false;
    sfx.die();
  }
  function loseLife() {
    game.lives--;
    if (game.lives <= 0) {
      state = 'gameover'; stateT = 0;
      saveHi();
    } else startLife();
  }
  function saveHi() {
    if (game.score > hiscore) {
      hiscore = game.score;
      try { localStorage.setItem('contramario.hi', String(hiscore)); } catch (e) { /* ignore */ }
    }
  }

  function giveFalcon(p, w, x, y) {
    if (w === 'R') p.rapid = true;
    else if (w === 'B') p.barrier = 720;
    else p.weapon = w;
    sfx.weapon();
    addScore(1000, x, y);
    showBanner(FALCON_NAMES[w] + '!', 80);
  }

  function torsoTop(p) {
    const bottom = p.y + p.h;
    return p.big ? bottom - 19 : bottom - 9;
  }
  function aimVec(p) {
    const l = Math.hypot(p.aim.x, p.aim.y) || 1;
    return { x: p.aim.x / l, y: p.aim.y / l };
  }
  function muzzle(p) {
    const cx = p.x + p.w / 2;
    if (p.spin && !p.onGround) return { x: cx, y: p.y + p.h / 2 };
    if (p.prone) return { x: cx + p.face * 14, y: p.y + p.h - 6 };
    const n = aimVec(p);
    const L = p.big ? 12 : 10;
    const sx = cx + (p.aim.x === 0 ? p.face * 3 : 0);
    return { x: sx + n.x * L, y: torsoTop(p) + 2 + n.y * L };
  }

  function fireWeapon(p) {
    const w = WEAPONS[p.weapon];
    if (pbullets.length >= w.max) return;
    const n = aimVec(p);
    const o = muzzle(p);
    const spd = w.spd * (p.rapid ? 1.35 : 1);
    const mk = (vx, vy, kind, extra) => Object.assign({ x: o.x, y: o.y, vx, vy, kind, life: 140, dmg: 1, r: 2, pierce: false, dead: false }, extra || {});
    switch (p.weapon) {
      case 'N': case 'M':
        pbullets.push(mk(n.x * spd, n.y * spd, p.weapon));
        sfx.shoot();
        break;
      case 'S': {
        const base = Math.atan2(n.y, n.x);
        for (const a of [-0.34, -0.17, 0, 0.17, 0.34]) {
          pbullets.push(mk(Math.cos(base + a) * spd, Math.sin(base + a) * spd, 'S', { r: 3 }));
        }
        sfx.spread();
        break;
      }
      case 'L':
        pbullets = pbullets.filter((b) => b.kind !== 'L');
        pbullets.push(mk(n.x * spd, n.y * spd, 'L', { r: 4, dmg: 2, pierce: true, hits: new Set(), nx: n.x, ny: n.y }));
        sfx.laser();
        break;
      case 'F':
        pbullets.push(mk(n.x * spd, n.y * spd, 'F', { r: 4, dmg: 2, bx: o.x, by: o.y, ph: 0, spinDir: p.face }));
        sfx.fire();
        break;
    }
    p.cool = Math.round(w.cd / (p.rapid ? 1.5 : 1));
    parts.push({ kind: 'flash', x: o.x, y: o.y, t: 0, life: 3 });
  }

  function headBump(p, ty) {
    const cx = Math.floor((p.x + p.w / 2) / TS);
    let tx = cx;
    if (!solidTile(cx, ty)) {
      const x0 = Math.floor(p.x / TS), x1 = Math.floor((p.x + p.w - 0.01) / TS);
      tx = solidTile(x0, ty) ? x0 : x1;
    }
    bumpTile(tx, ty, p.big ? 'big' : 'small');
  }

  function updatePlayer() {
    const p = player;
    p.anim++;
    if (p.dying) {
      p.dieT++;
      if (p.dieT > 30) { p.vy += 0.25; p.y += p.vy; }
      if (p.dieT > 170) loseLife();
      return;
    }
    if (p.clear) { updateClear(p); return; }
    if (p.inv > 0) p.inv--;
    if (p.barrier > 0) p.barrier--;
    if (p.kickGrace > 0) p.kickGrace--;

    const L = btn('left'), Rt = btn('right'), U = btn('up'), D = btn('down');

    const wantProne = D && p.onGround && !L && !Rt;
    if (wantProne !== p.prone) setProne(p, wantProne);

    let dir = (Rt ? 1 : 0) - (L ? 1 : 0);
    if (dir) p.face = dir;
    if (p.prone) dir = 0;
    const maxV = btn('run') ? 2.5 : 1.6;
    if (dir) {
      const skid = Math.sign(p.vx) === -dir;
      p.vx += dir * (p.onGround ? (skid ? 0.28 : 0.11) : 0.09);
      if (Math.abs(p.vx) > maxV) p.vx = Math.sign(p.vx) * Math.max(maxV, Math.abs(p.vx) - 0.2);
    } else if (p.onGround) {
      p.vx = approach(p.vx, 0, p.prone ? 0.3 : 0.12);
    }

    // Jumping (with coyote time + jump buffering)
    if (p.onGround) p.coyote = 6; else if (p.coyote > 0) p.coyote--;
    if (btnp('jump')) p.jumpBuf = 6; else if (p.jumpBuf > 0) p.jumpBuf--;
    if (p.jumpBuf > 0 && p.coyote > 0) {
      if (!p.prone || setProne(p, false)) {
        p.vy = -(5.3 + Math.abs(p.vx) * 0.3);
        p.onGround = false; p.coyote = 0; p.jumpBuf = 0; p.spin = true;
        sfx.jump();
      }
    }
    p.vy += btn('jump') && p.vy < 0 ? 0.2 : 0.5;
    if (p.vy > 6.5) p.vy = 6.5;

    p.x += p.vx;
    if (collideX(p)) p.vx = 0;
    if (p.x < cam.x) { p.x = cam.x; if (p.vx < 0) p.vx = 0; }
    if (!boss.gone && p.x + p.w > boss.x) { p.x = boss.x - p.w; if (p.vx > 0) p.vx = 0; }
    p.y += p.vy;
    const r = collideY(p);
    const wasGround = p.onGround;
    p.onGround = r.ground;
    if (r.ground) { p.spin = false; p.combo = 0; }
    else if (wasGround && p.vy >= 0) p.spin = false;
    if (r.head) headBump(p, r.ty);
    if (p.y > H + 8) { killPlayer(); return; }

    // Contra-style 8-way aiming
    let ax = p.face, ay = 0;
    if (U) { ay = -1; ax = L || Rt ? p.face : 0; }
    else if (D && !p.onGround) { ay = 1; ax = L || Rt ? p.face : 0; }
    else if (D && (L || Rt)) { ay = 1; ax = p.face; }
    p.aim = { x: ax, y: ay };

    if (p.cool > 0) p.cool--;
    if (btn('fire') && p.cool <= 0) fireWeapon(p);

    if (!game.checkpoint && p.x > CHECKPOINT_TX * TS) game.checkpoint = true;

    // Flagpole
    if (boss.gone && p.x + p.w >= FLAG_TX * TS) startClear(p);
  }

  function startClear(p) {
    const h = GROUND_Y - TS - (p.y + p.h);
    const pts = h >= 128 ? 5000 : h >= 96 ? 2000 : h >= 64 ? 800 : h >= 32 ? 400 : 100;
    addScore(pts, p.x + 16, p.y);
    p.clear = { phase: 'slide', t: 0, flagY: 3 * TS };
    p.x = FLAG_TX * TS + 7 - p.w;
    p.vx = 0; p.vy = 0; p.face = 1; p.spin = false;
    if (p.prone) setProne(p, false);
    music.on = false;
    sfx.flag();
  }
  function updateClear(p) {
    const c = p.clear;
    c.t++;
    const base = 12 * TS;
    if (c.phase === 'slide') {
      if (p.y + p.h < base) p.y = Math.min(p.y + 2, base - p.h);
      if (c.flagY < base - 16) c.flagY += 2;
      if (p.y + p.h >= base && c.flagY >= base - 16) { c.phase = 'turn'; c.t = 0; }
    } else if (c.phase === 'turn') {
      if (c.t === 1) { p.face = -1; p.x += 10; }
      if (c.t > 24) { c.phase = 'walk'; c.t = 0; p.face = 1; sfx.clear(); }
    } else if (c.phase === 'walk') {
      p.vx = 1.2;
      moveBody(p, 0.4);
      if (p.x + p.w / 2 >= (CASTLE_TX + 2) * TS + 8) { p.hidden = true; c.phase = 'tally'; c.t = 0; }
    } else if (c.phase === 'tally') {
      if (time > 0) {
        const d = Math.min(time, 2);
        time -= d;
        game.score += d * 50;
        if (c.t % 3 === 0) sfx.tick();
      } else if (c.t > 0) { c.phase = 'done'; c.t = 0; }
    } else if (c.phase === 'done') {
      if (c.t === 1) { parts.push({ kind: 'firework', x: (CASTLE_TX + 2) * TS + 8, y: 60, t: 0, life: 40 }); sfx.explode(); }
      if (c.t > 140) { state = 'clear'; stateT = 0; saveHi(); }
    }
  }

  // ---------------------------------------------------------------------------
  // Blocks & items
  // ---------------------------------------------------------------------------
  function bumpTile(tx, ty, src) {
    const c = tileAt(tx, ty);
    const px = tx * TS, py = ty * TS;
    if (c === '?') {
      setTile(tx, ty, 'U');
      bumps.push({ tx, ty, t: 0 });
      const what = contents.get(tx + ',' + ty) || 'coin';
      if (what === 'coin') {
        parts.push({ kind: 'coin', x: px + 3, y: py - 16, vy: -4.5, t: 0, life: 32 });
        addCoin();
      } else if (what === 'mush') {
        items.push({ kind: 'mush', x: px, y: py, w: 16, h: 16, vx: 0, vy: 0, rise: 16, dead: false });
        sfx.sprout();
      } else {
        items.push({ kind: 'falcon', weapon: what, x: px, y: py, w: 16, h: 14, vx: 0, vy: 0, rise: 16, dead: false, bounces: 99 });
        sfx.sprout();
      }
      hitAtop(tx, ty);
      if (src !== 'bullet') sfx.bump();
    } else if (c === 'B') {
      if (src === 'small') {
        bumps.push({ tx, ty, t: 0 });
        sfx.bump();
      } else {
        setTile(tx, ty, '.');
        for (let i = 0; i < 4; i++) {
          parts.push({ kind: 'debris', x: px + (i % 2) * 8 + 4, y: py + (i < 2 ? 0 : 8) + 4, vx: (i % 2 ? 1 : -1) * rand(1, 1.8), vy: i < 2 ? -5 : -3, t: 0, life: 90 });
        }
        game.score += 50;
        sfx.brick();
      }
      hitAtop(tx, ty);
    } else if (src !== 'bullet') {
      sfx.bump();
    }
  }
  function hitAtop(tx, ty) {
    const zone = { x: tx * TS, y: ty * TS - 4, w: TS, h: 4 };
    for (const e of ents) {
      if (e.dead || !e.active) continue;
      if ((e.type === 'walker' || e.type === 'koopa' || e.type === 'soldier') && overlap(zone, e)) killEnemy(e, 'flip');
      if (e.type === 'coin' && overlap(zone, e)) { e.dead = true; addCoin(); parts.push({ kind: 'coin', x: e.x, y: e.y - 8, vy: -4.5, t: 0, life: 32 }); }
    }
    for (const it of items) if (!it.rise && overlap(zone, it)) { it.vy = -4; it.vx = it.vx || 1; }
  }

  function updateItems() {
    for (const it of items) {
      if (it.dead) continue;
      if (it.rise > 0) {
        it.rise--; it.y -= 1;
        if (it.rise === 0) it.vx = it.kind === 'mush' ? 1 : 0.8;
        continue;
      }
      if (it.kind === 'falcon' && it.bounces < 3) {
        // dropped from a capsule: bouncy arc like in Contra
        it.vy = Math.min(it.vy + 0.15, 4);
        it.x += it.vx;
        if (collideX(it)) it.vx = -it.vx;
        it.y += it.vy;
        const r = collideY(it);
        if (r.ground) { it.bounces++; it.vy = -Math.max(0.5, 3 - it.bounces); }
      } else {
        const v = it.vx;
        if (moveBody(it, 0.35)) it.vx = -v;
      }
      if (it.y > H + 16 || it.x + it.w < cam.x - 32) it.dead = true;
    }
    items = items.filter((i) => !i.dead);
  }

  // ---------------------------------------------------------------------------
  // Enemies
  // ---------------------------------------------------------------------------
  const STOMPABLE = new Set(['walker', 'koopa', 'soldier']);
  const SHOOTABLE = new Set(['walker', 'koopa', 'soldier', 'turret', 'piranha', 'capsule']);
  const POINTS = { walker: 100, koopa: 200, soldier: 300, turret: 1000, piranha: 200, capsule: 500 };

  const onScreen = (e) => e.x + e.w > cam.x && e.x < cam.x + W && e.y + e.h > 0 && e.y < H;

  function enemyShot(x, y, tx, ty, spd, kind = 'pellet') {
    const a = Math.atan2(ty - y, tx - x);
    ebullets.push({ x, y, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd, kind, r: 2, dead: false, grav: 0 });
    sfx.eshot();
  }

  function damage(e, d) {
    e.hp -= d;
    e.flash = 5;
    if (e.hp <= 0) killEnemy(e, 'shot');
    else sfx.hit();
  }
  function explosion(x, y, s = 1) {
    parts.push({ kind: 'explo', x, y, t: 0, life: 22, s });
    for (let i = 0; i < 5 * s; i++) {
      parts.push({ kind: 'spark', x, y, vx: rand(-2, 2) * s, vy: rand(-2.5, 1), t: 0, life: rand(12, 24) });
    }
  }
  function killEnemy(e, how, dir = 0) {
    if (e.dead) return;
    e.dead = true;
    addScore(POINTS[e.type] || 100, e.x + e.w / 2, e.y);
    if (how === 'shot') {
      explosion(e.x + e.w / 2, e.y + e.h / 2, e.type === 'turret' ? 1.6 : 1);
      sfx.explode();
    } else {
      parts.push({ kind: 'flip', ent: Object.assign({}, e, { dead: false, flash: 0 }), vx: dir || (e.x < player.x ? -1 : 1), vy: -3.5, t: 0, life: 120 });
      sfx.kick();
    }
    if (e.type === 'capsule') {
      items.push({ kind: 'falcon', weapon: e.weapon, x: e.x + 4, y: e.y, w: 16, h: 14, vx: 0.7, vy: -3, rise: 0, dead: false, bounces: 0 });
    }
    if (e.type === 'turret') setTile(e.tx, e.ty, 'X');
  }

  function updateEnts() {
    for (const e of ents) {
      if (e.dead) continue;
      if (!e.active) {
        if (e.x < cam.x + W + 24) e.active = true;
        else continue;
      }
      e.t++;
      if (e.flash > 0) e.flash--;
      UPDATERS[e.type](e);
      if (e.y > H + 48 || e.x + e.w < cam.x - 96 || e.x > cam.x + W + 200) e.dead = true;
    }
    // Walkers bounce off each other
    for (let i = 0; i < ents.length; i++) {
      const a = ents[i];
      if (a.dead || !a.active || !(a.type === 'walker' || (a.type === 'koopa' && a.state === 'walk'))) continue;
      for (let j = i + 1; j < ents.length; j++) {
        const b = ents[j];
        if (b.dead || !b.active || !(b.type === 'walker' || (b.type === 'koopa' && b.state === 'walk'))) continue;
        if (overlap(a, b)) {
          if (a.x < b.x) { a.vx = -Math.abs(a.vx); b.vx = Math.abs(b.vx); }
          else { a.vx = Math.abs(a.vx); b.vx = -Math.abs(b.vx); }
        }
      }
    }
    ents = ents.filter((e) => !e.dead);
  }

  const UPDATERS = {
    walker(e) {
      const v = e.vx;
      if (moveBody(e)) e.vx = -v;
    },
    koopa(e) {
      if (e.state === 'walk') {
        const v = e.vx;
        if (moveBody(e)) e.vx = -v;
        e.face = Math.sign(e.vx) || -1;
      } else if (e.state === 'shell') {
        e.vx = 0;
        moveBody(e);
        if (++e.shellT > 420) {
          e.state = 'walk'; e.y -= 8; e.h = 24;
          e.vx = player.x < e.x ? -0.5 : 0.5;
        }
      } else if (e.state === 'moving') {
        const v = e.vx;
        if (moveBody(e)) { e.vx = -v; if (onScreen(e)) sfx.bump(); }
        for (const o of ents) {
          if (o === e || o.dead || !o.active || !STOMPABLE.has(o.type)) continue;
          if (overlap(e, o)) killEnemy(o, 'flip', Math.sign(e.vx));
        }
      }
    },
    soldier(e) {
      if (e.pause > 0) {
        e.pause--;
        e.vx = 0;
        if (e.pause === 12 && !player.dying) {
          const px = player.x + player.w / 2, py = player.y + player.h / 2;
          enemyShot(e.x + 8 + e.face * 9, e.y + 9, px, py, 2.0);
        }
      } else {
        e.vx = e.face * 0.9;
        if (--e.shootT <= 0 && onScreen(e)) {
          e.pause = 34;
          e.face = player.x + player.w / 2 < e.x + 8 ? -1 : 1;
          e.shootT = rand(90, 170);
        }
        // hop off ledges like a Contra grunt
        if (e.onGround) {
          const aheadX = Math.floor((e.x + 8 + e.face * 10) / TS);
          const belowY = Math.floor((e.y + e.h + 2) / TS);
          if (!solidTile(aheadX, belowY) && Math.random() < 0.5) e.vy = -4.5;
        }
      }
      if (moveBody(e)) e.face = -e.face;
    },
    turret(e) {
      const px = player.x + player.w / 2, py = player.y + player.h / 2;
      const cx = e.x + 8, cy = e.y + 8;
      const step = Math.PI / 6;
      const target = Math.round(Math.atan2(py - cy, px - cx) / step) * step;
      if (e.t % 8 === 0) {
        let d = target - e.aim;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        if (Math.abs(d) > 0.01) e.aim += Math.sign(d) * step;
      }
      if (--e.cool <= 0 && onScreen(e) && !player.dying) {
        e.cool = 85;
        ebullets.push({ x: cx + Math.cos(e.aim) * 10, y: cy + Math.sin(e.aim) * 10, vx: Math.cos(e.aim) * 1.8, vy: Math.sin(e.aim) * 1.8, kind: 'pellet', r: 2, dead: false, grav: 0 });
        sfx.eshot();
      }
    },
    piranha(e) {
      const top = e.topY;
      e.pt--;
      if (e.phase === 0) {
        e.y = top;
        const near = Math.abs(player.x + player.w / 2 - (e.x + 8)) < 30;
        if (e.pt <= 0 && !near) { e.phase = 1; e.pt = 24; }
      } else if (e.phase === 1) {
        e.y = top - (24 - e.pt);
        if (e.pt <= 0) { e.phase = 2; e.pt = 80; }
      } else if (e.phase === 2) {
        e.y = top - 24;
        if (e.pt === 45 && onScreen(e) && !player.dying) {
          ebullets.push(Object.assign({}, { x: e.x + 8, y: e.y + 6, vx: 0, vy: 0, kind: 'fireball', r: 3, dead: false, grav: 0 }));
          const b = ebullets[ebullets.length - 1];
          const a = Math.atan2(player.y + player.h / 2 - b.y, player.x + player.w / 2 - b.x);
          b.vx = Math.cos(a) * 1.5; b.vy = Math.sin(a) * 1.5;
          sfx.fire();
        }
        if (e.pt <= 0) { e.phase = 3; e.pt = 24; }
      } else {
        e.y = top - e.pt;
        if (e.pt <= 0) { e.phase = 0; e.pt = 90; }
      }
      e.visible = e.y < top - 2;
    },
    coin() {},
    captrigger(e) {
      e.dead = true;
      ents.push({
        type: 'capsule', x: cam.x - 24, y: 60, baseY: 60, w: 24, h: 14, vx: 1.25, vy: 0,
        hp: 1, t: 0, dead: false, active: true, flash: 0, weapon: e.weapon,
      });
    },
    capsule(e) {
      e.x += e.vx;
      e.y = e.baseY + Math.sin(e.t * 0.05) * 24;
      if (e.x > cam.x + W + 24) e.dead = true;
    },
  };

  // ---------------------------------------------------------------------------
  // Boss: the Defense Wall
  // ---------------------------------------------------------------------------
  function updateBoss() {
    const b = boss;
    if (b.gone) return;
    if (!b.active) {
      if (cam.x + W > b.x + 32) { b.active = true; sfx.alarm(); music.fast = true; showBanner('WARNING! DEFENSE WALL', 120); }
      else return;
    }
    if (b.dying > 0) {
      b.dying--;
      if (b.dying % 5 === 0) { explosion(b.x + rand(-10, 60), rand(40, 200), 1.4); sfx.explode(); }
      if (b.dying === 0) {
        b.gone = true;
        addScore(10000, b.x + 10, 120);
        showBanner('PATH CLEAR! GRAB THE FLAG', 120);
        music.fast = false;
      }
      return;
    }
    b.t++;
    for (const c of b.cannons) {
      if (c.flash > 0) c.flash--;
      if (c.hp <= 0) continue;
      if (--c.cool <= 0 && !player.dying) {
        c.cool = rand(80, 140);
        ebullets.push({ x: c.x, y: c.y + 6, vx: -rand(0.8, 2.3), vy: -rand(1.2, 2.4), kind: 'shell', r: 3, dead: false, grav: 0.08 });
        noise(0.15, 0.08, 1000);
      }
    }
    if (b.core.flash > 0) b.core.flash--;
    if (--b.spawnT <= 0) {
      b.spawnT = 240;
      const soldiers = ents.filter((e) => e.type === 'soldier').length;
      if (soldiers < 2) {
        const s = makeEnt({ type: 'soldier', tx: 0, ty: 0 });
        s.x = b.x - 18; s.y = 24; s.active = true; s.face = -1; s.shootT = 80;
        ents.push(s);
      }
    }
  }
  function bossHitBullet(bl) {
    const b = boss;
    if (!b.active || b.gone || b.dying) return false;
    const box = { x: bl.x - bl.r, y: bl.y - bl.r, w: bl.r * 2, h: bl.r * 2 };
    for (const c of b.cannons) {
      if (c.hp > 0 && overlap(box, c)) {
        c.hp -= bl.dmg; c.flash = 5;
        if (c.hp <= 0) { explosion(c.x + 9, c.y + 6, 1.4); sfx.explode(); addScore(2000, c.x, c.y); }
        else sfx.hit();
        return true;
      }
    }
    if (overlap(box, b.core)) {
      b.core.hp -= bl.dmg; b.core.flash = 5;
      sfx.hit();
      if (b.core.hp <= 0) {
        b.dying = 160;
        for (const c of b.cannons) c.hp = 0;
        ebullets = [];
        for (const e of ents) if (e.type === 'soldier') killEnemy(e, 'shot');
        sfx.bigexplode();
      }
      return true;
    }
    if (bl.x >= b.x && bl.y >= 36) { parts.push({ kind: 'spark', x: bl.x, y: bl.y, vx: -1, vy: -1, t: 0, life: 8 }); return true; }
    return false;
  }

  // ---------------------------------------------------------------------------
  // Bullets & particles
  // ---------------------------------------------------------------------------
  function updatePBullets() {
    for (const b of pbullets) {
      if (b.kind === 'F') {
        b.bx += b.vx; b.by += b.vy;
        b.ph += 0.32 * b.spinDir;
        b.x = b.bx + Math.cos(b.ph) * 7;
        b.y = b.by + Math.sin(b.ph) * 7;
      } else {
        b.x += b.vx; b.y += b.vy;
      }
      if (--b.life <= 0 || b.x < cam.x - 24 || b.x > cam.x + W + 24 || b.y < -24 || b.y > H + 24) { b.dead = true; continue; }
      const box = { x: b.x - b.r, y: b.y - b.r, w: b.r * 2, h: b.r * 2 };
      for (const e of ents) {
        if (e.dead || !e.active || !SHOOTABLE.has(e.type)) continue;
        if (e.type === 'piranha' && !e.visible) continue;
        if (b.hits && b.hits.has(e)) continue;
        const hb = e.type === 'piranha' ? { x: e.x, y: e.y, w: e.w, h: e.topY - e.y } : e;
        if (overlap(box, hb)) {
          damage(e, b.dmg);
          if (b.pierce) b.hits.add(e);
          else { b.dead = true; break; }
        }
      }
      if (b.dead) continue;
      if (bossHitBullet(b)) { b.dead = true; continue; }
      const cx = b.kind === 'F' ? b.bx : b.x, cy = b.kind === 'F' ? b.by : b.y;
      const tx = Math.floor(cx / TS), ty = Math.floor(cy / TS);
      const t = tileAt(tx, ty);
      if (SOLID.has(t)) {
        if (t === 'B' || t === '?') bumpTile(tx, ty, 'bullet');
        parts.push({ kind: 'spark', x: cx, y: cy, vx: -b.vx * 0.2, vy: -1, t: 0, life: 8 });
        b.dead = true;
      }
    }
    pbullets = pbullets.filter((b) => !b.dead);
  }

  function updateEBullets() {
    const p = player;
    const pb = p.prone ? { x: p.x - 4, y: p.y + 2, w: p.w + 8, h: p.h - 2 } : { x: p.x + 2, y: p.y + 3, w: p.w - 4, h: p.h - 4 };
    for (const b of ebullets) {
      b.vy += b.grav;
      b.x += b.vx; b.y += b.vy;
      if (b.x < cam.x - 16 || b.x > cam.x + W + 16 || b.y > H + 16 || b.y < -40) { b.dead = true; continue; }
      if (solidTile(Math.floor(b.x / TS), Math.floor(b.y / TS))) {
        b.dead = true;
        if (b.kind === 'shell') { explosion(b.x, b.y - 4, 0.7); noise(0.15, 0.08, 800); }
        continue;
      }
      if (!p.dying && !p.clear && overlap(pb, { x: b.x - b.r, y: b.y - b.r, w: b.r * 2, h: b.r * 2 })) {
        if (p.barrier > 0) { b.dead = true; continue; }
        if (p.inv > 0) continue;
        b.dead = true;
        hurtPlayer();
      }
    }
    ebullets = ebullets.filter((b) => !b.dead);
  }

  function updateParts() {
    for (const q of parts) {
      q.t++;
      switch (q.kind) {
        case 'debris': q.vy += 0.3; q.x += q.vx; q.y += q.vy; break;
        case 'spark': q.vy += 0.1; q.x += q.vx; q.y += q.vy; break;
        case 'text': q.y += q.vy; break;
        case 'coin':
          q.y += q.vy; q.vy += 0.3;
          if (q.t === q.life) parts.push({ kind: 'text', text: '200', x: q.x, y: q.y, vy: -0.6, t: 0, life: 40 });
          break;
        case 'flip': q.vy += 0.3; q.ent.x += q.vx; q.ent.y += q.vy; break;
        case 'firework':
          if (q.t % 10 === 1) explosion(q.x + rand(-40, 40), q.y + rand(-20, 20), 1.2);
          break;
      }
    }
    parts = parts.filter((q) => q.t < q.life);
    for (const b of bumps) b.t++;
    bumps = bumps.filter((b) => b.t < 10);
  }

  // ---------------------------------------------------------------------------
  // Player vs. world interactions
  // ---------------------------------------------------------------------------
  const COMBO = [100, 200, 400, 500, 800, 1000, 2000, 4000, 5000, 8000];
  function stompScore(e) {
    const p = player;
    const i = p.combo++;
    if (i >= COMBO.length) oneUp(e.x + 8, e.y);
    else addScore(COMBO[i], e.x + 8, e.y);
  }

  function playerInteract() {
    const p = player;
    if (p.dying || p.clear) return;
    const pb = { x: p.x + 1, y: p.y + 1, w: p.w - 2, h: p.h - 1 };

    for (const it of items) {
      if (it.dead || it.rise > 8 || !overlap(pb, it)) continue;
      it.dead = true;
      if (it.kind === 'mush') {
        if (p.big) { addScore(1000, it.x, it.y); sfx.power(); }
        else { grow(p); addScore(1000, it.x, it.y); }
      } else giveFalcon(p, it.weapon, it.x, it.y);
    }

    for (const e of ents) {
      if (e.dead || !e.active) continue;
      if (e.type === 'captrigger' || e.type === 'capsule' || e.type === 'turret') continue;
      if (e.type === 'piranha') {
        if (e.visible && overlap(pb, { x: e.x + 2, y: e.y, w: e.w - 4, h: e.topY - e.y })) {
          if (p.barrier > 0) killEnemy(e, 'shot'); else hurtPlayer();
        }
        continue;
      }
      if (!overlap(pb, e)) continue;
      if (e.type === 'coin') { e.dead = true; addCoin(); continue; }

      if (p.barrier > 0) { killEnemy(e, 'flip', p.face); continue; }

      const falling = p.vy > 0 && p.y + p.h - p.vy <= e.y + 8;
      if (e.type === 'koopa' && e.state === 'shell') {
        e.state = 'moving';
        e.vx = p.x + p.w / 2 < e.x + 8 ? 4 : -4;
        p.kickGrace = 12;
        if (falling) p.vy = -3.5;
        addScore(400, e.x + 8, e.y);
        sfx.kick();
        continue;
      }
      if (falling) {
        p.vy = btn('jump') ? -6 : -3.8;
        p.spin = false;
        stompScore(e);
        sfx.stomp();
        if (e.type === 'koopa') {
          if (e.state === 'walk') { e.state = 'shell'; e.shellT = 0; e.y += 8; e.h = 16; }
          e.vx = 0;
          e.state = 'shell';
          e.shellT = 0;
        } else {
          e.dead = true;
          parts.push({ kind: 'squish', type: e.type, x: e.x, y: e.y + e.h - 8, t: 0, life: 30 });
        }
        continue;
      }
      if (e.type === 'koopa' && e.state === 'moving' && p.kickGrace > 0) continue;
      hurtPlayer();
    }
  }

  function updateCamera() {
    const p = player;
    const target = p.x + p.w / 2 - 112;
    if (target > cam.x) cam.x = target;
    cam.x = clamp(cam.x, 0, LW * TS - W);
  }

  function updatePlay() {
    if (banner && --banner.t <= 0) banner = null;
    if (freeze > 0) {
      freeze--;
      if (player.morph > 0) player.morph--;
      return;
    }
    updatePlayer();
    if (player.dying) { updateParts(); return; }
    if (!player.clear) {
      updateEnts();
      updateItems();
      updateBoss();
      updatePBullets();
      updateEBullets();
      playerInteract();
    } else {
      updatePBullets();
    }
    updateParts();
    updateCamera();

    if (!player.clear && !player.dying) {
      if (++timeTick >= 24) {
        timeTick = 0;
        time--;
        if (time === 100 && !hurried) { hurried = true; sfx.hurry(); music.fast = true; }
        if (time <= 0) { time = 0; killPlayer(); }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Main loop
  // ---------------------------------------------------------------------------
  function tick() {
    pollInput();
    if (btnp('mute')) { muted = !muted; if (!muted) music.next = 0; }
    stateT++;
    switch (state) {
      case 'title':
        if (btnp('start') || btnp('jump')) { initAudio(); newGame(); }
        break;
      case 'intro':
        if (stateT > 140 || (stateT > 20 && btnp('start'))) {
          state = 'play'; stateT = 0;
          music.on = true; music.step = 0; music.next = 0;
          showBanner('WORLD 1-1  JUNGLE FORTRESS', 100);
        }
        break;
      case 'play':
        if (btnp('start') || btnp('pause')) { state = 'pause'; sfx.pause(); break; }
        updatePlay();
        break;
      case 'pause':
        if (btnp('start') || btnp('pause')) { state = 'play'; sfx.pause(); }
        break;
      case 'gameover':
      case 'clear':
        if (stateT > 60 && (btnp('start') || btnp('jump'))) { state = 'title'; stateT = 0; }
        break;
    }
    musicUpdate();
    frame++;
  }

  let acc = 0, lastT = performance.now();
  const STEP = 1000 / 60;
  function loop(now) {
    acc += Math.min(100, now - lastT);
    lastT = now;
    while (acc >= STEP) { tick(); acc -= STEP; }
    render();
    requestAnimationFrame(loop);
  }

  // ---------------------------------------------------------------------------
  // Rendering: palette & cached tiles
  // ---------------------------------------------------------------------------
  const C = {
    sky: '#5c94fc', black: '#000', white: '#fcfcfc',
    brick: '#c84c0c', brickHi: '#fcbcb0', brickDk: '#7c2c00',
    gold: '#fca044', goldHi: '#fce0a8', goldDk: '#7c3c00',
    steel: '#8c8c9c', steelHi: '#d8d8e8', steelDk: '#3c3c4c',
    pipe: '#00a800', pipeHi: '#80d010', pipeDk: '#005000',
    skin: '#fcbc94', hair: '#5c2c0c', red: '#e40058', blue: '#2038ec', boot: '#7c3c00',
    gun: '#a0a0a8', gunDk: '#3c3c44', must: '#3c1c00',
  };

  function makeCanvas(w, h, draw) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    draw((x, y, ww, hh, col) => { g.fillStyle = col; g.fillRect(x, y, ww, hh); }, g);
    return c;
  }

  const QMARK = ['.###.', '#...#', '....#', '...#.', '..#..', '.....', '..#..'];
  const tiles = {};
  function buildTiles() {
    tiles['#'] = makeCanvas(16, 16, (r) => {
      r(0, 0, 16, 16, C.brick);
      r(0, 0, 16, 1, C.brickHi); r(0, 0, 1, 16, C.brickHi);
      r(15, 0, 1, 16, C.black); r(0, 15, 16, 1, C.black);
      r(9, 1, 1, 9, C.black); r(10, 9, 5, 1, C.black); r(1, 10, 8, 1, C.black);
      r(10, 1, 1, 8, C.brickHi); r(1, 11, 1, 4, C.brickHi);
      r(6, 11, 1, 4, C.black);
    });
    tiles['B'] = makeCanvas(16, 16, (r) => {
      r(0, 0, 16, 16, C.brick);
      r(0, 0, 16, 1, C.brickHi);
      for (let y = 3; y < 16; y += 4) r(0, y, 16, 1, C.black);
      for (let row = 0; row < 4; row++) {
        const off = row % 2 ? 4 : 12;
        r(off, row * 4, 1, 3, C.black);
        r((off + 8) % 16, row * 4, 1, 3, C.black);
      }
    });
    const qb = (base, hi, dk) => makeCanvas(16, 16, (r) => {
      r(0, 0, 16, 16, base);
      r(0, 0, 16, 1, hi); r(0, 0, 1, 16, hi);
      r(15, 0, 1, 16, C.black); r(0, 15, 16, 1, C.black);
      for (const [x, y] of [[2, 2], [13, 2], [2, 13], [13, 13]]) r(x, y, 1, 1, dk);
      for (let y = 0; y < QMARK.length; y++) for (let x = 0; x < 5; x++) {
        if (QMARK[y][x] === '#') { r(5 + x, 4 + y, 1, 1, dk); r(6 + x, 5 + y, 1, 1, C.black); }
      }
    });
    tiles['?0'] = qb(C.gold, C.goldHi, C.goldDk);
    tiles['?1'] = qb('#e88c2c', C.goldHi, C.goldDk);
    tiles['?2'] = qb('#c87420', '#fcc070', C.goldDk);
    tiles['U'] = makeCanvas(16, 16, (r) => {
      r(0, 0, 16, 16, C.goldDk);
      r(0, 0, 16, 1, '#a85c20'); r(0, 0, 1, 16, '#a85c20');
      r(15, 0, 1, 16, C.black); r(0, 15, 16, 1, C.black);
      for (const [x, y] of [[2, 2], [13, 2], [2, 13], [13, 13]]) r(x, y, 1, 1, C.black);
    });
    tiles['X'] = makeCanvas(16, 16, (r) => {
      r(0, 0, 16, 16, C.steel);
      r(0, 0, 16, 2, C.steelHi); r(0, 0, 2, 16, C.steelHi);
      r(14, 0, 2, 16, C.steelDk); r(0, 14, 16, 2, C.steelDk);
      r(4, 4, 8, 8, '#a8a8b8'); r(4, 4, 8, 1, C.steelDk); r(4, 4, 1, 8, C.steelDk);
      for (const [x, y] of [[3, 3], [12, 3], [3, 12], [12, 12]]) r(x, y, 1, 1, C.black);
    });
    tiles['T'] = tiles['X'];
    tiles['['] = makeCanvas(16, 16, (r) => {
      r(0, 0, 16, 16, C.pipe); r(0, 0, 16, 1, C.black); r(0, 15, 16, 1, C.black); r(0, 0, 1, 16, C.black);
      r(2, 1, 2, 14, C.pipeHi); r(6, 1, 1, 14, C.pipeHi);
    });
    tiles[']'] = makeCanvas(16, 16, (r) => {
      r(0, 0, 16, 16, C.pipe); r(0, 0, 16, 1, C.black); r(0, 15, 16, 1, C.black); r(15, 0, 1, 16, C.black);
      r(10, 1, 4, 14, C.pipeDk); r(4, 1, 1, 14, C.pipeHi);
    });
    tiles['{'] = makeCanvas(16, 16, (r) => {
      r(2, 0, 14, 16, C.pipe); r(2, 0, 1, 16, C.black);
      r(4, 0, 2, 16, C.pipeHi); r(8, 0, 1, 16, C.pipeHi);
    });
    tiles['}'] = makeCanvas(16, 16, (r) => {
      r(0, 0, 14, 16, C.pipe); r(13, 0, 1, 16, C.black);
      r(8, 0, 4, 16, C.pipeDk); r(2, 0, 1, 16, C.pipeHi);
    });
  }

  // Goomba-style grunt, pixel map
  const WALKER_MAP = [
    '......bbbb......',
    '.....bbbbbb.....',
    '....bbbbbbbb....',
    '...bbbbbbbbbb...',
    '..bkkbbbbbbkkb..',
    '.bbbwkkbbkkwbbb.',
    '.bbbwkwbbwkwbbb.',
    'bbbbwwwbbwwwbbbb',
    'bbbbbbbbbbbbbbbb',
    'bbbbbbbbbbbbbbbb',
    '.bbbbssssssbbbb.',
    '....ssssssss....',
    '...ssssssssss...',
    '..kkksssssskk...',
    '.kkkkkkssskkkk..',
    '.kkkkkk..kkkkk..',
  ];
  const WALKER_PAL = { b: '#c84c0c', k: '#000', w: '#fcbcb0', s: '#fcbcb0' };
  let walkerImg = [];
  function buildSprites() {
    const mk = (map, pal, flip) => makeCanvas(16, map.length, (r) => {
      map.forEach((row, y) => {
        for (let x = 0; x < 16; x++) {
          const ch = row[flip ? 15 - x : x] || '.';
          if (pal[ch]) r(x, y, 1, 1, pal[ch]);
        }
      });
    });
    walkerImg = [mk(WALKER_MAP, WALKER_PAL, false), mk(WALKER_MAP, WALKER_PAL, true)];
  }

  // ---------------------------------------------------------------------------
  // Rendering: helpers
  // ---------------------------------------------------------------------------
  function text(str, x, y, col = C.white, size = 8, align = 'left') {
    ctx.font = `bold ${size}px "Courier New", monospace`;
    ctx.textAlign = align;
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#000';
    ctx.fillText(str, x + 1, y + 1);
    ctx.fillStyle = col;
    ctx.fillText(str, x, y);
  }
  function pline(x0, y0, x1, y1, t, col) {
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0)));
    ctx.fillStyle = col;
    for (let i = 0; i <= n; i++) {
      const x = x0 + ((x1 - x0) * i) / n, y = y0 + ((y1 - y0) * i) / n;
      ctx.fillRect(Math.round(x - t / 2), Math.round(y - t / 2), t, t);
    }
  }
  function disc(x, y, r, col) {
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }

  // ---------------------------------------------------------------------------
  // Rendering: background
  // ---------------------------------------------------------------------------
  function drawBackground(cx) {
    R(0, 0, W, H, C.sky);
    // distant jungle mountains
    const mp = cx * 0.2;
    ctx.fillStyle = '#3c8c6c';
    for (let i = -1; i < 6; i++) {
      const bx = i * 120 - (mp % 120);
      ctx.beginPath();
      ctx.moveTo(bx - 20, GROUND_Y);
      ctx.lineTo(bx + 40, 120);
      ctx.lineTo(bx + 60, 132);
      ctx.lineTo(bx + 90, 104);
      ctx.lineTo(bx + 150, GROUND_Y);
      ctx.fill();
    }
    // clouds
    const cp = cx * 0.35;
    for (let i = -1; i < 5; i++) {
      const k = Math.floor((cp + i * 90) / 90);
      const bx = k * 90 - cp + ((k * 37) % 40);
      const by = 24 + ((k * 53) % 40);
      disc(bx, by + 6, 8, C.white); disc(bx + 10, by, 10, C.white); disc(bx + 22, by + 6, 8, C.white);
      R(bx - 4, by + 6, 30, 8, C.white);
    }
    // hills
    const hp = cx * 0.5;
    for (let i = -1; i < 4; i++) {
      const k = Math.floor((hp + i * 160) / 160);
      const bx = k * 160 - hp;
      const big = k % 2 === 0;
      const hh = big ? 40 : 24;
      ctx.fillStyle = '#00a800';
      ctx.beginPath();
      ctx.moveTo(bx, GROUND_Y);
      ctx.quadraticCurveTo(bx + hh * 1.2, GROUND_Y - hh * 2, bx + hh * 2.4, GROUND_Y);
      ctx.fill();
      R(bx + hh * 1.0, GROUND_Y - hh * 0.7, 2, 6, C.black);
      R(bx + hh * 1.4, GROUND_Y - hh * 0.7, 2, 6, C.black);
    }
    // palm trees (jungle flavour)
    const pp = cx * 0.7;
    for (let i = -1; i < 3; i++) {
      const k = Math.floor((pp + i * 140) / 140);
      const bx = k * 140 - pp + 60;
      for (let s = 0; s < 9; s++) R(Math.round(bx + Math.sin(s * 0.3) * 4), GROUND_Y - 8 - s * 8, 4, 8, s % 2 ? '#a0541c' : '#7c3c00');
      const tx = bx + Math.sin(8 * 0.3) * 4 + 2, ty = GROUND_Y - 76;
      for (const [dx, dy] of [[-22, 8], [22, 8], [-16, 14], [16, 14], [-8, -6], [10, -6]]) pline(tx, ty, tx + dx, ty + dy, 3, '#007800');
      R(tx - 3, ty - 2, 6, 5, '#7c3c00');
    }
  }

  function drawTiles(cx) {
    const x0 = Math.floor(cx / TS), x1 = Math.min(LW - 1, x0 + Math.ceil(W / TS) + 1);
    const qFrame = [0, 0, 0, 1, 2, 1][Math.floor(frame / 8) % 6];
    for (let ty = 0; ty < LH; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        const c = grid[ty][tx];
        if (c === '.' || c === 'T') continue;
        let img = c === '?' ? tiles['?' + qFrame] : tiles[c];
        if (!img) continue;
        let oy = 0;
        for (const b of bumps) if (b.tx === tx && b.ty === ty) oy = -Math.round(Math.sin((b.t / 10) * Math.PI) * 5);
        ctx.drawImage(img, tx * TS - cx, ty * TS + oy);
      }
    }
    // bushes on the ground (decoration)
    for (let tx = x0 - 3; tx <= x1; tx++) {
      if (tx < 0 || (tx * 7) % 23 !== 3 || tileAt(tx, 13) !== '#' || tileAt(tx, 12) !== '.' || tileAt(tx + 1, 12) !== '.') continue;
      const bx = tx * TS - cx, by = GROUND_Y;
      disc(bx + 6, by - 2, 7, '#00a800'); disc(bx + 16, by - 4, 9, '#00a800'); disc(bx + 26, by - 2, 7, '#00a800');
      disc(bx + 14, by - 6, 3, '#80d010');
      R(bx - 1, by - 1, 34, 1, '#005000');
    }
  }

  function drawFlagAndCastle(cx, p) {
    const fx = FLAG_TX * TS + 7 - cx;
    if (fx < -40 || fx > W + 100) return;
    R(fx, 2 * TS + 8, 2, 10 * TS - 8, '#a8e010');
    disc(fx + 1, 2 * TS + 6, 4, '#00a800');
    R(fx - 1, 2 * TS + 3, 2, 2, '#80d010');
    const fy = p.clear ? p.clear.flagY : 3 * TS;
    // flag: red with white falcon wing emblem
    ctx.fillStyle = C.red;
    ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(fx - 18, fy + 7); ctx.lineTo(fx, fy + 14); ctx.fill();
    R(fx - 9, fy + 5, 6, 2, C.white); R(fx - 7, fy + 7, 3, 2, C.white);

    const bx = CASTLE_TX * TS - cx, top = GROUND_Y - 80;
    const brick = (x, y, w, h) => {
      R(x, y, w, h, C.brick);
      for (let yy = 0; yy < h; yy += 4) {
        R(x, y + yy + 3, w, 1, C.black);
        for (let xx = (yy / 4) % 2 ? 4 : 0; xx < w; xx += 8) R(x + xx, y + yy, 1, 3, C.black);
      }
    };
    brick(bx, top + 40, 80, 40);
    brick(bx + 16, top, 48, 32);
    for (let i = 0; i < 5; i++) brick(bx + i * 16 + 2, top + 32, 12, 8);
    for (let i = 0; i < 3; i++) brick(bx + 16 + i * 16 + 2, top - 8, 12, 8);
    R(bx + 32, top + 56, 16, 24, C.black);
    disc(bx + 40, top + 56, 8, C.black);
    R(bx + 24, top + 12, 6, 12, C.black); R(bx + 50, top + 12, 6, 12, C.black);
    // castle flag pops up after clear
    if (p.clear && (p.clear.phase === 'done' || p.clear.phase === 'tally')) {
      R(bx + 39, top - 26, 2, 18, '#fcfcfc');
      R(bx + 41, top - 26, 12, 8, C.red);
    }
  }

  // ---------------------------------------------------------------------------
  // Rendering: actors
  // ---------------------------------------------------------------------------
  function drawPlayerAt(p, sx, bottom, big) {
    const cx = Math.round(sx + p.w / 2);
    const f = p.face;
    bottom = Math.round(bottom);

    if (p.dying) {
      // arms up, facing camera
      const top = bottom - 15;
      R(cx - 4, top, 8, 6, C.skin); R(cx - 4, top, 8, 2, C.hair); R(cx - 4, top + 2, 8, 1, C.red);
      R(cx - 3, top + 3, 1, 1, C.black); R(cx + 2, top + 3, 1, 1, C.black); R(cx - 2, top + 5, 4, 1, C.must);
      R(cx - 4, top + 6, 8, 5, C.blue); R(cx - 7, top + 1, 3, 6, C.skin); R(cx + 4, top + 1, 3, 6, C.skin);
      R(cx - 4, top + 11, 3, 4, C.boot); R(cx + 1, top + 11, 3, 4, C.boot);
      return;
    }

    if (p.prone && !p.morph) {
      const y = bottom - 7;
      const back = cx - f * 13;
      R(Math.min(back, back + f * 10), y + 2, 10, 4, C.blue);
      R(back - (f > 0 ? 3 : -0), y + 3, 3, 3, C.boot);
      R(Math.min(cx - f * 3, cx - f * 3 + f * 8), y + 1, 8, 5, C.skin);
      R(cx - 3 + f * 6, y - 1, 7, 6, C.skin);
      R(cx - 3 + f * 6, y - 1, 7, 2, C.hair);
      R(cx - 3 + f * 6, y + 1, 7, 1, C.red);
      R(cx + f * 6 + (f > 0 ? 2 : -3), y + 2, 1, 1, C.black);
      pline(cx + f * 6, y + 4, cx + f * 16, y + 4, 2, C.gunDk);
      R(cx + f * 16 - 1, y + 3, 2, 1, C.gun);
      return;
    }

    if (p.spin && !p.onGround && !p.morph) {
      // Contra somersault
      const cy = Math.round(bottom - p.h / 2);
      const a = Math.floor(p.anim / 3) % 4;
      const cols = [C.skin, C.blue, C.red, C.skin];
      const offs = [[-6, -6], [0, -6], [0, 0], [-6, 0]];
      for (let i = 0; i < 4; i++) {
        const [ox, oy] = offs[(i + (f > 0 ? a : 4 - a)) % 4];
        R(cx + ox, cy + oy, 6, 6, cols[i]);
      }
      R(cx - 2, cy - 2, 4, 4, C.hair);
      return;
    }

    const bootH = big ? 3 : 2, legH = big ? 8 : 3, torsoH = big ? 8 : 4, headH = big ? 8 : 6;
    const legTop = bottom - bootH - legH;
    const tTop = legTop - torsoH;
    const hTop = tTop - headH;
    const moving = Math.abs(p.vx) > 0.2 && p.onGround;
    const wf = moving ? Math.floor(p.anim / (Math.abs(p.vx) > 2 ? 4 : 6)) % 4 : 0;
    const stride = p.onGround ? [0, 2, 0, -2][wf] : 2;
    const lw = big ? 3 : 2;

    // legs
    const legX1 = cx - lw - 1 + stride * f, legX2 = cx + 1 - stride * f;
    R(legX1, legTop, lw, legH, '#1828b0');
    R(legX2, legTop, lw, legH, C.blue);
    R(legX1 + (f > 0 ? 0 : -1), bottom - bootH, lw + 1, bootH, C.boot);
    R(legX2 + (f > 0 ? 0 : -1), bottom - bootH, lw + 1, bootH, C.boot);

    // torso: bare chest + overall bib
    const tw = big ? 8 : 6;
    R(cx - tw / 2, tTop, tw, torsoH, C.skin);
    R(cx - tw / 2, tTop + Math.floor(torsoH / 2), tw, Math.ceil(torsoH / 2), C.blue);
    R(cx - tw / 2 + 1, tTop, 1, torsoH, C.blue);
    R(cx + tw / 2 - 2, tTop, 1, torsoH, C.blue);
    if (big) R(cx - 1, tTop + 5, 2, 1, '#fce000');

    // head
    const hw = big ? 8 : 6;
    const hx = cx - hw / 2 + f;
    R(hx, hTop, hw, headH, C.skin);
    R(hx, hTop, hw, big ? 2 : 1, C.hair);
    R(f > 0 ? hx : hx + hw - 2, hTop, 2, headH - 2, C.hair);
    R(hx, hTop + (big ? 2 : 1), hw, big ? 2 : 1, C.red);
    // bandana tails flapping
    const flap = Math.floor(p.anim / 5) % 2;
    const tailX = f > 0 ? hx - 4 : hx + hw;
    R(tailX, hTop + (big ? 2 : 1) + flap, 4, 1, C.red);
    R(tailX + (f > 0 ? -2 : 2), hTop + (big ? 3 : 2) - flap, 3, 1, C.red);
    // face
    const ex = f > 0 ? hx + hw - 3 : hx + 2;
    R(ex, hTop + (big ? 4 : 3), 1, big ? 2 : 1, C.black);
    R(f > 0 ? hx + hw - 4 : hx, hTop + headH - (big ? 2 : 1), 4, 1, C.must);
    R(f > 0 ? hx + hw : hx - 1, hTop + (big ? 4 : 3), 1, 2, C.skin);

    // arm + gun along the aim vector
    const n = aimVec(p);
    const shX = cx + (p.aim.x === 0 ? f * 3 : 0), shY = tTop + 2;
    const L = big ? 12 : 10;
    const gx0 = shX + n.x * 3, gy0 = shY + n.y * 3;
    const gx1 = shX + n.x * L, gy1 = shY + n.y * L;
    pline(shX, shY, gx0 + n.x * 2, gy0 + n.y * 2, 2, C.skin);
    pline(gx0, gy0, gx1, gy1, 2, C.gunDk);
    R(Math.round(gx1 - 1), Math.round(gy1 - 1), 2, 2, C.gun);
  }

  function drawPlayer(cx) {
    const p = player;
    if (p.hidden) return;
    if (p.inv > 0 && !p.morph && Math.floor(frame / 2) % 2) return;
    let big = p.big;
    if (p.morph > 0) big = Math.floor(p.morph / 4) % 2 ? p.morphFrom : p.big;
    const sx = p.x - cx;
    if (p.barrier > 0) {
      const cols = ['#fc7460', '#fce000', '#3cbcfc', '#fcfcfc'];
      const col = cols[Math.floor(frame / 3) % 4];
      if (p.barrier > 120 || Math.floor(frame / 4) % 2) {
        ctx.strokeStyle = col; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.ellipse(sx + p.w / 2, p.y + p.h / 2, p.w / 2 + 6, p.h / 2 + 5, 0, 0, Math.PI * 2); ctx.stroke();
      }
    }
    drawPlayerAt(p, sx, p.y + p.h, big);
  }

  function drawWalker(e, sx, sy) {
    const img = walkerImg[Math.floor(e.t / 10) % 2];
    ctx.drawImage(img, Math.round(sx), Math.round(sy));
    // tiny army helmet for the Contra touch
    R(Math.round(sx) + 4, Math.round(sy) - 1, 8, 2, '#5c7c2c');
  }
  function drawKoopa(e, sx, sy) {
    sx = Math.round(sx); sy = Math.round(sy);
    const f = e.vx > 0 ? 1 : -1;
    if (e.state !== 'walk') {
      const wob = e.state === 'shell' && e.shellT > 330 && Math.floor(e.t / 3) % 2 ? 1 : 0;
      R(sx + 1 + wob, sy + 3, 14, 11, '#00a800');
      R(sx + 3 + wob, sy + 4, 10, 5, '#80d010');
      R(sx + 1 + wob, sy + 11, 14, 3, C.white);
      R(sx + 6 + wob, sy + 4, 1, 7, '#005000'); R(sx + 9 + wob, sy + 4, 1, 7, '#005000');
      if (e.state === 'shell' && e.shellT > 330) { R(sx + 3, sy + 14, 3, 2, '#fcbc94'); R(sx + 10, sy + 14, 3, 2, '#fcbc94'); }
      return;
    }
    const step = Math.floor(e.t / 8) % 2;
    // head
    const hx = f > 0 ? sx + 10 : sx;
    R(hx, sy, 6, 7, '#fcd8a8'); R(hx + (f > 0 ? 3 : 1), sy + 2, 2, 2, C.black);
    R(hx + (f > 0 ? 0 : 2), sy + 7, 4, 4, '#fcd8a8');
    // shell
    R(sx + 2, sy + 9, 12, 10, '#00a800');
    R(sx + 4, sy + 10, 8, 5, '#80d010');
    R(sx + 2, sy + 17, 12, 2, C.white);
    // feet
    R(sx + 2 + step * 2, sy + 19, 4, 5, '#fcd8a8');
    R(sx + 10 - step * 2, sy + 19, 4, 5, '#fcd8a8');
    R(sx + 1 + step * 2, sy + 22, 5, 2, '#c87420');
    R(sx + 9 - step * 2, sy + 22, 5, 2, '#c87420');
  }
  function drawSoldier(e, sx, sy) {
    sx = Math.round(sx); sy = Math.round(sy);
    const f = e.face;
    const cx = sx + 8;
    const run = e.pause > 0 ? 0 : Math.floor(e.t / 5) % 4;
    const st = [0, 2, 0, -2][run];
    // legs
    R(cx - 4 + st, sy + 15, 3, 7, '#4c4c5c'); R(cx + 1 - st, sy + 15, 3, 7, '#5c5c6c');
    R(cx - 4 + st, sy + 22, 4, 2, C.black); R(cx + 1 - st, sy + 22, 4, 2, C.black);
    // body
    R(cx - 4, sy + 7, 8, 8, '#8c8c9c'); R(cx - 4, sy + 13, 8, 2, '#5c3c1c');
    // head + red beret
    R(cx - 3, sy + 1, 6, 6, C.skin);
    R(cx - 4, sy, 8, 2, '#c80018'); R(f > 0 ? cx - 4 : cx + 2, sy + 2, 2, 2, '#c80018');
    R(f > 0 ? cx + 1 : cx - 2, sy + 3, 1, 1, C.black);
    // rifle
    pline(cx, sy + 9, cx + f * 10, sy + 9, 2, C.gunDk);
    R(cx + f * 2 - 1, sy + 9, 3, 2, C.skin);
    if (e.pause > 0 && e.pause < 14 && e.pause > 8) R(cx + f * 11 - 1, sy + 8, 3, 3, '#fce000');
  }
  function drawTurret(e, sx, sy) {
    sx = Math.round(sx); sy = Math.round(sy);
    R(sx, sy, 16, 16, C.steelDk);
    R(sx + 1, sy + 1, 14, 14, '#5c5c6c');
    disc(sx + 8, sy + 8, 6, e.flash ? C.white : '#9c2c2c');
    disc(sx + 8, sy + 8, 3, e.flash ? C.white : '#fc7460');
    pline(sx + 8, sy + 8, sx + 8 + Math.cos(e.aim) * 11, sy + 8 + Math.sin(e.aim) * 11, 3, '#1c1c24');
    for (const [x, y] of [[1, 1], [14, 1], [1, 14], [14, 14]]) R(sx + x, sy + y, 1, 1, C.steelHi);
  }
  function drawPiranha(e, sx, sy) {
    sx = Math.round(sx); sy = Math.round(sy);
    const open = Math.floor(e.t / 8) % 2;
    R(sx + 7, sy + 12, 2, 12, '#00a800');
    R(sx + 2, sy + 16, 5, 3, '#00a800'); R(sx + 9, sy + 18, 5, 3, '#00a800');
    R(sx + 2, sy, 12, 6 - open * 2, '#d82800');
    R(sx + 2, sy + 7 + open, 12, 5 - open, '#d82800');
    R(sx + 3, sy + 6 - open * 2, 10, 1 + open * 3, '#fcfcfc');
    R(sx + 4, sy + 1, 2, 2, C.white); R(sx + 10, sy + 2, 2, 2, C.white); R(sx + 6, sy + 9, 2, 2, C.white);
  }
  function drawCoinEnt(e, sx, sy) {
    const k = Math.floor(frame / 8) % 4;
    const w = [8, 6, 2, 6][k];
    sx = Math.round(sx + 5 - w / 2); sy = Math.round(sy);
    R(sx, sy, w, 14, '#fca044');
    if (w > 2) R(sx + 1, sy + 1, w - 2, 12, '#fce0a8');
    if (w > 4) R(sx + w / 2 - 1, sy + 3, 2, 8, '#c87420');
  }
  function drawCapsule(e, sx, sy) {
    sx = Math.round(sx); sy = Math.round(sy);
    const flap = Math.floor(e.t / 4) % 2;
    R(sx + 2, sy + (flap ? -3 : 1), 6, 4, '#c8c8d8');
    R(sx + 16, sy + (flap ? -3 : 1), 6, 4, '#c8c8d8');
    R(sx + 4, sy + 3, 16, 9, '#8c8c9c');
    R(sx + 6, sy + 4, 12, 3, '#d8d8e8');
    R(sx + 1, sy + 6, 3, 4, '#5c5c6c'); R(sx + 20, sy + 6, 3, 4, '#5c5c6c');
    R(sx + 11, sy + 8, 3, 3, Math.floor(e.t / 6) % 2 ? '#fc3c3c' : '#7c0000');
  }
  function drawFalcon(x, y, letter, t) {
    x = Math.round(x); y = Math.round(y);
    const flap = Math.floor(t / 6) % 2;
    // wings
    for (let i = 0; i < 3; i++) {
      R(x - i * 2 + 1, y + 3 + i * 2 - flap, 6, 2, i % 2 ? '#a8a8b8' : '#fcfcfc');
      R(x + 9 + i * 2, y + 3 + i * 2 - flap, 6, 2, i % 2 ? '#a8a8b8' : '#fcfcfc');
    }
    // body
    R(x + 4, y, 8, 14, '#d8d8e8');
    R(x + 5, y + 1, 6, 12, '#fcfcfc');
    R(x + 6, y - 2, 4, 3, '#fce000');
    ctx.font = 'bold 9px "Courier New", monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillStyle = '#e40058';
    ctx.fillText(letter, x + 8, y + 2);
  }
  function drawMushroom(x, y) {
    x = Math.round(x); y = Math.round(y);
    R(x + 1, y + 2, 14, 7, '#d82800');
    R(x + 4, y, 8, 2, '#d82800');
    R(x + 5, y + 2, 6, 3, C.white); R(x + 1, y + 5, 3, 3, C.white); R(x + 12, y + 5, 3, 3, C.white);
    R(x + 3, y + 9, 10, 7, '#fcd8a8');
    R(x + 6, y + 10, 1, 3, C.black); R(x + 9, y + 10, 1, 3, C.black);
  }

  function drawEnt(e, sx, sy) {
    switch (e.type) {
      case 'walker': drawWalker(e, sx, sy); break;
      case 'koopa': drawKoopa(e, sx, sy); break;
      case 'soldier': drawSoldier(e, sx, sy); break;
      case 'turret': drawTurret(e, sx, sy); break;
      case 'piranha': drawPiranha(e, sx, sy); break;
      case 'coin': drawCoinEnt(e, sx, sy); break;
      case 'capsule': drawCapsule(e, sx, sy); break;
    }
  }

  function drawBoss(cx) {
    const b = boss;
    if (b.gone) return;
    const x = Math.round(b.x - cx);
    if (x > W + 10) return;
    const shake = b.dying ? Math.round(rand(-2, 2)) : 0;
    const X = x + shake;
    // wall body
    R(X, 36, 64, GROUND_Y - 36, '#4c4c5c');
    for (let y = 36; y < GROUND_Y; y += 16) {
      R(X, y, 64, 1, '#2c2c3c');
      for (let xx = (y / 16) % 2 ? 0 : 8; xx < 64; xx += 16) R(X + xx, y, 1, 16, '#2c2c3c');
    }
    R(X, 36, 64, 4, '#8c8c9c');
    R(X + 2, 28, 12, 8, '#4c4c5c'); R(X + 26, 28, 12, 8, '#4c4c5c'); R(X + 50, 28, 12, 8, '#4c4c5c');
    // warning stripes
    for (let i = 0; i < 8; i++) R(X + i * 8, 64, 4, 4, '#fce000');
    // sensor lights
    for (let i = 0; i < 3; i++) R(X + 14 + i * 14, 48, 6, 6, Math.floor(frame / 10 + i) % 3 ? '#7c0000' : '#fc3c3c');
    // cannons
    for (const c of b.cannons) {
      const cxp = Math.round(c.x - cx) + shake;
      if (c.hp <= 0) { R(cxp + 10, c.y - 2, 10, 16, '#1c1c1c'); continue; }
      R(cxp + 10, c.y - 2, 10, 16, '#2c2c3c');
      R(cxp, c.y + 3, 16, 6, c.flash ? C.white : '#7c7c8c');
      R(cxp, c.y + 3, 3, 6, '#1c1c24');
    }
    // core
    const k = b.core;
    const kx = Math.round(k.x - cx) + shake;
    R(kx - 2, k.y - 4, k.w + 4, k.h + 8, '#2c2c3c');
    const pulse = Math.floor(frame / 6) % 2;
    R(kx, k.y, k.w, k.h, k.flash ? C.white : pulse ? '#d80018' : '#fc3c3c');
    R(kx + 4, k.y + 4, k.w - 8, k.h - 8, k.flash ? C.white : '#fc7460');
    R(kx + 7, k.y + 10, k.w - 14, k.h - 20, '#fce0a8');
    // health bar
    if (b.active && !b.dying) {
      const total = 40 + 24;
      const hp = Math.max(0, k.hp) + b.cannons.reduce((s, c) => s + Math.max(0, c.hp), 0);
      text('WALL', 176, 18, '#fc7460', 7);
      R(200, 20, 50, 5, '#000');
      R(201, 21, Math.round(48 * hp / total), 3, '#fc3c3c');
    }
  }

  function drawPBullet(b, cx) {
    const x = b.x - cx, y = b.y;
    switch (b.kind) {
      case 'N': case 'M':
        R(Math.round(x) - 1, Math.round(y) - 1, 3, 3, C.white);
        R(Math.round(x), Math.round(y), 1, 1, '#fc7460');
        break;
      case 'S':
        disc(x, y, 3, '#fc3c3c'); disc(x, y, 1.6, '#fce0a8');
        break;
      case 'L': {
        const len = 18;
        pline(x - b.nx * len, y - b.ny * len, x, y, 3, '#3cbcfc');
        pline(x - b.nx * len, y - b.ny * len, x, y, 1, '#e0f8fc');
        break;
      }
      case 'F':
        disc(x, y, 4, Math.floor(frame / 2) % 2 ? '#fc7400' : '#fc3c00');
        disc(x, y, 2, '#fce000');
        break;
    }
  }
  function drawEBullet(b, cx) {
    const x = b.x - cx;
    if (b.kind === 'pellet') { R(Math.round(x) - 1, Math.round(b.y) - 1, 3, 3, '#fcfcfc'); R(Math.round(x), Math.round(b.y), 1, 1, '#fc3c3c'); }
    else if (b.kind === 'fireball') { disc(x, b.y, 3, '#fc7400'); disc(x, b.y, 1.5, '#fce000'); }
    else { disc(x, b.y, 3.5, '#3c3c44'); R(Math.round(x) - 1, Math.round(b.y) - 2, 1, 1, '#c8c8d8'); }
  }

  function drawParts(cx) {
    for (const q of parts) {
      const x = q.x - cx;
      switch (q.kind) {
        case 'debris':
          R(Math.round(x), Math.round(q.y), 5, 5, C.brick);
          R(Math.round(x), Math.round(q.y), 2, 2, C.black);
          break;
        case 'spark':
          R(Math.round(x), Math.round(q.y), 2, 2, q.t % 4 < 2 ? '#fce000' : '#fcfcfc');
          break;
        case 'flash':
          R(Math.round(x) - 2, Math.round(q.y) - 2, 4, 4, '#fce0a8');
          break;
        case 'explo': {
          const k = q.t / q.life;
          const r = (4 + k * 14) * q.s;
          disc(x, q.y, r, k < 0.3 ? '#fcfcfc' : k < 0.6 ? '#fce000' : '#fc7400');
          disc(x, q.y, r * 0.6, k < 0.5 ? '#fcfcfc' : '#fc3c00');
          if (k > 0.6) disc(x, q.y, r * 0.3, '#7c0000');
          break;
        }
        case 'text':
          text(q.text, Math.round(x), Math.round(q.y), C.white, 7, 'center');
          break;
        case 'coin':
          R(Math.round(x), Math.round(q.y), 8, 14, '#fca044');
          R(Math.round(x) + 2, Math.round(q.y) + 2, 4, 10, '#fce0a8');
          break;
        case 'squish':
          if (q.type === 'walker') {
            R(Math.round(x), Math.round(q.y), 16, 8, '#c84c0c');
            R(Math.round(x) + 3, Math.round(q.y) + 2, 3, 2, C.white); R(Math.round(x) + 10, Math.round(q.y) + 2, 3, 2, C.white);
            R(Math.round(x), Math.round(q.y) + 6, 6, 2, C.black); R(Math.round(x) + 10, Math.round(q.y) + 6, 6, 2, C.black);
          } else {
            R(Math.round(x), Math.round(q.y) + 2, 16, 6, '#8c8c9c');
            R(Math.round(x) + 2, Math.round(q.y), 6, 3, '#c80018');
          }
          break;
        case 'flip': {
          const e = q.ent;
          ctx.save();
          ctx.translate(0, Math.round(e.y) * 2 + e.h);
          ctx.scale(1, -1);
          drawEnt(e, e.x - cx, e.y);
          ctx.restore();
          break;
        }
      }
    }
  }

  function drawHUD() {
    const p = player;
    R(0, 0, W, 16, 'rgba(0,0,0,0.35)');
    text('SCORE', 6, 2, C.white, 7);
    text(String(game.score).padStart(7, '0'), 6, 9, C.white, 7);
    // coin
    R(52, 9, 4, 6, '#fca044');
    text('x' + String(game.coins).padStart(2, '0'), 58, 8, C.white, 7);
    text('WORLD', 82, 2, C.white, 7);
    text(' 1-1', 82, 9, C.white, 7);
    // weapon
    text('GUN', 118, 2, C.white, 7);
    R(118, 9, 12, 7, '#e40058');
    text(p.weapon, 121, 9, C.white, 7);
    if (p.rapid) { R(131, 9, 7, 7, '#3cbcfc'); text('R', 132, 9, C.white, 7); }
    if (p.barrier > 0) { R(139, 9, 7, 7, '#fce000'); text('B', 140, 9, '#000', 7); }
    text('LIVES', 154, 2, C.white, 7);
    for (let i = 0; i < Math.min(game.lives, 6); i++) { R(155 + i * 5, 10, 3, 5, '#3cbcfc'); R(155 + i * 5, 10, 3, 1, C.white); }
    if (game.lives > 6) text('+', 186, 9, C.white, 7);
    text('TIME', 222, 2, C.white, 7);
    text(String(Math.max(0, time)).padStart(3, '0'), 224, 9, time <= 100 && Math.floor(frame / 15) % 2 ? '#fc3c3c' : C.white, 7);
  }

  function drawWorld() {
    const cx = Math.round(cam.x);
    drawBackground(cx);
    // piranhas live behind the pipes
    for (const e of ents) if (e.type === 'piranha' && e.active) drawPiranha(e, e.x - cx, e.y);
    drawTiles(cx);
    drawFlagAndCastle(cx, player);
    for (const it of items) {
      if (it.rise > 0) {
        // clip so the item emerges from the block
        ctx.save();
        ctx.beginPath(); ctx.rect(it.x - cx, 0, 16, it.y + 16 - it.rise); ctx.clip();
      }
      if (it.kind === 'mush') drawMushroom(it.x - cx, it.y);
      else drawFalcon(it.x - cx, it.y, it.weapon, frame);
      if (it.rise > 0) ctx.restore();
    }
    for (const e of ents) {
      if (!e.active || e.type === 'piranha') continue;
      if (e.flash > 0 && Math.floor(frame / 2) % 2) continue;
      drawEnt(e, e.x - cx, e.y);
    }
    drawBoss(cx);
    drawPlayer(cx);
    for (const b of pbullets) drawPBullet(b, cx);
    for (const b of ebullets) drawEBullet(b, cx);
    drawParts(cx);
    drawHUD();
    if (banner) {
      const a = Math.floor(frame / 8) % 2;
      text(banner.text, W / 2, 40, a ? '#fce000' : C.white, 8, 'center');
    }
  }

  function drawTitle() {
    R(0, 0, W, H, '#000');
    // starfield
    for (let i = 0; i < 60; i++) {
      const x = (i * 73 + frame * (1 + (i % 3)) * 0.3) % W;
      const y = (i * 131) % H;
      R(Math.floor(W - x), y, 1, 1, i % 4 ? '#5c5c6c' : C.white);
    }
    text('CONTRA', W / 2, 30, '#e40058', 24, 'center');
    text('MARIO', W / 2, 54, '#fce000', 24, 'center');
    text('SUPER SPREAD BROS.', W / 2, 82, '#3cbcfc', 8, 'center');

    // hero showcase
    const demo = makePlayer(0);
    demo.big = true; demo.h = 27; demo.anim = frame; demo.face = 1; demo.onGround = true;
    demo.aim = Math.floor(frame / 60) % 2 ? { x: 1, y: -1 } : { x: 1, y: 0 };
    drawPlayerAt(demo, 56, 132, true);
    drawFalcon(92, 112, ['M', 'S', 'L', 'F', 'R', 'B'][Math.floor(frame / 40) % 6], frame);
    drawWalker({ t: frame }, 150, 116);
    drawSoldier({ t: frame, face: -1, pause: 0 }, 180, 108);

    const lines = [
      ['ARROWS / WASD', 'MOVE + 8-WAY AIM'],
      ['Z / SPACE / K', 'JUMP'],
      ['X / J', 'FIRE'],
      ['SHIFT / C', 'RUN'],
      ['DOWN', 'PRONE'],
      ['P / ENTER', 'PAUSE   M  MUTE'],
    ];
    lines.forEach(([k, v], i) => {
      text(k, 34, 146 + i * 10, '#fca044', 7);
      text(v, 124, 146 + i * 10, C.white, 7);
    });
    if (Math.floor(frame / 30) % 2) text('PRESS ENTER', W / 2, 212, C.white, 8, 'center');
    text('HI ' + String(hiscore).padStart(7, '0'), W / 2, 226, '#8c8c9c', 7, 'center');
  }

  function render() {
    ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
    ctx.imageSmoothingEnabled = false;
    switch (state) {
      case 'title':
        drawTitle();
        break;
      case 'intro':
        R(0, 0, W, H, '#000');
        drawHUD();
        text('WORLD 1-1', W / 2, 90, C.white, 10, 'center');
        drawPlayerAt(Object.assign(makePlayer(0), { anim: 0 }), 100, 132, false);
        text('x  ' + game.lives, 126, 120, C.white, 9);
        text('STAGE 1: JUNGLE FORTRESS', W / 2, 160, '#fca044', 7, 'center');
        break;
      case 'play':
      case 'pause':
        drawWorld();
        if (state === 'pause') {
          R(0, 0, W, H, 'rgba(0,0,0,0.5)');
          text('PAUSE', W / 2, 108, C.white, 12, 'center');
        }
        break;
      case 'gameover':
        R(0, 0, W, H, '#000');
        text('GAME OVER', W / 2, 100, '#e40058', 14, 'center');
        text('SCORE ' + game.score, W / 2, 124, C.white, 8, 'center');
        if (stateT > 60 && Math.floor(frame / 30) % 2) text('PRESS ENTER', W / 2, 160, C.white, 8, 'center');
        break;
      case 'clear':
        R(0, 0, W, H, '#000');
        text('STAGE CLEAR!', W / 2, 70, '#fce000', 14, 'center');
        text('THE DEFENSE WALL HAS FALLEN.', W / 2, 100, C.white, 7, 'center');
        text('THE PRINCESS IS IN ANOTHER', W / 2, 114, C.white, 7, 'center');
        text('ENEMY BASE.', W / 2, 124, C.white, 7, 'center');
        text('FINAL SCORE ' + game.score, W / 2, 148, '#3cbcfc', 8, 'center');
        if (stateT > 60 && Math.floor(frame / 30) % 2) text('PRESS ENTER', W / 2, 180, C.white, 8, 'center');
        break;
    }
  }

  // ---------------------------------------------------------------------------
  // Boot
  // ---------------------------------------------------------------------------
  buildTiles();
  buildSprites();
  buildLevel();
  // Small debug/testing hook (harmless in normal play)
  window.__contramario = {
    get state() { return state; },
    get player() { return player; },
    get ents() { return ents; },
    get boss() { return boss; },
    get game() { return game; },
    get cam() { return cam; },
  };
  requestAnimationFrame(loop);
})();
