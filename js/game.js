// Pure simulation. No DOM, no canvas. Emits events through game.events.

const PUNCHES = {
  jab:      { dmg: 1.3, stam: 4,  windup: 0.14, active: 0.06, recover: 0.18, arm: 'lead' },
  cross:    { dmg: 2.2, stam: 7,  windup: 0.22, active: 0.07, recover: 0.28, arm: 'rear' },
  hook:     { dmg: 3.0, stam: 10, windup: 0.28, active: 0.08, recover: 0.34, arm: 'lead' },
  uppercut: { dmg: 4.0, stam: 14, windup: 0.34, active: 0.09, recover: 0.44, arm: 'rear', guardBreak: 0.35 },
};

const ROUNDS = 10;
const ROUND_SECONDS = 180;   // displayed game-clock seconds
const CLOCK_SPEED = 3;       // game seconds per real second (60s real per round)
const REST_SECONDS = 8;
const DODGE_DUR = 0.4;
const DODGE_INVULN_FROM = 0.04;
const DODGE_INVULN_TO = 0.36;
const DODGE_COOLDOWN = 0.55;
const DODGE_STAM = 3;
const COUNTER_WINDOW = 0.9;
const COUNTER_MULT = 1.5;
const BLOCK_DMG_FACTOR = 0.15;
const COUNT_TICK = 0.85;     // real seconds per count number

const AI_STYLES = {
  slugger: {
    agg: 0.65, blockPref: 0.75, react: 0.0,
    combos: [['cross'], ['hook'], ['jab', 'cross'], ['cross', 'hook'], ['uppercut'], ['jab', 'uppercut']],
  },
  'out-boxer': {
    agg: 0.55, blockPref: 0.45, react: 0.08,
    combos: [['jab'], ['jab'], ['jab', 'jab'], ['jab', 'cross'], ['jab', 'jab', 'cross']],
  },
  pressure: {
    agg: 0.8, blockPref: 0.7, react: 0.0,
    combos: [['jab', 'cross', 'hook'], ['cross', 'cross'], ['hook', 'hook'], ['jab', 'cross'], ['jab', 'hook']],
  },
  counter: {
    agg: 0.4, blockPref: 0.4, react: 0.18,
    combos: [['cross'], ['jab', 'cross'], ['cross', 'hook'], ['jab']],
  },
};

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

function makeFighter(def, isAI) {
  return {
    def,
    isAI,
    health: 100, maxHealth: 100,
    stamina: 100, maxStamina: 100,
    state: 'idle',       // idle | punch | block | dodge | hit | down | rising | victory | ko
    stateT: 0,
    punch: null,          // { type, def, dur:{windup,active,total}, resolved, gassed }
    blockHeld: false,
    dodgeCd: 0,
    counterWindow: 0,
    graceT: 0,            // invulnerability after rising
    knockdownsRound: 0,
    knockdownsTotal: 0,
    round: { landed: 0, thrown: 0, dmg: 0 },
    total: { landed: 0, thrown: 0, dmg: 0 },
    ai: isAI ? { cd: 1.2, comboQueue: [], seenPunch: false, blockT: 0 } : null,
  };
}

function punchDurations(f, pdef, gassed) {
  let mul = 1.25 - f.def.speed * 0.05;
  if (gassed) mul *= 1.3;
  return {
    windup: pdef.windup * mul,
    active: pdef.active * mul,
    total: (pdef.windup + pdef.active + pdef.recover) * mul,
  };
}

class Game {
  constructor(playerDef, oppDef) {
    this.p = makeFighter(playerDef, false);
    this.o = makeFighter(oppDef, true);
    this.round = 1;
    this.clock = ROUND_SECONDS;
    this.state = 'intro';   // intro | fighting | count | rest | over
    this.stateT = 0;
    this.events = [];
    this.cards = [[], [], []]; // per judge, per round: [pPts, oPts]
    this.count = null;         // { downed, standing, num, t, riseMeter, aiRiseAt }
    this.result = null;        // { method, winner: 'p'|'o'|'draw', round, totals }
    this.events.push({ type: 'roundstart', round: 1 });
  }

  emit(e) { this.events.push(e); }

