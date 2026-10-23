#!/bin/bash
# Stop JARVIS Server and stop it starting with the Mac. Your data stays in
# ~/Library/Application Support/JARVIS Server/data, so installing again picks up where it left off.
BASE="$HOME/Library/Application Support/JARVIS Server"
PLIST="$HOME/Library/LaunchAgents/com.jarvis.server.plist"
echo ""
launchctl bootout "gui/$(id -u)" "$PLIST" 2>/dev/null || launchctl unload "$PLIST" 2>/dev/null
rm -f "$PLIST"
rm -rf "$BASE/app" "$BASE/app.old" "$BASE/app.new"
echo "  JARVIS Server is stopped and will no longer start with this Mac."
echo "  Your data is kept in:  $BASE/data"
echo "  (Delete that folder too if you want everything gone.)"
echo ""; read -n 1 -s -r -p "  Press any key to close this window."; echo ""
