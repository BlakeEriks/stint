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

# plutil reads JSON and ships with macOS, so this runs on a Mac with no
# developer tools — python3 there is a stub that prompts to install them.
json() { printf '%s' "$SESSION" | plutil -extract "$1" raw -o - - 2>/dev/null; }
json access_token >/dev/null || { echo "error: ${SESSION:0:200}" >&2; exit 1; }

# Namespaced by host, matching TokenStore.
HOST=$(printf '%s' "$URL" | sed -E 's#^[a-z]+://([^/:]+).*#\1#')
ACCOUNT="supabase@$HOST"
/usr/bin/security add-generic-password -U -s dev.stint.session -a "$ACCOUNT" -w "$SESSION"
echo "signed in as $(json user.email) ($ACCOUNT)"

# The app reads the Keychain once, at launch.
pkill -f 'Stint.app/Contents/MacOS/Stint' && while pgrep -f 'Stint.app/Contents/MacOS/Stint' >/dev/null; do sleep 0.2; done
open ~/Applications/Stint.app
