// Pure simulation. No DOM, no canvas. Emits events through game.events.

// reach: max distance between fighter centers for the punch to land
const PUNCHES = {
  jab:      { dmg: 1.3, stam: 4,  windup: 0.14, active: 0.06, recover: 0.18, arm: 'lead', reach: 165 },
  cross:    { dmg: 2.2, stam: 7,  windup: 0.22, active: 0.07, recover: 0.28, arm: 'rear', reach: 155 },
  hook:     { dmg: 3.0, stam: 10, windup: 0.28, active: 0.08, recover: 0.34, arm: 'lead', reach: 140 },
  uppercut: { dmg: 4.0, stam: 14, windup: 0.34, active: 0.09, recover: 0.44, arm: 'rear', reach: 128, guardBreak: 0.35 },
  body:     { dmg: 2.6, stam: 9,  windup: 0.26, active: 0.08, recover: 0.32, arm: 'rear', reach: 140, target: 'body' },
};

const ROUNDS = 10;
const ROUND_SECONDS = 180;   // displayed game-clock seconds
const CLOCK_SPEED = 3;       // game seconds per real second (60s real per round)
const REST_SECONDS = 8;
const DODGE_DUR = 0.45;
const DODGE_INVULN_FROM = 0.03;
const DODGE_INVULN_TO = 0.42;
const DODGE_COOLDOWN = 0.5;
const DODGE_STAM = 3;
const COUNTER_WINDOW = 0.9;
const COUNTER_MULT = 1.5;
const INPUT_BUFFER = 0.5;       // seconds a queued input stays alive
const DUCK_DRAIN = 9;           // stamina per second while covering up
const COUNT_TICK = 0.85;        // real seconds per count number

// How much damage gets through each guard zone, per punch destination.
// <= 0.3 means the guard truly caught it (chip damage, no hitstun).
const GUARD_THROUGH = {
  high: { head: 0.15, body: 0.6 },
  low:  { head: 0.7,  body: 0.12 },
  duck: { head: 0.25, body: 0.25 },
};

// Ring geometry (shared with the renderer's coordinate space)
const RING_LEFT = 130;
const RING_RIGHT = 770;
const MIN_GAP = 70;
const START_P_X = 300;
const START_O_X = 600;

const AI_STYLES = {
  slugger: {
    agg: 0.65, blockPref: 0.75, react: 0.0, prefGap: 115,
    combos: [['cross'], ['hook'], ['jab', 'cross'], ['cross', 'hook'], ['uppercut'], ['body', 'hook'], ['jab', 'uppercut']],
  },
  'out-boxer': {
    agg: 0.55, blockPref: 0.45, react: 0.08, prefGap: 150,
    combos: [['jab'], ['jab'], ['jab', 'jab'], ['jab', 'cross'], ['jab', 'jab', 'cross']],
  },
  pressure: {
    agg: 0.8, blockPref: 0.7, react: 0.0, prefGap: 105,
    combos: [['jab', 'cross', 'hook'], ['cross', 'cross'], ['body', 'body'], ['jab', 'body'], ['hook', 'hook'], ['jab', 'cross']],
  },
  counter: {
    agg: 0.4, blockPref: 0.4, react: 0.18, prefGap: 148,
    combos: [['cross'], ['jab', 'cross'], ['cross', 'hook'], ['jab']],
  },
};

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

function makeFighter(def, isAI, x, dir) {
  return {
    def,
    isAI,
    x, dir,               // dir: +1 faces right (player), -1 faces left (AI)
    moveDir: 0,           // +1 forward (toward opponent), -1 retreat, 0 still
    health: 100, maxHealth: 100,
    stamina: 100, maxStamina: 100,
    state: 'idle',        // idle | punch | block | dodge | hit | down | rising | victory | ko
    stateT: 0,
    punch: null,          // { type, def, dur:{windup,active,total}, resolved, gassed }
    blockHeld: false,
    guardZone: 'high',    // high | low | duck
    dodgeCd: 0,
    counterWindow: 0,
    graceT: 0,            // invulnerability after rising
    knockdownsRound: 0,
    knockdownsTotal: 0,
    round: { landed: 0, thrown: 0, dmg: 0 },
    total: { landed: 0, thrown: 0, dmg: 0 },
    ai: isAI ? { cd: 1.0, comboQueue: [], seenPunch: false, blockT: 0, retreatT: 0 } : null,
  };
}

