# Hushfall: Blade of the Kith

An original 3D action-adventure that runs in your browser. Fast lock-on sword
combat with dodges and parries, elemental creatures (Kith) you tame and fight
beside, an open valley with five biomes, five shrines with bosses, and an
endless Abyss for when the story is done.

## How to play

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
| Move / camera | Left stick / right stick | WASD / mouse (click the game first) or arrows |
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
- `vendor/`: the three.js renderer (MIT licence).
- `server.py`: a tiny local web server (localhost only).
