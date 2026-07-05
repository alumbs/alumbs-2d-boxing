// Procedural canvas renderer. Reads game state, never mutates it.
// Logical canvas: 900 x 500.

const CW = 900, CH = 500;
const FLOOR_Y = 458;

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
    this.anchors = { p: { head: { x: 360, y: 246 } }, o: { head: { x: 540, y: 246 } } };
    this.crowd = this.makeCrowd();
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

  draw(game, dt) {
    this.t += dt;
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

    // Shake
    this.shake = Math.max(0, this.shake - dt * 26);
    if (this.shake > 0) {
      ctx.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);
    }

    this.drawRing(ctx);

    if (game) {
      const px = 362, ox = 538;
      // Draw the currently-attacking fighter on top
      const pActive = game.p.state === 'punch';
      if (pActive) {
        this.drawBoxer(ctx, game.o, ox, -1, px, 'o');
        this.drawBoxer(ctx, game.p, px, 1, ox, 'p');
      } else {
        this.drawBoxer(ctx, game.p, px, 1, ox, 'p');
        this.drawBoxer(ctx, game.o, ox, -1, px, 'o');
      }
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

    // White flash (knockdowns)
    if (this.flash > 0) {
      ctx.fillStyle = `rgba(255,255,255,${this.flash * 0.6})`;
      ctx.fillRect(0, 0, CW, CH);
      this.flash = Math.max(0, this.flash - dt * 2.5);
    }

    ctx.restore();
  }

  drawRing(ctx) {
    // Crowd backdrop
    ctx.drawImage(this.crowd, 0, 0);

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
    ctx.fillText('ALUMBS BOXING', 450, 462);
    ctx.restore();

    // Posts
    for (const [x, col] of [[52, '#b03030'], [848, '#3050b0']]) {
      ctx.fillStyle = col;
      ctx.fillRect(x - 7, 160, 14, 195);
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.fillRect(x - 7, 160, 5, 195);
    }
    // Ropes
    const ropeCols = ['#d84040', '#f0f0f0', '#4060d8'];
    for (let i = 0; i < 3; i++) {
      const y = 190 + i * 52;
      ctx.strokeStyle = ropeCols[i];
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(52, y);
      ctx.quadraticCurveTo(450, y + 8, 848, y);
      ctx.stroke();
    }
  }

  // dir: +1 faces right, -1 faces left. oppX: opponent x for punch targeting.
  drawBoxer(ctx, f, x, dir, oppX, key) {
    const def = f.def;
    const t = f.stateT;
    const state = f.state;

    // Downness: 0 standing, 1 flat on the mat
    let downness = 0;
    if (state === 'down' || state === 'ko') downness = Math.min(1, t / 0.35);
    else if (state === 'rising') downness = 1 - Math.min(1, t / 0.7);

    // Idle bob + fatigue slump
    const stamFrac = f.stamina / f.maxStamina;
    const bob = (state === 'idle' || state === 'block') ? Math.sin(this.t * 3.2 + (dir > 0 ? 0 : 1.7)) * 3 : 0;
    const slump = (1 - stamFrac) * 6;

    // Lean (x-offset of upper body). Negative = away from opponent.
    let lean = 0;
    let headDy = 0;
    if (state === 'dodge') {
      const dp = Math.sin(Math.min(1, t / 0.4) * Math.PI);
      lean = -34 * dp;
      headDy = 6 * dp;
    } else if (state === 'hit') {
      const hp = 1 - Math.min(1, t / (f.hitDur || 0.25));
      lean = -16 * hp;
      headDy = -4 * hp;
    } else if (state === 'punch' && f.punch) {
      lean = 10 * this.punchExt(f);
    } else if (state === 'victory') {
      headDy = -4 + Math.sin(this.t * 6) * 2;
    }

    ctx.save();

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

    const hipY = 372 + bob * 0.4 + slump * 0.5;
    const shoY = 288 + bob + slump;
    const headY = 246 + bob + slump + headDy;
    const headX = x + dir * 8 + lean;
    const shoX = x + lean * 0.7;

    // Legs
    ctx.strokeStyle = def.skin;
    ctx.lineWidth = 13;
    ctx.lineCap = 'round';
    const frontFootX = x + dir * 30, backFootX = x - dir * 24;
    ctx.beginPath();
    ctx.moveTo(x + dir * 6, hipY);
    ctx.quadraticCurveTo(frontFootX - dir * 4, (hipY + FLOOR_Y) / 2 + 6, frontFootX, FLOOR_Y - 8);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - dir * 6, hipY);
    ctx.quadraticCurveTo(backFootX + dir * 2, (hipY + FLOOR_Y) / 2 + 8, backFootX, FLOOR_Y - 8);
    ctx.stroke();
    // Boots
    ctx.fillStyle = '#222';
    for (const fx of [frontFootX, backFootX]) {
      ctx.beginPath();
      ctx.ellipse(fx + dir * 5, FLOOR_Y - 5, 14, 8, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Trunks
    ctx.fillStyle = def.trunks;
    ctx.beginPath();
    ctx.moveTo(x - 20 + lean * 0.3, hipY - 26);
    ctx.lineTo(x + 20 + lean * 0.3, hipY - 26);
    ctx.lineTo(x + 24, hipY + 16);
    ctx.lineTo(x + 6, hipY + 12);
    ctx.lineTo(x, hipY - 2);
    ctx.lineTo(x - 6, hipY + 12);
    ctx.lineTo(x - 24, hipY + 16);
    ctx.closePath();
    ctx.fill();
    // Waistband
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.fillRect(x - 20 + lean * 0.3, hipY - 28, 40, 5);

    // Torso
    ctx.fillStyle = def.skin;
    ctx.beginPath();
    ctx.moveTo(x - 19 + lean * 0.3, hipY - 24);
    ctx.quadraticCurveTo(shoX - 26, (hipY + shoY) / 2, shoX - 23, shoY - 6);
    ctx.quadraticCurveTo(shoX, shoY - 20, shoX + 23, shoY - 6);
    ctx.quadraticCurveTo(shoX + 26, (hipY + shoY) / 2, x + 19 + lean * 0.3, hipY - 24);
    ctx.closePath();
    ctx.fill();
    // Chest shading
    ctx.fillStyle = 'rgba(0,0,0,0.08)';
    ctx.beginPath();
    ctx.ellipse(shoX - dir * 8, (hipY + shoY) / 2 - 4, 10, 26, 0, 0, Math.PI * 2);
    ctx.fill();

    // Head
    ctx.fillStyle = def.skin;
    ctx.beginPath();
    ctx.arc(headX, headY, 21, 0, Math.PI * 2);
    ctx.fill();
    // Hair cap
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.beginPath();
    ctx.arc(headX, headY - 3, 21, Math.PI * 1.05, Math.PI * 1.95);
    ctx.fill();
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

    // Arms + gloves
    this.drawArms(ctx, f, x, dir, oppX, shoX, shoY, headX, headY, stamFrac, downness);

    ctx.restore();

    // Save anchors (pre-fall-rotation approximation is fine for effects)
    this.anchors[key] = { head: { x: headX, y: headY }, chest: { x: shoX, y: shoY + 30 } };
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
      lead = { x: headX + dir * 12, y: headY + 2 };
      rear = { x: headX + dir * 2, y: headY + 10 };
    } else if (victory) {
      lead = { x: x + dir * 10, y: 175 + Math.sin(this.t * 6) * 5 };
      rear = { x: x - dir * 26, y: 255 };
    } else if (downish) {
      lead = { x: x + dir * 40, y: shoY + 40 };
      rear = { x: x - dir * 10, y: shoY + 44 };
    }

    // Punch extension overrides one arm
    if (f.state === 'punch' && f.punch) {
      const ext = this.punchExt(f);
      const type = f.punch.type;
      const arm = f.punch.def.arm; // 'lead' | 'rear'
      const targetX = oppX - dir * 26;
      let targetY = 246;
      let fromY = arm === 'lead' ? lead.y : rear.y;
      let fromX = arm === 'lead' ? lead.x : rear.x;
      if (type === 'uppercut') { fromY = shoY + 60; targetY = 238; }
      if (type === 'hook') targetY = 240;
      const gx = ext >= 0 ? lerp(fromX, targetX, ext) : fromX + dir * 26 * ext;
      let gy = lerp(fromY, targetY, Math.abs(ext));
      if (type === 'hook' && ext > 0) gy -= Math.sin(ext * Math.PI) * 28; // arc over the top
      const g = { x: gx, y: gy };
      if (arm === 'lead') lead = g; else rear = g;
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
  }
}
