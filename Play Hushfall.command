#!/bin/bash
# Double-click to play Hushfall. Starts a tiny local web server and opens the game in your browser.
cd "$(dirname "$0")"
PORT=8765
if ! lsof -i tcp:$PORT >/dev/null 2>&1; then
  python3 server.py $PORT &
  SERVER=$!
  sleep 0.8
fi
open "http://localhost:$PORT/"
echo "Hushfall is running at http://localhost:$PORT"
echo "Leave this window open while you play. Close it (or press Ctrl+C) to stop."
[ -n "$SERVER" ] && wait $SERVER
