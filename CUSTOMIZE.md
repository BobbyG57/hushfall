# Making Hushfall your own

Everything here is optional. The game runs as-is, and each piece you add
replaces one built-in piece.

## 1. How the look is set up

- **Classic view** (the default): a fixed high-angle camera looking north, with
  a narrow lens and the world fading out a short way past the top of the screen.
  Right stick up / down (or the arrow keys) zooms.
- **Free camera**: the over-the-shoulder view. Switch under Menu, Status, View.
- The numbers live in `src/main.js` in one line:
  `const CLASSIC = { pitch: 0.9, fov: 36, zoom: 30, zoomMin: 22, zoomMax: 44 }`.
  Raise `pitch` (up to about 1.3) for more top-down, lower it for more side-on.
  Lower `fov` for a flatter, more "2D" feel.

## 2. Your own art: `assets/art.json`

Put image files in the `assets/` folder and list them in `assets/art.json`.
Anything you do not list keeps its built-in look, so you can go one character
at a time.

To see a working example, add `?art=example` to the address
(for instance `http://localhost:8765/?art=example`). That loads
`assets/art.example.json`, which swaps in the sample hero and ground tile from
`assets/example/`. Copy that file over `art.json` as a starting point.

```json
{
  "title": "MY GAME",
  "subtitle": "A subtitle",
  "sprites": {
    "player":         { "file": "hero.png", "frames": 4, "rows": 4, "height": 2.1 },
    "kith.mossling":  { "file": "mossling.png", "frames": 2, "rows": 1, "faces": "right" },
    "enemy.husk":     { "file": "husk.png", "frames": 4, "rows": 4 },
    "npc.elder":      { "file": "elder.png" }
  },
  "ground": { "file": "grass.png", "size": 3 },
  "floor":  { "file": "dungeon.png", "size": 4 },
  "biomes": { "meadow": { "g1": "#5fb24a", "g2": "#93d066" } }
}
```

### Character sprite sheets

A sheet is a grid of equal-sized cells on a transparent background. Any cell
size works (the sample uses 64 x 64).

```
            frame 1   frame 2   frame 3   frame 4     <- walk cycle; frame 1 is also standing still
  row 1     facing down  (toward the camera)
  row 2     facing left
  row 3     facing right
  row 4     facing up    (away from the camera)
```

| Setting | What it does |
| --- | --- |
| `file` | Image path inside `assets/` (png, jpg, webp or gif). |
| `frames` | Columns in the sheet. `1` for a single still image. |
| `rows` | `4` for the four facings above, or `1` for a single facing. |
| `faces` | With `"rows": 1`, set `"right"` if the art faces right, and it is mirrored when moving left. |
| `height` | Height in the world. The hero is about 2. Leave out for a sensible default. |
| `fps` | Walk animation speed (default 8). |
| `hover` | Lifts the sprite off the ground, for flyers. |
| `smooth` | `true` for painted or high-resolution art. Leave out for crisp pixel art. |

Names you can use under `"sprites"`:

- **Hero:** `player`
- **Villagers:** `npc.elder`, `npc.smith`, `npc.merchant`, `npc.keeper`
- **Kith:** `kith.` plus one of `mossling`, `thornback`, `bloomstag`, `cinderpup`,
  `magmole`, `pyrewing`, `puddlefin`, `shellgar`, `mistray`, `voltkit`, `galehawk`,
  `thunderam`, `duskmoth`, `umbrafox`. Add `.evo` for the evolved form
  (for example `kith.mossling.evo`); without it the base sprite is shown larger.
- **Enemies:** `enemy.husk`, `enemy.skitter`, `enemy.spitter`, `enemy.brute`,
  `enemy.warder`, `enemy.wraith`. They are tinted slightly by their element.
- **Bosses:** `boss.ghorn`, `boss.cindermaw`, `boss.brine`, `boss.skarn`, `boss.king`

Sprites get a soft shadow automatically, flash when hit, and tip over when
defeated. The hero's sword swing and trail are drawn for you, so the hero sheet
only needs walking frames.

### Ground and dungeon floor

`ground` covers the whole outdoor world and `floor` covers shrine rooms. Use an
image that repeats seamlessly. `size` is how many world units one copy covers
(the hero is about 2 units tall). Keep the ground image light: each area's
colours are laid over it, so a pale texture picks up the green of the meadow,
the red of Emberridge, and so on.

### Colours

Under `"biomes"`, any of `meadow`, `ember`, `tide`, `storm`, `gloam` can set:
`g1` and `g2` (the two ground colours that are blended), `rock`, `grass`, `fog`,
`skyTop`, `sun`. Use `"#rrggbb"` values.

## 3. Words, names and numbers

All in `src/data.js`, in plain lists near the top of each section:

- `KITH`: each creature's name, evolved name, description, element, power, and
  Bond Art. The `m` part is the recipe for its built-in model (body type,
  colours `c1` `c2` `c3`, ears, tail, horns), so you can restyle a creature
  without drawing anything.
- `ENEMY` and `BOSS`: names, health, damage, speed.
- `TALK`, `QUESTS`, `TIPS`: all dialogue, objectives and hints.
- `BIOME`: area names and subtitles. `NPCS`: villager names and outfit colours.
- `SKILLS`, `ARTS`, `BOONS`: names and descriptions.

Elsewhere:

- **Menus and HUD colours and fonts:** the `:root` block at the top of `style.css`.
- **The built-in hero's outfit colours:** `makePlayerModel` in `src/models.js`.
- **Music:** the `MOODS` table in `src/audio.js` (key, scale and tempo for each
  area). Sound effects are the `SFX` table just above it.

## 4. Not swappable yet

These need a little code first, so ask for them when you want them: 3D model
files (for example `.glb` from Blender), your own trees, rocks and buildings,
a different ground texture for each area, music or sound files, and creature
portraits in the menus.

## 5. Seeing your changes

Run the game from this folder (double-click `Play Hushfall.command`) and refresh
the page after each change. The live link only changes when the folder is
pushed to GitHub:

```bash
git add -A && git commit -m "My art" && git push
```
