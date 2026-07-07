# Champions Roster, Title Defenses & Knockdown Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deepen the career ladder with ~30 new fighters, let a champion pick any opponent for a belt-safe title defense, and make knockdown stamina recovery realistic.

**Architecture:** Pure HTML/CSS/JS, no build step, no tests. `FIGHTERS` (js/fighters.js) is the ordered ladder consumed everywhere by array order. Career state lives in localStorage via `loadCareer`/`saveCareer` in js/main.js. The fight engine is js/game.js. Changes are additive: extend the roster array, add a `champ` select phase + `career-defense` mode reusing the existing select grid and result flow, and retune two recovery numbers in the engine.

**Tech Stack:** Vanilla JS, Canvas, localStorage. Served statically. Verified manually in a browser.

## Global Constraints

- No build step, no dependencies, no backend — plain `.js` files loaded by `index.html`.
- Fighter stats are integers 1–10.
- `style` is one of: `slugger | out-boxer | pressure | counter`.
- `FIGHTERS` array order IS the ladder: index 0 = weakest, last = strongest. New entries must be inserted to preserve ascending overall rating.
- Every fighter `id` must be globally unique (used as a select/career key and as the seed for `hairFor(id)`).
- No test harness exists; each task is verified by loading `index.html` in a browser and observing behavior. Commit after each task.

---

### Task 1: Fix knockdown stamina recovery

**Files:**
- Modify: `js/game.js` (count-tick recovery ~630–634; rise jolt ~470)

**Interfaces:**
- Consumes: `c.num` (count reached), `c.t` (time into current count), `COUNT_TICK`, `c.staminaAtDown`, `c.downed.maxStamina`, `clamp` — all already in scope in the `case 'count':` block.
- Produces: nothing new; retunes existing behavior.

- [ ] **Step 1: Replace the count-tick recovery formula**

In `js/game.js`, find the block inside `case 'count':` (currently ~626–634):

```js
        // Resting on the canvas still counts: the downed fighter recovers
        // 10% of their stamina per count reached (a 6-count → 60% back),
        // ramping smoothly toward the next tick rather than jumping. Never
        // drops them below whatever stamina they still had when they fell.
        {
          const recoveredFrac = (c.num + clamp(c.t / COUNT_TICK, 0, 1)) * 0.1;
          const target = Math.max(c.staminaAtDown, c.downed.maxStamina * recoveredFrac);
          c.downed.stamina = Math.min(c.downed.maxStamina, target);
        }
```

Replace it with:

```js
        // A fighter who was just dropped gets up tired, not refreshed: only a
        // small trickle of stamina comes back on the canvas — ~2.5% of max per
        // count, capped at 20% total, ramping smoothly toward the next tick.
        // Never drops them below whatever stamina they still had when they fell,
        // so a fighter downed with more wind simply keeps it.
        {
          const recoveredFrac = Math.min((c.num + clamp(c.t / COUNT_TICK, 0, 1)) * 0.025, 0.20);
          const target = Math.max(c.staminaAtDown, c.downed.maxStamina * recoveredFrac);
          c.downed.stamina = Math.min(c.downed.maxStamina, target);
        }
```

- [ ] **Step 2: Trim the rise jolt**

In `js/game.js`, in the `rise(f)` method (~468–470), change:

```js
    // Stamina already climbed through the count (10%/count); a small extra
    // jolt on top for actually getting back to your feet.
    f.stamina = Math.min(f.maxStamina, f.stamina + 8);
```

to:

```js
    // Stamina barely climbed through the count; a tiny jolt for actually
    // getting back to your feet — not enough to un-gas you.
    f.stamina = Math.min(f.maxStamina, f.stamina + 4);
```

- [ ] **Step 3: Verify in browser**

Open `index.html`, start an Exhibition, and get knocked down (or knock the AI down). Watch the stamina bar during the count.
Expected: the downed fighter's stamina bar rises only slightly through the count (not to ~60%), and they get up visibly gassed. No console errors.

- [ ] **Step 4: Commit**

```bash
git add js/game.js
git commit -m "Make knockdown recovery realistic: small capped stamina regen while down"
```

---

### Task 2: Expand the fighter roster

**Files:**
- Modify: `js/fighters.js` (append entries to the `FIGHTERS` array, ~80)

