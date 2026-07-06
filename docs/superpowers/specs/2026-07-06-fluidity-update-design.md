# Fluidity Update — Design

Date: 2026-07-06

## Goal

Make the fight feel fluid and free (lanes + circling), add long-term hooks
(training mode, create-a-fighter, rankings ladder), and polish the visuals.

## Features

### 1. Three-lane ring

- Fighters get `lane` (0 = far, 1 = mid, 2 = near) plus a smooth `laneF`
  interpolation value for rendering.
- Lane steps are discrete (W/S keys, ▲/▼ buttons), take ~0.25 s, cost a
  little stamina, and have a short cooldown.
- A punch only lands when both fighters are settled in the same lane —
  stepping lanes is a side-step evade (emits a `sidestep` miss event).
- AI pursues the player's lane and occasionally side-steps incoming punches
  (out-boxers/counter-punchers more often).

### 2. Free movement & side-switching

- `moveDir` becomes absolute screen direction (A = left, D = right) instead
  of forward/retreat.
- Facing (`dir`) is recomputed from relative x whenever a fighter is free
  (not punching / hit / down), so you can circle through another lane and
  come out on the other side.
- Same-lane collision: you cannot walk through your opponent; if lanes merge
  while overlapping, a gentle separation force pushes both apart.

### 3. Training mode

- Menu entry → pick your fighter → pick a sparring partner.
- `Game` accepts `opts = { training: true }`: clock frozen, rounds never end,
  a KO'd partner auto-rises with restored health.
- Spar behavior toggle (in-fight buttons): DUMMY (stands there), DEFEND
  (blocks/dodges only), SPAR (fights normally).
- Damage numbers float off every landed punch; RESET button restores both.

### 4. Create-a-fighter + career rankings

- Career save v2: `{ v: 2, fighter: <def>, stage, w, l, ko, sp }` (v1 saves
  migrate automatically; `fighterId` → preset def copy).
- New career starts on a create-a-fighter screen: name, nickname, flag,
  skin tone, trunks/gloves colors, style, and a stat pool (5 stats start
  at 3, 14 points to allocate, max 10 each).
- Career hub shows the full rankings ladder (#12 → champion) with the player
  slotted at their current rank; beat the fighter above you to climb.
- Wins award 2 skill points (+1 for KO/TKO) to spend on stats in the hub.

### 5. Graphics polish (renderer only)

- Perspective ring: 4 posts, side ropes, translucent foreground ropes drawn
  over the fighters, subtle lane guides on the mat.
- Fighters scale/translate by lane depth (wrapper transform keeps existing
  drawing code intact); anchors transformed for effects.
- Dynamic camera: smooth zoom/pan toward the midpoint of the two fighters.
- Animated crowd bob + random camera flashes, vignette overlay.

## Non-goals

- No multiplayer, no sprite/asset pipeline (stays procedural canvas),
  no changes to audio.
