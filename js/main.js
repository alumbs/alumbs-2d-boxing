// Screens, HUD, event routing, main loop.
(function () {
  const $ = id => document.getElementById(id);

  const audio = new AudioSys();
  const canvas = $('ring');
  const renderer = new Renderer(canvas);

  let game = null;
  let playerDef = null;
  let oppDef = null;
  let lastTime = 0;
  let resultShownAt = null;

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

  // ---------------- Fighter select ----------------
  const selectScreen = $('screen-select');
  const fightScreen = $('screen-fight');
  const selectTitle = $('select-title');
  const grid = $('fighter-grid');

  function statRow(label, v) {
    return `<div class="stat"><span>${label}</span><div class="stat-bar"><div style="width:${v * 10}%"></div></div></div>`;
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
        if (phase === 'player') {
          playerDef = def;
          selectTitle.textContent = 'CHOOSE YOUR OPPONENT';
          renderGrid('opponent');
        } else {
          oppDef = def;
          startFight();
        }
      });
      grid.appendChild(card);
    });
  }

  function showSelect() {
    game = null;
    playerDef = null;
    oppDef = null;
    selectTitle.textContent = 'CHOOSE YOUR FIGHTER';
    renderGrid('player');
    selectScreen.classList.remove('hidden');
    fightScreen.classList.add('hidden');
  }

  // ---------------- Fight lifecycle ----------------
  function startFight() {
    game = new Game(playerDef, oppDef);
    resultShownAt = null;
    bannerQueue = [];
    bannerUntil = 0;
    $('hud-p-name').textContent = playerDef.nick.toUpperCase();
    $('hud-o-name').textContent = oppDef.nick.toUpperCase();
    $('result-panel').classList.add('hidden');
    $('rest-panel').classList.add('hidden');
    $('count-overlay').classList.add('hidden');
    selectScreen.classList.add('hidden');
    fightScreen.classList.remove('hidden');
    renderer.resize();
  }

  $('btn-ready').addEventListener('click', () => { if (game) game.skipRest(); });
  $('btn-rematch').addEventListener('click', () => { audio.ensure(); startFight(); });
  $('btn-menu').addEventListener('click', showSelect);

  // ---------------- Event routing ----------------
  function isPlayer(f) { return game && f === game.p; }
  function anchor(f) { return renderer.anchors[isPlayer(f) ? 'p' : 'o']; }

  function handleEvent(e) {
    switch (e.type) {
      case 'roundstart':
        banner(`ROUND ${e.round}`, 'round', 1.2);
        break;
      case 'fight':
        banner('FIGHT!', 'fight', 0.8);
        audio.bellRound();
        break;
      case 'hit': {
        const a = anchor(e.target);
        audio.thud(e.dmg * 2.2);
        renderer.addImpact(a.head.x, a.head.y, Math.min(16, 4 + e.dmg * 2));
        if (e.counter) renderer.addFloat(a.head.x, a.head.y - 40, 'COUNTER!', '#ffe14d', 26);
        else if (e.dmg >= 5) renderer.addFloat(a.head.x, a.head.y - 40, 'BIG SHOT!', '#ff7a4d', 22);
        if (isPlayer(e.target) && navigator.vibrate) navigator.vibrate(25);
        break;
      }
      case 'blocked': {
        const a = anchor(e.target);
        audio.blockThud();
        renderer.addImpact(a.head.x, a.head.y + 10, 3, '#aab');
        break;
      }
      case 'guardbreak': {
        const a = anchor(e.target);
        audio.thud(14);
        renderer.addFloat(a.head.x, a.head.y - 40, 'GUARD BROKEN!', '#ff4d4d', 24);
        break;
      }
      case 'dodged': {
        const a = anchor(e.by);
        audio.whoosh();
        renderer.addFloat(a.head.x, a.head.y - 44, 'DODGED!', '#6de3ff', 20);
        break;
      }
      case 'miss':
        audio.whoosh();
        break;
      case 'knockdown': {
        audio.knockdown();
        audio.crowdRoar(1.5);
        renderer.addFlash(1);
        renderer.shake = 18;
        banner('KNOCKDOWN!', 'kd', 1.0);
        if (isPlayer(e.target) && navigator.vibrate) navigator.vibrate([60, 40, 60]);
        break;
      }
      case 'counttick':
        audio.countTick();
        break;
      case 'rise':
        audio.crowdRoar(0.8);
        break;
      case 'roundend':
        audio.bellEnd();
        banner('END OF ROUND', 'round', 1.0);
        break;
      case 'over':
        audio.bellEnd();
        audio.crowdRoar(2.5);
        resultShownAt = performance.now() + 1600;
        break;
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
    panel.classList.remove('hidden');
  }

  // ---------------- Main loop ----------------
  function loop(now) {
    requestAnimationFrame(loop);
    const dt = Math.min(0.05, (now - lastTime) / 1000 || 0.016);
    lastTime = now;
    if (!game) return;

    game.update(dt);
    let e;
    while ((e = game.events.shift())) handleEvent(e);
    renderer.draw(game, dt);
    updateHUD();
    updateOverlays();
    updateBanner(now);
  }

  // ---------------- Boot ----------------
  bindInput(() => game, () => audio.ensure());
  if (window.matchMedia('(pointer: fine)').matches) {
    $('key-hint').classList.remove('hidden');
  }
  showSelect();
  // Dev shortcut: ?auto[=yourIdx,oppIdx] jumps straight into a fight
  const auto = new URLSearchParams(location.search).get('auto');
  if (auto !== null) {
    const [a, b] = (auto || '').split(',').map(Number);
    playerDef = FIGHTERS[a >= 0 && a < FIGHTERS.length ? a : 0];
    oppDef = FIGHTERS[b >= 0 && b < FIGHTERS.length ? b : 3];
    startFight();
  }
  requestAnimationFrame(loop);
})();