**Interfaces:**
- Consumes: `hairFor(id)` (already defined above the array).
- Produces: ~30 additional `FIGHTERS` entries. Every consumer (`careerOpponents`, `renderGrid`, `renderRankings`, `careerRank`) already iterates the array, so no other code changes.

- [ ] **Step 1: Append the new fighters**

In `js/fighters.js`, the `FIGHTERS` array currently ends with `rossi` (rating ~7.4). Insert the following 30 objects **before** the closing `];` of the array, so the new fighters continue the weakest → strongest ordering (these are ordered ascending and all rate at or above the mid roster, extending the top of the ladder). Keep the existing 12 entries unchanged.

```js
  {
    id: 'flint', name: 'Cody Flint', nick: 'Sparky', flag: '🇺🇸',
    power: 4, speed: 4, chin: 4, stamina: 5, recovery: 4,
    style: 'slugger', skin: '#e8b088', trunks: '#c05a1a', gloves: '#7a3810', ...hairFor('flint'),
  },
  {
    id: 'abara', name: 'Emeka Abara', nick: 'Hammer', flag: '🇳🇬',
    power: 6, speed: 3, chin: 5, stamina: 4, recovery: 4,
    style: 'slugger', skin: '#5c3a1e', trunks: '#1a7a4a', gloves: '#0d4d2e', ...hairFor('abara'),
  },
  {
    id: 'santos', name: 'Beto Santos', nick: 'Relámpago', flag: '🇧🇷',
    power: 4, speed: 6, chin: 4, stamina: 6, recovery: 5,
    style: 'out-boxer', skin: '#b57e52', trunks: '#f0d000', gloves: '#b09800', ...hairFor('santos'),
  },
  {
    id: 'novak', name: 'Emil Novak', nick: 'The Clinic', flag: '🇨🇿',
    power: 4, speed: 6, chin: 6, stamina: 6, recovery: 5,
    style: 'counter', skin: '#e6c8a0', trunks: '#2a4d8a', gloves: '#182f5a', ...hairFor('novak'),
  },
  {
    id: 'reyes', name: 'Chuy Reyes', nick: 'El Gallo', flag: '🇲🇽',
    power: 6, speed: 5, chin: 5, stamina: 6, recovery: 5,
    style: 'pressure', skin: '#c68863', trunks: '#c0392b', gloves: '#7d1f16', ...hairFor('reyes'),
  },
  {
    id: 'kane', name: 'Del Kane', nick: 'Southpaw', flag: '🇦🇺',
    power: 6, speed: 6, chin: 5, stamina: 5, recovery: 5,
    style: 'out-boxer', skin: '#d9a071', trunks: '#0f5f8a', gloves: '#093f5c', ...hairFor('kane'),
  },
  {
    id: 'yamamoto', name: 'Sho Yamamoto', nick: 'Needle', flag: '🇯🇵',
    power: 5, speed: 7, chin: 5, stamina: 6, recovery: 6,
    style: 'counter', skin: '#e8c49a', trunks: '#d81f1f', gloves: '#8a1010', ...hairFor('yamamoto'),
  },
  {
    id: 'bauer', name: 'Klaus Bauer', nick: 'Panzer', flag: '🇩🇪',
    power: 7, speed: 4, chin: 7, stamina: 6, recovery: 5,
    style: 'pressure', skin: '#e8b088', trunks: '#333333', gloves: '#111111', ...hairFor('bauer'),
  },
  {
    id: 'costa', name: 'Nuno Costa', nick: 'Matador', flag: '🇵🇹',
    power: 6, speed: 7, chin: 5, stamina: 6, recovery: 6,
    style: 'out-boxer', skin: '#b57e52', trunks: '#0a7d40', gloves: '#c0392b', ...hairFor('costa'),
  },
  {
    id: 'dubois', name: 'Yannick Dubois', nick: 'Le Chat', flag: '🇫🇷',
    power: 5, speed: 8, chin: 6, stamina: 7, recovery: 6,
    style: 'counter', skin: '#8d5524', trunks: '#1a1a6a', gloves: '#0d0d40', ...hairFor('dubois'),
  },
  {
    id: 'walsh', name: 'Fergus Walsh', nick: 'Bulldog', flag: '🇮🇪',
    power: 7, speed: 5, chin: 7, stamina: 7, recovery: 6,
    style: 'pressure', skin: '#e8b088', trunks: '#e07a1a', gloves: '#a05010', ...hairFor('walsh'),
  },
  {
    id: 'ivanov', name: 'Gleb Ivanov', nick: 'Winter', flag: '🇷🇺',
    power: 8, speed: 5, chin: 7, stamina: 6, recovery: 6,
    style: 'slugger', skin: '#e6c8a0', trunks: '#b0b0c0', gloves: '#707080', ...hairFor('ivanov'),
  },
  {
    id: 'mensah', name: 'Kwame Mensah', nick: 'Thunder', flag: '🇬🇭',
    power: 8, speed: 6, chin: 6, stamina: 6, recovery: 6,
    style: 'slugger', skin: '#5c3a1e', trunks: '#e0c000', gloves: '#c0392b', ...hairFor('mensah'),
  },
  {
    id: 'romero', name: 'Tavo Romero', nick: 'Cyclone', flag: '🇦🇷',
    power: 6, speed: 8, chin: 6, stamina: 7, recovery: 7,
    style: 'out-boxer', skin: '#c68863', trunks: '#5aa0d8', gloves: '#2d6fa8', ...hairFor('romero'),
  },
  {
    id: 'haddad', name: 'Sami Haddad', nick: 'Scorpion', flag: '🇱🇧',
    power: 7, speed: 7, chin: 6, stamina: 7, recovery: 7,
    style: 'counter', skin: '#c68863', trunks: '#8a0f5a', gloves: '#5c0a3c', ...hairFor('haddad'),
  },
  {
    id: 'oduya', name: 'Femi Oduya', nick: 'Blade', flag: '🇳🇬',
    power: 7, speed: 8, chin: 6, stamina: 7, recovery: 7,
    style: 'out-boxer', skin: '#6b4423', trunks: '#0f7a3d', gloves: '#f0f0f0', ...hairFor('oduya'),
  },
  {
    id: 'blackwood', name: 'Errol Blackwood', nick: 'Nightmare', flag: '🇯🇲',
    power: 9, speed: 6, chin: 6, stamina: 6, recovery: 6,
    style: 'slugger', skin: '#5c3a1e', trunks: '#1a1a1a', gloves: '#3a7a1a', ...hairFor('blackwood'),
  },
  {
    id: 'lindqvist', name: 'Anders Lindqvist', nick: 'The Machine', flag: '🇸🇪',
    power: 7, speed: 7, chin: 8, stamina: 7, recovery: 7,
    style: 'counter', skin: '#e8c8a8', trunks: '#0060c0', gloves: '#f0d000', ...hairFor('lindqvist'),
  },
  {
    id: 'delacruz', name: 'Ramon De La Cruz', nick: 'Huracán', flag: '🇩🇴',
    power: 8, speed: 7, chin: 7, stamina: 7, recovery: 7,
    style: 'pressure', skin: '#b57e52', trunks: '#c0392b', gloves: '#7d1f16', ...hairFor('delacruz'),
  },
  {
    id: 'kowalski', name: 'Piotr Kowalski', nick: 'Granite', flag: '🇵🇱',
    power: 7, speed: 6, chin: 10, stamina: 8, recovery: 7,
    style: 'counter', skin: '#e8b088', trunks: '#d01818', gloves: '#f5f5f5', ...hairFor('kowalski'),
  },
  {
    id: 'ssempa', name: 'Isaac Ssempa', nick: 'The Crane', flag: '🇺🇬',
    power: 7, speed: 9, chin: 7, stamina: 8, recovery: 7,
    style: 'out-boxer', skin: '#6b4423', trunks: '#f0c000', gloves: '#000000', ...hairFor('ssempa'),
  },
  {
    id: 'ferreira', name: 'Diego Ferreira', nick: 'Jaguar', flag: '🇧🇷',
    power: 8, speed: 8, chin: 7, stamina: 8, recovery: 7,
    style: 'pressure', skin: '#8d5524', trunks: '#0a8a3a', gloves: '#f0d000', ...hairFor('ferreira'),
  },
  {
    id: 'volkov', name: 'Roman Volkov', nick: 'The Bear', flag: '🇷🇺',
    power: 10, speed: 5, chin: 8, stamina: 7, recovery: 6,
    style: 'slugger', skin: '#e6c8a0', trunks: '#8a1010', gloves: '#4a0808', ...hairFor('volkov'),
  },
  {
    id: 'nakamura', name: 'Rei Nakamura', nick: 'Mirror', flag: '🇯🇵',
    power: 7, speed: 10, chin: 7, stamina: 8, recovery: 8,
    style: 'counter', skin: '#e8c49a', trunks: '#101010', gloves: '#c0c0c0', ...hairFor('nakamura'),
  },
  {
    id: 'campbell', name: 'Dexter Campbell', nick: 'Slick Rick', flag: '🇺🇸',
    power: 8, speed: 9, chin: 7, stamina: 8, recovery: 8,
    style: 'out-boxer', skin: '#7a4a1e', trunks: '#7d2ea0', gloves: '#d0b000', ...hairFor('campbell'),
  },
  {
    id: 'adeyemi', name: 'Tunde Adeyemi', nick: 'Earthquake', flag: '🇳🇬',
    power: 10, speed: 7, chin: 8, stamina: 7, recovery: 7,
    style: 'slugger', skin: '#5c3a1e', trunks: '#0f7a3d', gloves: '#c0392b', ...hairFor('adeyemi'),
  },
  {
    id: 'moreau', name: 'Julien Moreau', nick: 'The Artist', flag: '🇫🇷',
    power: 8, speed: 9, chin: 8, stamina: 8, recovery: 8,
    style: 'out-boxer', skin: '#d9a071', trunks: '#0040a0', gloves: '#f5f5f5', ...hairFor('moreau'),
  },
  {
    id: 'castillo', name: 'Nando Castillo', nick: 'El Rey', flag: '🇲🇽',
    power: 9, speed: 8, chin: 8, stamina: 8, recovery: 8,
    style: 'pressure', skin: '#c68863', trunks: '#008040', gloves: '#c0392b', ...hairFor('castillo'),
  },
  {
    id: 'thompson', name: 'Marcus Thompson', nick: 'The General', flag: '🇺🇸',
    power: 9, speed: 8, chin: 9, stamina: 8, recovery: 8,
    style: 'counter', skin: '#7a4a1e', trunks: '#101820', gloves: '#c0a000', ...hairFor('thompson'),
  },
  {
    id: 'king', name: 'Julius King', nick: 'His Majesty', flag: '🇺🇸',
    power: 10, speed: 9, chin: 9, stamina: 9, recovery: 9,
    style: 'pressure', skin: '#5c3a1e', trunks: '#d4af37', gloves: '#1a1a1a', ...hairFor('king'),
  },
```

