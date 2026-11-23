# Hushfall: Blade of the Kith

An original 3D action-adventure that runs in your browser. Fast lock-on sword
combat with dodges and parries, elemental creatures (Kith) you tame and fight
beside, an open valley with five biomes, five shrines with bosses, and an
endless Abyss for when the story is done.

## Play online

**https://bobbyg57.github.io/hushfall/**

Open that link in a browser on any computer (Chrome works best), connect a
controller or use the keyboard, and click the page once to switch sound on.
Progress is saved in each browser separately, so every device has its own save.

## Moving your save to another device

Saves live in each browser, so they do not follow you automatically. To carry
one across: choose **Transfer save** (title screen or pause menu), copy the
transfer link, and send it to yourself. Opening that link on the other device
offers to load the save there. You can also paste a link or code into the
Transfer save screen on the title menu.

## Play from this folder

1. Connect your Xbox controller (Bluetooth or USB).
2. Double-click **Play Hushfall.command**. It opens the game in your browser.
   (Chrome works best. Or run `python3 server.py` and open http://localhost:8765)
3. Click the game window once so the browser switches sound on.
4. For fullscreen, press Ctrl+Cmd+F in the browser.

Your progress saves in the browser, at Waystones and automatically as you
explore. Add `?slot=name` to the address for a second save file.

## Controls

| Action | Xbox controller | Keyboard and mouse |
| --- | --- | --- |
| Move | Left stick | WASD |
| Zoom (Classic view) | Right stick up / down | Up / Down arrows |
| Look around (Free camera view) | Right stick | Mouse (click the game first) or arrows |
| Jump, interact | A | Space |
| Dodge | B | Shift |
| Light attack | X | J or left click |
| Heavy attack (hold to charge) | Y | K or right click |
| Guard, tap to parry | LB | Q |
| Kith Bond Art | RB | E |
| Lock on (flick right stick to switch) | LT | Tab or C |
| Bond Rite / Unison Burst | RT | R |
| Drink a Dewdrop | D-pad up | F |
| Swap Kith | D-pad left / right | Z / X |
| Menu / map | Menu / View | Esc or P / M |

## Make it your own

The default view is a fixed high-angle camera; the over-the-shoulder camera is
under Menu, Status, View. Menu, Status, Look switches to a felt stop-motion look
(a prototype). To add your own 3D models (for example from Blender),
sprites, ground textures, colours and title, and to find where names, dialogue
and stats live, see [CUSTOMIZE.md](CUSTOMIZE.md). The hero is a 3D model made
in Blender; add `?art=none` to the address to see the original blocky hero.

## Things worth knowing

- Your blade takes on the element of the Kith beside you. Ember burns Verdant,
  Verdant grounds Storm, Storm shocks Tide, Tide douses Ember. Gloam cuts, and
  is cut by, everything.
- To tame a wild Kith: get it below half health, then press RT and land the
  ring timing. The weaker it is, the bigger the target. It costs a Bond Thread.
- Dodging through an attack at the last instant, or tapping guard just before
  it lands, opens enemies up. Shielded Warders need a heavy attack or a flank.
- Spend Skill Sigils (from levels, Echo Shards and Hush Rifts) in the menu to
  unlock new sword moves. Spend Motes at the smith in Lanternrest.
- Each shrine's relic opens the next mountain pass and grants a new ability.
- After the Shrine of Cinders, the village well leads to the Abyss: endless
  floors, a boon after each one, and a boss every fifth.

## Files

- `index.html`, `style.css`: the page and HUD styling.
- `src/`: the game, as plain JavaScript modules (no build step).
- `assets/`: your own art goes here (see CUSTOMIZE.md). `assets/models/hero.glb`
  is the hero, and `assets/example/` holds a sample sprite.
- `blender/`: the hero's Blender file and the script that builds it,
  `Kit.blend` (the building pieces), and the two double-click files that make a
  Blender file for each zone and bring your work back (see CUSTOMIZE.md,
  section 5).
- `assets/world/`: the shape of the valley (heights, roads, regions), made by
  `tools/world/make_world.py`, plus your sculpting and the pieces placed in
  Blender. `assets/models/kit/`: those pieces. `assets/textures/ground/`: the
  painted ground, made by `tools/textures/paint_ground.py`.
- `vendor/`: the three.js renderer and its model loader (MIT licence).
- `server.py`: a tiny local web server (localhost only).