  // ---------- Player intents ----------
  pressPunch(type) {
    if (this.state !== 'fighting') return;
    this.throwPunch(this.p, type);
  }
  setBlock(held) {
    this.p.blockHeld = held;
    if (this.state !== 'fighting') return;
    const f = this.p;
    if (held && f.state === 'idle') { f.state = 'block'; f.stateT = 0; }
  }
  dodge() {
    if (this.state !== 'fighting') return;
    this.startDodge(this.p);
  }
  riseTap() {
    if (this.state !== 'count' || !this.count || this.count.downed !== this.p) return;
    this.count.riseMeter = clamp(this.count.riseMeter + 0.09, 0, 1);
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

  // ---------- Punch resolution ----------
  resolvePunch(attacker, target) {
    const punch = attacker.punch;
    const pdef = punch.def;

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
    let dmg = pdef.dmg * (0.6 + attacker.def.power * 0.08);
    dmg *= 0.75 + 0.5 * Math.random();
    if (punch.gassed) dmg *= 0.5;
    let counter = false;
    if (attacker.counterWindow > 0) { dmg *= COUNTER_MULT; counter = true; attacker.counterWindow = 0; }

    // Blocked?
    if (target.state === 'block') {
      const broke = pdef.guardBreak && Math.random() < pdef.guardBreak;
      target.stamina = Math.max(0, target.stamina - dmg * 1.2);
      if (!broke && target.stamina > 0) {
        const chip = dmg * BLOCK_DMG_FACTOR;
        target.health = Math.max(0, target.health - chip);
        attacker.round.dmg += chip;
        this.emit({ type: 'blocked', target, attacker, punch: punch.type });
        return;
      }
      // Guard break: partial damage + stun
      dmg *= 0.6;
      this.stagger(target, 0.5);
      this.emit({ type: 'guardbreak', target });
    }

    dmg = Math.round(dmg * 10) / 10;
    target.health = Math.max(0, target.health - dmg);
    attacker.round.landed++;
    attacker.round.dmg += dmg;
    attacker.total.landed++;
    attacker.total.dmg += dmg;
    this.emit({ type: 'hit', target, attacker, dmg, punch: punch.type, counter });

    // Knockdown?
    let down = target.health <= 0;
    if (!down && target.health < 30 && (punch.type === 'hook' || punch.type === 'uppercut') && dmg >= 2.8) {
      const chance = (dmg / 22) * (1 - target.def.chin * 0.07);
      if (Math.random() < chance) down = true;
    }
    if (down) this.knockdown(target, attacker);
    else if (target.state !== 'hit' || target.stateT > 0.05) {
      this.stagger(target, clamp(0.16 + dmg * 0.03, 0.16, 0.45));
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
    target.knockdownsRound++;
    target.knockdownsTotal++;
    standing.state = 'idle';
    standing.punch = null;
    this.state = 'count';
    this.stateT = 0;
    const chinFrac = target.def.chin / 10;
    const hurt = 1 - target.health / 40; // health is 0..40 here typically
    let aiRiseAt = null;
    if (target.isAI) {
      aiRiseAt = Math.round(3 + (1 - chinFrac) * 4 + Math.max(0, hurt) * 3 + Math.random() * 2);
      if (target.knockdownsRound >= 3 || target.health <= 0 && target.knockdownsTotal >= 3) aiRiseAt = 99;
    }
    this.count = { downed: target, standing, num: 0, t: 0, riseMeter: 0, aiRiseAt };
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
    if (w) { w.state = 'victory'; w.stateT = 0; w.punch = null; }
    if (l && method !== 'Decision' && method !== 'Draw') { l.state = 'ko'; l.stateT = 0; l.punch = null; }
    else if (l) { l.state = 'idle'; l.punch = null; }
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
      f.state = 'idle'; f.punch = null; f.blockHeld = false;
      f.counterWindow = 0; f.knockdownsRound = 0;
      f.round = { landed: 0, thrown: 0, dmg: 0 };
    }
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
        // passive rise for player, decay nothing
        if (c.downed === this.p) c.riseMeter = clamp(c.riseMeter + dt * 0.02, 0, 1);
        while (c.t >= COUNT_TICK) {
          c.t -= COUNT_TICK;
          c.num++;
          this.emit({ type: 'counttick', num: c.num });
          if (c.num >= 10) {
            this.finish('KO', c.standing === this.p ? 'p' : 'o');
            return;
          }
        }
        const canRise = c.num >= 2; // can't pop up instantly
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

    // Stamina regen
    const regenBase = 4.5 + f.def.stamina * 0.55;
    if (f.state === 'idle' || f.state === 'rising') {
      f.stamina = Math.min(f.maxStamina, f.stamina + regenBase * dt);
    } else if (f.state === 'block') {
      f.stamina = Math.min(f.maxStamina, f.stamina + regenBase * 0.35 * dt);
    }

    switch (f.state) {
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
      case 'dodge':
        if (f.stateT >= DODGE_DUR) {
          f.state = (f === this.p && f.blockHeld) ? 'block' : 'idle';
          f.stateT = 0;
        }
        break;
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

    // Continue a combo
    if (ai.comboQueue.length > 0) {
      const next = ai.comboQueue.shift();
      this.throwPunch(f, next);
      // Pause after the combo finishes, tiny gap between combo punches
      ai.cd = ai.comboQueue.length > 0 ? 0.05 + Math.random() * 0.1 : 0.4 + Math.random() * 0.55;
      return;
    }

    const stamFrac = f.stamina / f.maxStamina;

    // Gassed: rest behind guard
    if (stamFrac < 0.25 && Math.random() < 0.7) {
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
      else if (opp.state === 'block' && Math.random() < 0.5) combo = ['uppercut'];
      else combo = style.combos[Math.floor(Math.random() * style.combos.length)];
      this.throwPunch(f, combo[0]);
      ai.comboQueue = combo.slice(1);
      ai.cd = combo.length > 1 ? 0.05 : 0.4 + Math.random() * 0.55;
    } else if (r < agg + 0.25 * (AI_STYLES[f.def.style].blockPref)) {
      f.state = 'block'; f.stateT = 0;
      ai.blockT = 0.3 + Math.random() * 0.5;
      ai.cd = 0.1;
    } else {
      ai.cd = 0.15 + Math.random() * 0.45;
    }
  }
}