function punchDurations(f, pdef, gassed) {
  // Speed stat matters a lot: speed 2 → 1.23x slower, speed 10 → 0.75x
  let mul = clamp(1.35 - f.def.speed * 0.06, 0.7, 1.3);
  if (gassed) mul *= 1.3;
  // AI punches must be humanly reactable: long telegraphs, much longer for
  // slow fighters, with per-punch variance so timing stays interesting.
  let windup = pdef.windup * mul;
  if (f.isAI) {
    const windupMul = clamp(2.6 - f.def.speed * 0.16, 1.15, 2.35);
    windup = Math.max(windup * windupMul * (1 + Math.random() * 0.3), 0.28);
  }
  return {
    windup,
    active: pdef.active * mul,
    total: windup + (pdef.active + pdef.recover) * mul,
  };
}

class Game {
  constructor(playerDef, oppDef) {
    this.p = makeFighter(playerDef, false, START_P_X, 1);
    this.o = makeFighter(oppDef, true, START_O_X, -1);
    this.round = 1;
    this.clock = ROUND_SECONDS;
    this.state = 'intro';   // intro | fighting | count | rest | over
    this.stateT = 0;
    this.events = [];
    this.cards = [[], [], []]; // per judge, per round: [pPts, oPts]
    this.count = null;         // { downed, standing, num, t, riseMeter, riseTarget, aiRiseAt }
    this.result = null;        // { method, winner: 'p'|'o'|'draw', round, totals }
    this.buffer = null;        // queued player input { kind, type?, ttl }
    this.o.ai.cd = 0.9 + Math.random() * 0.5; // no cheap shots right at the bell
    this.events.push({ type: 'roundstart', round: 1 });
  }

  emit(e) { this.events.push(e); }

  dist() { return Math.abs(this.o.x - this.p.x); }

  // ---------- Player intents ----------
  // Inputs pressed while busy (punching, hitstun, dodging) are buffered and
  // fire the instant the fighter is free — nothing gets silently eaten.
  pressPunch(type) {
    if (this.state !== 'fighting') return;
    const f = this.p;
    if (f.state === 'idle' || f.state === 'block') this.throwPunch(f, type);
    else this.buffer = { kind: 'punch', type, ttl: INPUT_BUFFER };
  }
  // zone: 'high' | 'low' | 'duck' to hold that guard, null to release
  setGuard(zone) {
    const f = this.p;
    f.blockHeld = !!zone;
    if (zone) f.guardZone = zone;
    if (this.state !== 'fighting') return;
    if (zone && f.state === 'idle') { f.state = 'block'; f.stateT = 0; }
  }
  setBlock(held) { this.setGuard(held ? 'high' : null); } // legacy alias
  setMove(dir) {
    this.p.moveDir = clamp(dir, -1, 1);
  }
  dodge() {
    if (this.state !== 'fighting') return;
    const f = this.p;
    if ((f.state === 'idle' || f.state === 'block') && f.dodgeCd <= 0) this.startDodge(f);
    else this.buffer = { kind: 'dodge', ttl: INPUT_BUFFER };
  }
  drainBuffer(dt) {
    const b = this.buffer;
    if (!b) return;
    b.ttl -= dt;
    if (b.ttl <= 0) { this.buffer = null; return; }
    const f = this.p;
    if (f.state !== 'idle' && f.state !== 'block') return;
    this.buffer = null;
    if (b.kind === 'punch') this.throwPunch(f, b.type);
    else if (f.dodgeCd <= 0) this.startDodge(f);
  }
  riseTap() {
    if (this.state !== 'count' || !this.count || this.count.downed !== this.p) return;
    const c = this.count;
    c.riseMeter = clamp(c.riseMeter + 0.09 / c.riseTarget, 0, 1);
  }

  // ---------- Actions ----------
  throwPunch(f, type) {
    if (f.state !== 'idle' && f.state !== 'block') return;
    const pdef = PUNCHES[type];
    const gassed = f.stamina < pdef.stam;
    f.stamina = Math.max(0, f.stamina - pdef.stam);
    f.state = 'punch';
    f.stateT = 0;
    f.punch = { type, def: pdef, dur: punchDurations(f, pdef, gassed), resolved: false, gassed };
    f.round.thrown++;
    f.total.thrown++;
  }

