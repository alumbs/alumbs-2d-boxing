# 🥊 Alumbs 2D Boxing

A mobile-first, side-view 2D boxing game. Pure HTML/CSS/JS + Canvas — no build
step, no dependencies, no backend.

**Play:** pick a fighter, pick an opponent, survive 10 rounds. Win by KO, TKO
(3 knockdowns in a round) or the judges' scorecards.

## Controls

**Touch (mobile):** left cluster = ◀ ▶ move (hold), DODGE, DUCK (hold),
BLOCK ▲ high guard (hold), BLOCK ▼ low guard (hold). Right cluster = JAB /
CROSS / HOOK / UPPER / BODY. When you're knocked down, mash the TAP button to
beat the count — later knockdowns need more mashing.

**Keyboard:** `A`/`D` move · `W` dodge · `S`/`Space` high block · `X` low
block · `C` duck (all guards are hold) · `J` jab · `K` cross · `L` hook ·
`I` uppercut · `M` body · mash `Space` to get up.

**Tips:** watch the opponent's glove — a pulsing yellow ring means a punch is
coming; guard or dodge it. **High guard stops head shots but leaks body
shots; low guard is the reverse — read the punch and match the guard.**
Ducking covers both but burns stamina while held, and an uppercut smashes
straight through it. The same applies to the opponent: watch their guard
height and hit what's open. Inputs pressed while you're mid-punch are buffered
and fire the instant you're free. Dodging opens a counter window: your next
punch does 1.5×. Mind your range — jabs reach farthest, uppercuts and body
shots need to be close. Body shots steal stamina. Gassed punches hit like
pillows. The roster is ordered weakest to strongest — start at the top of the
list if you're getting hurt.

## Run locally

Just open `index.html` in a browser, or:

```bash
docker compose up --build
# → http://localhost:8080
```

## Deploy on Coolify

The repo ships a `Dockerfile` (nginx serving the static files on port 80).

1. Push this repo to your Git provider (GitHub/GitLab/Gitea…).
2. In Coolify: **+ New → (Public or Private) Repository**, select this repo
   and branch.
3. **Build Pack:** `Dockerfile` (Coolify usually auto-detects it).
4. **Port:** `80` (set "Ports Exposes" to 80 if asked).
5. Assign your domain / let Coolify generate one, then **Deploy**.

That's it — no environment variables, no volumes, no database. Every push to
the branch redeploys automatically if you enable auto-deploy on the resource.

Alternatively, choose **Docker Compose** as the build pack and point it at
`docker-compose.yml` — but the plain Dockerfile route is simpler on Coolify.

## Project layout

```
index.html        — shell: select screen, fight screen, HUD, overlays
css/style.css     — all styling (mobile-first, safe-area aware)
js/fighters.js    — roster + stats (add fighters here)
js/game.js        — pure simulation: state machines, punch resolution, AI, judging
js/render.js      — procedural canvas renderer (no image assets)
js/audio.js       — WebAudio-synthesized bell/thuds/whooshes (no sound assets)
js/input.js       — touch + keyboard bindings
js/main.js        — screens, HUD, event routing, game loop
docs/DESIGN.md    — mechanics & architecture doc
```

### Adding a fighter

Append an object to `FIGHTERS` in `js/fighters.js` — stats are 1–10
(`power`, `speed`, `chin`, `stamina`, `recovery`), pick a `style`
(`slugger` / `out-boxer` / `pressure` / `counter`) and three colors. Done.
