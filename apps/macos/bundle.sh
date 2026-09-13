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

# Sign with the local dev certificate when there is one.
#
# NOT what stops the Keychain password prompts — that was believed here for a
# while and it is wrong. The certificate stabilises the ACL, and the ACL was
# never the check that failed; the PARTITION LIST was, and macOS pins that to
# the caller's cdhash whenever there is no team identifier to use instead.
# `TokenStore.swift` explains it and carries the actual fix.
#
# What signing still buys: a stable identity for anything that keys off the
# designated requirement, and a bundle that is not ad-hoc. Optional — a fresh
# clone builds and runs without it. `./dev-certificate.sh` creates one.
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

# Sign AFTER copying, and sign the copy.
#
# Signing the build directory and then `cp -R`ing it left the installed app
# effectively unsigned, since copying does not reliably carry the seal. This
# was once billed as the Keychain fix; it was not, but signing the artefact
# that actually runs is still the correct order.
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