  startDodge(f) {
    if (f.state !== 'idle' && f.state !== 'block') return;
    if (f.dodgeCd > 0) return;
    f.state = 'dodge';
    f.stateT = 0;
    f.dodgeCd = DODGE_DUR + DODGE_COOLDOWN;
    f.stamina = Math.max(0, f.stamina - DODGE_STAM);
  }

  // Move a fighter, respecting ring bounds and the minimum gap
  applyMovement(f, opp, dt, speedScale) {
    if (f.moveDir === 0) return;
    const spd = (70 + f.def.speed * 10) * speedScale * (f.moveDir > 0 ? 1 : 0.85);
    let nx = f.x + f.moveDir * f.dir * spd * dt;
    if (f.dir > 0) nx = clamp(nx, RING_LEFT, opp.x - MIN_GAP);
    else nx = clamp(nx, opp.x + MIN_GAP, RING_RIGHT);
    f.x = nx;
  }

  knockback(target, attacker, px) {
    let nx = target.x - target.dir * px; // pushed backward, away from the attacker
    if (target.dir > 0) nx = clamp(nx, RING_LEFT, attacker.x - MIN_GAP);
    else nx = clamp(nx, attacker.x + MIN_GAP, RING_RIGHT);
    target.x = nx;
  }

  // ---------- Punch resolution ----------
  resolvePunch(attacker, target) {
    const punch = attacker.punch;
    const pdef = punch.def;

    // Out of range → whiff
    if (this.dist() > pdef.reach) { this.emit({ type: 'miss', by: attacker, range: true }); return; }

    if (target.graceT > 0) { this.emit({ type: 'miss', by: attacker }); return; }

    // Dodged?
    if (target.state === 'dodge' &&
        target.stateT >= DODGE_INVULN_FROM && target.stateT <= DODGE_INVULN_TO) {
      target.counterWindow = COUNTER_WINDOW;
      punch.dur.total += pdef.recover * 0.5; // whiff punishment
      attacker.stamina = Math.max(0, attacker.stamina - 3);
      this.emit({ type: 'dodged', by: target, attacker });
      return;
    }

    // Damage
    const isBody = pdef.target === 'body';
    let dmg = pdef.dmg * (0.6 + attacker.def.power * 0.08);
    dmg *= 0.75 + 0.5 * Math.random();
    if (punch.gassed) dmg *= 0.5;
    let counter = false;
    if (attacker.counterWindow > 0) { dmg *= COUNTER_MULT; counter = true; attacker.counterWindow = 0; }

    // Blocked? Guard zones matter: high covers the head, low covers the
    // body, duck covers both (but drains stamina and loses to uppercuts).
    let smash = false;
    if (target.state === 'block') {
      const zone = target.guardZone || 'high';
      if (zone === 'duck' && punch.type === 'uppercut') {
        // Uppercut rips straight through a duck
        dmg *= 1.15;
        smash = true;
      } else {
        const through = GUARD_THROUGH[zone][isBody ? 'body' : 'head'];
        const solid = through <= 0.3; // the guard truly caught it
        const broke = solid && zone === 'high' && pdef.guardBreak && Math.random() < pdef.guardBreak;
        target.stamina = Math.max(0, target.stamina - dmg * (solid ? 1.2 : 0.5) - (zone === 'duck' ? 2 : 0));
        if (solid && !broke && target.stamina > 0) {
          const chip = dmg * through;
          target.health = Math.max(0, target.health - chip);
          attacker.round.dmg += chip;
          this.emit({ type: 'blocked', target, attacker, punch: punch.type, body: isBody, zone });
          return;
        }
        if (broke || (solid && target.stamina <= 0)) {
          // Guard break: partial damage + stun
          dmg *= 0.6;
          this.stagger(target, 0.5);
          this.emit({ type: 'guardbreak', target });
        } else {
          // Wrong guard for this punch — most of it gets through
          dmg *= through;
        }
      }
    }

    dmg = Math.round(dmg * 10) / 10;
    target.health = Math.max(0, target.health - dmg);
    if (isBody) target.stamina = Math.max(0, target.stamina - dmg * 2.2); // body work steals wind
    attacker.round.landed++;
    attacker.round.dmg += dmg;
    attacker.total.landed++;
    attacker.total.dmg += dmg;
    this.knockback(target, attacker, 5 + dmg * 2);
    this.emit({ type: 'hit', target, attacker, dmg, punch: punch.type, counter, body: isBody, smash });

    // Knockdown? (body shots wear you down but don't drop you outright)
    let down = target.health <= 0;
    if (!down && !isBody && target.health < 30 && (punch.type === 'hook' || punch.type === 'uppercut') && dmg >= 2.8) {
      const chance = (dmg / 22) * (1 - target.def.chin * 0.07);
      if (Math.random() < chance) down = true;
    }
    if (down) this.knockdown(target, attacker);
    else if (target.state !== 'hit' || target.stateT > 0.05) {
      this.stagger(target, clamp((isBody ? 0.12 : 0.16) + dmg * 0.03, 0.12, 0.45));
    }
  }

