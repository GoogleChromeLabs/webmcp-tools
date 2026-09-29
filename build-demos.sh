#!/usr/bin/env bash
set -e

# Change to repo root directory
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "${REPO_ROOT}/demos"

echo "=========================================="
echo "   Building all Demos   "
echo "=========================================="

echo -e "\n[1/7] Building react-flightsearch..."
(cd react-flightsearch && npm ci && npm run build)

echo -e "\n[2/7] Building webmcp-maze..."
(cd webmcp-maze && npm ci && npm run build)

echo -e "\n[3/7] Building sport-shop-angular..."
(cd sport-shop-angular && npm ci && npm run build -- --base-href /webmcp-tools/demos/sport-shop-angular/)

echo -e "\n[4/7] Building hotel-chain..."
(cd hotel-chain && npm ci && npm run build)

echo -e "\n[5/7] Building analytics-dashboard..."
(cd analytics-dashboard && npm ci && npm run build)

echo -e "\n[6/7] Building leather-bag..."
(cd leather-bag && npm ci && npm run build -- --base-href /webmcp-tools/demos/leather-bag/)

echo -e "\n[7/7] Building smart-home..."
(cd smart-home && npm ci && npm run build)

echo -e "\n==============================================="
echo "   ✓ ALL DEMO BUILDS COMPLETED SUCCESSFULLY!   "
echo "==============================================="
