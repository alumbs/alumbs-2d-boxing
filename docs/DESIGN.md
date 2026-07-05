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
- **Footwork**: fighters move along one axis inside ring bounds with a minimum
  gap. Move speed scales with the speed stat; retreating is slightly slower,
  blocking halves movement. Landed punches knock the target back. Each round
  starts from the corners (out of range — no cheap shots at the bell).
- **Punches** (jab / cross / hook / uppercut / body): each has damage, stamina
  cost, **reach**, and windup → active → recover phases. Durations scale with
  the speed stat. Out-of-range punches whiff. Jabs reach farthest; uppercuts
  and body shots need to be close.
- **Body shots**: deal moderate health damage but heavy stamina damage
  ("stealing wind") and can never score a flash knockdown.
- **Guard zones** (`GUARD_THROUGH` in game.js): a guard is held as high, low,
  or duck. High stops head punches (15% chip) but leaks body shots (60%
  through); low is the mirror (12% body / 70% head). Duck is a crouched full
  cover (25% through everywhere) but actively drains stamina while held —
  hitting 0 collapses the guard with a stun — and an **uppercut smashes clean
  through a duck** for bonus damage. Right-zone blocks chip without hitstun;
  wrong-zone hits land with hitstun at the leak percentage.
- **Input buffering**: player punch/dodge inputs pressed while busy (punching,
  hitstun, dodging) are queued for 0.5s and fire the instant the fighter is
  free. Nothing is silently dropped — this is what makes controls feel snappy.
- **AI telegraphs**: AI punches have much longer windups than the player's
  (`windupMul ≈ 2.6 − speed×0.16`, ±30% per-punch variance, 0.28s absolute
  floor), so every punch is humanly reactable and slow fighters telegraph
  badly. The renderer draws a pulsing yellow ring on the AI's chambering glove
  during windup — that's the player's reaction cue.
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
  Player taps rapidly to beat the 10-count; the required mash effort scales up
  with each knockdown suffered and with how hurt you are. The AI's rise count is
  derived from chin + remaining health. Rising restores a chin-based sliver of
  health, with a 1.5s grace period. 3 knockdowns in a round = TKO.
- **Rounds**: 10 rounds. Clock shows 3:00 running at 3× speed (60 real seconds).
  Between rounds: recovery-stat-based health/stamina restore, 8s rest (skippable).
- **Judges**: 3 judges score each round 10–9 (damage + punches landed, small
  per-judge noise), minus a point per knockdown suffered (floor 7). Full
  scorecards shown at the decision.

## AI
State-machine driven, personality from stats + style:
- Holds its style's preferred distance (out-boxers far, pressure close), backs
  off when gassed; out-boxers stick-and-move after combos.
- Only starts combos from a range the first punch can land; abandons a combo
  if the player slips out of range.
- Reacts to the player's punch windup with block/dodge, chance scaled by
  speed; reads the incoming punch and picks the matching guard zone (~12%
  misread), ducking sometimes when badly hurt.
- Chooses combos from its style table; aggression scales with its stamina and
  spikes when the player is in hitstun or recovery. Reads the player's guard
  zone and attacks what's open: head shots vs a low guard, body/uppercuts vs
  a high guard, uppercut vs a duck.
- Decision tempo scales with speed: low-speed fighters attack noticeably less
  often — this plus telegraphing is the difficulty ladder. The roster is
  ordered weakest (★2.6) to strongest.
- Gets a ~1s grace period after each bell before it may attack.

## Controls
- **Touch**: left cluster = ◀ ▶ move (hold), DODGE, DUCK (hold), BLOCK ▲
  (hold), BLOCK ▼ (hold); right cluster = JAB / CROSS / HOOK / UPPER / BODY.
  During a count: mash the big TAP button to get up.
- **Keyboard**: A/D move, W dodge, S or Space = high block, X = low block,
  C = duck (all hold), J jab, K cross, L hook, I uppercut, M body. Mash Space
  to rise. Overlapping guard holds resolve to the most recently pressed.
- Holding block through a bell re-engages the guard the instant the round
  starts (idle + held button → block).

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