  stagger(f, dur) {
    f.state = 'hit';
    f.stateT = 0;
    f.hitDur = dur;
    f.punch = null;
    f.blockHeld = f.blockHeld && !f.isAI; // player may still be holding the button
  }

  knockdown(target, standing) {
    target.state = 'down';
    target.stateT = 0;
    target.punch = null;
    target.moveDir = 0;
    target.knockdownsRound++;
    target.knockdownsTotal++;
    standing.state = 'idle';
    standing.punch = null;
    standing.moveDir = 0;
    this.buffer = null;
    this.state = 'count';
    this.stateT = 0;
    const chinFrac = target.def.chin / 10;
    const hurt = 1 - target.health / 40;
    let aiRiseAt = null;
    if (target.isAI) {
      aiRiseAt = Math.round(3 + (1 - chinFrac) * 4 + Math.max(0, hurt) * 3 + Math.random() * 2);
      if (target.knockdownsRound >= 3 || target.health <= 0 && target.knockdownsTotal >= 3) aiRiseAt = 99;
    }
    // Each knockdown (and worse shape) takes more mashing to beat
    const riseTarget = clamp(1 + (target.knockdownsTotal - 1) * 0.35 + Math.max(0, hurt) * 0.25, 1, 2.1);
    this.count = { downed: target, standing, num: 0, t: 0, riseMeter: 0, riseTarget, aiRiseAt };
    this.emit({ type: 'knockdown', target });
    if (target.knockdownsRound >= 3) {
      this.finish('TKO', standing === this.p ? 'p' : 'o');
      return;
    }
  }

  rise(f) {
    f.state = 'rising';
    f.stateT = 0;
    f.health = Math.max(f.health, Math.min(40, 12 + f.def.chin * 2.8));
    f.stamina = Math.min(f.maxStamina, f.stamina + 25);
    f.graceT = 1.5;
    this.count = null;
    this.state = 'fighting';
    this.stateT = 0;
    this.emit({ type: 'rise', target: f });
  }

  finish(method, winner) {
    this.state = 'over';
    this.stateT = 0;
    this.count = null;
    const totals = this.cardTotals();
    this.result = { method, winner, round: this.round, totals };
    const w = winner === 'p' ? this.p : winner === 'o' ? this.o : null;
    const l = w === this.p ? this.o : this.p;
    if (w) { w.state = 'victory'; w.stateT = 0; w.punch = null; w.moveDir = 0; }
    if (l && method !== 'Decision' && method !== 'Draw') { l.state = 'ko'; l.stateT = 0; l.punch = null; l.moveDir = 0; }
    else if (l) { l.state = 'idle'; l.punch = null; l.moveDir = 0; }
    this.emit({ type: 'over', result: this.result });
  }

  cardTotals() {
    return this.cards.map(rounds =>
      rounds.reduce((acc, r) => [acc[0] + r[0], acc[1] + r[1]], [0, 0]));
  }

  scoreRound() {
    for (let j = 0; j < 3; j++) {
      const noise = () => 0.9 + Math.random() * 0.2;
      const a = (this.p.round.dmg + this.p.round.landed * 0.6) * noise();
      const b = (this.o.round.dmg + this.o.round.landed * 0.6) * noise();
      let pa = 10, pb = 10;
      if (a > b + 0.5) pb = 9;
      else if (b > a + 0.5) pa = 9;
      pa = Math.max(7, pa - this.p.knockdownsRound);
      pb = Math.max(7, pb - this.o.knockdownsRound);
      this.cards[j].push([pa, pb]);
    }
  }

