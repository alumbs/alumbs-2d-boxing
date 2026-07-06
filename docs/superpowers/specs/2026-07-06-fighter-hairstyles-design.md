# Fighter Hairstyles — Design

Date: 2026-07-06

## Goal

Give fighters visual variety through hairstyles instead of every fighter
sharing the same hardcoded dark hair-cap arc.

## Data model (`js/fighters.js`)

Each fighter def gains two fields:

- `hair`: one of `'bald' | 'short' | 'afro' | 'mohawk' | 'long'`
- `hairColor`: a hex string, chosen from a small natural palette (black,
  dark brown, brown, blonde, gray, auburn/red)

A helper, `hairFor(id)`, hashes a fighter's existing `id` string to
deterministically pick both fields. The 12 preset fighters in the roster
get their `hair`/`hairColor` computed this way at definition time — no new
authored data, and the mapping is stable (a given fighter always renders
with the same hair).

## Renderer (`js/render.js`)

The existing hardcoded block:

```js
// Hair cap
ctx.fillStyle = 'rgba(0,0,0,0.55)';
ctx.beginPath();
ctx.arc(headX, headY - 3, 21, Math.PI * 1.05, Math.PI * 1.95);
ctx.fill();
```

becomes a dispatch: `drawHair(ctx, def, headX, headY, dir, downness)`,
called from `drawBoxer` in the same place, using `def.hairColor` instead of
the hardcoded rgba. Five styles:

- **bald** — no hair shape; a faint highlight arc for a bit of shine
- **short** — today's look (the existing arc), now colored by `hairColor`
- **afro** — a larger rounded silhouette, radius bigger than the skull,
  centered slightly behind the head
- **mohawk** — a narrow vertical strip along the top-center of the head
- **long** — the short-hair cap plus a static teardrop/ponytail shape
  trailing from the back of the head down toward shoulder height. No
  swing/physics — it is drawn rigidly attached, same relative position
  every frame, so it needs no extra per-fighter state.

All styles draw in head-local coordinates (relative to `headX`/`headY`),
so they automatically inherit the existing squash-on-impact, fall-rotation,
and lane-depth scaling with no extra plumbing.

## Create-a-fighter (`js/main.js` + `index.html` + `css/style.css`)

Two new swatch rows, inserted after the existing SKIN row, following the
exact pattern `renderSwatches` already uses for skin/trunks/gloves/style:

- **HAIR** — 5 swatches, one per style (icon or short label text)
- **HAIR COLOR** — swatches for the same natural palette used by the
  roster hash

The created fighter def includes `hair`/`hairColor` from these picks.
Existing v2 career saves that predate this feature (no `hair` field) fall
back to `'short'` / black the same way the v1→v2 migration already patches
missing fields on load.

## Non-goals

- No hair physics/swing simulation (even for `long`) — static attachment
  only, per explicit decision.
- No changes to `js/game.js` — this is purely cosmetic and has zero effect
  on gameplay/simulation.
- No new hairstyle beyond the 5 listed (no cornrows, headbands, etc. in
  this pass).
