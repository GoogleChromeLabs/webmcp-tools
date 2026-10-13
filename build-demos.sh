#!/usr/bin/env bash
set -e

# Change to repo root directory
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${REPO_ROOT}/demos"

echo "=========================================="
echo "   Building all Demos   "
echo "=========================================="

echo -e "\n[1/8] Building react-flightsearch..."
(cd react-flightsearch && npm ci && npm run build)

echo -e "\n[2/8] Building webmcp-maze..."
(cd webmcp-maze && npm ci && npm run build)

echo -e "\n[3/8] Building sport-shop-angular..."
(cd sport-shop-angular && npm ci && npm run build -- --base-href /webmcp-tools/demos/sport-shop-angular/)

echo -e "\n[4/8] Building hotel-chain..."
(cd hotel-chain && npm ci && npm run build)

echo -e "\n[5/8] Building analytics-dashboard..."
(cd analytics-dashboard && npm ci && npm run build)

echo -e "\n[6/8] Building leather-bag..."
(cd leather-bag && npm ci && npm run build -- --base-href /webmcp-tools/demos/leather-bag/)

echo -e "\n[7/8] Building smart-home..."
(cd smart-home && npm ci && npm run build)

echo -e "\n[8/8] Building pixel-art-studio..."
(cd pixel-art-studio && npm ci && npm run build)

echo -e "\n==============================================="
echo "   ✓ ALL DEMO BUILDS COMPLETED SUCCESSFULLY!   "
echo "==============================================="
