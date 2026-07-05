# Alumbs 2D Boxing — Design Doc

A mobile-first, side-view 2D boxing game. Pure HTML/CSS/JS + Canvas, no build step,
no dependencies, no backend. Deploys as a static site behind nginx.

## Core loop
Pick your fighter → pick an opponent → fight up to 10 rounds → win by KO, TKO
(3 knockdowns in one round) or judges' decision → rematch or back to menu.

## Fighters
8 fighters, each defined in `js/fighters.js` with stats on a 1–10 scale:

| Stat     | Effect |
|----------|--------|
| power    | Damage multiplier: `0.6 + power * 0.08` |
| speed    | Punch duration multiplier: `1.25 - speed * 0.05`; also AI reaction chance |
| chin     | Reduces flash-knockdown chance; raises health restored on rising |
| stamina  | Max effective stamina regen rate |
| recovery | Health/stamina restored between rounds |

Each fighter also has a `style` ('slugger' | 'out-boxer' | 'pressure' | 'counter')
that selects the AI's combo table, aggression and dodge/block preference.

## Combat mechanics
- **Punches** (jab / cross / hook / uppercut): each has damage, stamina cost, and
  windup → active → recover phases. Durations scale with the speed stat.
- **Stamina**: drains per punch, regens while idle (slower while blocking). Punching
  while gassed (stamina < cost) does half damage and is 30% slower.
- **Block** (hold): incoming damage reduced to 15%, but blocker loses stamina per
  blocked hit. Stamina hitting 0 while blocking = guard break (stun). Uppercuts have
  a 35% chance to smash through a guard for partial damage + stun.
- **Dodge**: 0.4s lean-back with an invulnerability window, short cooldown. A
  successful dodge opens a 0.9s **counter window**: your next landed punch does 1.5×.
- **Whiffing** into a dodge extends your recovery 1.5× and costs extra stamina.
- **Hitstun** scales with damage taken.
- **Knockdowns**: health reaching 0 always drops you; big punches (hook/uppercut)
  landing while under 40 health can score flash knockdowns, resisted by chin.
  Player taps rapidly to beat the 10-count; the AI's rise count is derived from
  chin + remaining health. Rising restores a chin-based sliver of health, with a
  1s grace period. 3 knockdowns in a round = TKO.
- **Rounds**: 10 rounds. Clock shows 3:00 running at 3× speed (60 real seconds).
  Between rounds: recovery-stat-based health/stamina restore, 8s rest (skippable).
- **Judges**: 3 judges score each round 10–9 (damage + punches landed, small
  per-judge noise), minus a point per knockdown suffered (floor 7). Full
  scorecards shown at the decision.

## AI
State-machine driven, personality from stats + style:
- Reacts to the player's punch windup with block/dodge, chance scaled by speed.
- Chooses combos from its style table; aggression scales with its stamina and
  spikes when the player is in hitstun or recovery.
- Rests behind its guard when gassed.

## Controls
- **Touch**: left cluster = DODGE + BLOCK (hold); right cluster = JAB / CROSS /
  HOOK / UPPER. During a count: mash the big TAP button to get up.
- **Keyboard**: J jab, K cross, L hook, I uppercut, S or Space = block (hold),
  A or D = dodge. Mash Space to rise.

## Architecture (plain script globals, no modules — works from file:// too)
- `js/fighters.js` — roster data (`FIGHTERS`)
- `js/game.js` — all simulation: fighter state machines, punch resolution, AI,
  rounds, judging. **No DOM/canvas access.** Emits events via `game.events` queue.
- `js/render.js` — procedural canvas renderer (ring, boxers, particles, shake).
  Exposes glove/head anchor points so effects can be placed without the sim
  knowing coordinates.
- `js/input.js` — touch + keyboard → game intents.
- `js/audio.js` — WebAudio-synthesized bell, thuds, whooshes (no asset files).
- `js/main.js` — screens/HUD DOM, game loop, event → sound/banner/effect routing.

## Deploy
`nginx:alpine` Dockerfile serving the repo root. Coolify: point at the repo,
build pack = Dockerfile, port 80.
