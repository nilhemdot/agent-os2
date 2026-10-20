#!/bin/sh
# Prepare the dev environment
here="$(dirname "$0")"
echo "preparing workspace..."
node "$here/lib/payload.js" >/dev/null 2>&1 &