  endRound() {
    this.scoreRound();
    this.emit({ type: 'roundend', round: this.round });
    if (this.round >= ROUNDS) {
      const totals = this.cardTotals();
      let pv = 0, ov = 0;
      for (const [a, b] of totals) { if (a > b) pv++; else if (b > a) ov++; }
      if (pv > ov) this.finish('Decision', 'p');
      else if (ov > pv) this.finish('Decision', 'o');
      else this.finish('Draw', 'draw');
      return;
    }
    // Corner recovery
    for (const f of [this.p, this.o]) {
      const heal = Math.min(25, (f.maxHealth - f.health) * (0.10 + f.def.recovery * 0.02));
      f.health = Math.min(f.maxHealth, f.health + heal);
      f.stamina = Math.min(f.maxStamina, f.stamina + 45 + f.def.recovery * 4);
      f.state = 'idle'; f.punch = null; f.blockHeld = false; f.moveDir = 0;
      f.counterWindow = 0; f.knockdownsRound = 0;
      f.round = { landed: 0, thrown: 0, dmg: 0 };
    }
    this.buffer = null;
    this.state = 'rest';
    this.stateT = 0;
  }

  skipRest() {
    if (this.state === 'rest') this.startRound();
  }

  startRound() {
    this.round++;
    this.clock = ROUND_SECONDS;
    this.state = 'intro';
    this.stateT = 0;
    // Back to your corners
    this.p.x = START_P_X;
    this.o.x = START_O_X;
    this.o.ai.cd = 0.9 + Math.random() * 0.5;
    this.o.ai.comboQueue = [];
    this.emit({ type: 'roundstart', round: this.round });
  }

  // ---------- Per-frame update ----------
  update(dt) {
    this.stateT += dt;
    switch (this.state) {
      case 'intro':
        this.updateFighterPassive(this.p, dt);
        this.updateFighterPassive(this.o, dt);
        if (this.stateT >= 2.2) { this.state = 'fighting'; this.stateT = 0; this.emit({ type: 'fight' }); }
        break;
      case 'fighting': {
        this.clock -= dt * CLOCK_SPEED;
        this.updateFighter(this.p, this.o, dt);
        if (this.state !== 'fighting') break; // knockdown/finish mid-update
        this.drainBuffer(dt);
        this.updateFighter(this.o, this.p, dt);
        if (this.state !== 'fighting') break;
        this.aiUpdate(this.o, this.p, dt);
        if (this.clock <= 0) { this.clock = 0; this.endRound(); }
        break;
      }
      case 'count': {
        const c = this.count;
        if (!c) break;
        c.t += dt;
        c.downed.stateT += dt;
        this.updateFighterPassive(c.standing, dt);
        if (c.downed === this.p) c.riseMeter = clamp(c.riseMeter + dt * 0.02 / c.riseTarget, 0, 1);
        while (c.t >= COUNT_TICK) {
          c.t -= COUNT_TICK;
          c.num++;
          this.emit({ type: 'counttick', num: c.num });
          if (c.num >= 10) {
            this.finish('KO', c.standing === this.p ? 'p' : 'o');
            return;
          }
        }
        const canRise = c.num >= 1;
        if (canRise) {
          if (c.downed === this.p && c.riseMeter >= 1) this.rise(this.p);
          else if (c.downed === this.o && c.num >= c.aiRiseAt) this.rise(this.o);
        }
        break;
      }
      case 'rest':
        if (this.stateT >= REST_SECONDS) this.startRound();
        break;
      case 'over':
        this.p.stateT += dt;
        this.o.stateT += dt;
        break;
    }
  }

  updateFighterPassive(f, dt) {
    f.stateT += dt;
    if (f.dodgeCd > 0) f.dodgeCd -= dt;
    if (f.graceT > 0) f.graceT -= dt;
    if (f.counterWindow > 0) f.counterWindow -= dt;
    if (f.state === 'rising' && f.stateT > 0.7) { f.state = 'idle'; f.stateT = 0; }
    if (f.state === 'punch' || f.state === 'hit' || f.state === 'dodge') {
      // let animations settle during non-fighting states
      if (f.stateT > 0.6) { f.state = 'idle'; f.stateT = 0; f.punch = null; }
    }
  }

