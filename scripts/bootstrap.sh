#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if ! command -v node >/dev/null; then
  echo "Node.js 22 or newer is required" >&2
  exit 1
fi
major="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$major" -lt 22 ]; then
  echo "Node.js 22 or newer is required (found $(node -v))" >&2
  exit 1
fi
npm install
npm run build:web
echo "AgentOS is installed. Start it with: agentos daemon start"
