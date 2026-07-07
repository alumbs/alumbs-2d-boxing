# 🥊 Alumbs 2D Boxing

A mobile-first, side-view 2D boxing game. Pure HTML/CSS/JS + Canvas — no build
step, no dependencies, no backend.

**Play:** **Career** — create your own fighter (name, colors, hairstyle,
style, stat budget) and climb the rankings ladder from unranked to
Undisputed Champion; wins earn skill points to spend on your stats. Once
you're champion, pick any challenger and defend your title — the belt is
yours to keep. Record saved in your browser.
**Exhibition** — any fighter vs any opponent. **Training** — pick a sparring
partner and drill with no clock: DUMMY stands there, DEFEND only blocks and
slips, SPAR fights back; damage numbers show on every landed punch. Fights
go up to 10 rounds; win by KO, TKO (3 knockdowns in a round) or the judges'
scorecards.

## Controls

**Touch (mobile):** left cluster = ◀ ▶ move (hold), ▲ ▼ switch lane (tap),
LEAN, WEAVE, BLOCK ▲ high guard (hold), BLOCK ▼ low guard (hold), DUCK
(hold). Right cluster = JAB / CROSS / HOOK / UPPER / BODY. When you're
knocked down, mash the TAP button to beat the count — later knockdowns need
more mashing.

**Keyboard:** `A`/`D` move · `W`/`S` switch lane · `Q` lean · `E` weave ·
`Space` high block · `X` low block · `C` duck (all guards are hold) · `J`
jab · `K` cross · `L` hook · `I` uppercut · `M` body · mash `Space` to get
up · `Esc` pause.

**Pause:** the ❚❚ button top-right of the ring, or `Esc`, freezes the fight
(clock, punches, AI, sound) — Resume or bail to the Main Menu. Switching
tabs/apps mid-fight pauses automatically.

**The ring has three lanes** (near, mid, far). Punches only land when both
fighters are in the same lane — stepping lanes at the right moment side-steps
a punch and opens a counter window, and a free lane lets you circle right
around your opponent to switch sides or escape a corner. The AI hunts your
lane, and slick fighters will side-step you too.

**Tips:** watch the opponent's glove — a pulsing yellow ring means a punch is
coming; guard or dodge it. **High guard stops head shots but leaks body
shots; low guard is the reverse — read the punch and match the guard.**
Ducking covers both but burns stamina while held, and an uppercut smashes
straight through it. The same applies to the opponent: watch their guard
height and hit what's open. **LEAN evades straights and body shots; WEAVE
rolls under hooks — but weaving into an uppercut gets you smashed.** A clean
evade (or a well-timed side-step) opens a counter window: your next punch
does 1.5× damage **and** snaps out 25% faster, so cash it in quick. A big
counter leaves them DAZED — wobbling, stars circling, free shots until they
recover. Inputs pressed while you're mid-punch (or mid-lane-step) are
buffered and fire the instant you're free. Mind your range — jabs reach
farthest, uppercuts and body shots need to be close. Body shots steal
stamina. Gassed punches hit like pillows. **Getting knocked down isn't a
total loss** — you recover 10% of your stamina for every count that ticks
by (a 6-count back on your feet = 60% of your wind back), so a fresh
knockdown while gassed is a chance to recover, not just a countdown. The
fighter who scored the knockdown is resting in a neutral corner too and
recovers stamina at the normal idle rate for as long as the count runs. The
roster is ordered weakest to strongest — start at the top of the list if
you're getting hurt.

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