  updateFighter(f, opp, dt) {
    f.stateT += dt;
    if (f.dodgeCd > 0) f.dodgeCd -= dt;
    if (f.graceT > 0) f.graceT -= dt;
    if (f.counterWindow > 0) f.counterWindow -= dt;

    // Stamina regen (ducking actively burns stamina — you can't cover up forever)
    const regenBase = 4.5 + f.def.stamina * 0.55;
    if (f.state === 'idle' || f.state === 'rising') {
      f.stamina = Math.min(f.maxStamina, f.stamina + regenBase * dt);
    } else if (f.state === 'block') {
      if (f.guardZone === 'duck' && f.stamina <= 0) f.guardZone = 'high'; // can't hold a cover with no wind
      if (f.guardZone === 'duck') {
        f.stamina = Math.max(0, f.stamina - DUCK_DRAIN * dt);
        if (f.stamina <= 0) {
          this.stagger(f, 0.55);
          if (!f.isAI) f.guardZone = 'high'; // arms drop
          this.emit({ type: 'guardbreak', target: f });
        }
      } else {
        f.stamina = Math.min(f.maxStamina, f.stamina + regenBase * 0.35 * dt);
      }
    }

    // Footwork (free while idle, slower while blocking)
    if (f.state === 'idle') this.applyMovement(f, opp, dt, 1);
    else if (f.state === 'block') this.applyMovement(f, opp, dt, 0.5);

    switch (f.state) {
      case 'idle':
        // Holding block re-engages the guard as soon as you're free (e.g. at the bell)
        if (!f.isAI && f.blockHeld) { f.state = 'block'; f.stateT = 0; }
        break;
      case 'punch': {
        const p = f.punch;
        if (!p) { f.state = 'idle'; break; }
        if (!p.resolved && f.stateT >= p.dur.windup) {
          p.resolved = true;
          this.resolvePunch(f, opp);
          if (this.state !== 'fighting') return;
        }
        if (f.state === 'punch' && f.stateT >= p.dur.total) {
          f.punch = null;
          f.state = (f === this.p && f.blockHeld) ? 'block' : 'idle';
          f.stateT = 0;
        }
        break;
      }
      case 'block':
        // AI block release is timed in aiUpdate (blockT); player's follows the button
        if (!f.isAI && !f.blockHeld) { f.state = 'idle'; f.stateT = 0; }
        break;
      case 'dodge': {
        // Lean back drifts you slightly out of range
        const back = -f.dir * 55 * dt;
        let nx = f.x + back;
        if (f.dir > 0) nx = clamp(nx, RING_LEFT, opp.x - MIN_GAP);
        else nx = clamp(nx, opp.x + MIN_GAP, RING_RIGHT);
        f.x = nx;
        if (f.stateT >= DODGE_DUR) {
          f.state = (f === this.p && f.blockHeld) ? 'block' : 'idle';
          f.stateT = 0;
        }
        break;
      }
      case 'hit':
        if (f.stateT >= (f.hitDur || 0.25)) {
          f.state = (f === this.p && f.blockHeld) ? 'block' : 'idle';
          f.stateT = 0;
        }
        break;
      case 'rising':
        if (f.stateT >= 0.7) { f.state = 'idle'; f.stateT = 0; }
        break;
    }
  }

