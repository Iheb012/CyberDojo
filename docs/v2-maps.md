# Pixel-art maps

The game now uses only the nine hand-painted rooms. The old square/tile engine
and its maps (`lab-web`, `dojo-v1`, `lobby`, `library`, `world`) are removed.

| Room id | Image | Camera | Slots |
| --- | --- | --- | --- |
| `dojo` | `dojo.webp` | fit | `dojo-01` |
| `ctf` | `ctf.webp` | follow | `ctf-01` … `ctf-20` |
| `rewards` | `rewards.webp` | follow | `rewards-01` |
| `courses_lobby` | `courses_lobby.webp` | fit | — |
| `hall` | `hall.webp` | fit | — |
| `course_web` | `course_web.webp` | fit | `web-01` … `web-09` |
| `course_crypto` | `course_crypto.webp` | fit | `crypto-01` … `crypto-08` |
| `course_osint` | `course_osint.webp` | fit | `osint-01` … `osint-05` (05 = central table) |
| `course_reseaux` | `course_reseaux.webp` | fit | `reseaux-01` … `reseaux-04` |

`config/packages/game.yaml` is the single source of truth for that list. It is
injected into `SalleAccess` (door permissions), `MapValidator` (static checks)
and Twig (`game_maps`), which builds the JSON URLs with `asset()`.

## Door graph

- `dojo` south → `rewards`, west → `ctf`, east → `courses_lobby`
- `ctf` right → `dojo`
- `rewards` top → `dojo`
- `courses_lobby` west → `dojo`, east → `hall`
- `hall` left side → `courses_lobby`; top-left/top-right/bottom-left/bottom-right
  arches → `course_osint`, `course_web`, `course_crypto`, `course_reseaux`
- each course bottom-centre → `hall`

Bottom steps and small orange doors in the artwork are decoration, not doors.
A door's `spawn` is expressed in the **destination** room, just outside the
matching back door, on walkable floor and facing away from it.

## Modules

All game code lives in `assets/game/` as native ES modules (AssetMapper, no
bundler). `assets/controllers/game_controller.js` is the only Stimulus entry
point: it owns the DOM, challenge overlay, keyboard events, animation loop and
server calls, then delegates world state to the engine.

- `map-loader.js` — cached `fetchMap()`, cached `loadImage()` and
  `preloadNeighbors()` (called after the current room is visible).
- `engine-v2.js` — free movement, camera, doors, interaction, rendering and the
  editor overlay hook.
- `camera.js` — `fit` (contain, centred, integer scale when possible) and
  `follow` (zoom, clamped to the room).
- `character.js` — reads `characters/character_1.json`, draws frames, exposes
  the feet hitbox in room pixels and selects the active skin variant.
- `input.js` — held keys for arrows/ZQSD/WASD, diagonals normalised.
- `collision.js` — swept, axis-separated AABB against walls, solid NPCs (the
  sensei in `dojo`, and the arbitre/accueil in `ctf`/`hall`) and the map bounds;
  steps are clamped to the hitbox size (no tunnelling).
- `geometry.js`, `debug.js` — AABB helpers and the F2 overlay.
- `map-editor.js` — dev-only F3 rectangle editor (see below).
- `character-test.js` — dev page that shows every row of both sheets.

## Map format

Coordinates are in the room image's own pixels, origin top-left. Each JSON in
`assets/game/maps/` follows `version: 2`. `walls` are solid rectangles
(furniture included); `doors` carry `rect`, `to`, `spawn` and `facing`; `slots`
are anchors matched to server objects by slot id; `interactables` are fixed
objects and `npcs` are solid dialogue points. The `cloths` interactable in
`dojo` opens the local skin shop (prices live in `character_1.json`). NPCs use the PNGs declared by
`data-game-sprites-value` in the Twig template. `spriteIdle`, `spriteDown`,
`spriteUp`, `spriteLeft`, `spriteRight` and `spriteTalk` select the animation
strip; `frames`/`fps` are objects keyed by state. With `motion`, an NPC either
cycles between idle and walk on a weighted clock (`behavior.weights`, default
60/40 over a 10 s `behavior.cycle`) or, with `behavior.random: true`, pauses and
walks smoothly to random `minX`/`maxX` and `minY`/`maxY` points at `speed`,
showing the matching facing strip, never driven by player input. Talk is
triggered only by interacting with the NPC and lasts `behavior.talk` ms
(default 2200), then the NPC resumes its own clock. If a sprite cannot load,
`engine-v2.js` falls back to its small purple placeholder.

