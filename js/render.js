// Procedural canvas renderer. Reads game state, never mutates it.
// Logical canvas: 900 x 500.

const CW = 900, CH = 500;
const FLOOR_Y = 458;

// Lane depth: laneF 0 (far) → 2 (near). Fighters shrink and rise with depth.
const LANE_FAR_Y = 392, LANE_NEAR_Y = 458;
const LANE_FAR_S = 0.82, LANE_NEAR_S = 1.0;
function laneFloorY(laneF) { return lerp(LANE_FAR_Y, LANE_NEAR_Y, laneF / 2); }
function laneScale(laneF) { return lerp(LANE_FAR_S, LANE_NEAR_S, laneF / 2); }

function lerp(a, b, t) { return a + (b - a) * t; }
function ease(t) { return t * t * (3 - 2 * t); }

class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.t = 0;
    this.shake = 0;
    this.flash = 0;
    this.sparks = [];
    this.floats = [];
    this.squash = { p: 0, o: 0 };
    // Walk-cycle state per fighter: stride phase advances with actual
    // horizontal travel, amt fades the cycle in/out with speed.
    this.gait = { p: { prevX: null, phase: 0, amt: 0, s: 1 }, o: { prevX: null, phase: 0, amt: 0, s: 1 } };
    this.dt = 0;
    this.blood = [];   // falling droplets
    this.stains = [];  // dried onto the mat for the rest of the fight
    this._builds = new WeakMap(); // per-def silhouette variation cache
    this.anchors = { p: { head: { x: 360, y: 246 } }, o: { head: { x: 540, y: 246 } } };
    this.crowd = this.makeCrowd();
    this.vignette = this.makeVignette();
    this.camX = 450;   // dynamic camera: smoothed focus + zoom
    this.camZ = 1;
    this.camFlashes = []; // crowd camera flashes
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = Math.max(1, Math.round(rect.width * dpr));
    this.canvas.height = Math.max(1, Math.round(rect.height * dpr));
  }

  makeCrowd() {
    const c = document.createElement('canvas');
    c.width = CW; c.height = 350;
    const g = c.getContext('2d');
    const grad = g.createLinearGradient(0, 0, 0, 350);
    grad.addColorStop(0, '#0b0d14');
    grad.addColorStop(1, '#1a1f2e');
    g.fillStyle = grad;
    g.fillRect(0, 0, CW, 350);
    for (let i = 0; i < 700; i++) {
      const x = Math.random() * CW;
      const y = 40 + Math.random() * 290;
      const s = 2 + Math.random() * 3 * (y / 350);
      g.fillStyle = `hsla(${200 + Math.random() * 120}, 30%, ${25 + Math.random() * 35}%, ${0.25 + (y / 350) * 0.4})`;
      g.beginPath();
      g.arc(x, y, s, 0, Math.PI * 2);
      g.fill();
    }
    // Spotlights
    g.globalCompositeOperation = 'lighter';
    for (const sx of [200, 700]) {
      const lg = g.createRadialGradient(sx, -50, 10, sx, -50, 420);
      lg.addColorStop(0, 'rgba(255,240,200,0.20)');
      lg.addColorStop(1, 'rgba(255,240,200,0)');
      g.fillStyle = lg;
      g.fillRect(0, 0, CW, 350);
    }
    return c;
  }

  makeVignette() {
    const c = document.createElement('canvas');
    c.width = CW; c.height = CH;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(CW / 2, CH / 2 - 30, 240, CW / 2, CH / 2, 640);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.45)');
    g.fillStyle = grad;
    g.fillRect(0, 0, CW, CH);
    return c;
  }

  addImpact(x, y, mag, color = '#ffd27a') {
    this.shake = Math.max(this.shake, mag);
    const n = 6 + Math.floor(mag * 1.2);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 60 + Math.random() * 60 * mag * 0.4;
      this.sparks.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 40, life: 0.35 + Math.random() * 0.2, color });
    }
  }

  addFloat(x, y, text, color = '#fff', size = 22) {
    this.floats.push({ x, y, text, color, size, life: 1.0 });
  }

  addFlash(v) { this.flash = Math.max(this.flash, v); }

  addSquash(key, amt = 1) { this.squash[key] = Math.min(1.2, Math.max(this.squash[key], amt)); }

  // A bloodied fighter sheds droplets that fall and soak into the mat.
  addBlood(x, y, floorY, n = 4) {
    for (let i = 0; i < n; i++) {
      this.blood.push({
        x: x + (Math.random() - 0.5) * 16,
        y: y + (Math.random() - 0.5) * 8,
        vx: (Math.random() - 0.5) * 150,
        vy: -30 - Math.random() * 90,
        floor: floorY + 2 + Math.random() * 8,
      });
    }
  }

  clearBlood() { this.blood.length = 0; this.stains.length = 0; }

  // Per-fighter silhouette: heavy hitters carry more bulk, speedsters run
  // lean, with a per-identity nudge so same-stat fighters still differ.
  buildOf(def) {
    let b = this._builds.get(def);
    if (b) return b;
    const s = String(def.id || def.name || '');
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    const jitter = ((Math.abs(h) % 9) - 4) * 0.012;
    const w = Math.min(1.18, Math.max(0.86,
      0.94 + (def.power || 3) * 0.024 - (def.speed || 3) * 0.014 + jitter));
    b = { w };
    this._builds.set(def, b);
    return b;
  }

  draw(game, dt) {
    this.t += dt;
    this.dt = dt;
    const ctx = this.ctx;
    const w = this.canvas.width, h = this.canvas.height;
    // Uniform scale, letterboxed and centered — never stretch the scene
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#0b0d14';
    ctx.fillRect(0, 0, w, h);
    const scale = Math.min(w / CW, h / CH);
    const ox = (w - CW * scale) / 2, oy = (h - CH * scale) / 2;
    ctx.save();
    ctx.setTransform(scale, 0, 0, scale, ox, oy);
    ctx.beginPath();
    ctx.rect(0, 0, CW, CH);
    ctx.clip();

    // Shake + squash decay
    this.squash.p = Math.max(0, this.squash.p - dt * 5);
    this.squash.o = Math.max(0, this.squash.o - dt * 5);
    this.shake = Math.max(0, this.shake - dt * 26);
    if (this.shake > 0) {
      ctx.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);
    }

    // Dynamic camera: drift toward the fighters, zoom in when they close
    const k = Math.min(1, dt * 3);
    if (game) {
      const mid = (game.p.x + game.o.x) / 2;
      const spread = Math.abs(game.p.x - game.o.x);
      const tz = Math.min(1.14, Math.max(1, 1.18 - spread / 1400));
      this.camZ += (tz - this.camZ) * k;
      this.camX += (Math.min(570, Math.max(330, mid)) - this.camX) * k;
    } else {
      this.camZ += (1 - this.camZ) * k;
    }
    ctx.save();
    ctx.translate(this.camX, 350);
    ctx.scale(this.camZ, this.camZ);
    ctx.translate(-this.camX, -350);

    this.drawRing(ctx, dt);

    // Dried blood stains on the mat (under the fighters)
    for (const st of this.stains) {
      ctx.globalAlpha = st.a;
      ctx.fillStyle = '#8e1420';
      ctx.beginPath();
      ctx.ellipse(st.x, st.y, st.rx, st.ry, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    if (game) {
      // Far lane draws first; within a lane the attacker draws on top
      const order = [['p', game.p, game.o], ['o', game.o, game.p]].sort((a, b) =>
        (a[1].laneF - b[1].laneF) || ((a[1].state === 'punch' ? 1 : 0) - (b[1].state === 'punch' ? 1 : 0)));
      for (const [key, f, opp] of order) this.drawBoxer(ctx, f, f.x, f.dir, opp.x, key);
      // Sweat drips off a gassed fighter
      for (const [key, f] of [['p', game.p], ['o', game.o]]) {
        if (f.stamina < 30 && Math.random() < dt * 2.5) {
          const a = this.anchors[key].head;
          this.sparks.push({
            x: a.x + (Math.random() - 0.5) * 22, y: a.y - 6,
            vx: (Math.random() - 0.5) * 50, vy: -30, life: 0.4, color: '#9fd8ff',
          });
        }
      }
    }

    // Falling blood droplets — land on the mat and become stains
    for (let i = this.blood.length - 1; i >= 0; i--) {
      const d = this.blood[i];
      d.x += d.vx * dt; d.y += d.vy * dt; d.vy += 620 * dt;
      if (d.y >= d.floor) {
        this.blood.splice(i, 1);
        this.stains.push({
          x: d.x, y: d.floor,
          rx: 2.5 + Math.random() * 4.5, ry: 1 + Math.random() * 1.6,
          a: 0.35 + Math.random() * 0.2,
        });
        if (this.stains.length > 80) this.stains.shift();
        continue;
      }
      ctx.fillStyle = '#c11f2e';
      ctx.beginPath();
      ctx.arc(d.x, d.y, 2.4, 0, Math.PI * 2);
      ctx.fill();
    }

    // Particles
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const s = this.sparks[i];
      s.life -= dt;
      if (s.life <= 0) { this.sparks.splice(i, 1); continue; }
      s.x += s.vx * dt; s.y += s.vy * dt; s.vy += 500 * dt;
      ctx.globalAlpha = Math.min(1, s.life * 3);
      ctx.fillStyle = s.color;
      ctx.beginPath();
      ctx.arc(s.x, s.y, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    // Floating text
    ctx.textAlign = 'center';
    for (let i = this.floats.length - 1; i >= 0; i--) {
      const f = this.floats[i];
      f.life -= dt;
      if (f.life <= 0) { this.floats.splice(i, 1); continue; }
      f.y -= 40 * dt;
      ctx.globalAlpha = Math.min(1, f.life * 2);
      ctx.font = `bold ${f.size}px 'Arial Black', sans-serif`;
      ctx.strokeStyle = 'rgba(0,0,0,0.7)';
      ctx.lineWidth = 4;
      ctx.strokeText(f.text, f.x, f.y);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y);
      ctx.globalAlpha = 1;
    }

    this.drawForeground(ctx);

    // Ring-walk ceremony: house lights down, spotlight on whoever's being introduced
    if (game && game.state === 'ringwalk' && game.walk) {
      const focus = game.walk.phase === 'opp' ? game.o : game.walk.phase === 'player' ? game.p : null;
      if (focus) {
        // Darkness with a soft transparent well around the featured fighter
        const g = ctx.createRadialGradient(focus.x, 330, 45, focus.x, 330, 185);
        g.addColorStop(0, 'rgba(4,6,14,0)');
        g.addColorStop(1, 'rgba(4,6,14,0.68)');
        ctx.fillStyle = g;
        ctx.fillRect(-300, -300, CW + 600, CH + 600);
        // Warm light cone from the rig
        ctx.save();
        ctx.globalAlpha = 0.14;
        ctx.fillStyle = '#ffe9b0';
        ctx.beginPath();
        ctx.moveTo(focus.x - 24, 30);
        ctx.lineTo(focus.x + 24, 30);
        ctx.lineTo(focus.x + 92, 462);
        ctx.lineTo(focus.x - 92, 462);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      } else {
        ctx.fillStyle = 'rgba(4,6,14,0.68)';
        ctx.fillRect(-300, -300, CW + 600, CH + 600);
      }
    }

    ctx.restore(); // camera

    // Vignette + knockdown flash sit outside the camera so they hug the frame
    ctx.drawImage(this.vignette, 0, 0);
    if (this.flash > 0) {
      ctx.fillStyle = `rgba(255,255,255,${this.flash * 0.6})`;
      ctx.fillRect(0, 0, CW, CH);
      this.flash = Math.max(0, this.flash - dt * 2.5);
    }

    // Broadcast score bug — baked into the canvas so recordings carry the
    // names, round, and clock, not just the action.
    if (game && game.state !== 'ringwalk') this.drawScoreBug(ctx, game);

    ctx.restore();
  }

  drawScoreBug(ctx, game) {
    ctx.save();
    ctx.textBaseline = 'middle';
    const plate = (f, right) => {
      const bw = 140;
      const x0 = right ? CW - 14 - bw : 14;
      ctx.fillStyle = 'rgba(8,10,16,0.55)';
      ctx.fillRect(x0 - 6, 10, bw + 12, 43);
      ctx.font = "bold 13px 'Arial Black', sans-serif";
      ctx.textAlign = right ? 'right' : 'left';
      ctx.fillStyle = '#eef1fa';
      ctx.fillText(f.def.nick.toUpperCase(), right ? x0 + bw : x0, 21);
      const frac = Math.max(0, f.health / f.maxHealth);
      ctx.fillStyle = '#262c3d';
      ctx.fillRect(x0, 32, bw, 7);
      ctx.fillStyle = frac > 0.5 ? '#3ddc6a' : frac > 0.25 ? '#ffce4d' : '#ff4d4d';
      const fw = bw * frac;
      ctx.fillRect(right ? x0 + bw - fw : x0, 32, fw, 7);
      const sfrac = Math.max(0, f.stamina / f.maxStamina);
      ctx.fillStyle = '#262c3d';
      ctx.fillRect(x0, 42, bw, 5);
      ctx.fillStyle = '#4dc3ff';
      const sw = bw * sfrac;
      ctx.fillRect(right ? x0 + bw - sw : x0, 42, sw, 5);
    };
    plate(game.p, false);
    plate(game.o, true);

    let label;
    if (game.training) label = 'SPARRING';
    else if (game.state === 'rest') label = `END OF ROUND ${game.round}`;
    else if (game.state === 'count') label = game.count && game.count.num > 0 ? `COUNT: ${game.count.num}` : 'KNOCKDOWN!';
    else if (game.state === 'over') label = 'FIGHT OVER';
    else {
      const t = Math.max(0, Math.ceil(game.clock));
      label = `ROUND ${game.round} · ${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
    }
    ctx.font = "bold 15px 'Arial Black', sans-serif";
    ctx.textAlign = 'center';
    const tw = ctx.measureText(label).width;
    ctx.fillStyle = 'rgba(8,10,16,0.55)';
    ctx.fillRect(CW / 2 - tw / 2 - 12, 12, tw + 24, 24);
    ctx.fillStyle = '#ffd27a';
    ctx.fillText(label, CW / 2, 25);
    ctx.restore();
  }

  drawRing(ctx, dt) {
    // Crowd backdrop, gently breathing
    ctx.drawImage(this.crowd, 0, Math.sin(this.t * 1.4) * 2 - 2);

    // Camera flashes popping in the stands
    if (Math.random() < dt * 2.2) {
      this.camFlashes.push({ x: 40 + Math.random() * (CW - 80), y: 50 + Math.random() * 220, life: 0.28 });
    }
    for (let i = this.camFlashes.length - 1; i >= 0; i--) {
      const f = this.camFlashes[i];
      f.life -= dt;
      if (f.life <= 0) { this.camFlashes.splice(i, 1); continue; }
      ctx.globalAlpha = Math.min(1, f.life * 5);
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(f.x, f.y, 2.5 + f.life * 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    // Ring floor
    const grad = ctx.createLinearGradient(0, 330, 0, CH);
    grad.addColorStop(0, '#3d5a80');
    grad.addColorStop(1, '#2b405c');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 330, CW, CH - 330);
    // Canvas mat
    ctx.fillStyle = '#e8e2d0';
    ctx.beginPath();
    ctx.moveTo(60, 350);
    ctx.lineTo(840, 350);
    ctx.lineTo(CW, CH);
    ctx.lineTo(0, CH);
    ctx.closePath();
    ctx.fill();
    // Mat logo
    ctx.save();
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = '#a33';
    ctx.beginPath();
    ctx.ellipse(450, 452, 150, 34, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = '#822';
    ctx.font = 'bold 26px "Arial Black", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('ALUMBS BOXING', 450, 430);
    ctx.restore();

    // Lane guides: faint seams in the canvas hinting at the three lanes
    ctx.strokeStyle = 'rgba(0,0,0,0.07)';
    ctx.lineWidth = 2;
    for (const y of [LANE_FAR_Y + 14, laneFloorY(1) + 14]) {
      const t = (y - 350) / 150;
      ctx.beginPath();
      ctx.moveTo(lerp(60, 0, t), y);
      ctx.lineTo(lerp(840, 900, t), y);
      ctx.stroke();
    }

    // Back posts
    for (const [x, col] of [[52, '#b03030'], [848, '#3050b0']]) {
      ctx.fillStyle = col;
      ctx.fillRect(x - 7, 160, 14, 195);
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.fillRect(x - 7, 160, 5, 195);
      // Turnbuckle pad
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.fillRect(x - 9, 185, 18, 8);
    }
    // Back ropes
    const ropeCols = ['#d84040', '#f0f0f0', '#4060d8'];
    for (let i = 0; i < 3; i++) {
      const y = 190 + i * 52;
      ctx.strokeStyle = ropeCols[i];
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(52, y);
      ctx.quadraticCurveTo(450, y + 8, 848, y);
      ctx.stroke();
      // Side ropes running toward the camera
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(52, y);
      ctx.lineTo(6, y + 105 + i * 40);
      ctx.moveTo(848, y);
      ctx.lineTo(894, y + 105 + i * 40);
      ctx.stroke();
    }
    // Corner stools
    for (const [x, col] of [[30, '#8a2424'], [870, '#24308a']]) {
      ctx.fillStyle = col;
      ctx.fillRect(x - 15, 470, 30, 8);
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.fillRect(x - 11, 478, 5, 18);
      ctx.fillRect(x + 6, 478, 5, 18);
    }
  }

  // Near-side ropes drawn OVER the fighters — translucent so they read as
  // depth without hiding the action.
  drawForeground(ctx) {
    const ropeCols = ['rgba(216,64,64,0.30)', 'rgba(240,240,240,0.26)', 'rgba(64,96,216,0.30)'];
    const ropeYs = [402, 450, 498];
    for (let i = 0; i < 3; i++) {
      ctx.strokeStyle = ropeCols[i];
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.moveTo(6, ropeYs[i]);
      ctx.quadraticCurveTo(450, ropeYs[i] + 18, 894, ropeYs[i]);
      ctx.stroke();
    }
    // Front posts
    for (const [x, col] of [[6, 'rgba(176,48,48,0.35)'], [894, 'rgba(48,80,176,0.35)']]) {
      ctx.fillStyle = col;
      ctx.fillRect(x - 9, 300, 18, 200);
    }
  }

  // dir: +1 faces right, -1 faces left. oppX: opponent x for punch targeting.
  drawBoxer(ctx, f, x, dir, oppX, key) {
    const def = f.def;
    const t = f.stateT;
    const state = f.state;
    const bw = this.buildOf(def).w; // silhouette width factor

    // Downness: 0 standing, 1 flat on the mat
    let downness = 0;
    if (state === 'down' || state === 'ko') downness = Math.min(1, t / 0.35);
    else if (state === 'rising') downness = 1 - Math.min(1, t / 0.7);

    // Walk cycle: stride is keyed to actual horizontal travel, so fighting
    // footwork, the ringwalk strut, and the neutral-corner reset all read
    // as steps instead of a glide. Fades out whenever the body stops.
    const g = this.gait[key] || (this.gait[key] = { prevX: null, phase: 0, amt: 0, s: 1 });
    if (g.prevX === null || Math.abs(x - g.prevX) > 60) g.prevX = x; // spawn/round-reset teleport, not a step
    const gdx = x - g.prevX;
    g.prevX = x;
    if (gdx !== 0) g.s = gdx > 0 ? 1 : -1;
    if (this.dt > 0) {
      g.phase += gdx * 0.05;
      const speed = Math.abs(gdx) / this.dt;
      const target = downness > 0 ? 0 : Math.min(1, speed / 70);
      g.amt += (target - g.amt) * Math.min(1, this.dt * 12);
    }
    const stride = 15 * g.amt;
    const strideS = Math.sin(g.phase);
    const liftFront = Math.max(0, Math.cos(g.phase) * g.s) * 9 * g.amt;
    const liftBack = Math.max(0, -Math.cos(g.phase) * g.s) * 9 * g.amt;
    const gaitBob = Math.abs(strideS) * -2.5 * g.amt; // slight rise mid-stride

    // Idle bob + fatigue slump
    const stamFrac = f.stamina / f.maxStamina;
    const bob = (state === 'idle' || state === 'block') ? Math.sin(this.t * 3.2 + (dir > 0 ? 0 : 1.7)) * 3 * (1 - g.amt * 0.7) : 0;
    const slump = (1 - stamFrac) * 6;

    // Lean (x-offset of upper body). Negative = away from opponent.
    let lean = 0;
    let headDy = 0;
    if (state === 'dodge') {
      const dp = Math.sin(Math.min(1, t / 0.45) * Math.PI);
      if (f.dodgeKind === 'weave') {
        // Roll under: head drops low, slight forward lean
        lean = 8 * dp;
        headDy = 38 * dp;
      } else {
        lean = -34 * dp;
        headDy = 6 * dp;
      }
    } else if (state === 'stun') {
      // Wobbling on rubber legs
      lean = Math.sin(this.t * 7) * 9;
      headDy = 3 + Math.sin(this.t * 11) * 2;
    } else if (state === 'hit') {
      const hp = 1 - Math.min(1, t / (f.hitDur || 0.25));
      lean = -16 * hp;
      headDy = -4 * hp;
    } else if (state === 'punch' && f.punch) {
      lean = 10 * this.punchExt(f);
    } else if (state === 'clinch') {
      // Leaning into the tie-up, slowly wrestling for position
      lean = dir * 12 + Math.sin(this.t * 2.4) * 2;
      headDy = 5;
    } else if (state === 'victory') {
      headDy = -4 + Math.sin(this.t * 6) * 2;
    }

    ctx.save();

    // Lane depth: shift the whole figure to its lane's floor and shrink it.
    // All drawing below stays in the original near-lane coordinate space.
    const laneF = f.laneF !== undefined ? f.laneF : 2;
    const lY = laneFloorY(laneF);
    const lS = laneScale(laneF);
    ctx.translate(x, lY);
    ctx.scale(lS, lS);
    ctx.translate(-x, -FLOOR_Y);

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(x + (downness > 0.3 ? -dir * 30 : 0), FLOOR_Y + 4, 46 + downness * 30, 10, 0, 0, Math.PI * 2);
    ctx.fill();

    // Fall rotation around the back foot
    if (downness > 0) {
      const pivotX = x - dir * 24, pivotY = FLOOR_Y;
      ctx.translate(pivotX, pivotY);
      ctx.rotate(-dir * downness * 1.35);
      ctx.translate(-pivotX, -pivotY);
    }

    // Ducking: whole upper body sinks into a crouch
    const duck = f.state === 'block' && f.guardZone === 'duck' ? 1 : 0;
    const hipY = 372 + bob * 0.4 + gaitBob * 0.4 + slump * 0.5 + duck * 8;
    const shoY = 288 + bob + gaitBob + slump + duck * 20;
    const headY = 246 + bob + gaitBob + slump + headDy + duck * 28;
    const headX = x + dir * 8 + lean;
    const shoX = x + lean * 0.7;

    // Legs
    ctx.strokeStyle = def.skin;
    ctx.lineWidth = 13 * bw;
    ctx.lineCap = 'round';
    const frontFootX = x + dir * 30 * bw + strideS * stride;
    const backFootX = x - dir * 24 * bw - strideS * stride;
    ctx.beginPath();
    ctx.moveTo(x + dir * 6 * bw, hipY);
    ctx.quadraticCurveTo(frontFootX - dir * 4, (hipY + FLOOR_Y) / 2 + 6 - liftFront * 0.6, frontFootX, FLOOR_Y - 8 - liftFront);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - dir * 6 * bw, hipY);
    ctx.quadraticCurveTo(backFootX + dir * 2, (hipY + FLOOR_Y) / 2 + 8 - liftBack * 0.6, backFootX, FLOOR_Y - 8 - liftBack);
    ctx.stroke();
    // Boots
    ctx.fillStyle = '#222';
    for (const [fx, lift] of [[frontFootX, liftFront], [backFootX, liftBack]]) {
      ctx.beginPath();
      ctx.ellipse(fx + dir * 5, FLOOR_Y - 5 - lift, 14, 8, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Trunks
    ctx.fillStyle = def.trunks;
    ctx.beginPath();
    ctx.moveTo(x - 20 * bw + lean * 0.3, hipY - 26);
    ctx.lineTo(x + 20 * bw + lean * 0.3, hipY - 26);
    ctx.lineTo(x + 24 * bw, hipY + 16);
    ctx.lineTo(x + 6 * bw, hipY + 12);
    ctx.lineTo(x, hipY - 2);
    ctx.lineTo(x - 6 * bw, hipY + 12);
    ctx.lineTo(x - 24 * bw, hipY + 16);
    ctx.closePath();
    ctx.fill();
    // Waistband
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.fillRect(x - 20 * bw + lean * 0.3, hipY - 28, 40 * bw, 5);

    // Torso
    ctx.fillStyle = def.skin;
    ctx.beginPath();
    ctx.moveTo(x - 19 * bw + lean * 0.3, hipY - 24);
    ctx.quadraticCurveTo(shoX - 26 * bw, (hipY + shoY) / 2, shoX - 23 * bw, shoY - 6);
    ctx.quadraticCurveTo(shoX, shoY - 20, shoX + 23 * bw, shoY - 6);
    ctx.quadraticCurveTo(shoX + 26 * bw, (hipY + shoY) / 2, x + 19 * bw + lean * 0.3, hipY - 24);
    ctx.closePath();
    ctx.fill();
    // Chest shading
    ctx.fillStyle = 'rgba(0,0,0,0.08)';
    ctx.beginPath();
    ctx.ellipse(shoX - dir * 8, (hipY + shoY) / 2 - 4, 10 * bw, 26, 0, 0, Math.PI * 2);
    ctx.fill();

    // Head (squashes on impact)
    const sq = this.squash[key] || 0;
    ctx.fillStyle = def.skin;
    ctx.beginPath();
    ctx.ellipse(headX, headY, 21 * (1 + sq * 0.28), 21 * (1 - sq * 0.3), 0, 0, Math.PI * 2);
    ctx.fill();
    // Hair
    this.drawHair(ctx, def, headX, headY, dir);
    // Ear
    ctx.fillStyle = def.skin;
    ctx.beginPath();
    ctx.arc(headX - dir * 14, headY + 2, 5, 0, Math.PI * 2);
    ctx.fill();

    // Face
    const hurt = f.health < 30;
    ctx.fillStyle = '#1a1a1a';
    if (state === 'down' || state === 'ko') {
      // X eyes
      ctx.strokeStyle = '#1a1a1a';
      ctx.lineWidth = 2;
      const ex = headX + dir * 8, ey = headY - 2;
      ctx.beginPath();
      ctx.moveTo(ex - 3, ey - 3); ctx.lineTo(ex + 3, ey + 3);
      ctx.moveTo(ex + 3, ey - 3); ctx.lineTo(ex - 3, ey + 3);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(headX + dir * 9, headY - 3, 2.4, 0, Math.PI * 2);
      ctx.fill();
      // Brow
      ctx.strokeStyle = '#1a1a1a';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(headX + dir * 4, headY - 9);
      ctx.lineTo(headX + dir * 14, headY - 8 + (hurt ? 2 : 0));
      ctx.stroke();
    }
    // Bruise when hurt
    if (hurt) {
      ctx.fillStyle = 'rgba(180,40,40,0.45)';
      ctx.beginPath();
      ctx.arc(headX + dir * 11, headY + 5, 6, 0, Math.PI * 2);
      ctx.fill();
    }
    // Hit red flash on head
    if (state === 'hit' && t < 0.12) {
      ctx.fillStyle = 'rgba(255,60,60,0.4)';
      ctx.beginPath();
      ctx.arc(headX, headY, 23, 0, Math.PI * 2);
      ctx.fill();
    }

    // Dazed: stars orbiting the head
    if (state === 'stun') {
      ctx.fillStyle = '#ffe14d';
      ctx.font = 'bold 15px sans-serif';
      ctx.textAlign = 'center';
      for (let i = 0; i < 3; i++) {
        const a = this.t * 5 + i * (Math.PI * 2 / 3);
        ctx.globalAlpha = 0.6 + 0.4 * Math.sin(a * 2);
        ctx.fillText('✦', headX + Math.cos(a) * 30, headY - 18 + Math.sin(a) * 9);
      }
      ctx.globalAlpha = 1;
    }

    // Arms + gloves
    this.drawArms(ctx, f, x, dir, oppX, shoX, shoY, headX, headY, stamFrac, downness);

    ctx.restore();

    // Save anchors in world space (apply the lane transform by hand;
    // pre-fall-rotation approximation is fine for effects)
    const toWorld = (px, py) => ({ x: x + (px - x) * lS, y: lY + (py - FLOOR_Y) * lS });
    this.anchors[key] = { head: toWorld(headX, headY), chest: toWorld(shoX, shoY + 30) };
  }

  // Draws entirely in head-local space (relative to headX/headY) so it
  // inherits the caller's squash, fall-rotation, and lane-depth transforms
  // for free. No swing/physics — every style is rigidly attached.
  drawHair(ctx, def, headX, headY, dir) {
    const hair = def.hair || 'short';
    const color = def.hairColor || '#1a1a1a';
    ctx.fillStyle = color;

    if (hair === 'bald') {
      // No hair shape — just a faint shine highlight on the crown
      ctx.save();
      ctx.globalAlpha = 0.18;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(headX - dir * 4, headY - 14, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }

    if (hair === 'short') {
      // Original hair-cap look
      ctx.beginPath();
      ctx.arc(headX, headY - 3, 21, Math.PI * 1.05, Math.PI * 1.95);
      ctx.fill();
      return;
    }

    if (hair === 'afro') {
      // Larger rounded silhouette, bigger than the skull, centered slightly back
      ctx.beginPath();
      ctx.ellipse(headX - dir * 2, headY - 8, 27, 25, 0, Math.PI * 0.95, Math.PI * 2.05);
      ctx.fill();
      return;
    }

    if (hair === 'mohawk') {
      // Narrow vertical strip along the top-center of the head
      ctx.beginPath();
      ctx.moveTo(headX - 4, headY - 8);
      ctx.lineTo(headX - 3, headY - 26);
      ctx.lineTo(headX + 3, headY - 26);
      ctx.lineTo(headX + 4, headY - 8);
      ctx.closePath();
      ctx.fill();
      return;
    }

    if (hair === 'long') {
      // Hair cap plus a static ponytail trailing from the back of the head
      ctx.beginPath();
      ctx.arc(headX, headY - 3, 21, Math.PI * 1.05, Math.PI * 1.95);
      ctx.fill();
      const backX = headX - dir * 16;
      ctx.beginPath();
      ctx.moveTo(backX, headY - 8);
      ctx.quadraticCurveTo(backX - dir * 10, headY + 20, backX - dir * 4, headY + 46);
      ctx.quadraticCurveTo(backX - dir * 1, headY + 24, backX + dir * 4, headY - 4);
      ctx.closePath();
      ctx.fill();
      return;
    }
  }

  // Punch extension 0..1 across windup/active/recover, with a chamber pull-back.
  punchExt(f) {
    const p = f.punch;
    if (!p) return 0;
    const t = f.stateT;
    const { windup, active, total } = p.dur;
    if (t < windup) return -0.22 * ease(t / windup);
    if (t < windup + active) return lerp(-0.22, 1, ease((t - windup) / active));
    const rt = (t - windup - active) / Math.max(0.01, total - windup - active);
    return 1 - ease(Math.min(1, rt * 1.15));
  }

  drawArms(ctx, f, x, dir, oppX, shoX, shoY, headX, headY, stamFrac, downness) {
    const def = f.def;
    const guardDroop = (1 - stamFrac) * 14;
    const blocking = f.state === 'block';
    const victory = f.state === 'victory';
    const downish = downness > 0.05;

    // Default guard glove positions
    let lead = { x: x + dir * 34, y: 258 + guardDroop };
    let rear = { x: x + dir * 20, y: 268 + guardDroop };
    if (blocking) {
      const zone = f.guardZone || 'high';
      if (zone === 'low') {
        // Elbows down, gloves protecting the midsection
        lead = { x: x + dir * 30, y: 322 };
        rear = { x: x + dir * 16, y: 330 };
      } else if (zone === 'duck') {
        // Crouched full cover: gloves tight around the face
        lead = { x: headX + dir * 10, y: headY - 4 };
        rear = { x: headX - dir * 4, y: headY + 6 };
      } else {
        lead = { x: headX + dir * 12, y: headY + 2 };
        rear = { x: headX + dir * 2, y: headY + 10 };
      }
    } else if (victory) {
      lead = { x: x + dir * 10, y: 175 + Math.sin(this.t * 6) * 5 };
      rear = { x: x - dir * 26, y: 255 };
    } else if (f.state === 'stun') {
      // Arms hanging heavy
      lead = { x: x + dir * 28, y: shoY + 58 + Math.sin(this.t * 7) * 4 };
      rear = { x: x - dir * 6, y: shoY + 62 };
    } else if (downish) {
      lead = { x: x + dir * 40, y: shoY + 40 };
      rear = { x: x - dir * 10, y: shoY + 44 };
    } else if (f.state === 'clinch') {
      // Arms wrapped over the opponent's shoulders
      lead = { x: x + dir * 54, y: shoY - 10 };
      rear = { x: x + dir * 42, y: shoY + 12 };
    }

    // Punch extension overrides one arm
    let telegraph = null;
    if (f.state === 'punch' && f.punch) {
      const ext = this.punchExt(f);
      const type = f.punch.type;
      const pdef = f.punch.def;
      const arm = pdef.arm; // 'lead' | 'rear'
      // Cap extension at the punch's reach so whiffs visibly fall short
      const maxX = x + dir * (pdef.reach - 30);
      const targetX = dir > 0 ? Math.min(oppX - dir * 26, maxX) : Math.max(oppX - dir * 26, maxX);
      let targetY = pdef.target === 'body' ? 322 : 246;
      let fromY = arm === 'lead' ? lead.y : rear.y;
      let fromX = arm === 'lead' ? lead.x : rear.x;
      if (type === 'uppercut') { fromY = shoY + 60; targetY = 238; }
      if (type === 'hook') targetY = 240;
      const gx = ext >= 0 ? lerp(fromX, targetX, ext) : fromX + dir * 26 * ext;
      let gy = lerp(fromY, targetY, Math.abs(ext));
      if (type === 'hook' && ext > 0) gy -= Math.sin(ext * Math.PI) * 28; // arc over the top
      const g = { x: gx, y: gy };
      if (arm === 'lead') lead = g; else rear = g;
      // AI windup cue: pulsing ring on the chambering glove — this is your chance to react
      if (f.isAI && ext < 0) telegraph = g;
    }

    const drawArm = (glove, shoulderOffset) => {
      const sx2 = shoX + dir * shoulderOffset;
      const sy2 = shoY - 2;
      // Elbow control point bows downward/outward
      const mx = (sx2 + glove.x) / 2;
      const my = Math.max(sy2, glove.y) + 18;
      ctx.strokeStyle = def.skin;
      ctx.lineWidth = 12;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(sx2, sy2);
      ctx.quadraticCurveTo(mx, my, glove.x, glove.y);
      ctx.stroke();
      // Glove
      ctx.fillStyle = def.gloves;
      ctx.beginPath();
      ctx.arc(glove.x, glove.y, 13, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.beginPath();
      ctx.arc(glove.x - 4, glove.y - 4, 5, 0, Math.PI * 2);
      ctx.fill();
    };

    // Rear arm behind, lead arm in front
    drawArm(rear, -14);
    drawArm(lead, 16);

    if (telegraph) {
      const pulse = 17 + Math.sin(this.t * 22) * 3;
      ctx.strokeStyle = 'rgba(255, 210, 80, 0.85)';
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.arc(telegraph.x, telegraph.y, pulse, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
}
