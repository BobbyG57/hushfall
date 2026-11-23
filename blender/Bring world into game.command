#!/bin/bash
# Double-click after saving your Blender files (Cmd+S). Brings your sculpting from every zone file,
# the pieces in Kit.blend and everything placed into the game, then rebuilds the world and checks
# that every waystone, shrine and camp can still be reached. Refresh the game afterwards.
cd "$(dirname "$0")/.."
BLENDER=/Applications/Blender.app/Contents/MacOS/Blender
echo "Reading the Blender files..."
"$BLENDER" --background --factory-startup --python-exit-code 1 --python tools/world/blender.py -- bring 2>&1 | grep "Terrain:\|Kit:\|left out\|Error\|rror:\|There are no"
if [ ${PIPESTATUS[0]} -ne 0 ]; then echo; echo "That did not work (see above)."; read -n 1 -p "Press any key to close."; exit 1; fi
echo; echo "Rebuilding the world..."
python3 tools/world/make_world.py
echo; echo "Done. Refresh the game to see your changes."
read -n 1 -p "Press any key to close."
