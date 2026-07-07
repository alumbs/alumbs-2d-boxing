# Match Highlights Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Record each match continuously to an in-memory video, tag key combat
moments (knockdown, stun, dodge/slip, power punch, finish) as they happen, and
play them back as a slow-mo highlight reel on the result screen — with a
download option, discarded otherwise.

**Architecture:** A new standalone module `js/highlights.js` defines a
`HighlightRecorder` class wrapping `canvas.captureStream()` +
`MediaRecorder`. `js/main.js` owns one instance, starts it in `startFight()`,
tags moments from the existing `handleEvent` switch, stops it ~1s after the
`over` event, and — after the result panel has been idle a few seconds —
shows a new `#highlight-panel` overlay that seeks a hidden `<video>` through
the tagged windows. The recorder is feature-detected; if unsupported, every
method is a no-op and the rest of the game is unaffected.

**Tech Stack:** Vanilla JS (ES5-style IIFE modules, no build step), HTML5
`<canvas>`, `MediaRecorder`/`MediaStream` Web APIs, plain CSS.

## Global Constraints

- No new dependencies, bundler, or build step — plain `<script>` tags loaded
  in the existing order (spec: "same IIFE pattern as other files").
- Feature-detect `canvas.captureStream` and `window.MediaRecorder`; if either
  is missing, recording/marking/playback must be complete no-ops with zero
  console errors and zero UI changes (spec: "Fallback / safety").
- Cap displayed highlight clips at 5, prioritized `finish` > `knockdown` >
  `stun` > `power` > `dodge`, then recency; `finish` is always included and
  doesn't count against the cap (spec: "Selection/cap logic").
- Recording is transient and in-memory only — no IndexedDB/localStorage/
  server persistence (spec: "Out of scope").
