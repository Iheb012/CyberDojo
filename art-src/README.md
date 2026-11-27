# Game art sources

Original PNG files live here. They are **not served**: `art-src/` is outside
`public/`, so Apache never exposes it.

Drop the files with the exact target names, then run:

```powershell
python tools/convert-art.py
```

The script writes WebP versions of the room illustrations to `public/game/maps/`
and copies the pixel-art sprite sheets to `public/game/sprites/` unchanged
(PNG keeps the hard edges).

| Source | Output |
| --- | --- |
| `dojo.png` | `public/game/maps/dojo.webp` |
| `ctf.png` | `public/game/maps/ctf.webp` |
| `rewards.png` | `public/game/maps/rewards.webp` |
| `courses_lobby.png` | `public/game/maps/courses_lobby.webp` |
| `hall.png` | `public/game/maps/hall.webp` |
| `course_web.png` | `public/game/maps/course_web.webp` |
| `course_crypto.png` | `public/game/maps/course_crypto.webp` |
| `course_osint.png` | `public/game/maps/course_osint.webp` |
| `course_reseaux.png` | `public/game/maps/course_reseaux.webp` |
| `character_1_32x32.png` | `public/game/sprites/character_1_32x32.png` |
| `character_1_16x20.png` | `public/game/sprites/character_1_16x20.png` |
| `character_sensei_sheet.png` | `public/game/sprites/character_sensei_sheet.png` |
| `character_sensei_idle.png` | `public/game/sprites/character_sensei_idle.png` |
| `character_sensei_down.png` | `public/game/sprites/character_sensei_down.png` |
| `character_sensei_up.png` | `public/game/sprites/character_sensei_up.png` |
| `character_sensei_left.png` | `public/game/sprites/character_sensei_left.png` |
| `character_sensei_right.png` | `public/game/sprites/character_sensei_right.png` |
| `character_sensei_talk.png` | `public/game/sprites/character_sensei_talk.png` |
| `Gemini_Generated_Image_a8irfqa8irfqa8ir.jpg` | `public/game/ui/Gemini_Generated_Image_a8irfqa8irfqa8ir.jpg` |

The player sprite rows are: row 0 `down`, row 1 `left`, row 2 `right` (the exact
horizontal mirror of row 1) and row 3 `up`. The mapping lives in
`assets/game/characters/character_1.json`; `templates/game/character-test.html.twig`
displays every row.

The three supplied sensei animation strips are kept in `art-src/raw/` as they
arrived (four frames on an opaque dark background). The versions in `art-src/`
have that background keyed out: `character_sensei_idle.png` keeps only the
front-facing frame, `character_sensei_talk.png` keeps its four frames, and the
four facing strips (`character_sensei_down.png`, `character_sensei_up.png`,
`character_sensei_left.png`, `character_sensei_right.png`) each keep two stride
frames from `character_sensei_sheet.png`. The maps select them with
`spriteIdle`, `spriteDown`, `spriteUp`, `spriteLeft`, `spriteRight` and
`spriteTalk`. `dojo.json` makes him pause and walk smoothly to random spots,
using the matching facing strip; talk is only played after a player interacts
with him.

The `cloths` interactable in `assets/game/maps/dojo.json` opens the skin shop.
All buyable skins and their prices are declared in
`assets/game/characters/character_1.json`: edit the `price` field on a variant
to change what the shop displays. `shop: false` hides the 16×20 size variant
from the grid while keeping it available to the character descriptor.