- [ ] **Step 2: Verify in browser**

Open `index.html`. Click Exhibition → the fighter-select grid should show all 42 fighters. Then start a new Career (start a new career if one exists) → the rankings list should show ~40 ranked fighters with ratings roughly ascending toward #1.
Expected: every new fighter renders with a name, nick, flag, stat bars, and hair; ratings climb sensibly; no console errors (a duplicate `id` would not error but check names are all distinct).

- [ ] **Step 3: Commit**

```bash
git add js/fighters.js
git commit -m "Add 30 fighters to deepen the career ladder"
```

---

### Task 3: Champion title-defense flow

**Files:**
- Modify: `index.html` (add DEFEND TITLE button near `btn-career-fight`, ~64)
- Modify: `js/main.js` (champion hub branch ~210–219; `renderGrid` phase `champ` ~311–356; `applyCareerResult` ~380–395; result-panel button toggle ~653–654; DEFEND TITLE event wiring)

**Interfaces:**
- Consumes: `loadCareer()`, `saveCareer(c)`, `careerOpponents(c)`, `playerDef`, `oppDef`, `mode`, `renderGrid(phase)`, `startFight()`, `showCareerHub()`, `$(id)`, `audio`.
- Produces: a `champ` `renderGrid` phase and a `career-defense` value for `mode`. `applyCareerResult` handles both `'career'` and `'career-defense'`.

