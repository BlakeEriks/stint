#!/bin/bash
# Wrap the SwiftPM binary in a .app.
#
# A menu bar app needs `LSUIElement` (no Dock icon, no menu bar of its own)
# and AppKit will not honour it from a bare executable — it has to read it
# from a bundle's Info.plist. Unsigned, so this is for running it yourself;
# distribution needs a Developer ID and notarisation.
set -euo pipefail
cd "$(dirname "$0")"

CONFIG="${1:-release}"
TARGET="${2:-local}"

# Where this bundle points. An LSUIElement app launched by `open` inherits
# Finder's environment, not a shell's, so exporting STINT_* before `open` is
# silently ignored — the values have to be baked into Info.plist.
#
# Local is the default and needs no keys: Config.swift already falls back to
# the local stack.
if [ "$TARGET" = "local" ]; then
    LS_ENVIRONMENT=""
else
    ENV_FILE="../web/.env.local"
    [ -f "$ENV_FILE" ] || { echo "error: $ENV_FILE not found" >&2; exit 1; }

    # Read straight out of the file rather than sourcing it: `.env.local`
    # also holds SUPABASE_DB_URL, a secret this bundle must never carry, and
    # sourcing would run whatever the file contains.
    value_of() {
        local line
        line=$(grep -m1 "^$1=" "$ENV_FILE") || return 1
        printf '%s' "${line#*=}" | tr -d '"'"'"'\r'
    }

    SUPABASE_URL=$(value_of NEXT_PUBLIC_SUPABASE_URL) \
        || { echo "error: NEXT_PUBLIC_SUPABASE_URL missing from $ENV_FILE" >&2; exit 1; }
    ANON_KEY=$(value_of NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) \
        || { echo "error: NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY missing from $ENV_FILE" >&2; exit 1; }
    # `.env.example` says to leave NEXT_PUBLIC_APP_ORIGIN empty locally — it
    # is set in the deployment — so an override is usually how this is
    # supplied. Never guess a hostname: one that does not resolve reaches the
    # panel as "a server with the specified hostname could not be found",
    # which reads as a network fault rather than as a build that was told
    # where to point.
    APP_URL="${STINT_APP_URL:-$(value_of NEXT_PUBLIC_APP_ORIGIN || true)}"
    if [ -z "$APP_URL" ]; then
        echo "error: no app origin. Add NEXT_PUBLIC_APP_ORIGIN to $ENV_FILE," >&2
        echo "       or pass it: STINT_APP_URL=https://<host> $0 $CONFIG $TARGET" >&2
        exit 1
    fi

    # Resolve it now rather than at the first request.
    APP_HOST="${APP_URL#*://}"; APP_HOST="${APP_HOST%%/*}"
    if ! host "$APP_HOST" >/dev/null 2>&1; then
        echo "error: $APP_HOST does not resolve — the panel would report it as" >&2
        echo "       a missing server. Check the origin before bundling." >&2
        exit 1
    fi

    case "$SUPABASE_URL" in
        *localhost*|*127.0.0.1*)
            echo "error: $ENV_FILE points at localhost — nothing to target" >&2; exit 1 ;;
    esac

    LS_ENVIRONMENT="    <key>LSEnvironment</key>
    <dict>
        <key>STINT_APP_URL</key><string>$APP_URL</string>
        <key>STINT_SUPABASE_URL</key><string>$SUPABASE_URL</string>
        <key>STINT_SUPABASE_ANON_KEY</key><string>$ANON_KEY</string>
        <key>STINT_ENV</key><string>$TARGET</string>
    </dict>"
fi

swift build -c "$CONFIG"

APP=".build/Stint.app"
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS"

cp ".build/$CONFIG/Stint" "$APP/Contents/MacOS/Stint"
cat > "$APP/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleName</key><string>Stint</string>
    <key>CFBundleIdentifier</key><string>dev.stint.menubar</string>
    <key>CFBundleExecutable</key><string>Stint</string>
    <key>CFBundlePackageType</key><string>APPL</string>
    <key>CFBundleShortVersionString</key><string>0.1.0</string>
    <key>LSMinimumSystemVersion</key><string>14.0</string>
    <!-- The whole point: menu bar only, no Dock icon. -->
    <key>LSUIElement</key><true/>
${LS_ENVIRONMENT:+$LS_ENVIRONMENT}
</dict>
</plist>
PLIST

# Sign with the local dev certificate when there is one, giving the bundle one
# stable designated requirement instead of an ad-hoc identity derived from its
# own bytes. Optional: a fresh clone builds and runs without it.
# `./dev-certificate.sh` creates one.
#
# It does NOT stop the Keychain password prompts — see `TokenStore.swift`.
echo "built $APP ($TARGET)"

# Install, because a URL scheme only resolves from a real Applications folder.
#
# LaunchServices registers the scheme from a build directory — `lsregister
# -dump` even shows the claim — and then refuses to open it, so the link
# silently does nothing. Tested: identical bundle, `/tmp` fails and
# ~/Applications works.
#
# Always overwritten, so the installed copy cannot drift from the built one.
INSTALLED="$HOME/Applications/Stint.app"
mkdir -p "$HOME/Applications"
rm -rf "$INSTALLED"
cp -R "$APP" "$INSTALLED"

# Sign AFTER copying, and sign the copy: `cp -R` does not reliably carry the
# seal, so signing the build directory leaves the installed app unsigned.
IDENTITY="Stint Local Dev"
if security find-identity -v -p codesigning 2>/dev/null | grep -q "$IDENTITY"; then
    codesign --force --deep --sign "$IDENTITY" "$INSTALLED" 2>/dev/null \
        && echo "signed with \"$IDENTITY\"" \
        || echo "warning: signing failed"
else
    echo "unsigned (ad-hoc) — ./dev-certificate.sh gives it a stable identity"
fi

"/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister" \
    -f "$INSTALLED"

echo "installed $INSTALLED"
echo "run it with: open \"$INSTALLED\""
echo "pointing at: $TARGET"
