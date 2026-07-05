// Touch + keyboard input → game intents.
// getGame: () => Game|null (game instance changes per fight)
function bindInput(getGame, onAnyGesture) {
  const punchTypes = ['jab', 'cross', 'hook', 'uppercut'];

  // --- Touch / pointer buttons ---
  document.querySelectorAll('[data-punch]').forEach(btn => {
    btn.addEventListener('pointerdown', e => {
      e.preventDefault();
      onAnyGesture();
      const g = getGame();
      if (g) g.pressPunch(btn.dataset.punch);
    });
  });

  const dodgeBtn = document.getElementById('btn-dodge');
  if (dodgeBtn) dodgeBtn.addEventListener('pointerdown', e => {
    e.preventDefault();
    onAnyGesture();
    const g = getGame();
    if (g) g.dodge();
  });

  const blockBtn = document.getElementById('btn-block');
  if (blockBtn) {
    const set = (v) => { const g = getGame(); if (g) g.setBlock(v); };
    blockBtn.addEventListener('pointerdown', e => { e.preventDefault(); onAnyGesture(); set(true); blockBtn.classList.add('held'); });
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) {
      blockBtn.addEventListener(ev, () => { set(false); blockBtn.classList.remove('held'); });
    }
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
  const keyPunch = { j: 'jab', k: 'cross', l: 'hook', i: 'uppercut' };
  window.addEventListener('keydown', e => {
    if (e.repeat) return;
    onAnyGesture();
    const g = getGame();
    if (!g) return;
    const k = e.key.toLowerCase();
    if (keyPunch[k]) { g.pressPunch(keyPunch[k]); e.preventDefault(); }
    else if (k === 'a' || k === 'd') { g.dodge(); e.preventDefault(); }
    else if (k === 's') { g.setBlock(true); e.preventDefault(); }
    else if (k === ' ') {
      if (g.state === 'count') g.riseTap();
      else g.setBlock(true);
      e.preventDefault();
    }
  });
  window.addEventListener('keyup', e => {
    const g = getGame();
    if (!g) return;
    const k = e.key.toLowerCase();
    if (k === 's' || k === ' ') g.setBlock(false);
  });
}
