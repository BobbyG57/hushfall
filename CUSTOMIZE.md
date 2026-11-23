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

### The felt look (a prototype)

A second look makes Vael into a stop-motion set made of felt. Switch it on under
Menu, Status, Look (the game saves and reloads), or add `?look=felt` to the
address (`?look=classic` goes back). It changes how things are drawn, not what
they are, so it works with everything, including your Blender pieces:

- Every surface gets felt fibres and broad felted patches, rounded soft shading,
  and a fuzzy sheen toward its edges. Tree canopies become clumps of wool balls
  in mixed greens and mustard, and grass becomes little felt tufts.
- Warm studio light, soft shadows and a hazy backdrop.
- The picture is finished like a photographed miniature: tilt-shift blur above
  and below the middle of the screen, warm grading, a vignette and film grain.
- Characters change pose twelve times a second, like puppets moved between
  photographs, while the camera and controls stay smooth.

The settings are in `src/felt.js`: the fibre texture and how strongly it shows
(`feltShader`), the wool colours (`WOOL`), the blur (`focusY`, `band`,
`amount`), the grading, and the frame rate of the poses (`step`, 1/12 of a
second).

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

The outdoor ground is painted with one texture per region, plus a cliff rock
used on steep slopes: `assets/textures/ground/meadow.jpg`, `ember.jpg`,
`tide.jpg`, `storm.jpg`, `gloam.jpg` and `cliff.jpg`. They were made by
`tools/textures/paint_ground.py` (run it again to repaint them, or change its
recipes). To use your own image for any of them, list it under
`"groundTextures"`:

```json
"groundTextures": { "meadow": { "file": "my-grass.png", "size": 7 }, "cliff": { "file": "my-rock.png" } },
"groundStrength": 1
```

Each image should repeat seamlessly. `size` is how many world units one copy
covers (the hero is about 2 units tall). The region's colours (see Colours
below) still set the overall colour; the texture adds its painted detail on top,
so any image works whatever its colours. `groundStrength` sets how strongly the
detail shows: 0 for none, 1 as made, up to 2.

An older option, `ground`, replaces all of that with one image for the whole
world, tinted by each area's colours. `floor` covers shrine rooms. For both,
`size` works as above.

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

## 4. The shape of the world

The valley's ground is made ahead of time by `tools/world/make_world.py` and
saved in `assets/world/`; the game just loads it. To change the land, change the
script and run it again (it takes about half a minute and needs Python with
numpy and Pillow, and Node):

```bash
python3 tools/world/make_world.py --preview /tmp/vael
```

How it builds the land: gradient noise, bent by domain warping so nothing lines
up, for rolling ground; a different shape for each region (meadow knolls, the
Emberridge volcano, the Mirrormere lake, Stormreach's stepped highland,
Gloamwood's ravines); then the mountain ranges between the regions, grown the
way real ones are: the ground along each range is pushed up (tectonic uplift)
while rivers cut it down, each river cutting harder the more ground drains into
it (the stream power law, solved with the method of Braun and Willett, 2013, as
in FastScape, in `tools/world/uplift.mjs`). Over a few hundred steps the rivers
branch back up into each range, leaving ridges, spurs, saddles and valleys
between them. After that come droplet erosion, where about 150,000 simulated
raindrops carve small gullies; a little thermal erosion, where rock steeper than
its natural angle slides down; ledges, the volcano's crater, level ground for
every place in `src/data.js`, and roads between them. The grid is 513 by 513
points, one every 1.25 units.

It also checks its own work and prints the results: that every waystone, shrine,
camp and grove can be reached on foot, and whether any range is gentle enough to
climb over. Places come from `src/data.js`, so moving a camp there and running
the script again reshapes the ground around it. `--preview` saves a coloured map
of the result to look at.

Each region is loaded as its own area. Walking far enough into a pass loads the
region on the other side, behind a short fade. The edge of each region runs
along the crests of its mountains: you can climb a range to the top, but not
down the far side (only the passes lead on).

## 5. Sculpting the world and building on it in Blender

You can reshape the land and set out buildings in Blender, then bring both back
into the game. The world is split into one Blender file per zone, so you can
work on one piece at a time, plus one file for the building pieces.

1. Double-click **Update Blender files.command** in the `blender` folder. It
   makes the files (about a minute the first time) and opens their folder:
   - `blender/zones/Lanternrest Meadow.blend`, `Emberridge.blend`,
     `Gloamwood.blend`, `Mirrormere.blend` and `Stormreach.blend`, one per zone.
   - `blender/Kit.blend`, the building pieces.
2. Double-click the zone you want to work on. Inside:
   - **Terrain**: the zone's ground, to sculpt. It is coloured by region (roads
     tan, rock grey, snow white). One Blender unit is one game unit (the hero is
     about 2 tall). North is up in Top view (numpad 7).
   - **Around (for reference)**: a darker ring of the neighbouring land, so you
     can see what the zone meets. You cannot select or change it here.
   - **Places**: an arrow for every waystone, shrine, camp, grove and rift in
     the zone, with its name. They are there so you know what not to bury;
     moving them does not move anything in the game (that is `src/data.js`).
   - **Kit shelf**: rows of pieces on a dark slab just outside the zone, to
     place from (the list is below).
   - **Placed**: the pieces set out in this zone. The meadow starts with a small
     chapel and graveyard east of Lanternrest and a farmstead to the west, to
     show how it works. Move them, delete them, or add your own.
