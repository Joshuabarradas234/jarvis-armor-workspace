#!/bin/bash
# Installs JARVIS Server from the built zip exactly as the owner does (the Install .command), on a GitHub macOS runner,
# then checks launchd runs it, it keeps running, it shows a pairing code, and Uninstall stops it again.
# Run after scripts/release/build-server.mjs.   bash tests/mac/server-install.sh
set -u
ZIP="$(ls release/JARVIS-Server-*-mac.zip | head -1)"
WORK="$(mktemp -d)"; BASE="$HOME/Library/Application Support/JARVIS Server"
fail=0; ok() { if [ "$1" = 0 ]; then echo "  ✔ $2"; else echo "  ✘ $2"; echo "::error::$2"; fail=1; fi; }
echo "JARVIS Server install on $(sw_vers -productName) $(sw_vers -productVersion) ($(uname -m)), Node $(node -v):"
ditto -x -k "$ZIP" "$WORK"; ok $? "the zip unpacks"
[ -x "$WORK/JARVIS Server/Install JARVIS Server.command" ]; ok $? "the installer is executable after unzipping"
"$WORK/JARVIS Server/Install JARVIS Server.command" < /dev/null > "$WORK/install.txt" 2>&1; ok $? "the installer finishes without an error"
cat "$WORK/install.txt"
grep -q "Pairing code:" "$WORK/install.txt"; ok $? "it shows a pairing code"
launchctl print "gui/$(id -u)/com.jarvis.server" > /dev/null 2>&1; ok $? "launchd has the JARVIS Server agent"
PID="$(cat "$BASE/data/server.pid" 2>/dev/null)"; kill -0 "$PID" 2>/dev/null; ok $? "the server is running (process ${PID:-none})"
sleep 8; kill -0 "$PID" 2>/dev/null; ok $? "and is still running a few seconds later"
grep -q '"JARVIS Core started' "$BASE/data/jarvis.log"; ok $? "JARVIS Core started"
! grep -q '"kind":"crash"' "$BASE/data/jarvis.log"; ok $? "nothing logged as a crash"
"$WORK/JARVIS Server/Pair a device.command" < /dev/null > "$WORK/pair.txt" 2>&1; grep -q "Pairing code:" "$WORK/pair.txt"; ok $? "Pair a device shows a new code"
kill "$PID" 2>/dev/null; sleep 15; NEW="$(cat "$BASE/data/server.pid" 2>/dev/null)"; [ -n "$NEW" ] && [ "$NEW" != "$PID" ] && kill -0 "$NEW" 2>/dev/null; ok $? "if it stops, launchd starts it again"
"$WORK/JARVIS Server/Uninstall JARVIS Server.command" < /dev/null > /dev/null 2>&1
sleep 2; ! launchctl print "gui/$(id -u)/com.jarvis.server" > /dev/null 2>&1; ok $? "Uninstall stops it and removes the agent"
[ -d "$BASE/data" ]; ok $? "Uninstall keeps the data"
echo "--- what the server logged:"; tail -n 25 "$BASE/data/jarvis.log" 2>/dev/null
exit $fail
