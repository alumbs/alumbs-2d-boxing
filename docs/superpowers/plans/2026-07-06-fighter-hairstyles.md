# Fighter Hairstyles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give fighters five distinct hairstyles (bald, short, afro, mohawk, long) with an independent hair color, deterministically assigned to the 12 preset roster fighters and player-selectable in create-a-fighter.

**Architecture:** Two new plain-data fields (`hair`, `hairColor`) on every fighter def. `js/fighters.js` computes them for the roster via a small id-hash helper. `js/render.js` replaces its single hardcoded hair-cap draw with a per-style dispatch function, drawn in head-local space so it inherits squash/fall-rotation/lane-scaling for free. `js/main.js` + `index.html` + `css/style.css` add two create-a-fighter swatch rows reusing the existing `renderSwatches` pattern, and `loadCareer()` gets a one-line default-patch for saves made before this feature existed.

**Tech Stack:** Vanilla JS (no build step), HTML5 Canvas 2D, no new dependencies.

## Global Constraints

- No changes to `js/game.js` — this feature is purely cosmetic and must have zero effect on gameplay/simulation (per spec's Non-goals).
- No hair physics/swing simulation, even for the `long` style — hair is drawn rigidly attached to the head in the same relative position every frame (per spec).
- Exactly 5 hairstyles: `bald`, `short`, `afro`, `mohawk`, `long` — no others in this pass (per spec's Non-goals).
- Roster fighters get `hair`/`hairColor` computed deterministically from their existing `id` field — no hand-authored per-fighter hair data (per spec).
- Hair color palette (used both for the roster hash and the create-a-fighter swatch row): black `#1a1a1a`, dark brown `#3b2417`, brown `#6b4423`, blonde `#d9b877`, gray `#9a9a9a`, auburn/red `#8a3324`.
- Existing v2 career saves made before this feature must not break — missing `hair`/`hairColor` default to `'short'` / black (per spec).

---

## File Structure

| File | Responsibility |
|---|---|
| `js/fighters.js` | Fighter data + new `hairFor(id)` deterministic-hash helper; roster entries gain `hair`/`hairColor` |
| `js/render.js` | New `drawHair(ctx, def, headX, headY, dir)` method on `Renderer`, replacing the hardcoded hair-cap block in `drawBoxer` |
| `js/main.js` | Create-a-fighter: new `CF_HAIR`/`CF_HAIR_COLORS` constants, two new `renderSwatches(...)` calls, `hair`/`hairColor` added to the built fighter def, and a default-patch in `loadCareer()` for pre-existing v2 saves |
| `index.html` | Two new `.create-row` blocks (`cf-hair`, `cf-hair-colors`) in `#screen-create` |
| `css/style.css` | No changes needed — `.swatch`, `.swatch.text`, `.swatch.sel` already support both new rows |

---

### Task 1: Deterministic hair hash + roster hair data

**Files:**
- Modify: `js/fighters.js` (whole file — add helper near top, add fields to each of the 12 `FIGHTERS` entries)
- Test: manual node smoke check (this project has no test runner; verify via a throwaway `node -e` snippet, matching how earlier work in this codebase was verified — see the Testing section below)

**Interfaces:**
- Produces: `HAIR_STYLES` (array of 5 style-id strings), `HAIR_COLORS` (array of 6 hex strings), `hairFor(id)` → `{ hair: string, hairColor: string }`. Every object in the exported `FIGHTERS` array gains `hair` and `hairColor` string fields. `js/render.js` (Task 2) and `js/main.js` (Task 3) both read `HAIR_STYLES`/`HAIR_COLORS` by name, so these exact identifiers must exist as top-level `const` in `fighters.js` (this file has no module system — all scripts share the global scope via `<script>` tags in `index.html`, matching how `PUNCHES`, `FIGHTERS`, etc. are already shared today).

- [ ] **Step 1: Add the hash helper and shared constants**

Open `js/fighters.js`. Immediately after the file's opening comment (`// Fighter roster, ordered weakest → strongest. Stats are 1-10.` / `// style: 'slugger' | 'out-boxer' | 'pressure' | 'counter'`) and before `const FIGHTERS = [`, insert:

```js
// Five hairstyles, deterministically assigned to roster fighters from their
// id so no per-fighter hair data needs to be hand-authored.
const HAIR_STYLES = ['bald', 'short', 'afro', 'mohawk', 'long'];
const HAIR_COLORS = ['#1a1a1a', '#3b2417', '#6b4423', '#d9b877', '#9a9a9a', '#8a3324'];

// Simple string hash (djb2) → picks a stable style + color per id.
function hairFor(id) {
  let h = 5381;
  for (let i = 0; i < id.length; i++) h = ((h * 33) ^ id.charCodeAt(i)) >>> 0;
  return {
    hair: HAIR_STYLES[h % HAIR_STYLES.length],
    hairColor: HAIR_COLORS[Math.floor(h / HAIR_STYLES.length) % HAIR_COLORS.length],
  };
}
```

- [ ] **Step 2: Add `hair`/`hairColor` to every roster entry**

Each of the 12 objects inside `const FIGHTERS = [ ... ]` currently ends its stat/style block with a line like:

```js
    style: 'slugger', skin: '#e8b088', trunks: '#3d7a3d', gloves: '#265426',
  },
```

For **every** entry, add a spread of `hairFor(id)` right after the `style:` line, using that entry's own `id` value already present on the same object (e.g. `'mcgee'`, `'sloane'`, `'park'`, `'dimarco'`, `'tanaka'`, `'brooks'`, `'vega'`, `'malone'`, `'okafor'`, `'duran'`, `'petrov'`, `'rossi'`). For example, the first entry currently reads:

```js
  {
    id: 'mcgee', name: 'Tommy McGee', nick: 'Glass Jaw', flag: '🇮🇪',
    power: 3, speed: 2, chin: 2, stamina: 3, recovery: 3,
    style: 'slugger', skin: '#e8b088', trunks: '#3d7a3d', gloves: '#265426',
  },
```

Change its last line to:

```js
    style: 'slugger', skin: '#e8b088', trunks: '#3d7a3d', gloves: '#265426', ...hairFor('mcgee'),
  },
```

Repeat this exact pattern — appending `, ...hairFor('<that-entry's-id>')` to the existing last line inside each object — for all 12 entries (`mcgee`, `sloane`, `park`, `dimarco`, `tanaka`, `brooks`, `vega`, `malone`, `okafor`, `duran`, `petrov`, `rossi`). Do not change any other field.

- [ ] **Step 3: Verify by running a smoke script**

Run:

```bash
node -e "
const fs = require('fs');
const src = fs.readFileSync('js/fighters.js', 'utf8');
const ctx = eval(src + ';({ FIGHTERS, HAIR_STYLES, HAIR_COLORS, hairFor })');
console.log('styles:', ctx.HAIR_STYLES);
console.log('colors:', ctx.HAIR_COLORS);
for (const f of ctx.FIGHTERS) {
  if (!ctx.HAIR_STYLES.includes(f.hair)) throw new Error('bad hair on ' + f.id);
  if (!ctx.HAIR_COLORS.includes(f.hairColor)) throw new Error('bad hairColor on ' + f.id);
  console.log(f.id, f.hair, f.hairColor);
}
console.log('OK: all 12 fighters have valid hair + hairColor');
"
```

Expected output: 12 lines of `<id> <style> <color>` (a mix across all 5 styles is likely but not guaranteed — any valid combination is a pass) followed by `OK: all 12 fighters have valid hair + hairColor`. If it throws, re-check Step 2 for a typo'd id or a missing trailing comma.

- [ ] **Step 4: Commit**

```bash
git add js/fighters.js
git commit -m "Add deterministic hair style + color to the fighter roster"
```

---

### Task 2: Renderer — draw the 5 hairstyles

**Files:**
- Modify: `js/render.js:461-465` (replaces the existing hardcoded "Hair cap" block inside `drawBoxer`)
- Test: manual visual check via a static HTML harness (see Step 4) — this project has no headless rendering test; a canvas render must be eyeballed

**Interfaces:**
- Consumes: `def.hair` (one of the 5 `HAIR_STYLES` strings from Task 1), `def.hairColor` (hex string from Task 1). Falls back to `'short'` / `'#1a1a1a'` if either is missing (defends against a pre-Task-1 fighter def reaching the renderer, e.g. during manual testing).
- Produces: `Renderer.prototype.drawHair(ctx, def, headX, headY, dir)` — called once per fighter per frame from `drawBoxer`, in the same place the old hardcoded block was. Draws entirely in head-local coordinates already computed by the caller; adds no new state to `Renderer` or `Game`.

- [ ] **Step 1: Replace the hardcoded hair-cap block with a dispatch call**

In `js/render.js`, find this exact block (currently lines 461-465):

```js
    // Hair cap
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.beginPath();
    ctx.arc(headX, headY - 3, 21, Math.PI * 1.05, Math.PI * 1.95);
    ctx.fill();
```

Replace it with:

```js
    // Hair
    this.drawHair(ctx, def, headX, headY, dir);
```

- [ ] **Step 2: Add the `drawHair` method**

Immediately after the `drawBoxer` method closes (it currently ends with the `// Save anchors ...` block followed by a closing `}` — find that closing brace, which is right before the `// Punch extension 0..1 across windup/active/recover...` comment and the `punchExt(f)` method), insert a new method:

```js
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
```

- [ ] **Step 3: Confirm the file still parses**

Run:

```bash
node --check js/render.js
```

Expected: no output (exit code 0). If it errors, the most likely cause is inserting the new method outside the `Renderer` class body — re-check that both the replaced call site and the new method are between the class's opening `class Renderer {` and its final closing `}`.

- [ ] **Step 4: Visual smoke check in a browser**

Start a static file server from the project root and open the game:

```bash
node -e "
const http=require('http'),fs=require('fs'),path=require('path');
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css'};
http.createServer((req,res)=>{
  const p=path.join(process.cwd(), req.url.split('?')[0]==='/'?'index.html':req.url.split('?')[0]);
  fs.readFile(p,(err,data)=>{
    if(err){res.writeHead(404);res.end();return;}
    res.writeHead(200,{'Content-Type':MIME[path.extname(p)]||'text/plain'});
    res.end(data);
  });
}).listen(8950, ()=>console.log('http://localhost:8950/?auto=0,9'));
"
```

Open `http://localhost:8950/?auto=0,9` in a browser (this dev shortcut jumps straight into an exhibition fight between roster fighters at index 0 and 9 — per the existing `?auto=` handling in `js/main.js`). Confirm both fighters render with a visible hairstyle (not the old identical dark arc on both) and no console errors. Stop the server (Ctrl+C) when done.

- [ ] **Step 5: Commit**

```bash
git add js/render.js
git commit -m "Render 5 distinct hairstyles instead of one hardcoded hair cap"
```

---

### Task 3: Create-a-fighter — hair + hair color pickers

**Files:**
- Modify: `index.html:33-40` (add two new `.create-row` blocks inside `#screen-create`)
- Modify: `js/main.js` (create-a-fighter section: add `CF_HAIR`/`CF_HAIR_COLORS`, wire two `renderSwatches` calls, include `hair`/`hairColor` in the built def; `loadCareer()` gets a default-patch)
- Test: manual browser check (this project has no test runner)

**Interfaces:**
- Consumes: `HAIR_STYLES` and `HAIR_COLORS` from `js/fighters.js` (Task 1) — reused directly rather than re-declared, since `fighters.js` loads before `main.js` in `index.html`'s script order.
- Produces: the fighter def built by `btn-create-go`'s click handler gains `hair`/`hairColor` fields consumed by `js/render.js`'s `drawHair` (Task 2). `loadCareer()` guarantees every returned save's `fighter` object has non-undefined `hair`/`hairColor`.

- [ ] **Step 1: Add the two new rows to `index.html`**

In `index.html`, find this exact line (currently line 37):

```html
      <div class="create-row"><label>SKIN</label><div id="cf-skins" class="swatches"></div></div>
```

Insert two new rows immediately after it (before the existing TRUNKS row), so the block reads:

```html
      <div class="create-row"><label>SKIN</label><div id="cf-skins" class="swatches"></div></div>
      <div class="create-row"><label>HAIR</label><div id="cf-hair" class="swatches"></div></div>
      <div class="create-row"><label>HAIR COLOR</label><div id="cf-hair-colors" class="swatches"></div></div>
      <div class="create-row"><label>TRUNKS</label><div id="cf-trunks" class="swatches"></div></div>
```

- [ ] **Step 2: Add `CF_HAIR`/`CF_HAIR_COLORS` constants in `js/main.js`**

Find this exact block (currently lines 110-115):

```js
  const CF_FLAGS = ['🇳🇬', '🇺🇸', '🇬🇧', '🇯🇲', '🇲🇽', '🇯🇵', '🇮🇹', '🇮🇪', '🇰🇷', '🇺🇦', '🇧🇷', '🇵🇭'];
  const CF_SKINS = ['#f0c8a0', '#e8b088', '#d9a071', '#b57e52', '#8d5524', '#6b4423'];
  const CF_COLORS = ['#c0392b', '#1550a0', '#0f7a3d', '#7d2ea0', '#111111', '#e0a800', '#f5f5f5', '#ff6b35'];
  const CF_STYLES = ['slugger', 'out-boxer', 'pressure', 'counter'];
  const CF_STATS = [['power', 'PWR'], ['speed', 'SPD'], ['chin', 'CHN'], ['stamina', 'STA'], ['recovery', 'REC']];
  const CF_POOL = 14;
```

Replace it with (adding two lines, `CF_HAIR`/`CF_HAIR_COLORS`, reusing `HAIR_STYLES`/`HAIR_COLORS` from `fighters.js`):

```js
  const CF_FLAGS = ['🇳🇬', '🇺🇸', '🇬🇧', '🇯🇲', '🇲🇽', '🇯🇵', '🇮🇹', '🇮🇪', '🇰🇷', '🇺🇦', '🇧🇷', '🇵🇭'];
  const CF_SKINS = ['#f0c8a0', '#e8b088', '#d9a071', '#b57e52', '#8d5524', '#6b4423'];
  const CF_HAIR = HAIR_STYLES;
  const CF_HAIR_COLORS = HAIR_COLORS;
  const CF_COLORS = ['#c0392b', '#1550a0', '#0f7a3d', '#7d2ea0', '#111111', '#e0a800', '#f5f5f5', '#ff6b35'];
  const CF_STYLES = ['slugger', 'out-boxer', 'pressure', 'counter'];
  const CF_STATS = [['power', 'PWR'], ['speed', 'SPD'], ['chin', 'CHN'], ['stamina', 'STA'], ['recovery', 'REC']];
  const CF_POOL = 14;
```

- [ ] **Step 3: Initialize `cf.hair`/`cf.hairColor` and render the new swatch rows**

Find this exact block (currently lines 118-133):

```js
  function showCreate() {
    cf = {
      flag: CF_FLAGS[0], skin: CF_SKINS[2], trunks: CF_COLORS[0], gloves: CF_COLORS[1],
      style: CF_STYLES[0],
      stats: { power: 3, speed: 3, chin: 3, stamina: 3, recovery: 3 },
    };
    $('cf-name').value = '';
    $('cf-nick').value = '';
    renderSwatches('cf-flags', CF_FLAGS, v => cf.flag === v, v => { cf.flag = v; }, v => v);
    renderSwatches('cf-skins', CF_SKINS, v => cf.skin === v, v => { cf.skin = v; });
    renderSwatches('cf-trunks', CF_COLORS, v => cf.trunks === v, v => { cf.trunks = v; });
    renderSwatches('cf-gloves', CF_COLORS, v => cf.gloves === v, v => { cf.gloves = v; });
    renderSwatches('cf-styles', CF_STYLES, v => cf.style === v, v => { cf.style = v; }, v => v.toUpperCase());
    renderCfStats();
    show('screen-create');
  }
```

Replace it with:

```js
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
```

(`CF_HAIR[1]` is `'short'` — the previous default look — so a player who doesn't touch the HAIR row gets the same appearance the game always had.)

- [ ] **Step 4: Include `hair`/`hairColor` in the built fighter def**

Find this exact block (currently lines 177-190):

```js
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
    };
    saveCareer({ v: 2, fighter: def, stage: 0, w: 0, l: 0, ko: 0, sp: 0 });
    showCareerHub();
  });
```

Replace it with:

```js
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
```

- [ ] **Step 5: Default-patch pre-existing v2 saves in `loadCareer()`**

Find this exact block (currently lines 22-34):

```js
  const CAREER_KEY = 'alumbs-career-v1';
  function loadCareer() {
    try {
      const c = JSON.parse(localStorage.getItem(CAREER_KEY));
      if (!c) return null;
      if (c.v === 2 && c.fighter) return c;
      const def = FIGHTERS.find(f => f.id === c.fighterId);
      if (def) {
        return { v: 2, fighter: { ...def }, stage: c.stage || 0, w: c.w || 0, l: c.l || 0, ko: c.ko || 0, sp: 0 };
      }
    } catch (e) { /* corrupt save */ }
    return null;
  }
```

Replace it with (adding a defaulting line before the early return, so a save made before this feature shipped still has valid `hair`/`hairColor`):

```js
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
```

(The v1→v2 branch below it already copies a full roster `def` via `{ ...def }`, and every roster fighter has `hair`/`hairColor` from Task 1, so that branch needs no separate patch.)

- [ ] **Step 6: Verify files parse**

```bash
node --check js/main.js
```

Expected: no output (exit code 0).

- [ ] **Step 7: Browser check — create a fighter with non-default hair**

Reuse the static server from Task 2 Step 4 (or start it again if stopped):

```bash
node -e "
const http=require('http'),fs=require('fs'),path=require('path');
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css'};
http.createServer((req,res)=>{
  const p=path.join(process.cwd(), req.url.split('?')[0]==='/'?'index.html':req.url.split('?')[0]);
  fs.readFile(p,(err,data)=>{
    if(err){res.writeHead(404);res.end();return;}
    res.writeHead(200,{'Content-Type':MIME[path.extname(p)]||'text/plain'});
    res.end(data);
  });
}).listen(8951, ()=>console.log('http://localhost:8951/'));
"
```

Open `http://localhost:8951/`, click CAREER, and on the new-fighter screen:
1. Confirm HAIR and HAIR COLOR rows appear between SKIN and TRUNKS, each showing 5/6 swatches respectively.
2. Click a hairstyle other than the default (e.g. AFRO) and a color other than the default (e.g. blonde `#d9b877`).
3. Click START CAREER, then FIGHT — confirm your player fighter renders with the chosen hairstyle and color in the ring, and no console errors appear (open devtools before starting, if testing manually).

Stop the server (Ctrl+C) when done.

- [ ] **Step 8: Commit**

```bash
git add index.html js/main.js
git commit -m "Add hair + hair color pickers to create-a-fighter"
```

---

## Self-Review Notes

- **Spec coverage:** Data model (Task 1), renderer dispatch for all 5 styles including static long/ponytail (Task 2), create-a-fighter swatch rows + v2-save default-patch (Task 3) — every section of the spec has a task. `game.js` is untouched, matching the spec's non-goal.
- **Placeholder scan:** No TBD/TODO; every step shows exact before/after code, not descriptions.
- **Type consistency:** `hair`/`hairColor` field names match across `fighters.js` (Task 1), `render.js`'s `drawHair` (Task 2), and `main.js`'s `cf.hair`/`cf.hairColor`/built `def` (Task 3). `HAIR_STYLES`/`HAIR_COLORS` are declared once in `fighters.js` and reused by reference in `main.js` (`CF_HAIR = HAIR_STYLES`), never redefined with different values.
