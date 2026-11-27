# Manual test checklist — pixel maps

Setup: `APP_ENV=dev`, `php bin/console doctrine:migrations:migrate`,
`php bin/console doctrine:fixtures:load`, `php bin/console cache:clear`, then
open `/jeu`. Press **F2** to see every box, **F3** for the editor.

Static checks must be green before manual testing:

```powershell
php bin/console app:maps:validate
php vendor/bin/phpunit
```

The validator reports nine rooms, 20 CTF slots, 9 web, 8 crypto, 5 OSINT
(including the central table) and 4 réseaux slots, with zero errors. It also
checks image sizes, rectangles, spawn collision, door links, facing and
reachability, so the walkthrough below focuses on feel and rendering.

## 1. Door graph

Walk into each door; the destination, arrival point and facing must be:

| From | Door | To | Arrival behaviour |
| --- | --- | --- | --- |
| `dojo` | south steps | `rewards` | top door, facing away from it |
| `dojo` | west | `ctf` | near the CTF right door |
| `dojo` | east | `courses_lobby` | near the west door |
| `ctf` | right | `dojo` | near the dojo west door |
| `rewards` | top | `dojo` | near the dojo south door |
| `courses_lobby` | west | `dojo` | near the dojo east door |
| `courses_lobby` | east | `hall` | near the hall left door |
| `hall` | left side | `courses_lobby` | near the east door |
| `hall` | top-left arch | `course_osint` | bottom-centre door |
| `hall` | top-right arch | `course_web` | bottom-centre door |
| `hall` | bottom-left arch | `course_crypto` | bottom-centre door |
| `hall` | bottom-right arch | `course_reseaux` | bottom-centre door |
| each course | bottom centre | `hall` | matching corner arch |

Bottom steps and small orange doors inside a room are decoration only: walking
over them must not trigger a transition. After each arrival, wait 1 s without
moving: no ping-pong back through the door. Door cooldown is 600 ms, so a quick
step in and out must not immediately re-enter.

**Denied door**: in devtools, intercept `POST /salles/hall/acces` and reply
`{"autorise": false, "message": "Accès refusé."}`. The message must appear,
there must be no fade, and the player is pushed 24 px away. Try again after
leaving the rect: it triggers again. **Unknown room**: reply
`{"autorise": false, "message": "Salle inconnue."}` and check the same.

## 2. Walls and corners

With F2 on, the yellow feet box is the only thing that collides. The sprite may
draw over a wall; the feet box may not enter a red box.

For every room, approach each outer wall and each large furniture wall from
both sides, hold the direction for 3 s, and confirm the box stops at the red
edge. Approach each corner diagonally and along both edges: the box must slide,
never jitter or stick. Hold one direction for 5 s (switch tabs and come back)
to confirm there is no tunnelling at large frame gaps.

Pay particular attention to the openings: the door rectangles interrupt the
outer walls. The character must fit through each opening without catching on
the neighbouring wall corners.

## 3. Interaction and rendering

- The fixture objects sit at the slot centres. Stand within the orange reach
  and check the hint shows `[E] <titre>`; press E, the challenge window opens;
  typing a flag never moves the character; Esc closes it.
- Check at least `dojo-01`, `ctf-01`, `ctf-20`, `rewards-01`, `web-01`,
  `crypto-08`, `osint-05` (central table) and `reseaux-04`.
- Fixed objects (`scoreboard`, `badge-wall`, `belt-stand`, …) show their French
  title when reached with E. The sensei in `dojo` (and the arbitre/accueil in
  `ctf`/`hall`) uses the real sprite and is solid.
- In `dojo`, the larger sensei is not the old blue/purple placeholder. Idle
  shows only the front-facing frame; there is no thinking state. He pauses for
  1.2–3.2 s, then (65 % chance) walks smoothly to a random point in the small
  corridor around him (x 640–760, y 580–650) at 22 px/s, easing in and out, or
  simply stays idle. While walking, the down/up/left/right strip matches his
  direction; idle always returns to the front frame. This runs on his own clock,
  not on player input. Press E near him to play the 4-frame talking strip; the
  small purple F2 feet box marks his collision.
- Draw order: when walking behind an object or the sensei the player is drawn
  first; in front, last. No tile grid is visible.
- Resize the window: `fit` rooms stay centred and uncropped; `ctf` and
  `rewards` use `follow` and clamp at the room edges.

## 4. F3 editor (dev only)

- Press F3: the panel opens, movement stops and the HUD hint explains the keys.
- Choose each layer in turn. Drag on the canvas to draw a rectangle; click an
  existing rectangle to select it; drag a white handle to resize; drag its body
  to move it; Delete removes it; arrows nudge 1 px, Shift+arrows 10 px.
- With a `door` selected, edit `id`, `kind`, `to` and its `spawn x/y` in the
  form. With an `interactable`, edit `id`, `kind` and `label`. With `spawn`,
  drag the crosshair or use the form. Typing in a field must not move the
  character.
- Ctrl+Z restores the last change, including after a deletion. “Copier le JSON”
  puts the full map on the clipboard; “Télécharger” saves `<id>.json`.
- Press F3 again (or Esc / “Fermer”) to close: the panel disappears and movement
  resumes.
- Reload with `APP_ENV=prod` and a cleared cache: no debug hint in the HUD, F3
  does nothing, and `GET /jeu/editeur` returns 404.

## 5. Loading and debug

- Network tab: the room WebP is requested before the first frame; neighbour
  images are fetched afterwards. The small progress bar appears during load
  and disappears at 100 %.
- F2 toggles red/green/blue/cyan/purple (NPC feet)/yellow/orange boxes and the
  cursor coordinate readout. Press F2 twice: overlay disappears.
- Character sheet row check: open `/jeu/personnage-test`, switch between the
  32 × 32 and 16 × 20 variants. Rows must read
  `down=0, left=1, right=2, up=3`; yellow box marks the feet hitbox.
- In prod (`APP_ENV=prod`, clear cache, reload): no debug hint, F2 and F3 do
  nothing, and neither dev page/route is reachable.
