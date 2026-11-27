# Game art sources

Original PNG files live here. They are **not served**: `art-src/` is outside
`public/`, so Apache never exposes it.

Drop the files with the exact target names, then run:

```powershell
python tools/convert-art.py
```

The script writes the WebP versions to:

- `public/game/maps/` for every PNG except `character_*`
- `public/game/sprites/` for `character_*` PNGs

Expected files:

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
| `world.png` | `public/game/maps/world.webp` |
| `character_1_32x32.png` | `public/game/sprites/character_1_32x32.png` (copied as-is) |
| `character_1_16x20.png` | `public/game/sprites/character_1_16x20.png` (copied as-is) |
