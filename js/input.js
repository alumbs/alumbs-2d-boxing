// Touch + keyboard input → game intents.
// getGame: () => Game|null (game instance changes per fight)
function bindInput(getGame, onAnyGesture) {
  // --- Guard stack: latest held zone wins; releasing falls back ---
  const guardStack = [];
  function pushZone(zone) {
    const i = guardStack.indexOf(zone);
    if (i !== -1) guardStack.splice(i, 1);
    guardStack.push(zone);
    const g = getGame();
    if (g) g.setGuard(zone);
  }
  function popZone(zone) {
    const i = guardStack.indexOf(zone);
    if (i !== -1) guardStack.splice(i, 1);
    const g = getGame();
    if (g) g.setGuard(guardStack.length ? guardStack[guardStack.length - 1] : null);
  }

  // --- Touch / pointer buttons ---
  document.querySelectorAll('[data-punch]').forEach(btn => {
    btn.addEventListener('pointerdown', e => {
      e.preventDefault();
      onAnyGesture();
      const g = getGame();
      if (g) g.pressPunch(btn.dataset.punch);
    });
  });

  for (const [id, kind] of [['btn-lean', 'lean'], ['btn-weave', 'weave']]) {
    const btn = document.getElementById(id);
    if (btn) btn.addEventListener('pointerdown', e => {
      e.preventDefault();
      onAnyGesture();
      const g = getGame();
      if (g) g.dodge(kind);
    });
  }

  // Hold-style buttons
  function bindHold(id, onDown, onUp) {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('pointerdown', e => {
      e.preventDefault();
      onAnyGesture();
      onDown();
      el.classList.add('held');
    });
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) {
      el.addEventListener(ev, () => { onUp(); el.classList.remove('held'); });
    }
  }
  bindHold('btn-guard-high', () => pushZone('high'), () => popZone('high'));
  bindHold('btn-guard-low', () => pushZone('low'), () => popZone('low'));
  bindHold('btn-duck', () => pushZone('duck'), () => popZone('duck'));
  bindHold('btn-back',
    () => { const g = getGame(); if (g) g.setMove(-1); },
    () => { const g = getGame(); if (g && g.p.moveDir < 0) g.setMove(0); });
  bindHold('btn-fwd',
    () => { const g = getGame(); if (g) g.setMove(1); },
    () => { const g = getGame(); if (g && g.p.moveDir > 0) g.setMove(0); });

  // Lane steps (tap)
  for (const [id, d] of [['btn-lane-up', -1], ['btn-lane-down', 1]]) {
    const btn = document.getElementById(id);
    if (btn) btn.addEventListener('pointerdown', e => {
      e.preventDefault();
      onAnyGesture();
      const g = getGame();
      if (g) g.laneStep(d);
    });
  }

  const riseBtn = document.getElementById('btn-rise');
  if (riseBtn) riseBtn.addEventListener('pointerdown', e => {
    e.preventDefault();
    onAnyGesture();
    const g = getGame();
    if (g) g.riseTap();
  });

  // Stop the fight screen from scrolling/zooming on touch
  const controls = document.getElementById('controls');
  if (controls) controls.addEventListener('touchstart', e => e.preventDefault(), { passive: false });

  // --- Keyboard ---
  // A/D move · W/S step between lanes · Q lean · E weave
  // Space high block · X low block · C duck
  const keyPunch = { j: 'jab', k: 'cross', l: 'hook', i: 'uppercut', m: 'body' };
  const keyGuard = { x: 'low', c: 'duck', ' ': 'high' };
  const moveKeys = { a: false, d: false };
  const syncMove = g => g.setMove(moveKeys.d ? 1 : moveKeys.a ? -1 : 0);

  window.addEventListener('keydown', e => {
    if (e.repeat) return;
    onAnyGesture();
    const g = getGame();
    if (!g) return;
    const k = e.key.toLowerCase();
    if (keyPunch[k]) { g.pressPunch(keyPunch[k]); e.preventDefault(); }
    else if (k === 'a' || k === 'd') { moveKeys[k] = true; syncMove(g); e.preventDefault(); }
    else if (k === 'w' || k === 'arrowup') { g.laneStep(-1); e.preventDefault(); }
    else if (k === 's' || k === 'arrowdown') { g.laneStep(1); e.preventDefault(); }
    else if (k === 'q') { g.dodge('lean'); e.preventDefault(); }
    else if (k === 'e') { g.dodge('weave'); e.preventDefault(); }
    else if (keyGuard[k]) {
      if (k === ' ' && g.state === 'count') g.riseTap();
      else pushZone(keyGuard[k]);
      e.preventDefault();
    }
  });
  window.addEventListener('keyup', e => {
    // Always sync local key state on release, even with no live game (e.g.
    // paused) — otherwise a key let go mid-pause leaves stale movement/guard
    // state that reasserts itself the moment play resumes.
    const k = e.key.toLowerCase();
    if (keyGuard[k]) popZone(keyGuard[k]);
    else if (k === 'a' || k === 'd') {
      moveKeys[k] = false;
      const g = getGame();
      if (g) syncMove(g);
    }
  });
}
