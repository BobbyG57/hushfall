#!/bin/bash
# Double-click to make (or refresh) the Blender files for Hushfall's world, then open their folder:
#   blender/Kit.blend           the building pieces, to change or add to
#   blender/zones/<Zone>.blend  one file per zone: its terrain to sculpt, its places, a shelf of
#                               pieces to place from, and what you have placed there
# Double-click a zone file (or Kit.blend) to open it in Blender. Refreshing keeps what you have
# placed and any zone with sculpting that is not in the game yet.
cd "$(dirname "$0")/.."
BLENDER=/Applications/Blender.app/Contents/MacOS/Blender
if [ ! -x "$BLENDER" ]; then echo "Blender is not in Applications."; read -n 1 -p "Press any key to close."; exit 1; fi
echo "Getting the Blender files ready (about a minute)..."
"$BLENDER" --background --factory-startup --python-exit-code 1 --python tools/world/blender.py -- send 2>&1 | grep "made\|refreshed\|left as it is\|Made blender\|Error\|rror:"
open blender/zones
