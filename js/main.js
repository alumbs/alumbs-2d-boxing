// Screens, HUD, career mode, event routing, main loop.
(function () {
  const $ = id => document.getElementById(id);

  const audio = new AudioSys();
  const canvas = $('ring');
  const renderer = new Renderer(canvas);

  let game = null;
  let mode = 'exhibition';   // 'exhibition' | 'career'
  let playerDef = null;
  let oppDef = null;
  let lastTime = 0;
  let resultShownAt = null;
  let resultApplied = false;
  let hitstopT = 0;

  // ---------------- Career persistence ----------------
  const CAREER_KEY = 'alumbs-career-v1';
  function loadCareer() {
    try {
      const c = JSON.parse(localStorage.getItem(CAREER_KEY));
      if (c && FIGHTERS.some(f => f.id === c.fighterId)) return c;
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
    return FIGHTERS.filter(f => f.id !== c.fighterId); // roster is already weakest → strongest
  }

  // ---------------- Screens ----------------
  const screens = ['screen-menu', 'screen-career', 'screen-select', 'screen-fight'];
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
  function showMenu() {
    const c = loadCareer();
    const sum = $('career-summary');
    if (c) {
      const def = FIGHTERS.find(f => f.id === c.fighterId);
      const opps = careerOpponents(c);
      sum.textContent = `${def.nick} · ${c.w}-${c.l} (${c.ko} KO) · ${Math.min(c.stage, opps.length)}/${opps.length} beaten`;
      sum.classList.remove('hidden');
    } else {
      sum.classList.add('hidden');
    }
    show('screen-menu');
  }

  $('btn-career').addEventListener('click', () => {
    audio.ensure();
    if (loadCareer()) showCareerHub();
    else { renderGrid('career'); $('select-title').textContent = 'CHOOSE YOUR FIGHTER'; show('screen-select'); }
  });
  $('btn-exhibition').addEventListener('click', () => {
    audio.ensure();
    playerDef = null;
    renderGrid('player');
    $('select-title').textContent = 'CHOOSE YOUR FIGHTER';
    show('screen-select');
  });
  $('btn-select-back').addEventListener('click', showMenu);

  // ---------------- Career hub ----------------
  function showCareerHub() {
    const c = loadCareer();
    if (!c) { showMenu(); return; }
    const def = FIGHTERS.find(f => f.id === c.fighterId);
    const opps = careerOpponents(c);
    $('career-title').textContent = `🏆 ${def.nick.toUpperCase()}'S CAREER`;
    $('career-record').textContent = `${c.w}-${c.l} · ${c.ko} KO`;
    const box = $('career-opponent');
    if (c.stage >= opps.length) {
      $('career-next-label').textContent = '';
      box.innerHTML = `<div class="champion-banner">🏆 UNDISPUTED CHAMPION 🏆<br><small>Every fighter in the gym is beaten.</small></div>`;
      $('btn-career-fight').classList.add('hidden');
    } else {
      const next = opps[c.stage];
      $('career-next-label').textContent = `FIGHT ${c.stage + 1} OF ${opps.length} — NEXT OPPONENT`;
      box.innerHTML = fighterCardHTML(next);
      $('btn-career-fight').classList.remove('hidden');
    }
    show('screen-career');
  }

  $('btn-career-fight').addEventListener('click', () => {
    audio.ensure();
    const c = loadCareer();
    if (!c) { showMenu(); return; }
    const opps = careerOpponents(c);
    if (c.stage >= opps.length) return;
    playerDef = FIGHTERS.find(f => f.id === c.fighterId);
    oppDef = opps[c.stage];
    mode = 'career';
    startFight();
  });
  $('btn-career-menu').addEventListener('click', showMenu);
  $('btn-career-reset').addEventListener('click', () => {
    clearCareer();
    renderGrid('career');
    $('select-title').textContent = 'CHOOSE YOUR FIGHTER';
    show('screen-select');
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
    FIGHTERS.forEach(def => {
      const card = document.createElement('button');
      card.className = 'card';
      if (phase === 'opponent' && playerDef && def.id === playerDef.id) card.classList.add('taken');
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
        if (phase === 'career') {
          saveCareer({ fighterId: def.id, stage: 0, w: 0, l: 0, ko: 0 });
          showCareerHub();
        } else if (phase === 'player') {
          playerDef = def;
          $('select-title').textContent = 'CHOOSE YOUR OPPONENT';
          renderGrid('opponent');
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
    game = new Game(playerDef, oppDef);
    resultShownAt = null;
    resultApplied = false;
    hitstopT = 0;
    bannerQueue = [];
    bannerUntil = 0;
    $('hud-p-name').textContent = playerDef.nick.toUpperCase();
    $('hud-o-name').textContent = oppDef.nick.toUpperCase();
    $('result-panel').classList.add('hidden');
    $('rest-panel').classList.add('hidden');
    $('count-overlay').classList.add('hidden');
    show('screen-fight');
    renderer.resize();
  }

  function applyCareerResult(r) {
    if (mode !== 'career' || resultApplied) return;
    resultApplied = true;
    const c = loadCareer();
    if (!c) return;
    if (r.winner === 'p') {
      c.w++;
      if (r.method === 'KO' || r.method === 'TKO') c.ko++;
      c.stage++;
    } else if (r.winner === 'o') {
      c.l++;
    }
    saveCareer(c);
  }

  $('btn-ready').addEventListener('click', () => { if (game) game.skipRest(); });
  $('btn-rematch').addEventListener('click', () => { audio.ensure(); startFight(); });
  $('btn-continue').addEventListener('click', showCareerHub);
  $('btn-menu').addEventListener('click', showMenu);

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
        banner(`ROUND ${e.round}`, 'round', 1.2);
        audio.say(`Round ${e.round}`);
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
    $('hud-round').textContent = `R${game.round}`;
    $('hud-clock').textContent = fmtClock(game.clock);
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
    $('btn-continue').classList.toggle('hidden', mode !== 'career');
    $('btn-rematch').classList.toggle('hidden', mode === 'career');
    panel.classList.remove('hidden');
  }

  // ---------------- Main loop ----------------
  function loop(now) {
    requestAnimationFrame(loop);
    const dt = Math.min(0.05, (now - lastTime) / 1000 || 0.016);
    lastTime = now;
    audio.update(dt);
    if (!game) return;

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
  bindInput(() => game, () => audio.ensure());
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
