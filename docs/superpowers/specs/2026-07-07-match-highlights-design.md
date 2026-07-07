# Match Highlights — Design

Date: 2026-07-07

## Goal

Automatically capture key moments during a fight (knockdowns, stuns, big
punches, dodges/slips, the finishing blow) and play them back as a highlight
reel on the result screen, without touching the game's performance. Let the
player download the reel; discard it otherwise.

## Approach

Record the whole match continuously to a single in-memory video (via
`canvas.captureStream()` + `MediaRecorder`), and mark timestamps whenever a
notable combat event fires. At the end of the match, seek a hidden `<video>`
element into those marked windows to play the highlight reel — no per-clip
file splicing needed. This is the simplest reliable approach: encoding runs
off the main thread via the browser's media pipeline, so it doesn't compete
with `requestAnimationFrame` or add per-frame cost to game logic.

Matches are a few minutes of low-resolution 2D canvas video, so one
continuous recording is small (low single-digit MB), making "record
everything, seek into it" cheaper than trying to manage rolling buffers or
splice discrete clips.

## Components

### 1. `js/highlights.js` — new module, `HighlightRecorder` class

- Feature-detects `canvas.captureStream` and `window.MediaRecorder`. If
  either is missing, all methods become no-ops — no crashes, no UI changes,
  recording is simply skipped.
- `start(canvas)`: begins `captureStream(30)` → `MediaRecorder` (prefers
  `video/webm;codecs=vp9`, falls back to `vp8` / default), collecting data
  chunks via `ondataavailable` (timeslice ~1000ms).
- `mark(type, atTime)`: records a highlight window `{ type, start, end }`
  relative to recording start time, where `start`/`end` pad a few hundred ms
  around the event so the moment isn't cut off. Pre-roll is free since we
  always have the full recording already. For post-roll, `stop()` is
  deferred: on the `over` event, `main.js` marks the `finish` clip and waits
  ~1s (the existing hype-shout/result delay already covers this window)
  before calling `stop()`, so even a match-ending knockout gets its trailing
  frames.
- `stop()`: stops the `MediaRecorder`, assembles the final `Blob` from
  collected chunks, returns `{ blobUrl, marks }`.
- `dispose()`: revokes the blob URL and drops references. Called whenever a
  reel is dismissed without downloading, or a new match starts.
- Selection/cap logic: if more marks exist than the display cap (5),
  prioritize by type rank (`finish` > `knockdown` > `stun` > `power` >
  `dodge`) then recency, so the reel stays tight even in a long, busy match.

### 2. Hooking marks into existing combat events

In `js/main.js`, inside the existing `handleEvent` switch (`js/main.js:588`
onward) that already drives audio/renderer effects, add
`highlights.mark(...)` calls alongside the existing effect calls — no new
detection logic, just tagging events that already exist:

- `knockdown` → type `knockdown`
- `stun` → type `stun`
- `dodged` / `sidestep` → type `dodge`
- `hit` with `e.smash || e.counter || e.dmg >= 5` → type `power`
- `over` → type `finish` (always included, not subject to the cap)

Recorder `start()` fires when a match begins (same place `game` is
constructed); `stop()` fires on the `over` event once the final result is
known.

### 3. Result screen integration

- After `showResult()` displays (`js/main.js:717`) and the panel has sat
  idle for ~4 seconds with no input, fade in a `#highlight-panel` overlay
  reusing the existing `.overlay.panel` style.
- Any tap/key press during the idle wait or during playback cancels/skips
  the reel immediately back to the normal result panel — never blocks the
  player from continuing.
- Playback: a hidden `<video>` element (fed by the recorder's blob URL)
  seeks through each mark in order. `knockdown`, `finish`, and `dodge` clips
  start at `playbackRate = 0.35` for their first ~1s then ramp back to 1x;
  `stun`/`power` clips play at normal speed.
- Controls: SKIP (advance to next clip / close reel), DOWNLOAD (anchor
  `download` of the full match blob, standard "click hidden `<a>`" pattern),
  CONTINUE/REMATCH/MAIN MENU remain reachable after the reel (or immediately
  if skipped).

### 4. Disposal

- If the player clicks DOWNLOAD, the blob is preserved until they navigate
  away from the result screen, then disposed.
- If they don't download, the recording is disposed (`dispose()`) as soon as
  they leave the result screen (continue/rematch/menu) or a new match starts.
- No IndexedDB/localStorage persistence — this is a transient, in-memory
  feature only.

## Out of scope

- Per-clip file export (only the full match download is offered).
- Cross-session highlight history/gallery.
- Any server-side storage or upload.
