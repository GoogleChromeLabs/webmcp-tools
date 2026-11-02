#!/usr/bin/env bash
set -e

# Change to repo root directory
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${REPO_ROOT}/demos"

echo "=========================================="
echo "   Building all Demos   "
echo "=========================================="

echo -e "\n[1/10] Building react-flightsearch..."
(cd react-flightsearch && npm ci && npm run build)

echo -e "\n[2/10] Building webmcp-maze..."
(cd webmcp-maze && npm ci && npm run build)

echo -e "\n[3/10] Building sport-shop-angular..."
(cd sport-shop-angular && npm ci && npm run build -- --base-href /webmcp-tools/demos/sport-shop-angular/)

echo -e "\n[4/10] Building hotel-chain..."
(cd hotel-chain && npm ci && npm run build)

echo -e "\n[5/10] Building analytics-dashboard..."
(cd analytics-dashboard && npm ci && npm run build)

echo -e "\n[6/10] Building leather-bag..."
(cd leather-bag && npm ci && npm run build -- --base-href /webmcp-tools/demos/leather-bag/)

echo -e "\n[7/10] Building smart-home..."
(cd smart-home && npm ci && npm run build)

echo -e "\n[8/10] Building pixel-art-studio..."
(cd pixel-art-studio && npm ci && npm run build)

echo -e "\n[9/10] Building spreadsheet (after its unit tests)..."
(cd spreadsheet && npm ci && npm test && npm run build)

echo -e "\n[10/10] Building proxx-lite..."
(cd proxx-lite && npm ci && npm run build)

echo -e "\n==============================================="
echo "   ✓ ALL DEMO BUILDS COMPLETED SUCCESSFULLY!   "
echo "==============================================="
