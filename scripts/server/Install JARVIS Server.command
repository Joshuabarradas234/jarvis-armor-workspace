#!/bin/bash
# Install JARVIS Server on this Mac: JARVIS's brain, running in the background, started whenever the Mac starts.
# It copies itself into ~/Library/Application Support/JARVIS Server/app (your data stays in .../data), registers a
# launchd agent (com.jarvis.server) and shows the code to sign in from the ZenBook. Running it again updates it.
cd "$(dirname "$0")" || exit 1
HERE="$(pwd)"
BASE="$HOME/Library/Application Support/JARVIS Server"
PLIST="$HOME/Library/LaunchAgents/com.jarvis.server.plist"
bye() { echo ""; read -n 1 -s -r -p "  Press any key to close this window."; echo ""; exit "$1"; }
echo ""
echo "  JARVIS Server: installing"
echo "  ==========================="

NODE="$(command -v node 2>/dev/null)"
for n in /usr/local/bin/node /opt/homebrew/bin/node; do [ -z "$NODE" ] && [ -x "$n" ] && NODE="$n"; done
if [ -z "$NODE" ]; then
  echo ""
  echo "  Node.js isn't installed yet. In Safari go to  nodejs.org/dist/latest-v22.x/"
  echo "  download node-v22 ... .pkg, install it, then double-click this file again."
  bye 1
fi
MAJOR="$("$NODE" -p 'process.versions.node.split(".")[0]' 2>/dev/null)"
if [ -z "$MAJOR" ] || [ "$MAJOR" -lt 22 ]; then
  echo ""
  echo "  This Mac has Node.js $("$NODE" -v 2>/dev/null), which is too old. Install node-v22 from"
  echo "  nodejs.org/dist/latest-v22.x/ (the .pkg), then double-click this file again."
  bye 1
fi

echo "  Copying JARVIS Server into place..."
mkdir -p "$BASE" || bye 1
rm -rf "$BASE/app.new" && mkdir -p "$BASE/app.new" && cp -R "$HERE/app/." "$BASE/app.new/" || { echo "  The files could not be copied."; bye 1; }
xattr -dr com.apple.quarantine "$BASE/app.new" 2>/dev/null
rm -rf "$BASE/app.old"; [ -d "$BASE/app" ] && mv "$BASE/app" "$BASE/app.old"
mv "$BASE/app.new" "$BASE/app" || bye 1

echo "  Setting it to start whenever this Mac starts..."
mkdir -p "$HOME/Library/LaunchAgents"
cat > "$PLIST" <<PLISTEOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.jarvis.server</string>
  <key>ProgramArguments</key>
  <array><string>$NODE</string><string>$BASE/app/src/server/server.mjs</string></array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>10</integer>
  <key>StandardOutPath</key><string>$BASE/server-output.log</string>
  <key>StandardErrorPath</key><string>$BASE/server-output.log</string>
  <key>EnvironmentVariables</key>
  <dict><key>PATH</key><string>/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin</string></dict>
</dict>
</plist>
PLISTEOF
launchctl bootout "gui/$(id -u)" "$PLIST" 2>/dev/null || launchctl unload "$PLIST" 2>/dev/null
sleep 1
launchctl bootstrap "gui/$(id -u)" "$PLIST" 2>/dev/null || launchctl load -w "$PLIST" || { echo "  macOS would not start it. Restart the Mac and double-click this file again."; bye 1; }

echo "  Starting..."
for i in 1 2 3 4 5 6 7 8 9 10; do sleep 1; [ -f "$BASE/data/server.pid" ] && break; done
if [ ! -f "$BASE/data/server.pid" ]; then
  echo ""
  echo "  JARVIS Server did not start. What it said:"
  tail -n 20 "$BASE/server-output.log" 2>/dev/null
  bye 1
fi
echo ""
echo "  JARVIS Server is running, and will start by itself whenever this Mac starts."
echo "  Keep Tailscale signed in on this Mac."
"$NODE" "$BASE/app/src/server/server.mjs" pair
bye 0
