#!/bin/bash
# Copyright 2026 Google LLC
# SPDX-License-Identifier: Apache-2.0

# Exit immediately if a command exits with a non-zero status.
set -e

MODEL="gemini-3.5-flash"

TARGET="${1}"

if [ -z "$TARGET" ]; then
  echo "Error: Missing target parameter."
  echo "Usage: $0 <doors|bistro|pizza|sport-shop>"
  exit 1
fi

echo "=============================================================="
echo "🚀 Running WebMCP Evaluation for: $TARGET"
echo "🤖 Model: $MODEL"
echo "=============================================================="
echo

case "$TARGET" in
  "doors")
    # 1. Doors Demo
    echo "🚪 Running Doors Evaluation..."
    node dist/bin/webmcp-evals.js browser \
      -m "$MODEL" \
      -u https://googlechromelabs.github.io/webmcp-tools/demos/doors \
      -e examples/doors/evals.json
    ;;
  "bistro")
    # 2. French Bistro Demo
    echo "🇫🇷 Running French Bistro Evaluation..."
    node dist/bin/webmcp-evals.js browser \
      -m "$MODEL" \
      -u https://googlechromelabs.github.io/webmcp-tools/demos/french-bistro/ \
      -e examples/french-bistro/evals.json
    ;;
  "pizza")
    # 3. Pizza Maker Demo
    echo "🍕 Running Pizza Maker Evaluation..."
    node dist/bin/webmcp-evals.js browser \
      -m "$MODEL" \
      -u https://googlechromelabs.github.io/webmcp-tools/demos/pizza-maker/ \
      -e examples/pizza-maker/evals.json
    ;;
  "sport-shop")
    # 4. Sport Shop Angular Demo
    echo "🛍️ Running Sport Shop Angular Evaluation..."
    node dist/bin/webmcp-evals.js browser \
      -m "$MODEL" \
      -u https://googlechromelabs.github.io/webmcp-tools/demos/sport-shop-angular/ \
      -e examples/sport-shop-angular/evals.json
    ;;
  *)
    echo "Error: Invalid target '$TARGET'."
    echo "Supported targets: doors, bistro, pizza, sport-shop"
    exit 1
    ;;
esac

echo "--------------------------------------------------------------"
echo "✅ WebMCP evaluation for '$TARGET' completed successfully!"
echo "=============================================================="