- Any tap/key input during the idle-wait or during reel playback cancels
  immediately back to the normal result panel (spec: "Result screen
  integration").
- Dispose (revoke blob URL, drop references) whenever the player leaves the
  result screen without downloading, or when a new match starts (spec:
  "Disposal").

---

### Task 1: `HighlightRecorder` class — recording + marking + disposal

**Files:**
- Create: `js/highlights.js`
- Modify: `index.html:187` (add `<script src="js/highlights.js?v=3"></script>` before `main.js`)

**Interfaces:**
- Produces: `class HighlightRecorder` with methods:
  - `start(canvas)` — begins capturing; safe to call repeatedly (ignores if
    already recording).
  - `mark(type, padStartMs = 400, padEndMs = 800)` — records a highlight
    window `{ type, start, end }` in ms relative to recording start, clamped
    to `>= 0`. Valid `type` values: `'knockdown' | 'stun' | 'dodge' |
    'power' | 'finish'`.
  - `stop()` — returns a `Promise<{ blobUrl: string|null, marks: Array<{type,start,end}> }>`
    that resolves once the final Blob is assembled (or immediately with
    `blobUrl: null` if unsupported/never started).
  - `dispose()` — revokes any blob URL, clears marks and chunks.
  - `isSupported` — boolean property, true if `canvas.captureStream` and
    `MediaRecorder` both exist.
- Consumes: nothing (no dependency on other game modules).

- [ ] **Step 1: Create `js/highlights.js` with feature detection and the class skeleton**

```javascript
// Continuous match recording + key-moment tagging for the post-fight
// highlight reel. All methods are safe no-ops when captureStream/
// MediaRecorder aren't supported.
(function () {
  const MIME_CANDIDATES = [
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
  ];

  function pickMimeType() {
    if (typeof MediaRecorder === 'undefined') return null;
    for (const type of MIME_CANDIDATES) {
      if (MediaRecorder.isTypeSupported(type)) return type;
    }
    return '';
  }

  class HighlightRecorder {
    constructor() {
      this.isSupported =
        typeof MediaRecorder !== 'undefined' &&
        typeof HTMLCanvasElement !== 'undefined' &&
        !!HTMLCanvasElement.prototype.captureStream;
      this._recorder = null;
      this._stream = null;
      this._chunks = [];
      this._marks = [];
      this._startTime = 0;
      this._blobUrl = null;
    }

    start(canvas) {
      if (!this.isSupported || this._recorder) return;
      this._chunks = [];
      this._marks = [];
      this._startTime = performance.now();
      this._stream = canvas.captureStream(30);
      const mimeType = pickMimeType();
      try {
        this._recorder = mimeType
          ? new MediaRecorder(this._stream, { mimeType })
          : new MediaRecorder(this._stream);
      } catch (err) {
        this.isSupported = false;
        this._recorder = null;
        return;
      }
      this._recorder.ondataavailable = e => {
        if (e.data && e.data.size > 0) this._chunks.push(e.data);
      };
      this._recorder.start(1000);
    }

    mark(type, padStartMs, padEndMs) {
      if (!this.isSupported || !this._recorder) return;
      const t = performance.now() - this._startTime;
      const start = Math.max(0, t - (padStartMs == null ? 400 : padStartMs));
      const end = t + (padEndMs == null ? 800 : padEndMs);
      this._marks.push({ type, start, end });
    }

    stop() {
      if (!this.isSupported || !this._recorder) {
        return Promise.resolve({ blobUrl: null, marks: [] });
      }
      const recorder = this._recorder;
      const marks = this._marks.slice();
      this._recorder = null;
      return new Promise(resolve => {
        recorder.onstop = () => {
          const blob = new Blob(this._chunks, { type: recorder.mimeType || 'video/webm' });
          this._chunks = [];
          this._blobUrl = blob.size > 0 ? URL.createObjectURL(blob) : null;
          if (this._stream) {
            this._stream.getTracks().forEach(tr => tr.stop());
            this._stream = null;
          }
          resolve({ blobUrl: this._blobUrl, marks });
        };
        recorder.stop();
      });
    }

    dispose() {
      if (this._blobUrl) {
        URL.revokeObjectURL(this._blobUrl);
        this._blobUrl = null;
      }
      this._marks = [];
      this._chunks = [];
      if (this._stream) {
        this._stream.getTracks().forEach(tr => tr.stop());
        this._stream = null;
      }
    }
  }

  window.HighlightRecorder = HighlightRecorder;
})();
```

- [ ] **Step 2: Load the script in `index.html`**

Edit `index.html:187`, adding the new script tag right before `main.js` (it
must load after nothing else, and `main.js` must load after it since
`main.js` will construct a `HighlightRecorder`):

```html
      <script src="js/audio.js?v=3"></script>
      <script src="js/input.js?v=3"></script>
      <script src="js/highlights.js?v=3"></script>
      <script src="js/main.js?v=3"></script>
```

- [ ] **Step 3: Manually verify recording + marking + stop in the browser console**

Serve the project (e.g. `npx serve .` or open `index.html` directly — canvas
capture works from `file://` in Chrome/Edge) and in the page's dev console
run:

```javascript
const c = document.getElementById('ring');
const r = new HighlightRecorder();
console.log('supported:', r.isSupported);
r.start(c);
r.mark('knockdown');
setTimeout(() => {
  r.stop().then(res => {
    console.log('marks:', res.marks);
    console.log('blobUrl:', res.blobUrl);
    window.open(res.blobUrl); // should open/download a short webm clip
  });
}, 2000);
```

Expected: `supported: true` in Chrome/Edge/Firefox; `marks` has one entry
with `start`/`end` around the 2000ms mark; the opened blob URL plays a ~2s
recording of whatever was on the canvas.

- [ ] **Step 4: Commit**

```bash
git add js/highlights.js index.html
git commit -m "Add HighlightRecorder for continuous match recording and moment tagging"
```

---

### Task 2: Tag combat events and manage recorder lifecycle in `main.js`

**Files:**
- Modify: `js/main.js:5-7` (instantiate recorder alongside `audio`/`renderer`)
- Modify: `js/main.js:383-404` (`startFight` — start recording)
- Modify: `js/main.js:588-659` (`handleEvent` switch — add `mark()` calls)
- Modify: `js/main.js:650-659` (`over` case — deferred `stop()`)

**Interfaces:**
- Consumes: `HighlightRecorder` from Task 1 (`start`, `mark`, `stop`,
  `dispose`, `isSupported`).
- Produces: module-level `highlights` instance and `lastHighlightResult`
  (`{ blobUrl, marks }` or `null`), read by Task 3 for playback.

- [ ] **Step 1: Instantiate the recorder**

In `js/main.js`, near the top where `audio`/`renderer` are created (`js/main.js:5-7`):

```javascript
  const audio = new AudioSys();
  const canvas = $('ring');
  const renderer = new Renderer(canvas);
  const highlights = new HighlightRecorder();
  let lastHighlightResult = null; // { blobUrl, marks } from the most recently finished match
```

- [ ] **Step 2: Start recording (and dispose any previous reel) in `startFight`**

In `startFight()` (`js/main.js:383`), add at the top of the function, before
`game = new Game(...)`:

```javascript
  function startFight() {
    if (lastHighlightResult && lastHighlightResult.blobUrl) {
      URL.revokeObjectURL(lastHighlightResult.blobUrl);
    }
    lastHighlightResult = null;
    highlights.dispose();
    const training = mode === 'training';
    const ceremony = mode === 'career' || mode === 'career-defense';
    game = new Game(playerDef, oppDef, training ? { training: true, spar: 'spar' } : { ceremony });
    highlights.start(canvas);
    resultShownAt = null;
```

(the rest of the existing function body is unchanged)

- [ ] **Step 3: Tag moments in `handleEvent`**

In the `handleEvent` switch (`js/main.js:588` onward), add a `highlights.mark(...)`
call inside each of these existing cases (do not change any other logic in
these blocks — just add the one line):

```javascript
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
        if (e.smash || e.counter || e.dmg >= 5) highlights.mark('power');
        break;
      }
```

```javascript
      case 'stun': {
        const a = anchor(e.target);
        audio.stunWobble();
        audio.excite(0.5);
        audio.crowdRoar(0.6);
        if (!game.training && !isPlayer(e.target)) audio.hype(HYPE_DAZED);
        renderer.addFloat(a.head.x, a.head.y - 46, 'DAZED!', '#ffe14d', 28);
        renderer.addFlash(0.4);
        hitstopT = Math.max(hitstopT, 0.11);
        if (isPlayer(e.target) && navigator.vibrate) navigator.vibrate([40, 30, 40]);
        highlights.mark('stun');
        break;
      }
      case 'dodged': {
        const a = anchor(e.by);
        audio.whoosh();
        renderer.addFloat(a.head.x, a.head.y - 44, e.kind === 'weave' ? 'WEAVED!' : 'SLIPPED!', '#6de3ff', 20);
        highlights.mark('dodge');
        break;
      }
      case 'sidestep': {
        const a = anchor(e.by);
        audio.whoosh();
        renderer.addFloat(a.head.x, a.head.y - 44, 'SIDESTEPPED!', '#6de3ff', 20);
        highlights.mark('dodge');
        break;
      }
```

```javascript
      case 'knockdown': {
        audio.knockdown();
        audio.excite(0.9);
        audio.crowdRoar(1);
        if (!game.training) audio.hype(HYPE_KNOCKDOWN);
        renderer.addFlash(1);
        renderer.shake = 18;
        hitstopT = Math.max(hitstopT, 0.13);
        banner('KNOCKDOWN!', 'kd', 1.0);
        if (isPlayer(e.target) && navigator.vibrate) navigator.vibrate([60, 40, 60]);
        highlights.mark('knockdown', 800, 1200);
        break;
      }
```

- [ ] **Step 4: Tag the finish and defer `stop()` in the `over` case**

Replace the `over` case (`js/main.js:650-659`):

```javascript
      case 'over': {
        audio.bellEnd();
        audio.excite(1);
        if (e.result.method === 'KO' || e.result.method === 'TKO') {
          audio.crowdRoar(1.4);
          audio.hype(e.result.winner === 'p' ? HYPE_KO_WIN : HYPE_KO_LOSE);
        }
        highlights.mark('finish', 1500, 800);
        setTimeout(() => {
          highlights.stop().then(res => { lastHighlightResult = res; });
        }, 1000);
        applyCareerResult(e.result);
        resultShownAt = performance.now() + 1600;
        break;
      }
```

- [ ] **Step 5: Dispose on leaving the result screen without downloading**

Modify the three result-screen button handlers (`js/main.js:424-426`) so
leaving the result screen (without having downloaded — download handling is
added in Task 3, which will null out `lastHighlightResult.blobUrl` after a
download to prevent double-revoke) disposes the finished recording:

```javascript
  $('btn-rematch').addEventListener('click', () => {
    audio.ensure();
    if (lastHighlightResult && lastHighlightResult.blobUrl) URL.revokeObjectURL(lastHighlightResult.blobUrl);
    lastHighlightResult = null;
    startFight();
  });
  $('btn-continue').addEventListener('click', () => {
    if (lastHighlightResult && lastHighlightResult.blobUrl) URL.revokeObjectURL(lastHighlightResult.blobUrl);
    lastHighlightResult = null;
    showCareerHub();
  });
  $('btn-menu').addEventListener('click', () => {
    if (lastHighlightResult && lastHighlightResult.blobUrl) URL.revokeObjectURL(lastHighlightResult.blobUrl);
    lastHighlightResult = null;
    showMenu();
  });
```

Note: `startFight()` (Step 2) already revokes/disposes defensively, so this
is belt-and-suspenders for the `showCareerHub`/`showMenu` paths which don't
otherwise touch highlights.

- [ ] **Step 6: Manually verify event tagging**

Open the game in a browser (Chrome/Edge), open dev tools, start an
Exhibition fight, and temporarily add `console.log(type, this._marks.length)`
inside `HighlightRecorder.mark` (remove after checking). Play until you
land a big punch, get dodged/stunned, and finish the fight by KO. Confirm:
- Marks log for `power`, `stun`, `dodge`, `knockdown` (if triggered), and
  `finish`.
- No console errors when the match ends.
- `lastHighlightResult.blobUrl` is set about 1s after the `over` event
  (check via `console.log(lastHighlightResult)` in the console after the
  fight ends — these are IIFE-scoped, so instead temporarily add
  `window.lastHighlightResult = lastHighlightResult;` right after it's
  assigned in Step 4, check it, then remove the debug line).

- [ ] **Step 7: Commit**

```bash
git add js/main.js
git commit -m "Tag combat highlight moments and manage recorder lifecycle"
```

---

### Task 3: Highlight reel overlay — markup, styles, playback, download

**Files:**
- Modify: `index.html:146-156` (add `#highlight-panel` markup after `#result-panel`)
- Modify: `css/style.css` (append highlight-panel styles near the existing overlay/panel rules, `css/style.css:414-421`)
- Modify: `js/main.js` (`showResult()` at `js/main.js:723-767`; main loop's result-panel block at `js/main.js:716-720`)

**Interfaces:**
- Consumes: `lastHighlightResult = { blobUrl, marks: Array<{type, start, end}> }`
  from Task 2.
- Produces: nothing consumed by later tasks (this is the final task).

- [ ] **Step 1: Add the highlight panel markup**

In `index.html`, immediately after the closing `</div>` of `#result-panel`
(`index.html:156`), insert:

```html
      <div id="highlight-panel" class="overlay panel hidden">
        <h3>HIGHLIGHTS</h3>
        <video id="highlight-video" playsinline muted></video>
        <div class="panel-btns">
          <button id="btn-highlight-skip" class="big-btn alt">SKIP</button>
          <button id="btn-highlight-download" class="big-btn">DOWNLOAD</button>
        </div>
      </div>
```

- [ ] **Step 2: Style the panel and video**

Append to `css/style.css` (near the existing overlay rules, after
`css/style.css:421`):

```css
#highlight-panel video {
  width: min(480px, 92vw);
  max-height: 60vh;
  border-radius: 10px;
  background: #000;
}
```

- [ ] **Step 3: Add idle-detection, playback sequencing, and controls to `main.js`**

Add module-level state near the other result-related state (`js/main.js:23-26`):

```javascript
  let resultShownAt = null;
  let resultApplied = false;
  let hitstopT = 0;
  let paused = false;
  let highlightIdleAt = null;  // timestamp when reel should auto-start if untouched
  let highlightPlaying = false;
  let highlightQueue = [];
  let highlightQueueIdx = 0;
```

Add the cap/priority selection, playback sequencing, and input-cancel wiring
as new functions (place these right after `showResult()`, i.e. after
`js/main.js:767`):

```javascript
  const HIGHLIGHT_PRIORITY = { finish: 0, knockdown: 1, stun: 2, power: 3, dodge: 4 };
  const HIGHLIGHT_SLOWMO = { knockdown: true, finish: true, dodge: true };

  function selectHighlightClips(marks) {
    const finishes = marks.filter(m => m.type === 'finish');
    const rest = marks.filter(m => m.type !== 'finish')
      .sort((a, b) => HIGHLIGHT_PRIORITY[a.type] - HIGHLIGHT_PRIORITY[b.type] || b.start - a.start)
      .slice(0, 5);
    return finishes.concat(rest);
  }

  function cancelHighlightReel() {
    highlightIdleAt = null;
    if (!highlightPlaying) return;
    highlightPlaying = false;
    const video = $('highlight-video');
    video.pause();
    video.onended = null;
    video.ontimeupdate = null;
    $('highlight-panel').classList.add('hidden');
  }

  function playNextHighlightClip() {
    if (highlightQueueIdx >= highlightQueue.length) {
      cancelHighlightReel();
      return;
    }
    const clip = highlightQueue[highlightQueueIdx];
    const video = $('highlight-video');
    video.playbackRate = HIGHLIGHT_SLOWMO[clip.type] ? 0.35 : 1;
    video.currentTime = clip.start / 1000;
    video.play();
    video.ontimeupdate = () => {
      if (HIGHLIGHT_SLOWMO[clip.type] && video.currentTime * 1000 > clip.start + 1000) {
        video.playbackRate = 1;
      }
      if (video.currentTime * 1000 >= clip.end) {
        highlightQueueIdx++;
        playNextHighlightClip();
      }
    };
  }

  function startHighlightReel() {
    if (!lastHighlightResult || !lastHighlightResult.blobUrl || !lastHighlightResult.marks.length) return;
    highlightQueue = selectHighlightClips(lastHighlightResult.marks);
    if (!highlightQueue.length) return;
    highlightQueueIdx = 0;
    highlightPlaying = true;
    const video = $('highlight-video');
    video.src = lastHighlightResult.blobUrl;
    video.muted = true;
    $('highlight-panel').classList.remove('hidden');
    playNextHighlightClip();
  }

  $('btn-highlight-skip').addEventListener('click', cancelHighlightReel);
  $('btn-highlight-download').addEventListener('click', () => {
    if (!lastHighlightResult || !lastHighlightResult.blobUrl) return;
    const a = document.createElement('a');
    a.href = lastHighlightResult.blobUrl;
    a.download = 'alumbs-boxing-highlights.webm';
    a.click();
  });
  ['pointerdown', 'keydown'].forEach(evt => {
    window.addEventListener(evt, () => {
      if (highlightPlaying) cancelHighlightReel();
      else if (highlightIdleAt) highlightIdleAt = null;
    });
  });
```

- [ ] **Step 4: Start the idle timer when the result panel is shown, and trigger the reel after ~4s idle**

In `showResult()` (`js/main.js:723`), add at the end of the function (after
`panel.classList.remove('hidden');` at `js/main.js:766`):

```javascript
    panel.classList.remove('hidden');
    highlightIdleAt = performance.now() + 4000;
  }
```

In the main loop, right after the existing result-panel block
(`js/main.js:716-720`):

```javascript
    // Result panel
    if (game.state === 'over' && resultShownAt && performance.now() >= resultShownAt) {
      showResult();
      resultShownAt = null;
    }
    if (highlightIdleAt && !highlightPlaying && performance.now() >= highlightIdleAt) {
      highlightIdleAt = null;
      startHighlightReel();
    }
```

- [ ] **Step 5: Reset highlight UI state on new fight**

In `startFight()`, alongside the existing panel-hiding lines
(`js/main.js:395-399`), add:

```javascript
    $('result-panel').classList.add('hidden');
    $('rest-panel').classList.add('hidden');
    $('highlight-panel').classList.add('hidden');
    highlightIdleAt = null;
    highlightPlaying = false;
```

- [ ] **Step 6: Manually verify the full flow in a browser**

Run the game, play an Exhibition match to a finish (win by KO/decision).
Confirm:
- The result panel shows as usual.
- If you leave it untouched for ~4 seconds, the `#highlight-panel` fades in
  and clips play in sequence (finish clip always last-listed-first per the
  priority order — confirm visually that a knockdown/finish clip plays
  noticeably slower for its first second, then speeds up).
- Pressing any key or tapping during the wait or during playback
  immediately cancels back to the result panel.
- Clicking DOWNLOAD saves a `.webm` file that plays the match footage.
- Clicking REMATCH or MAIN MENU after a reel has played (or been skipped)
  works normally and does not throw console errors; starting a new match
  and reaching a new result again re-triggers the idle timer correctly.
- In a browser without `MediaRecorder` support (or by temporarily forcing
  `highlights.isSupported = false` in the console before starting a fight),
  confirm the game plays normally with no highlight panel and no errors.

- [ ] **Step 7: Commit**

```bash
git add index.html css/style.css js/main.js
git commit -m "Add highlight reel playback UI with slow-mo and download"
```

---

## Self-Review Notes

- Spec coverage: continuous recording ✓ (Task 1), event tagging incl. power/
  counter/smash ✓ (Task 2 Step 3), finish clip with post-roll via deferred
  `stop()` ✓ (Task 2 Step 4), cap/priority selection ✓ (Task 3 Step 3),
  idle-triggered auto-play ✓ (Task 3 Step 4), slow-mo ramp on
  knockdown/finish/dodge ✓ (Task 3 Step 3), input cancels reel ✓ (Task 3
  Step 3), download button ✓ (Task 3 Step 3), disposal on leaving result
  screen / new match ✓ (Task 2 Steps 2 & 5), unsupported-browser no-op ✓
  (Task 1 Step 1, verified Task 3 Step 6).
- No placeholders remain; all steps show full code.
- Method names consistent across tasks: `start`, `mark`, `stop`, `dispose`,
  `isSupported` on `HighlightRecorder`; `lastHighlightResult.{blobUrl,marks}`
  used identically in Tasks 2 and 3.