3. Save (Cmd+S). Work on as many zones as you like, saving each.
4. Double-click **Bring world into game.command**. It reads every zone file and
   `Kit.blend`, rebuilds the world, and checks every place can still be reached.
   Refresh the game.

**No mouse?** On a Mac trackpad, two-finger dragging orbits the view, Shift with
two fingers pans, and pinching zooms. In Edit, Preferences, Input, turning on
Emulate 3 Button Mouse also lets Option and click-drag orbit. Press Home (or
View, Frame All) if you lose your place.

**Sculpting.** Select the zone's terrain, switch to Sculpt Mode, and use any
brush (Draw, Clay Strips, Smooth, Flatten, Scrape, Grab). The game keeps only
the up and down change, so a brush that drags ground sideways works, but what
counts is the new height at each point. Your sculpting is saved as
`assets/world/sculpt.bin`, a layer laid over the generated land, so it survives
the generator being run again. The road colours stay where the generator put
them, so if you raise a hill across a road, the road climbs it. If the check
after bringing it in says a place is unreachable, smooth the slope near it and
bring it in again. Zones meet along the region borders (mostly the mountain
crests). If you sculpt right up to a border, the next zone does not follow, so
smooth across it from that zone's file too. To throw all your sculpting away,
delete `assets/world/sculpt.bin` and the `blender/zones` folder, then run
Update Blender files again.

**Placing pieces.** Select a piece on the shelf, press Alt+D (or Shift+D), and
move the copy onto the terrain. Anything off the dark slab counts as placed,
whichever collection it is in (the Placed collection just keeps things tidy).
Turn a piece with R Z, and scale it with S. Each piece's origin (the small dot)
is its footing: in the game it stands on the ground at that point, at the same
height above or below the ground as in Blender, so pieces stay on the ground
even if you sculpt under them later.

**The pieces.** Fifty-three to start with:

| For | Pieces |
| --- | --- |
| Villages and farms | cottage, chapel, gravestone, grave_cross, fence, field, wheat, haystack, signpost, watchtower, well, lamp_post, cart, log_pile, tent, campfire |
| Trees and plants | oak_tree, pine_tree, birch_tree, bush, flower_patch, stump, fallen_log |
| Stones and ruins | crag, boulder, rock_pile, standing_stone, stone_circle, ruin_wall, ruined_arch, broken_pillar, stone_lantern |
| Water | wooden_bridge, stepping_stones, pond, lily_pads, reeds |
| Emberridge | charred_tree, lava_rock, basalt_columns, ember_vent |
| Gloamwood | glow_mushroom, mushroom_cluster, crystal_cluster, twisted_tree |
| Mirrormere | stilt_hut, palm_tree, driftwood, coral |
| Stormreach | windswept_pine, snowy_rock, storm_crystal, rune_stone |

Any piece works in any zone. Lily pads float where you put them, so set them
at the water's surface (height 0 in Blender). The hero walks over the ground,
not the bridge deck, so lay the bridge across a dip or a stream bed. New starter
pieces that come with later updates are added to the end of `Kit.blend`'s shelf
by Update Blender files; any you delete stay deleted.

**Changing a piece or making your own.** Do this in `Kit.blend`. Every object
in it is a piece, except the slab and the plain figure standing by for scale
(as tall as the hero). Edit a piece there and, after Update Blender files, every
copy of it in every zone changes too (in the game it changes as soon as you
bring the world back). For a new piece, build it with its origin at its base,
join its parts into one object (Ctrl+J), and give it a short name; that name is
the piece. It joins the shelf in every zone file the next time you run Update
Blender files. Colours come from its materials. A material with Emission turned
on (any strength) glows at night, like the windows. Pieces block your path by
their footprint. Two custom properties change that (Object properties, Custom
Properties): `solid` set to `0` lets the hero walk through (like the fields),
and `radius` blocks only a circle that wide round the origin instead, the way
the trees block at their trunks but not under their leaves.

**What is kept where.** The pieces are saved as `assets/models/kit/<name>.glb`,
where they stand as `assets/world/placed.json`, and your sculpting as
`assets/world/sculpt.bin`; those are what the game uses. `Kit.blend` is kept
with the game too. The zone files stay on this computer and can always be made
again: running Update Blender files refreshes each zone's terrain, places and
shelf (keeping what you placed), but leaves alone any zone with sculpting you
have not brought into the game yet. The script behind both double-click files
is `tools/world/blender.py`.

## 6. Not swappable yet

These need a little code first, so ask for them when you want them: your own
trees and rocks in place of the scattered built-in ones (buildings and other
pieces you place yourself already work, see section 5), music or sound files,
and creature portraits in the menus.

## 7. Seeing your changes

Run the game from this folder (double-click `Play Hushfall.command`) and refresh
the page after each change. The live link only changes when the folder is
pushed to GitHub:

```bash
git add -A && git commit -m "My art" && git push
```
