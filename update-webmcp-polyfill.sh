#!/usr/bin/env bash
#
# Copyright 2026 Google LLC
# SPDX-License-Identifier: Apache-2.0
#
# Refreshes demos/shared/webmcp-polyfill.js from the @w3c/webmcp-polyfill npm package.
#
# Usage: ./update-webmcp-polyfill.sh [version]   (defaults to "latest")

set -euo pipefail

PACKAGE="@w3c/webmcp-polyfill"
VERSION="${1:-latest}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT="$ROOT_DIR/demos/shared/webmcp-polyfill.js"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

PACK_JSON="$(npm pack "$PACKAGE@$VERSION" --pack-destination "$TMP" --json --silent)"
read -r RESOLVED INTEGRITY TARBALL < <(
  node -e 'const [p] = JSON.parse(process.argv[1]); console.log(p.version, p.integrity, p.filename);' "$PACK_JSON"
)
tar -xzf "$TMP/$TARBALL" -C "$TMP"

{
  printf '/**\n * WebMCP polyfill - copied from npm, do not edit by hand.\n *\n'
  printf ' * Package:   %s@%s (dist/polyfill.js)\n' "$PACKAGE" "$RESOLVED"
  printf ' * Integrity: %s\n' "$INTEGRITY"
  printf ' * Refresh:   ./update-webmcp-polyfill.sh [version]\n *\n'
  printf ' * Implements the imperative WebMCP API only. The declarative form[toolname]\n'
  printf ' * tools and the :tool-form-active / :tool-submit-active pseudo-classes are\n'
  printf ' * polyfilled by webmcp-declarative.js, which must load after this file.\n *\n'
  printf ' * SPDX-License-Identifier: Apache-2.0\n */\n'
  cat "$TMP/package/dist/polyfill.js"
  printf '\n'
} > "$OUT"

echo "Updated $OUT to $PACKAGE@$RESOLVED"
