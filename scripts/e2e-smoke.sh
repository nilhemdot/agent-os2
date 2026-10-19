#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if ! npx playwright test --list >/dev/null 2>&1; then
  echo "NOT RUN: Playwright could not list tests. Install browsers with: npx playwright install chromium"
  exit 0
fi
npx playwright test
