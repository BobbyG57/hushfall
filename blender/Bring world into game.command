#!/bin/bash
# Double-click after saving blender/world.blend in Blender (Cmd+S). Brings your sculpting, your Kit
# pieces and everything in Placed into the game, then rebuilds the world and checks that every
# waystone, shrine and camp can still be reached. Refresh the game afterwards to see it.
cd "$(dirname "$0")/.."
BLENDER=/Applications/Blender.app/Contents/MacOS/Blender
echo "Reading blender/world.blend..."
"$BLENDER" --background --factory-startup --python-exit-code 1 --python tools/world/blender.py -- bring 2>&1 | grep "Terrain:\|Kit:\|left out\|Error\|rror:\|There is no\|has no object"
if [ ${PIPESTATUS[0]} -ne 0 ]; then echo; echo "That did not work (see above)."; read -n 1 -p "Press any key to close."; exit 1; fi
echo; echo "Rebuilding the world..."
python3 tools/world/make_world.py
echo; echo "Done. Refresh the game to see your changes."
read -n 1 -p "Press any key to close."
