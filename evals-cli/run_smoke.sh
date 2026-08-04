#!/bin/bash
# Copyright 2026 Google LLC
# SPDX-License-Identifier: Apache-2.0

# Exit immediately if a command exits with a non-zero status.
set -e

# Always install and build dependencies once at the start of the execution
echo "📦 Installing dependencies and building project..."
npm ci
npm run build
echo

TARGET="${1}"
VERBOSE_FLAG=""

if [ "${2}" = "-v" ] || [ "${2}" = "--verbose" ]; then
  VERBOSE_FLAG="-v"
fi

ALL_TARGETS=("doors" "bistro" "pizza" "sport-shop" "hotel-chain")

if [ -z "$TARGET" ]; then
  echo "Error: Missing target parameter."
  echo "Usage: $0 <doors|bistro|pizza|sport-shop|hotel-chain|all> [-v|--verbose]"
  exit 1
fi

run_single_smoke() {
  local t="${1}"
  case "$t" in
    "doors")
      # 1. Doors Demo
      echo "🚪 Running Doors Smoke Test..."
      node dist/bin/webmcp-evals.js smoke \
        -u https://googlechromelabs.github.io/webmcp-tools/demos/doors \
        -e examples/doors/evals.json \
        $VERBOSE_FLAG
      ;;
    "bistro")
      # 2. French Bistro Demo
      echo "🇫🇷 Running French Bistro Smoke Test..."
      node dist/bin/webmcp-evals.js smoke \
        -u https://googlechromelabs.github.io/webmcp-tools/demos/french-bistro/ \
        -e examples/french-bistro/evals.json \
        $VERBOSE_FLAG
      ;;
    "pizza")
      # 3. Pizza Maker Demo
      echo "🍕 Running Pizza Maker Smoke Test..."
      node dist/bin/webmcp-evals.js smoke \
        -u https://googlechromelabs.github.io/webmcp-tools/demos/pizza-maker/ \
        -e examples/pizza-maker/evals.json \
        $VERBOSE_FLAG
      ;;
    "sport-shop")
      # 4. Sport Shop Angular Demo
      echo "🛍️ Running Sport Shop Angular Smoke Test..."
      node dist/bin/webmcp-evals.js smoke \
        -u https://googlechromelabs.github.io/webmcp-tools/demos/sport-shop-angular/ \
        -e examples/sport-shop-angular/evals.json \
        $VERBOSE_FLAG
      ;;
    "hotel-chain")
      # 5. Hotel Chain Demo
      echo "🏨 Running Hotel Chain Smoke Test..."
      node dist/bin/webmcp-evals.js smoke \
        -u https://googlechromelabs.github.io/webmcp-tools/demos/hotel-chain/ \
        -e examples/hotel-chain/evals.json \
        $VERBOSE_FLAG
      ;;
    *)
      echo "Error: Invalid target '$t'."
      echo "Supported targets: doors, bistro, pizza, sport-shop, hotel-chain, all"
      exit 1
      ;;
  esac
}

echo "=============================================================="
echo "🚀 Running WebMCP Smoke Test for: $TARGET"
echo "=============================================================="
echo

if [ "$TARGET" = "all" ]; then
  echo "Running all smoke tests..."
  for t in "${ALL_TARGETS[@]}"; do
    echo "--------------------------------------------------------------"
    echo "Executing target: $t"
    echo "--------------------------------------------------------------"
    run_single_smoke "$t"
  done
  echo "All smoke tests finished!"
else
  run_single_smoke "$TARGET"
fi

echo "--------------------------------------------------------------"
echo "✅ WebMCP smoke test for '$TARGET' completed successfully!"
echo "=============================================================="
