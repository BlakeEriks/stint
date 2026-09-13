#!/bin/bash
# Create a local code-signing certificate, so rebuilds keep one identity.
#
# THIS DOES NOT STOP THE KEYCHAIN PASSWORD PROMPTS. It was written believing
# it would, and that was wrong in a way worth recording: a keychain grant is
# checked against a PARTITION LIST as well as an ACL. The certificate makes
# the ACL stable, and the ACL was never what failed. macOS writes the
# partition list itself, and with no team identifier — which a self-signed
# certificate cannot carry — the only identity it can pin is the caller's
# cdhash, which changes with the code. `TokenStore.swift` has the real fix.
#
# What this still buys: a bundle with one stable designated requirement
# instead of an ad-hoc identity derived from the binary's own bytes, which is
# what anything keying off the signature wants.
#
# This certificate is self-signed, lives only in YOUR login keychain, and is
# trusted by nothing except this machine. It is not a Developer ID and cannot
# distribute an app — see `docs/tasks.md` for that. Run it once.
set -euo pipefail

NAME="Stint Local Dev"

# A usable IDENTITY is a certificate with its private key. An earlier failed
# import can leave the certificate alone, which looks present and cannot
# sign — so check for the identity, and clear a stray certificate rather than
# reporting "nothing to do" about something broken.
if security find-identity -v -p codesigning | grep -q "$NAME"; then
    echo "\"$NAME\" already exists and can sign. Nothing to do."
    echo "To start over: security delete-certificate -c \"$NAME\""
    exit 0
fi

if security find-certificate -c "$NAME" >/dev/null 2>&1; then
    echo "Found a \"$NAME\" certificate with no usable key — removing it first."
    security delete-certificate -c "$NAME" >/dev/null 2>&1 || true
fi

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# `codeSigning` in extendedKeyUsage is what makes `codesign` accept it; a
# plain self-signed TLS cert is rejected with "no identity found".
cat > "$TMP/openssl.cnf" <<'CONF'
[ req ]
distinguished_name = dn
x509_extensions    = ext
prompt             = no

[ dn ]
CN = Stint Local Dev

[ ext ]
basicConstraints       = critical, CA:false
keyUsage               = critical, digitalSignature
extendedKeyUsage       = critical, codeSigning
subjectKeyIdentifier   = hash
CONF

echo "Generating a key and certificate…"
openssl req -x509 -newkey rsa:2048 -nodes \
    -keyout "$TMP/key.pem" -out "$TMP/cert.pem" \
    -days 3650 -config "$TMP/openssl.cnf" 2>/dev/null

# One PKCS#12 bundle, so the key and certificate import together — imported
# separately, the key is not associated with the cert and no usable identity
# exists.
#
# `-legacy` is REQUIRED and is not optional tidiness. OpenSSL 3 defaults to
# AES-256-CBC with a SHA-256 MAC, which Apple's Security framework cannot
# verify: `security import` then fails with "MAC verification failed during
# PKCS12 import (wrong password?)" — a message that sends you looking at the
# password, which is fine. `-legacy` writes the older RC2/SHA-1 form Apple
# accepts. Reproduced both ways before this line was written.
#
# LibreSSL (/usr/bin/openssl) does not know the flag and does not need it, so
# fall back when it is rejected.
openssl pkcs12 -export -legacy -inkey "$TMP/key.pem" -in "$TMP/cert.pem" \
    -out "$TMP/identity.p12" -passout pass:stint -name "$NAME" 2>/dev/null \
  || openssl pkcs12 -export -inkey "$TMP/key.pem" -in "$TMP/cert.pem" \
    -out "$TMP/identity.p12" -passout pass:stint -name "$NAME" 2>/dev/null

echo "Importing into your login keychain…"
# `-T /usr/bin/codesign` pre-authorises codesign to use the key, which is what
# stops THIS certificate's own prompt appearing on every build.
security import "$TMP/identity.p12" \
    -k "$HOME/Library/Keychains/login.keychain-db" \
    -P stint -T /usr/bin/codesign

# Trust it for code signing. This is the step that needs your password, and it
# is the only one.
echo "Trusting it for code signing (your password, once)…"
sudo security add-trusted-cert -d -r trustRoot \
    -p codeSign \
    -k /Library/Keychains/System.keychain "$TMP/cert.pem"

echo
echo "Done. \"$NAME\" is ready."
echo "Rebuild with ./bundle.sh — it signs with this automatically."
