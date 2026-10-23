#!/bin/bash
# Show a new code for signing in to JARVIS Server from another computer (it works once, for 10 minutes).
BASE="$HOME/Library/Application Support/JARVIS Server"
NODE="$(command -v node 2>/dev/null)"
for n in /usr/local/bin/node /opt/homebrew/bin/node; do [ -z "$NODE" ] && [ -x "$n" ] && NODE="$n"; done
echo ""
if [ -z "$NODE" ] || [ ! -f "$BASE/app/src/server/server.mjs" ]; then
  echo "  JARVIS Server isn't installed on this Mac. Double-click \"Install JARVIS Server\" first."
else
  "$NODE" "$BASE/app/src/server/server.mjs" pair
fi
echo ""; read -n 1 -s -r -p "  Press any key to close this window."; echo ""
