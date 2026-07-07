# Champions Roster, Title Defenses & Realistic Knockdown Recovery

**Date:** 2026-07-06

## Problem

Two issues:

1. **Champion dead-end.** After beating the whole roster (11 opponents) you
   become Undisputed Champion, at which point the career hub hides the FIGHT
   button and there is no way to keep fighting. The player wants a much deeper
   ladder (~30 more fighters) *and* the ability to pick any opponent to fight
   once they hold the belt.

2. **Unrealistic knockdown recovery.** A downed fighter currently regenerates
   ~10% of max stamina per count reached (a 6-count returns ~60% of their
   wind), plus corner-recovery and a +8 stamina jolt on rising. A fighter who
   was just dropped should get up *tired and vulnerable*, not refreshed.

## Goals

- Expand the ladder with ~30 new fighters, keeping the existing weakest →
  strongest ordering, so the career climb becomes ~40 fights long.
- Let a champion pick any roster fighter for a title-defense fight.
- Make title defenses "exhibition-style": W/L and KO tracked, skill points
  still earned, but the belt is never lost and CHAMPION status is retained.
- Cut knockdown stamina recovery to a small, capped amount so getting up
  costs the fighter.

## Non-Goals

- No new fighter *systems* (stats, styles, hair all use existing machinery).
- No changes to AI, rendering, or the fight engine beyond the recovery numbers.
- Champions cannot lose the belt (per decision); no belt-defense-loss ladder.

## Design

### 1. Roster expansion — `js/fighters.js`

Append ~30 new fighter objects to the `FIGHTERS` array. Each object uses the
existing shape:

```js
{ id, name, nick, flag, power, speed, chin, stamina, recovery,
  style, skin, trunks, gloves, ...hairFor(id) }
```

- `id` must be unique (used as a key across select/career logic and for
  deterministic hair).
- Stats are 1–10. New fighters are inserted in roughly ascending overall
  rating so the array stays ordered weakest → strongest (the ladder relies on
  array order — see `careerOpponents` returning `FIGHTERS` as-is).
- `style` is one of `slugger | out-boxer | pressure | counter`.
- Hair auto-derives from `id` via existing `hairFor(id)`; no hand-authoring.

No other code changes are required for the roster — every consumer already
iterates `FIGHTERS`.

### 2. Champion title defenses — `js/main.js`, `index.html`

**Hub (showCareerHub, main.js ~210):** when `c.stage >= opps.length`, keep the
champion banner but instead of hiding all action, show a **"DEFEND TITLE"**
button. (Add the button to `index.html` near `btn-career-fight`; id
`btn-career-defend`, hidden by default, shown only in the champion branch.)

**Defense flow:** clicking DEFEND TITLE sets `playerDef = c.fighter`, sets the
select-screen title to "CHOOSE A CHALLENGER", and calls `renderGrid('champ')`.

**New select phase `champ` (renderGrid, main.js ~311):**
- Roster shown: all `FIGHTERS` (the champion's own career fighter is already
  the player, so no self-match; the grid's `taken` marking by
  `def.id === playerDef.id` naturally disables any collision — career fighters
  have their own id).
- On card click in `champ` phase: `oppDef = def; mode = 'career-defense';
  startFight()`.

**New mode `career-defense`:** behaves like career for result handling but
does not advance/lose the belt.

**Result application (applyCareerResult, main.js ~380):** accept both
`'career'` and `'career-defense'`. For `career-defense`:
- On win: `c.w++`, `c.ko++` if KO/TKO, award skill points (same formula),
  **do not** touch `c.stage`.
- On loss: `c.l++` only. Belt retained (stage unchanged).
- Save.

**Continue button:** already routes to `showCareerHub`; ensure `btn-continue`
is shown for `career-defense` too (the toggle at main.js ~653 keys off
`mode !== 'career'` — update to treat `career-defense` like `career`). The
rematch button should stay hidden for defenses (it's a career-style flow).

### 3. Knockdown recovery — `js/game.js`

**Count-tick recovery (game.js ~630):** replace the 10%-per-count formula.
New: ~2.5% of max stamina per count, capped at ~20% total, never below
`staminaAtDown`.

```js
const recoveredFrac = (c.num + clamp(c.t / COUNT_TICK, 0, 1)) * 0.025;
const cappedFrac = Math.min(recoveredFrac, 0.20);
const target = Math.max(c.staminaAtDown, c.downed.maxStamina * cappedFrac);
c.downed.stamina = Math.min(c.downed.maxStamina, target);
```

Because `target` is floored at `staminaAtDown`, a fighter dropped with more
than 20% wind keeps what they had — they just don't gain much. The comment
above the block is updated to reflect the new rate.

**Rise jolt (game.js ~470):** reduce the on-rise stamina bonus from `+8` to
`+4`. Training mode (`f.health = max(f.health, 60)`) is unchanged.

## Testing

Manual, in-browser (no test harness in this project):

1. **Roster:** open Career / Exhibition select — all new fighters render with
   correct stats, styles, flags, and hair; no duplicate-id console errors;
   ratings visually ascend down the career rankings.
2. **Climb:** career ladder shows ~40 ranked fighters; NEXT OPPONENT numbers
   count down correctly.
3. **Champion:** reach (or force via a maxed save) champion status → banner
   shows, DEFEND TITLE button appears, FIGHT hidden.
4. **Defense:** DEFEND TITLE → challenger grid → pick anyone → fight →
   Continue returns to hub; still CHAMPION; W/L/KO and skill points updated;
   belt not lost on a loss.
5. **Recovery:** get knocked down; confirm stamina bar rises only slightly
   through the count and the fighter gets up visibly gassed, not refreshed.

## Files Touched

- `js/fighters.js` — ~30 new roster entries.
- `js/main.js` — `champ` select phase, `career-defense` mode, DEFEND TITLE
  wiring, result handling, continue-button toggle.
- `index.html` — DEFEND TITLE button.
- `js/game.js` — count-tick recovery formula, rise jolt.