The player position is the **centre of the feet hitbox**. The hitbox is declared
in source-frame pixels in the character JSON and scaled by the variant's
integer `playerScale` (6 for the default sheet); the sprite may overlap
furniture visually.

## Server contract

`GET /api/jeu/labs/{carte}/objets` returns each object with a nullable `slot`
string (plus `posX`/`posY`, kept nullable for older clients). The challenge and
module entities store that slot; `flagHash` is never serialised. Fixtures seed
one challenge per slot of every room.

`POST /salles/{id}/acces` (CSRF token `game`) answers
`{"autorise": true|false, "message": "…"}`. The engine calls it when the feet
box overlaps a door: allowed → fade out, load, spawn, fade in, ignore the door
for 600 ms and until the feet leave its rect; denied → show the French message
and push the player 24 px back.

## Art pipeline

Sources are in `art-src/` (never served). Run `python tools/convert-art.py`:
rooms become WebP in `public/game/maps/`, sprites are copied as PNG to
`public/game/sprites/`. `character_sensei_sheet.png` is the original sheet. The
supplied strips are kept unmodified in `art-src/raw/`; the copies in
`art-src/` have their dark background keyed out: `character_sensei_idle.png`
keeps only the front-facing frame, `character_sensei_down.png`,
`character_sensei_up.png`, `character_sensei_left.png` and
`character_sensei_right.png` each keep two stride frames for that facing, and
`character_sensei_talk.png` keeps its four frames. The sensei in `dojo` pauses
and walks to random spots on his own clock, independently of the player.
The real row order of the two player sheets is
`down=0, left=1, right=2, up=3` (row 2 is the exact mirror of row 1); see
`art-src/README.md` and `/jeu/personnage-test`.

## Validation

```powershell
php bin/console app:maps:validate
php vendor/bin/phpunit tests/Command/MapsValidateCommandTest.php
```

`MapValidator` checks that every id in `game.maps` has a JSON file, that the
image exists with matching dimensions, that every rectangle and spawn stays
inside the image, that ids are unique, that spawns avoid walls and doors, that door
targets exist with a facing back door, and that the doors/slots/interactables
are reachable from the room spawn. Reachability rasterises walls on an 8 px
grid, grows them by half the feet hitbox (48 × 30 room px for the default
sheet), then flood fills from the spawn. Hitbox and interaction reach are read
from `character_1.json`, so changing the character scale keeps validation in
sync. The command
prints one line per room and exits 1 when any check fails.

## Dev tools

`data-game-debug-value` comes from `APP_ENV` (`app.environment == 'dev'`).

- **F2** (dev only) toggles the overlay: walls red, doors green, slots blue,
  interactables cyan, NPCs purple, feet yellow, reach orange and the cursor's
  map coordinates.
- **F3** (dev only) toggles the map editor. It creates/drag-draws rectangles on
  the `wall`, `door`, `slot`, `interactable` and `spawn` layers. Click selects,
  drag handles resize, arrows nudge 1 px (Shift: 10 px), Delete removes,
  Ctrl+Z undoes. Its form edits `id`, `kind`, `label`, `to` and door `spawn`
  using DOM nodes and `textContent` only. “Copier le JSON” copies the complete
  map; “Télécharger” saves `<id>.json`.

The editor is gated twice: the front-end refuses to open it unless `APP_ENV=dev`
and a `GET /jeu/editeur` check answers `{"autorise": true}`. That route throws a
404 when `kernel.debug` is false, so a prod client cannot unlock it by changing
a front-end flag.

## Manual verification

See `docs/v2-map-test-checklist.md`.
