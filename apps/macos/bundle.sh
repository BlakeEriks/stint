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
</dict>
</plist>
PLIST

# Sign with the local dev certificate when there is one, giving the bundle one
# stable designated requirement instead of an ad-hoc identity derived from its
# own bytes. Optional: a fresh clone builds and runs without it.
# `./dev-certificate.sh` creates one.
#
# It does NOT stop the Keychain password prompts — see `TokenStore.swift`.
echo "built $APP"

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
