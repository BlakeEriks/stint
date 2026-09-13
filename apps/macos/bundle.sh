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
# Without it the bundle is signed AD-HOC, whose identity is the binary's own
# hash — so every rebuild is a different app to the Keychain, the ACL entry
# "Always allow" wrote no longer matches, and the password prompt comes back
# on every single build. A certificate gives one stable identity instead.
#
# Optional on purpose: a fresh clone still builds and runs, it just prompts.
# `./dev-certificate.sh` creates one.
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
# Signing the build directory and then `cp -R`ing it was the bug: the Keychain
# identifies the app that runs, which is the copy, and copying does not
# reliably carry the seal — so the installed app was effectively unsigned and
# every rebuild asked for the password again, exactly as it had before the
# certificate existed.
IDENTITY="Stint Local Dev"
if security find-identity -v -p codesigning 2>/dev/null | grep -q "$IDENTITY"; then
    codesign --force --deep --sign "$IDENTITY" "$INSTALLED" 2>/dev/null \
        && echo "signed with \"$IDENTITY\"" \
        || echo "warning: signing failed; the Keychain will keep prompting"
else
    echo "unsigned (ad-hoc) — run ./dev-certificate.sh to stop the Keychain prompts"
fi

"/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister" \
    -f "$INSTALLED"

echo "installed $INSTALLED"
echo "run it with: open \"$INSTALLED\""
