#!/bin/bash
# Double-click to open Hushfall's world in Blender: the terrain to sculpt, the places from the game
# for reference, a shelf of building pieces (the Kit) and the pieces you have set out (Placed).
# The first time, this makes blender/world.blend. After that it refreshes the terrain and places in
# it (keeping your Kit and Placed), unless you have sculpting that is not in the game yet.
cd "$(dirname "$0")/.."
BLENDER=/Applications/Blender.app/Contents/MacOS/Blender
if [ ! -x "$BLENDER" ]; then echo "Blender is not in Applications."; read -n 1 -p "Press any key to close."; exit 1; fi
echo "Getting the world ready for Blender..."
"$BLENDER" --background --factory-startup --python-exit-code 1 --python tools/world/blender.py -- send 2>&1 | grep -v "^$\|^Blender \|^Blender quit\|DeprecationWarning\|use_nodes"
open -a Blender blender/world.blend
