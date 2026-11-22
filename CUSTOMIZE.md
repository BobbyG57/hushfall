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

Put image files and 3D models in the `assets/` folder and list them in
`assets/art.json`. Anything you do not list keeps its built-in look, so you can
go one character at a time.

To see a working example, add `?art=example` to the address
(for instance `http://localhost:8765/?art=example`). That loads
`assets/art.example.json`, which swaps in the sample hero and ground tile from
`assets/example/`. Copy the parts you want from it into `art.json` (which
already lists the hero model, see 3D models below).

```json
{
  "title": "MY GAME",
  "subtitle": "A subtitle",
  "models": {
    "player":         { "file": "models/hero.glb", "height": 2 },
    "kith.cinderpup": { "file": "models/cinderpup.glb" }
  },
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

### 3D models (for example from Blender)

A model replaces a character's built-in look the same way a sprite does, using
the same names (`player`, `kith.mossling`, `enemy.husk`, `boss.ghorn`,
`npc.elder` and so on). If a character has both, the model wins.

The hero you play is one: `assets/art.json` lists `models/hero.glb`, made in
Blender. Its source is `blender/hero.blend`: open it in Blender to see how it
is put together, or change it and export again. To compare with the original
blocky hero, add `?art=none` to the address (`http://localhost:8765/?art=none`),
which skips `art.json` entirely. To go back to it for good, delete the
`"models"` part of `art.json`.

| Setting | What it does |
| --- | --- |
| `file` | Model path inside `assets/`, a `.glb` file (or `.gltf`). |
| `height` | Height in the world. The model is scaled to fit, with its feet on the ground, so the size you build it at does not matter. The hero is about 2. |
| `hover` | Lifts the model off the ground, for flyers. |
| `turn` | Degrees to turn the model if it does not face forward in the game. |
| `speed` | Speeds up (above 1) or slows down (below 1) all its animations. |
| `clips` | Picks animations by name for particular moves, for example `{ "h1": "BigSwing" }`. The move names are in the first column of the table below (`idle`, `run`, `air`, `h1`, `h2`, `v`, `spin`, `thrust`, `atk`, `charge`, `cast`, `guard`, `dodge`, `hurt`, `dead`, `drink`). |
| `blade` | `false` hides the floating sword a hero model gets when it has no sword of its own. |
| `tint` | `false` stops enemies from being tinted by their element. |

**Making one in Blender**

1. Build the character facing you in Front view (numpad 1), standing on the
   ground at the centre of the scene.
2. Colour it with materials. Plain colours and image textures both carry over;
   the game draws them in its own matte style so they match the world.
3. To animate it, rig it with an armature and make one action per move, named
   as in the table below. Anything without an animation gets a simple lean,
   bob or fall instead, so a model with no animations at all still works.
4. Choose File, Export, glTF 2.0. Set Format to **glTF Binary (.glb)** and,
   under Animation, set Mode to **Actions**. Save it in `assets/models/`.
5. Add it under `"models"` in `assets/art.json` and refresh the game.

**Animation names the game looks for** (capitals and spaces do not matter):

| Move | Names, first match wins |
| --- | --- |
| `idle`: standing still (loops) | Idle, Stand |
| `run`: moving (loops, faster at full speed) | Run, Walk |
| `air`: jumping or falling | Jump, Fall |
| `h1`, `h2`, `v`: light combo hits 1, 2 and 3 | Slash; Slash2; Overhead (each falls back to Attack) |
| `spin`, `thrust`: the finisher and the heavy attack | Spin; Thrust (fall back to Attack) |
| `charge`: holding the heavy attack | Charge |
| `guard`, `dodge` | Guard or Block; Dodge, Roll or Dash |
| `hurt`, `dead` | Hurt or Hit; Die or Death |
| `drink`: drinking a Dewdrop | Drink |
| `atk`, `cast`: enemy and Kith attacks and spells | Attack or Bite; Cast or Roar |

Attack animations play in step with the swing itself: the first frame is the
wind-up and the last frame is the follow-through. Other moves play once and
hold their last frame until the move ends. Idle and Run loop.

**The hero's sword.** Give the blade its own material named `Blade` and it
glows with the element of your Kith, as the built-in sword does. Add two
empties named `BladeBase` and `BladeTip` at the two ends of the blade, parented
to the sword (or the hand bone), and the sword trail follows them. Without
those empties the hero gets the same floating sword that sprites use.

**The sample hero is built by a script.** `blender/make_hero.py` makes the
whole model, rig and animations, then writes `blender/hero.blend` and
`assets/models/hero.glb`. To rebuild it (Blender does not need to be open):

```bash
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python blender/make_hero.py
```

Running the script replaces `hero.blend`, so once you start changing the model
by hand in Blender, export from Blender instead of running the script again.

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

These need a little code first, so ask for them when you want them: your own
trees, rocks and buildings (as 3D models or sprites), a different ground
texture for each area, music or sound files, and creature portraits in the
menus.

## 5. Seeing your changes

Run the game from this folder (double-click `Play Hushfall.command`) and refresh
the page after each change. The live link only changes when the folder is
pushed to GitHub:

```bash
git add -A && git commit -m "My art" && git push
```
