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
# the local stack. Prod's and preview's Supabase values are public — the publishable key ships in
# every browser bundle, and RLS is what protects the data.
NAME="Stint"
BUNDLE_ID="dev.stint.menubar"
EXTRA_ENV=""
ENV_LABEL="$TARGET"

if [ "$TARGET" = "prod" ]; then
    SUPABASE_URL="https://zwoceqydagxxmqoaqgbf.supabase.co"
    ANON_KEY="sb_publishable_dpZCXx5Z71lOUznVCIleJA__YjyUk4e"
    APP_URL="${STINT_APP_URL:-https://app.runstint.com}"
elif [ "$TARGET" = "preview" ]; then
    # One PR's Vercel preview and its seeded account on stint-test, signed in
    # on launch. `pnpm try-mac <pr>` supplies all three variables. Its own
    # name and bundle id, so it runs beside the installed Stint.app rather
    # than replacing it.
    PR="${STINT_PREVIEW_PR:?preview needs STINT_PREVIEW_PR — use pnpm try-mac <pr>}"
    SUPABASE_URL="https://aywejkegniljsljdzfrk.supabase.co"
    ANON_KEY="sb_publishable_q79gV5KhfKg05hZMjWVHsg_SqL2HPTH"
    APP_URL="${STINT_APP_URL:?preview needs STINT_APP_URL}"
    NAME="Stint Preview"
    BUNDLE_ID="dev.stint.menubar.preview"
    ENV_LABEL="PR $PR"
    # The password is `LOCAL_PASSWORD` in scripts/seed-account.mjs.
    EXTRA_ENV="
        <key>STINT_PREVIEW_EMAIL</key><string>pr-$PR@preview.test</string>
        <key>STINT_PREVIEW_PASSWORD</key><string>devpassword123</string>
        <key>STINT_VERCEL_BYPASS</key><string>${STINT_VERCEL_BYPASS:?preview needs STINT_VERCEL_BYPASS}</string>"
elif [ "$TARGET" != "local" ]; then
    echo "error: unknown target $TARGET — local, prod or preview" >&2; exit 1
fi

if [ "$TARGET" = "local" ]; then
    LS_ENVIRONMENT=""
else
    # Resolve it now rather than at the first request: a hostname that does
    # not resolve reaches the panel as "a server with the specified hostname
    # could not be found", which reads as a network fault.
    APP_HOST="${APP_URL#*://}"; APP_HOST="${APP_HOST%%/*}"
    if ! host "$APP_HOST" >/dev/null 2>&1; then
        echo "error: $APP_HOST does not resolve — the panel would report it as" >&2
        echo "       a missing server. Check the origin before bundling." >&2
        exit 1
    fi

    LS_ENVIRONMENT="    <key>LSEnvironment</key>
    <dict>
        <key>STINT_APP_URL</key><string>$APP_URL</string>
        <key>STINT_SUPABASE_URL</key><string>$SUPABASE_URL</string>
        <key>STINT_SUPABASE_ANON_KEY</key><string>$ANON_KEY</string>
        <key>STINT_ENV</key><string>$ENV_LABEL</string>$EXTRA_ENV
    </dict>"
fi

swift build -c "$CONFIG"

APP=".build/$NAME.app"
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS"

cp ".build/$CONFIG/Stint" "$APP/Contents/MacOS/Stint"
cat > "$APP/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleName</key><string>$NAME</string>
    <key>CFBundleIdentifier</key><string>$BUNDLE_ID</string>
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
INSTALLED="$HOME/Applications/$NAME.app"
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
