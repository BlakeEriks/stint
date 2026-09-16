#!/bin/bash
# Sign the menu bar app in from a magic-link URL.
#
# The panel takes a six-digit code, which only `supabase/templates/
# magic_link.html` renders — and a hosted project cannot read that file, nor
# can its template be edited without custom SMTP. The default email sends the
# same OTP as a hashed token in the link instead.
#
# So: paste the link, and this verifies that token and writes the session
# into the Keychain slot the installed app reads. `docs/setup.md` §4a has
# the permanent fix.
set -euo pipefail

APP="$HOME/Applications/Stint.app/Contents/Info.plist"
[ -f "$APP" ] || { echo "error: no installed app — run ./bundle.sh first" >&2; exit 1; }

plist() { /usr/libexec/PlistBuddy -c "Print :LSEnvironment:$1" "$APP" 2>/dev/null || true; }
URL="$(plist STINT_SUPABASE_URL)"; URL="${URL:-http://localhost:54321}"
KEY="$(plist STINT_SUPABASE_ANON_KEY)"
[ -n "$KEY" ] || { echo "error: no anon key in the bundle — rebuild with a target" >&2; exit 1; }

LINK="${1:-}"
[ -n "$LINK" ] || { read -r -p "Paste the sign-in link: " LINK; }

# The token is the OTP's hash; `type` says which flow issued it.
TOKEN=$(printf '%s' "$LINK" | sed -n 's/.*[?&]token=\([^&]*\).*/\1/p')
TYPE=$(printf '%s' "$LINK" | sed -n 's/.*[?&]type=\([^&]*\).*/\1/p')
[ -n "$TOKEN" ] || { echo "error: no token= in that link (a code= link is PKCE and cannot be used here)" >&2; exit 1; }

SESSION=$(curl -s -X POST "$URL/auth/v1/verify" \
    -H "apikey: $KEY" -H "Content-Type: application/json" \
    -d "{\"type\":\"${TYPE:-magiclink}\",\"token_hash\":\"$TOKEN\"}")

python3 - "$SESSION" "$URL" <<'PY'
import json, subprocess, sys, urllib.parse
session, url = sys.argv[1], sys.argv[2]
try:
    data = json.loads(session)
except json.JSONDecodeError:
    sys.exit(f"error: unreadable response: {session[:200]}")
if "access_token" not in data:
    sys.exit(f"error: {data.get('msg') or data.get('error_description') or data}")

# Namespaced by host, matching TokenStore.
account = "supabase@" + (urllib.parse.urlparse(url).hostname or "unknown")
subprocess.run(
    ["/usr/bin/security", "add-generic-password", "-U",
     "-s", "dev.stint.session", "-a", account, "-w", json.dumps(data)],
    check=True,
)
print(f"signed in as {data.get('user', {}).get('email')} ({account})")
PY

echo "restart the app to pick it up:"
echo "  pkill -f 'Stint.app/Contents/MacOS/Stint'; open ~/Applications/Stint.app"
