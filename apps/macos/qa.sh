#!/bin/bash
# The panel in an ordinary window, for QA without the menu bar.
#
#   ./qa.sh                   build, then (re)launch the windowed debug build
#   ./qa.sh shot [file]       screenshot its window without focusing it
#   ./qa.sh ids               the controls on screen, by identifier
#   ./qa.sh click <id>        press one
#   ./qa.sh type <id> <text>  fill a field and submit it
#
# It runs the debug build, never ~/Applications/Stint.app, so the installed
# menu bar app keeps running. It points at the local stack, takes no focus,
# and is driven through accessibility (`qa.swift`), so nothing moves the
# mouse. Identifiers are each control's `.accessibilityIdentifier`.
set -euo pipefail
cd "$(dirname "$0")"

# The pid of the copy this script launched, never a pattern match: `pgrep`
# would also catch the test runner under the same .build/debug.
PIDFILE=".build/qa.pid"
PID=$(cat "$PIDFILE" 2>/dev/null || true)
[ -n "$PID" ] && ! kill -0 "$PID" 2>/dev/null && PID=""

if [ $# -gt 0 ]; then
    [ -n "$PID" ] || { echo "error: not running — ./qa.sh first" >&2; exit 1; }
    if [ "$1" = "shot" ]; then
        OUT="${2:-${TMPDIR:-/tmp}/stint-qa.png}"
        WID=$(swift qa.swift "$PID" window)
        screencapture -x -o -l "$WID" "$OUT"
        echo "$OUT"
    else
        swift qa.swift "$PID" "$@"
    fi
    exit 0
fi

swift build
[ -n "$PID" ] && kill "$PID"
STINT_WINDOW=1 nohup .build/debug/Stint >/dev/null 2>&1 &
echo $! > "$PIDFILE"
echo "running pid $!"