- [ ] **Step 1: Add the DEFEND TITLE button to index.html**

In `index.html`, inside the `career-btns` block (~63–66), add the defend button just before the FIGHT button:

```html
      <div class="panel-btns career-btns">
        <button id="btn-career-defend" class="big-btn hidden">DEFEND TITLE</button>
        <button id="btn-career-fight" class="big-btn">FIGHT</button>
        <button id="btn-career-menu" class="big-btn alt">MENU</button>
      </div>
```

- [ ] **Step 2: Show DEFEND TITLE in the champion hub branch**

In `js/main.js`, in `showCareerHub`, update the champion branch (currently ~210–219) to reveal the defend button and hide it otherwise:

```js
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
```

- [ ] **Step 3: Wire the DEFEND TITLE button**

In `js/main.js`, next to the other career button listeners (after `btn-career-fight`'s listener, ~288), add:

```js
  $('btn-career-defend').addEventListener('click', () => {
    audio.ensure();
    const c = loadCareer();
    if (!c) { showMenu(); return; }
    playerDef = c.fighter;
    $('select-title').textContent = 'CHOOSE A CHALLENGER';
    renderGrid('champ');
    show('screen-select');
  });
```

- [ ] **Step 4: Handle the `champ` phase in renderGrid**

In `js/main.js`, in `renderGrid` (~316), the roster line currently is:

```js
    const roster = (phase === 'player' || phase === 't-player') && c ? [c.fighter, ...FIGHTERS] : FIGHTERS;
```

Leave it as-is (champ phase shows `FIGHTERS`). Then in the click handler's `if/else` chain (~336–352), add a `champ` branch before the final `else`:

```js
        } else if (phase === 'champ') {
          oppDef = def;
          mode = 'career-defense';
          startFight();
        } else {
```

- [ ] **Step 5: Handle career-defense in applyCareerResult**

In `js/main.js`, `applyCareerResult` (~380) currently early-returns unless `mode === 'career'`. Update the guard and the win branch so defenses count but never touch `c.stage`:

```js
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
```

- [ ] **Step 6: Show Continue (not Rematch) after a defense**

In `js/main.js`, the result-panel toggle (~653–654) is:

```js
    $('btn-continue').classList.toggle('hidden', mode !== 'career');
    $('btn-rematch').classList.toggle('hidden', mode === 'career');
```

Change both to treat a defense like career:

```js
    const careerish = mode === 'career' || mode === 'career-defense';
    $('btn-continue').classList.toggle('hidden', !careerish);
    $('btn-rematch').classList.toggle('hidden', careerish);
```

- [ ] **Step 7: Verify in browser**

To reach champion fast: open DevTools console and force a maxed save, then reload:

```js
const c = JSON.parse(localStorage.getItem('alumbs-career-v1'));
c.stage = 99; localStorage.setItem('alumbs-career-v1', JSON.stringify(c));
```

(If no career exists yet, create one first via Career → create a fighter, then run the snippet and reload.)

Expected flow:
1. Career hub shows the 🏆 UNDISPUTED CHAMPION banner, a **DEFEND TITLE** button, no FIGHT button.
2. DEFEND TITLE → select screen titled "CHOOSE A CHALLENGER" with the full roster.
3. Pick anyone → fight runs.
4. At the result, a **CONTINUE** button (not REMATCH) appears → returns to the champion hub.
5. Still UNDISPUTED CHAMPION. Record: a win increments W (and KO on a stoppage) and adds skill points; a loss increments L. The belt is retained either way.

- [ ] **Step 8: Commit**

```bash
git add index.html js/main.js
git commit -m "Let champions pick any challenger for belt-safe title defenses"
```

---

### Task 4: Update README

**Files:**
- Modify: `README.md` (Career description)

**Interfaces:** none.

- [ ] **Step 1: Mention title defenses**

In `README.md`, in the `**Career**` description sentence (~7–9), append a note about title defenses. Find:

```
Undisputed Champion; wins earn skill points to spend on your stats. Record
saved in your browser.
```

Replace with:

```
Undisputed Champion; wins earn skill points to spend on your stats. Once
you're champion, pick any challenger and defend your title — the belt is
yours to keep. Record saved in your browser.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "Document champion title defenses in README"
```

---

## Self-Review

**Spec coverage:**
- Roster expansion (~30 fighters, ascending, unique ids, `hairFor`) → Task 2. ✓
- Champion DEFEND TITLE button + `champ` select phase → Task 3 steps 1–4. ✓
- `career-defense` mode, exhibition-style result (W/L/KO + skill points, belt retained) → Task 3 step 5. ✓
- Continue button after a defense → Task 3 step 6. ✓
- Knockdown recovery cut to ~2.5%/count capped ~20% + rise jolt +8→+4 → Task 1. ✓
- Testing = manual browser verification → each task's verify step. ✓

**Placeholder scan:** No TBD/TODO; all code shown in full. ✓

**Type consistency:** `mode` values `'career'`/`'career-defense'` used consistently in Task 3 steps 4–6; phase string `'champ'` matches between the button wiring (step 3) and the renderGrid branch (step 4); button id `btn-career-defend` consistent across index.html and main.js. ✓