  // ---------- AI ----------
  aiUpdate(f, opp, dt) {
    const ai = f.ai;
    const style = AI_STYLES[f.def.style];
    ai.cd -= dt;
    if (ai.retreatT > 0) ai.retreatT -= dt;

    const d = this.dist();
    const stamFrac = f.stamina / f.maxStamina;

    // Footwork: hold the style's preferred distance; back off when gassed or resetting
    let prefGap = style.prefGap;
    if (stamFrac < 0.3) prefGap += 70;
    if (ai.retreatT > 0) prefGap += 90;
    if (f.state === 'idle' || f.state === 'block') {
      if (d > prefGap + 14) f.moveDir = 1;
      else if (d < prefGap - 14) f.moveDir = -1;
      else f.moveDir = 0;
    } else f.moveDir = 0;

    // React to the player's windup
    if (opp.state === 'punch' && opp.punch && !opp.punch.resolved) {
      if (!ai.seenPunch && (f.state === 'idle' || f.state === 'block')) {
        ai.seenPunch = true;
        const reactChance = clamp(0.18 + f.def.speed * 0.05 + style.react, 0, 0.85);
        if (Math.random() < reactChance) {
          const wantsDodge = Math.random() < (f.def.style === 'counter' ? 0.5 : f.def.style === 'out-boxer' ? 0.4 : 0.18);
          if (wantsDodge && f.dodgeCd <= 0 && f.state === 'idle') {
            this.startDodge(f);
          } else {
            // Read the incoming punch and pick the right guard (~12% misread)
            const incoming = opp.punch.def.target === 'body' ? 'low' : 'high';
            f.guardZone = Math.random() < 0.12 ? (incoming === 'low' ? 'high' : 'low') : incoming;
            if (f.health < 35 && Math.random() < 0.25 && f.stamina > 25) f.guardZone = 'duck';
            f.state = 'block'; f.stateT = 0;
            ai.blockT = 0.35 + Math.random() * 0.3;
          }
        }
      }
    } else {
      ai.seenPunch = false;
    }

    // Timed block release
    if (f.state === 'block') {
      ai.blockT -= dt;
      if (ai.blockT <= 0) { f.state = 'idle'; f.stateT = 0; }
      return;
    }

    if (f.state !== 'idle' || ai.cd > 0) return;

    // Slow fighters think slower too
    const tempo = clamp(1.45 - f.def.speed * 0.055, 0.9, 1.35);

    // Continue a combo
    if (ai.comboQueue.length > 0) {
      const next = ai.comboQueue.shift();
      if (d <= PUNCHES[next].reach + 10) {
        this.throwPunch(f, next);
        ai.cd = ai.comboQueue.length > 0 ? 0.05 + Math.random() * 0.1 : (0.4 + Math.random() * 0.55) * tempo;
      } else {
        ai.comboQueue = []; // opponent slipped out of range
        ai.cd = 0.15;
      }
      return;
    }

    // Gassed: rest behind guard (never duck to rest — it drains)
    if (stamFrac < 0.25 && Math.random() < 0.7) {
      f.guardZone = Math.random() < 0.7 ? 'high' : 'low';
      f.state = 'block'; f.stateT = 0;
      ai.blockT = 0.5 + Math.random() * 0.6;
      ai.cd = 0.1;
      return;
    }

    let agg = style.agg * (0.35 + 0.65 * stamFrac);
    if (opp.state === 'hit' || (opp.state === 'punch' && opp.punch && opp.punch.resolved)) agg *= 1.7;
    if (opp.state === 'block') agg *= 0.55;
    if (f.counterWindow > 0) agg = 0.95; // cash in the counter

    const r = Math.random();
    if (r < agg) {
      let combo;
      if (f.counterWindow > 0) combo = ['cross'];
      else if (opp.state === 'block' && Math.random() < 0.6) {
        // Attack whatever the opponent's guard leaves open
        const zone = opp.guardZone || 'high';
        if (zone === 'duck') combo = ['uppercut'];
        else if (zone === 'low') combo = Math.random() < 0.5 ? ['cross', 'hook'] : ['jab', 'cross'];
        else combo = Math.random() < 0.55 ? ['body'] : ['uppercut'];
      }
      else combo = style.combos[Math.floor(Math.random() * style.combos.length)];
      // Only start swinging from range the first punch can land
      if (d > PUNCHES[combo[0]].reach) {
        f.moveDir = 1;
        ai.cd = 0.12;
        return;
      }
      this.throwPunch(f, combo[0]);
      ai.comboQueue = combo.slice(1);
      ai.cd = combo.length > 1 ? 0.05 : (0.4 + Math.random() * 0.55) * tempo;
      if (f.def.style === 'out-boxer' && Math.random() < 0.5) ai.retreatT = 0.7; // stick and move
    } else if (r < agg + 0.25 * style.blockPref) {
      f.guardZone = Math.random() < 0.7 ? 'high' : 'low';
      f.state = 'block'; f.stateT = 0;
      ai.blockT = 0.3 + Math.random() * 0.5;
      ai.cd = 0.1;
    } else {
      ai.cd = (0.15 + Math.random() * 0.45) * tempo;
    }
  }
}
