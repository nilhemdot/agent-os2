#!/usr/bin/env bash
# Fail closed: a missing interpreter, a crash, or a timeout must block the tool call.
set -u
DIR="$(cd "$(dirname "$0")" && pwd)"
node "$DIR/pre-tool-guard.mjs"
status=$?
if [[ $status -eq 0 ]]; then
  exit 0
fi
exit 2
