// Screens, HUD, career mode, event routing, main loop.
(function () {
  const $ = id => document.getElementById(id);

  const audio = new AudioSys();
  const canvas = $('ring');
  const renderer = new Renderer(canvas);

  let game = null;
  let mode = 'exhibition';   // 'exhibition' | 'career' | 'training'
  let playerDef = null;
  let oppDef = null;
  let lastTime = 0;
  let resultShownAt = null;
  let resultApplied = false;
  let hitstopT = 0;
  let paused = false;

  // ---------------- Career persistence ----------------
  // v2: { v: 2, fighter: <def>, stage, w, l, ko, sp }. v1 saves (fighterId)
  // migrate to a copy of the preset def on load.
  const CAREER_KEY = 'alumbs-career-v1';
  function loadCareer() {
    try {
      const c = JSON.parse(localStorage.getItem(CAREER_KEY));
      if (!c) return null;
      if (c.v === 2 && c.fighter) {
        if (!c.fighter.hair) c.fighter.hair = 'short';
        if (!c.fighter.hairColor) c.fighter.hairColor = '#1a1a1a';
        return c;
      }
      const def = FIGHTERS.find(f => f.id === c.fighterId);
      if (def) {
        return { v: 2, fighter: { ...def }, stage: c.stage || 0, w: c.w || 0, l: c.l || 0, ko: c.ko || 0, sp: 0 };
      }
    } catch (e) { /* corrupt save */ }
    return null;
  }
  function saveCareer(c) {
    try { localStorage.setItem(CAREER_KEY, JSON.stringify(c)); } catch (e) { /* private mode */ }
  }
  function clearCareer() {
    try { localStorage.removeItem(CAREER_KEY); } catch (e) { /* ignore */ }
  }
  function careerOpponents(c) {
    return FIGHTERS.filter(f => f.id !== c.fighter.id); // roster is already weakest → strongest
  }

  // ---------------- Screens ----------------
  const screens = ['screen-menu', 'screen-career', 'screen-create', 'screen-select', 'screen-fight'];
  function show(id) {
    for (const s of screens) $(s).classList.toggle('hidden', s !== id);
    if (id !== 'screen-fight') game = null;
  }

  // ---------------- Banner ----------------
  const bannerEl = $('banner');
  let bannerQueue = [];
  let bannerUntil = 0;
  function banner(text, cls = '', dur = 1.1) {
    bannerQueue.push({ text, cls, dur });
  }
  function updateBanner(now) {
    if (bannerUntil > now) return;
    const b = bannerQueue.shift();
    if (!b) { bannerEl.className = 'banner'; return; }
    bannerEl.textContent = b.text;
    bannerEl.className = 'banner show ' + b.cls;
    bannerUntil = now + b.dur * 1000;
  }

  // ---------------- Menu ----------------
  function careerRank(c) {
    const n = careerOpponents(c).length;
    if (c.stage >= n) return 'CHAMPION';
    if (c.stage === 0) return 'UNRANKED';
    return `RANKED #${n - c.stage + 1}`;
  }

  function showMenu() {
    const c = loadCareer();
    const sum = $('career-summary');
    if (c) {
      sum.textContent = `${c.fighter.nick} · ${c.w}-${c.l} (${c.ko} KO) · ${careerRank(c)}`;
      sum.classList.remove('hidden');
    } else {
      sum.classList.add('hidden');
    }
    show('screen-menu');
  }

  $('btn-career').addEventListener('click', () => {
    audio.ensure();
    if (loadCareer()) showCareerHub();
    else showCreate();
  });
  $('btn-exhibition').addEventListener('click', () => {
    audio.ensure();
    playerDef = null;
    renderGrid('player');
    $('select-title').textContent = 'CHOOSE YOUR FIGHTER';
    show('screen-select');
  });
  $('btn-training').addEventListener('click', () => {
    audio.ensure();
    playerDef = null;
    renderGrid('t-player');
    $('select-title').textContent = 'CHOOSE YOUR FIGHTER';
    show('screen-select');
  });
  $('btn-select-back').addEventListener('click', showMenu);

  // ---------------- Create a fighter ----------------
  const CF_FLAGS = ['🇳🇬', '🇺🇸', '🇬🇧', '🇯🇲', '🇲🇽', '🇯🇵', '🇮🇹', '🇮🇪', '🇰🇷', '🇺🇦', '🇧🇷', '🇵🇭'];
  const CF_SKINS = ['#f0c8a0', '#e8b088', '#d9a071', '#b57e52', '#8d5524', '#6b4423'];
  const CF_HAIR = HAIR_STYLES;
  const CF_HAIR_COLORS = HAIR_COLORS;
  const CF_COLORS = ['#c0392b', '#1550a0', '#0f7a3d', '#7d2ea0', '#111111', '#e0a800', '#f5f5f5', '#ff6b35'];
  const CF_STYLES = ['slugger', 'out-boxer', 'pressure', 'counter'];
  const CF_STATS = [['power', 'PWR'], ['speed', 'SPD'], ['chin', 'CHN'], ['stamina', 'STA'], ['recovery', 'REC']];
  const CF_POOL = 14;
  let cf = null;

  function showCreate() {
    cf = {
      flag: CF_FLAGS[0], skin: CF_SKINS[2], trunks: CF_COLORS[0], gloves: CF_COLORS[1],
      hair: CF_HAIR[1], hairColor: CF_HAIR_COLORS[0],
      style: CF_STYLES[0],
      stats: { power: 3, speed: 3, chin: 3, stamina: 3, recovery: 3 },
    };
    $('cf-name').value = '';
    $('cf-nick').value = '';
    renderSwatches('cf-flags', CF_FLAGS, v => cf.flag === v, v => { cf.flag = v; }, v => v);
    renderSwatches('cf-skins', CF_SKINS, v => cf.skin === v, v => { cf.skin = v; });
    renderSwatches('cf-hair', CF_HAIR, v => cf.hair === v, v => { cf.hair = v; }, v => v.toUpperCase());
    renderSwatches('cf-hair-colors', CF_HAIR_COLORS, v => cf.hairColor === v, v => { cf.hairColor = v; });
    renderSwatches('cf-trunks', CF_COLORS, v => cf.trunks === v, v => { cf.trunks = v; });
    renderSwatches('cf-gloves', CF_COLORS, v => cf.gloves === v, v => { cf.gloves = v; });
    renderSwatches('cf-styles', CF_STYLES, v => cf.style === v, v => { cf.style = v; }, v => v.toUpperCase());
    renderCfStats();
    show('screen-create');
  }

  // Each swatch group re-renders itself on pick so the selection ring moves
  function renderSwatches(id, values, isSel, pick, label) {
    const box = $(id);
    box.innerHTML = '';
    for (const v of values) {
      const b = document.createElement('button');
      b.className = 'swatch' + (label ? ' text' : '') + (isSel(v) ? ' sel' : '');
      if (label) b.textContent = label(v);
      else b.style.background = v;
      b.addEventListener('click', () => { pick(v); renderSwatches(id, values, isSel, pick, label); });
      box.appendChild(b);
    }
  }

  function cfPoolLeft() {
    return CF_POOL - CF_STATS.reduce((s, [k]) => s + cf.stats[k] - 3, 0);
  }

  function renderCfStats() {
    const box = $('cf-stats');
    const pool = cfPoolLeft();
    $('cf-pool').textContent = pool;
    box.innerHTML = '';
    for (const [key, label] of CF_STATS) {
      const v = cf.stats[key];
      const row = document.createElement('div');
      row.className = 'cf-stat';
      row.innerHTML = `
        <span class="cf-label">${label}</span>
        <button data-d="-1" ${v <= 1 ? 'disabled' : ''}>−</button>
        <span class="cf-val">${v}</span>
        <button data-d="1" ${v >= 10 || pool <= 0 ? 'disabled' : ''}>+</button>
        <div class="stat-bar"><div style="width:${v * 10}%"></div></div>`;
      row.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
        cf.stats[key] = Math.max(1, Math.min(10, v + Number(b.dataset.d)));
        renderCfStats();
      }));
      box.appendChild(row);
    }
  }

  $('btn-create-back').addEventListener('click', showMenu);
  $('btn-create-go').addEventListener('click', () => {
    audio.ensure();
    const def = {
      id: 'you',
      name: $('cf-name').value.trim() || 'Rocky Alumbs',
      nick: $('cf-nick').value.trim() || 'The Truth',
      flag: cf.flag,
      ...cf.stats,
      style: cf.style,
      skin: cf.skin, trunks: cf.trunks, gloves: cf.gloves,
      hair: cf.hair, hairColor: cf.hairColor,
    };
    saveCareer({ v: 2, fighter: def, stage: 0, w: 0, l: 0, ko: 0, sp: 0 });
    showCareerHub();
  });

  // ---------------- Career hub ----------------
  function showCareerHub() {
    const c = loadCareer();
    if (!c) { showMenu(); return; }
    const opps = careerOpponents(c);
    $('career-title').textContent = `🏆 ${c.fighter.nick.toUpperCase()}'S CAREER`;
    $('career-record').textContent = `${c.w}-${c.l} · ${c.ko} KO · ${careerRank(c)}`;
    const box = $('career-opponent');
    if (c.stage >= opps.length) {
      $('career-next-label').textContent = '';
      box.innerHTML = `<div class="champion-banner">🏆 UNDISPUTED CHAMPION 🏆<br><small>Pick any challenger and defend your title.</small></div>`;
      $('btn-career-fight').classList.add('hidden');
      $('btn-career-defend').classList.remove('hidden');
    } else {
      const next = opps[c.stage];
      $('career-next-label').textContent = `NEXT OPPONENT — RANKED #${opps.length - c.stage}`;
      box.innerHTML = fighterCardHTML(next);
      $('btn-career-fight').classList.remove('hidden');
      $('btn-career-defend').classList.add('hidden');
    }
    renderSkillPoints(c);
    renderRankings(c);
    show('screen-career');
  }

  // Ladder: unbeaten fighters above you (strongest at #1), you, then everyone
  // you've already knocked off, struck through.
  function renderRankings(c) {
    const opps = careerOpponents(c);
    const box = $('career-rankings');
    const rows = [];
    const row = (rank, name, rating, cls) =>
      `<div class="rank-row ${cls || ''}">
        <span class="rank-num">${rank === 1 ? '👑' : '#' + rank}</span>
        <span class="rank-name">${name}</span>
        <span class="rank-rating">${rating !== null ? '★ ' + rating : ''}</span>
      </div>`;
    let rank = 1;
    if (c.stage >= opps.length) rows.push(row(rank++, `${c.fighter.name} "${c.fighter.nick}"`, fighterRating(c.fighter), 'you champ'));
    for (let i = opps.length - 1; i >= c.stage; i--) {
      const cls = (i === c.stage ? 'next' : '') + (rank === 1 ? ' champ' : '');
      rows.push(row(rank++, `${opps[i].name} "${opps[i].nick}"`, fighterRating(opps[i]), cls));
    }
    if (c.stage < opps.length) {
      rows.push(row(rank++, `${c.fighter.name} "${c.fighter.nick}"`, fighterRating(c.fighter), 'you'));
    }
    for (let i = c.stage - 1; i >= 0; i--) {
      rows.push(row(rank++, `${opps[i].name} "${opps[i].nick}"`, fighterRating(opps[i]), 'beaten'));
    }
    box.innerHTML = rows.join('');
  }

  function renderSkillPoints(c) {
    const box = $('career-sp');
    if (!c.sp || c.sp <= 0) { box.classList.add('hidden'); return; }
    box.classList.remove('hidden');
    box.innerHTML = `<div class="sp-title">SKILL POINTS: ${c.sp} — SPEND THEM</div>`;
    for (const [key, label] of CF_STATS) {
      const v = c.fighter[key];
      const row = document.createElement('div');
      row.className = 'cf-stat';
      row.innerHTML = `
        <span class="cf-label">${label}</span>
        <span class="cf-val">${v}</span>
        <button ${v >= 10 ? 'disabled' : ''}>+</button>
        <div class="stat-bar"><div style="width:${v * 10}%"></div></div>`;
      row.querySelector('button').addEventListener('click', () => {
        const cc = loadCareer();
        if (!cc || cc.sp <= 0 || cc.fighter[key] >= 10) return;
        cc.fighter[key]++;
        cc.sp--;
        saveCareer(cc);
        showCareerHub();
      });
      box.appendChild(row);
    }
  }

  $('btn-career-fight').addEventListener('click', () => {
    audio.ensure();
    const c = loadCareer();
    if (!c) { showMenu(); return; }
    const opps = careerOpponents(c);
    if (c.stage >= opps.length) return;
    playerDef = c.fighter;
    oppDef = opps[c.stage];
    mode = 'career';
    startFight();
  });
  $('btn-career-defend').addEventListener('click', () => {
    audio.ensure();
    const c = loadCareer();
    if (!c) { showMenu(); return; }
    playerDef = c.fighter;
    $('select-title').textContent = 'CHOOSE A CHALLENGER';
    renderGrid('champ');
    show('screen-select');
  });
  $('btn-career-menu').addEventListener('click', showMenu);
  $('btn-career-reset').addEventListener('click', () => {
    clearCareer();
    showCreate();
  });

  // ---------------- Fighter select ----------------
  const grid = $('fighter-grid');

  function statRow(label, v) {
    return `<div class="stat"><span>${label}</span><div class="stat-bar"><div style="width:${v * 10}%"></div></div></div>`;
  }
  function fighterCardHTML(def) {
    return `<div class="card">
      <div class="card-top"><span class="flag">${def.flag}</span><span class="rating">★ ${fighterRating(def)}</span></div>
      <div class="card-name">${def.name}</div>
      <div class="card-nick">"${def.nick}"</div>
      <div class="card-style">${def.style}</div>
      ${statRow('PWR', def.power)}${statRow('SPD', def.speed)}${statRow('CHN', def.chin)}${statRow('STA', def.stamina)}${statRow('REC', def.recovery)}
    </div>`;
  }

  function renderGrid(phase) {
    grid.innerHTML = '';
    // Your career fighter is available to pick for exhibitions and sparring
    const c = loadCareer();
    const roster = (phase === 'player' || phase === 't-player') && c ? [c.fighter, ...FIGHTERS] : FIGHTERS;
    roster.forEach(def => {
      const card = document.createElement('button');
      card.className = 'card';
      if ((phase === 'opponent' || phase === 't-partner') && playerDef && def.id === playerDef.id) card.classList.add('taken');
      card.innerHTML = `
        <div class="card-top">
          <span class="flag">${def.flag}</span>
          <span class="rating">★ ${fighterRating(def)}</span>
        </div>
        <div class="card-name">${def.name}</div>
        <div class="card-nick">"${def.nick}"</div>
        <div class="card-style">${def.style}</div>
        ${statRow('PWR', def.power)}
        ${statRow('SPD', def.speed)}
        ${statRow('CHN', def.chin)}
        ${statRow('STA', def.stamina)}
        ${statRow('REC', def.recovery)}
      `;
      card.addEventListener('click', () => {
        audio.ensure();
        if (phase === 'player') {
          playerDef = def;
          $('select-title').textContent = 'CHOOSE YOUR OPPONENT';
          renderGrid('opponent');
        } else if (phase === 't-player') {
          playerDef = def;
          $('select-title').textContent = 'CHOOSE A SPARRING PARTNER';
          renderGrid('t-partner');
        } else if (phase === 't-partner') {
          oppDef = def;
          mode = 'training';
          startFight();
        } else if (phase === 'champ') {
          oppDef = def;
          mode = 'career-defense';
          startFight();
        } else {
          oppDef = def;
          mode = 'exhibition';
          startFight();
        }
      });
      grid.appendChild(card);
    });
  }

  // ---------------- Fight lifecycle ----------------
  function startFight() {
    const training = mode === 'training';
    game = new Game(playerDef, oppDef, training ? { training: true, spar: 'spar' } : {});
    resultShownAt = null;
    resultApplied = false;
    hitstopT = 0;
    paused = false;
    bannerQueue = [];
    bannerUntil = 0;
    $('hud-p-name').textContent = playerDef.nick.toUpperCase();
    $('hud-o-name').textContent = oppDef.nick.toUpperCase();
    $('result-panel').classList.add('hidden');
    $('rest-panel').classList.add('hidden');
    $('count-overlay').classList.add('hidden');
    $('pause-overlay').classList.add('hidden');
    $('training-bar').classList.toggle('hidden', !training);
    if (training) setSparButtons('spar');
    show('screen-fight');
    renderer.resize();
  }

  function applyCareerResult(r) {
    if ((mode !== 'career' && mode !== 'career-defense') || resultApplied) return;
    resultApplied = true;
    const c = loadCareer();
    if (!c) return;
    if (r.winner === 'p') {
      c.w++;
      const ko = r.method === 'KO' || r.method === 'TKO';
      if (ko) c.ko++;
      if (mode === 'career') c.stage++;   // title defenses never advance the belt
      c.sp = (c.sp || 0) + 2 + (ko ? 1 : 0); // win bonus, extra for a stoppage
    } else if (r.winner === 'o') {
      c.l++;
    }
    saveCareer(c);
  }

  $('btn-ready').addEventListener('click', () => { if (game) game.skipRest(); });
  $('btn-rematch').addEventListener('click', () => { audio.ensure(); startFight(); });
  $('btn-continue').addEventListener('click', showCareerHub);
  $('btn-menu').addEventListener('click', showMenu);

  // ---------------- Pause ----------------
  // Purely a UI/loop concern — the Game's own state machine (intro/fighting/
  // count/rest/over) never sees this, so nothing resumes mid-punch wrong.
  function setPaused(v) {
    if (!game || game.state === 'over') return;
    paused = v;
    $('pause-overlay').classList.toggle('hidden', !paused);
    if (paused) {
      // Freeze cleanly: drop movement/guard so keys held or released during
      // the pause don't leave stale drift or a stuck block once resumed
      game.setMove(0);
      game.setGuard(null);
      if (window.speechSynthesis) speechSynthesis.cancel();
    }
  }
  $('btn-pause').addEventListener('click', () => { audio.ensure(); setPaused(!paused); });
  $('btn-resume').addEventListener('click', () => setPaused(false));
  $('btn-pause-menu').addEventListener('click', () => { paused = false; showMenu(); });
  window.addEventListener('keydown', e => {
    if (e.key === 'Escape' && game && game.state !== 'over') setPaused(!paused);
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && game && game.state !== 'over') setPaused(true);
  });

  // ---------------- Training bar ----------------
  function setSparButtons(modeName) {
    document.querySelectorAll('.tb-btn[data-spar]').forEach(b =>
      b.classList.toggle('active', b.dataset.spar === modeName));
  }
  document.querySelectorAll('.tb-btn[data-spar]').forEach(btn =>
    btn.addEventListener('click', () => {
      if (!game || !game.training) return;
      game.setSpar(btn.dataset.spar);
      setSparButtons(btn.dataset.spar);
    }));
  $('tb-reset').addEventListener('click', () => {
    if (!game || !game.training) return;
    game.trainingReset();
    banner('RESET', 'round', 0.7);
  });
  $('tb-exit').addEventListener('click', showMenu);

  // ---------------- Corner advice ----------------
  function cornerAdvice() {
    const p = game.p, o = game.o;
    if (o.health < 35) return "He's hurt! Go get him — hooks and uppercuts!";
    if (p.health < 30) return "Keep those hands up! Guard high, guard low — read him!";
    if (p.stamina < 35) return "You're gassing out. Pick your shots, breathe!";
    if (p.total.landed < p.total.thrown * 0.35) return "Stop head-hunting into his guard — go to the body!";
    if (p.total.dmg > o.total.dmg + 10) return "Beautiful work. Stay sharp, don't get careless.";
    if (o.total.dmg > p.total.dmg + 10) return "You're behind on the cards. Let those hands go!";
    return "It's close. Win me this round — jab your way in.";
  }

  // ---------------- Event routing ----------------
  function isPlayer(f) { return game && f === game.p; }
  function fighterKey(f) { return isPlayer(f) ? 'p' : 'o'; }
  function anchor(f) { return renderer.anchors[fighterKey(f)]; }

  function handleEvent(e) {
    switch (e.type) {
      case 'roundstart':
        if (game.training) { banner('GYM SESSION', 'round', 1.2); audio.say('Time to work'); }
        else { banner(`ROUND ${e.round}`, 'round', 1.2); audio.say(`Round ${e.round}`); }
        break;
      case 'fight':
        banner('FIGHT!', 'fight', 0.8);
        audio.bellRound();
        audio.excite(0.25);
        break;
      case 'hit': {
        const a = anchor(e.target);
        const spot = e.body ? a.chest : a.head;
        audio.thud(e.dmg * 2.2);
        audio.excite(Math.min(0.3, 0.04 + e.dmg * 0.03));
        renderer.addImpact(spot.x, spot.y, Math.min(16, 4 + e.dmg * 2), e.body ? '#ff9a5c' : '#ffd27a');
        renderer.addSquash(fighterKey(e.target), Math.min(1, 0.35 + e.dmg * 0.15));
        if (e.smash) renderer.addFloat(a.head.x, a.head.y - 40, 'SMASHED!', '#ff4d4d', 26);
        else if (e.counter) renderer.addFloat(a.head.x, a.head.y - 40, 'COUNTER!', '#ffe14d', 26);
        else if (e.dmg >= 5) renderer.addFloat(a.head.x, a.head.y - 40, 'BIG SHOT!', '#ff7a4d', 22);
        else if (e.body && e.dmg >= 3) renderer.addFloat(a.chest.x, a.chest.y - 20, 'BODY!', '#ffb56b', 18);
        if (game.training) renderer.addFloat(spot.x + 26, spot.y - 14, e.dmg.toFixed(1), '#c9d4ff', 15);
        hitstopT = Math.max(hitstopT, e.smash || e.counter ? 0.09 : e.dmg >= 3.5 ? 0.06 : 0);
        if (isPlayer(e.target) && navigator.vibrate) navigator.vibrate(25);
        break;
      }
      case 'blocked': {
        const a = anchor(e.target);
        const spot = e.body ? a.chest : a.head;
        audio.blockThud();
        renderer.addImpact(spot.x, spot.y + 10, 3, '#aab');
        break;
      }
      case 'guardbreak': {
        const a = anchor(e.target);
        audio.thud(14);
        renderer.addFloat(a.head.x, a.head.y - 40, 'GUARD BROKEN!', '#ff4d4d', 24);
        break;
      }
      case 'stun': {
        const a = anchor(e.target);
        audio.stunWobble();
        audio.excite(0.5);
        renderer.addFloat(a.head.x, a.head.y - 46, 'DAZED!', '#ffe14d', 28);
        renderer.addFlash(0.4);
        hitstopT = Math.max(hitstopT, 0.11);
        if (isPlayer(e.target) && navigator.vibrate) navigator.vibrate([40, 30, 40]);
        break;
      }
      case 'dodged': {
        const a = anchor(e.by);
        audio.whoosh();
        renderer.addFloat(a.head.x, a.head.y - 44, e.kind === 'weave' ? 'WEAVED!' : 'SLIPPED!', '#6de3ff', 20);
        break;
      }
      case 'sidestep': {
        const a = anchor(e.by);
        audio.whoosh();
        renderer.addFloat(a.head.x, a.head.y - 44, 'SIDESTEPPED!', '#6de3ff', 20);
        break;
      }
      case 'lanestep':
        audio.whoosh();
        break;
      case 'miss':
        audio.whoosh();
        break;
      case 'knockdown': {
        audio.knockdown();
        audio.excite(0.9);
        renderer.addFlash(1);
        renderer.shake = 18;
        hitstopT = Math.max(hitstopT, 0.13);
        banner('KNOCKDOWN!', 'kd', 1.0);
        if (isPlayer(e.target) && navigator.vibrate) navigator.vibrate([60, 40, 60]);
        break;
      }
      case 'counttick':
        audio.countTick();
        break;
      case 'rise':
        audio.excite(0.45);
        break;
      case 'roundend':
        audio.bellEnd();
        banner('END OF ROUND', 'round', 1.0);
        break;
      case 'over': {
        audio.bellEnd();
        audio.excite(1);
        applyCareerResult(e.result);
        resultShownAt = performance.now() + 1600;
        break;
      }
    }
  }

  // ---------------- HUD ----------------
  function fmtClock(sec) {
    const s = Math.max(0, Math.ceil(sec));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  function updateHUD() {
    const set = (id, frac, danger) => {
      const el = $(id);
      el.style.width = `${Math.max(0, frac * 100)}%`;
      if (danger !== undefined) el.classList.toggle('danger', danger);
    };
    set('hud-p-health', game.p.health / game.p.maxHealth, game.p.health < 30);
    set('hud-o-health', game.o.health / game.o.maxHealth, game.o.health < 30);
    set('hud-p-stam', game.p.stamina / game.p.maxStamina);
    set('hud-o-stam', game.o.stamina / game.o.maxStamina);
    $('hud-round').textContent = game.training ? 'GYM' : `R${game.round}`;
    $('hud-clock').textContent = game.training ? '∞' : fmtClock(game.clock);
  }

  function updateOverlays() {
    // Count overlay
    const co = $('count-overlay');
    if (game.state === 'count' && game.count) {
      co.classList.remove('hidden');
      $('count-num').textContent = game.count.num > 0 ? game.count.num : '';
      const playerDown = game.count.downed === game.p;
      $('rise-ui').classList.toggle('hidden', !playerDown);
      $('count-msg').textContent = playerDown ? 'GET UP! TAP!' : 'STAY ON YOUR FEET';
      if (playerDown) $('rise-meter-fill').style.width = `${game.count.riseMeter * 100}%`;
    } else {
      co.classList.add('hidden');
    }

    // Rest panel
    const rest = $('rest-panel');
    if (game.state === 'rest') {
      if (rest.classList.contains('hidden')) {
        $('rest-title').textContent = `END OF ROUND ${game.round}`;
        const totals = game.cardTotals();
        $('rest-cards').textContent =
          'Scorecards: ' + totals.map(([a, b]) => `${a}–${b}`).join('  ·  ');
        const advice = cornerAdvice();
        $('rest-advice').textContent = `Corner: "${advice}"`;
        audio.say(advice);
        rest.classList.remove('hidden');
      }
      $('btn-ready').textContent = `READY (${Math.ceil(8 - game.stateT)})`;
    } else {
      rest.classList.add('hidden');
    }

    // Result panel
    if (game.state === 'over' && resultShownAt && performance.now() >= resultShownAt) {
      showResult();
      resultShownAt = null;
    }
  }

  function showResult() {
    const r = game.result;
    const panel = $('result-panel');
    let title, sub;
    if (r.winner === 'draw') {
      title = 'DRAW';
      sub = 'The judges cannot split them.';
    } else {
      const wDef = r.winner === 'p' ? game.p.def : game.o.def;
      const youWon = r.winner === 'p';
      if (r.method === 'Decision') {
        const totals = r.totals;
        let votes = 0;
        for (const [a, b] of totals) {
          if ((r.winner === 'p' && a > b) || (r.winner === 'o' && b > a)) votes++;
        }
        const kind = votes === 3 ? 'UNANIMOUS' : votes === 2 ? 'MAJORITY' : 'SPLIT';
        title = youWon ? 'YOU WIN!' : 'YOU LOSE';
        sub = `${wDef.name} wins by ${kind} DECISION`;
      } else {
        title = youWon ? 'YOU WIN!' : 'YOU LOSE';
        sub = `${wDef.name} wins by ${r.method} in round ${r.round}`;
      }
      audio.say(youWon ? `And the winner: ${wDef.name}!` : `Winner: ${wDef.name}.`);
    }
    $('result-title').textContent = title;
    $('result-title').classList.toggle('win', r.winner === 'p');
    $('result-title').classList.toggle('lose', r.winner === 'o');
    $('result-sub').textContent = sub;
    $('result-cards').innerHTML = r.totals
      .map(([a, b], i) => `<div>Judge ${i + 1}: <b>${a}–${b}</b></div>`).join('');
    $('result-stats').innerHTML = `
      <div>${game.p.def.nick}: ${game.p.total.landed}/${game.p.total.thrown} landed</div>
      <div>${game.o.def.nick}: ${game.o.total.landed}/${game.o.total.thrown} landed</div>`;
    const careerish = mode === 'career' || mode === 'career-defense';
    $('btn-continue').classList.toggle('hidden', !careerish);
    $('btn-rematch').classList.toggle('hidden', careerish);
    panel.classList.remove('hidden');
  }

  // ---------------- Main loop ----------------
  function loop(now) {
    requestAnimationFrame(loop);
    const dt = Math.min(0.05, (now - lastTime) / 1000 || 0.016);
    lastTime = now;
    if (!game) { audio.update(dt); return; }

    if (paused) {
      // World holds still; audio settles to quiet so the pause is fully silent
      audio.excitement = Math.max(0, (audio.excitement || 0) - dt);
      audio.update(dt);
      renderer.draw(game, 0);
      return;
    }
    audio.update(dt);

    if (hitstopT > 0) {
      // Impact freeze: the world holds its breath for a few frames
      hitstopT -= dt;
      renderer.draw(game, dt * 0.05);
    } else {
      game.update(dt);
      let e;
      while ((e = game.events.shift())) handleEvent(e);
      renderer.draw(game, dt);
    }
    updateHUD();
    updateOverlays();
    updateBanner(now);
  }

  // ---------------- Boot ----------------
  bindInput(() => (paused ? null : game), () => audio.ensure());
  if (window.matchMedia('(pointer: fine)').matches) {
    $('key-hint').classList.remove('hidden');
  }
  showMenu();
  // Dev shortcut: ?auto[=yourIdx,oppIdx] jumps straight into an exhibition fight
  const auto = new URLSearchParams(location.search).get('auto');
  if (auto !== null) {
    const [a, b] = (auto || '').split(',').map(Number);
    playerDef = FIGHTERS[a >= 0 && a < FIGHTERS.length ? a : 0];
    oppDef = FIGHTERS[b >= 0 && b < FIGHTERS.length ? b : 3];
    mode = 'exhibition';
    startFight();
  }
  requestAnimationFrame(loop);
})();
