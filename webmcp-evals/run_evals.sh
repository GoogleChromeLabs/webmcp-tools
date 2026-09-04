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

MODEL="google:gemini-3.1-flash-lite"

TARGET="${1}"
RUNS="${2:-1}"

ALL_TARGETS=("doors" "bistro" "pizza" "sport-shop" "hotel-chain")

if [ -z "$TARGET" ]; then
  echo "Error: Missing target parameter."
  echo "Usage: $0 <doors|bistro|pizza|sport-shop|hotel-chain|all> [runs_count]"
  exit 1
fi

run_single_eval() {
  local t="${1}"
  case "$t" in
    "doors")
      # 1. Doors Demo
      echo "🚪 Running Doors Evaluation..."
      node dist/bin/webmcp-evals.js browser \
        -m "$MODEL" \
        -u https://googlechromelabs.github.io/webmcp-tools/demos/doors \
        -e examples/doors/evals.json \
        -r "$RUNS"
      ;;
    "bistro")
      # 2. French Bistro Demo
      echo "🇫🇷 Running French Bistro Evaluation..."
      node dist/bin/webmcp-evals.js browser \
        -m "$MODEL" \
        -u https://googlechromelabs.github.io/webmcp-tools/demos/french-bistro/ \
        -e examples/french-bistro/evals.json \
        -r "$RUNS"
      ;;
    "pizza")
      # 3. Pizza Maker Demo
      echo "🍕 Running Pizza Maker Evaluation..."
      node dist/bin/webmcp-evals.js browser \
        -m "$MODEL" \
        -u https://googlechromelabs.github.io/webmcp-tools/demos/pizza-maker/ \
        -e examples/pizza-maker/evals.json \
        -r "$RUNS"
      ;;
    "sport-shop")
      # 4. Sport Shop Angular Demo
      echo "🛍️ Running Sport Shop Angular Evaluation..."
      node dist/bin/webmcp-evals.js browser \
        -m "$MODEL" \
        -u https://googlechromelabs.github.io/webmcp-tools/demos/sport-shop-angular/ \
        -e examples/sport-shop-angular/evals.json \
        -r "$RUNS"
      ;;
    "hotel-chain")
      # 5. Hotel Chain Demo
      echo "🏨 Running Hotel Chain Evaluation..."
      node dist/bin/webmcp-evals.js browser \
        -m "$MODEL" \
        -u https://googlechromelabs.github.io/webmcp-tools/demos/hotel-chain/ \
        -e examples/hotel-chain/evals.json \
        -r "$RUNS"
      ;;
    *)
      echo "Error: Invalid target '$t'."
      echo "Supported targets: doors, bistro, pizza, sport-shop, hotel-chain, all"
      exit 1
      ;;
  esac
}

echo "=============================================================="
echo "🚀 Running WebMCP Evaluation for: $TARGET"
echo "🤖 Model: $MODEL"
echo "=============================================================="
echo

if [ "$TARGET" = "all" ]; then
  echo "Running all evaluations..."
  for t in "${ALL_TARGETS[@]}"; do
    echo "--------------------------------------------------------------"
    echo "Executing target: $t"
    echo "--------------------------------------------------------------"
    run_single_eval "$t"
  done
  echo "All evaluations finished!"
else
  run_single_eval "$TARGET"
fi

echo "--------------------------------------------------------------"
echo "✅ WebMCP evaluation for '$TARGET' completed successfully!"
echo "=============================================================="
