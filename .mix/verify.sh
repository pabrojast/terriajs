#!/usr/bin/env bash
# mix verify override for TerriaJS.
# Strong + fast: incremental TypeScript typecheck of the production lib (includes .tsx),
# avoiding the heavy Karma browser test run / full webpack build per iteration.
# Exit 0 => mix treats it as `custom pass strong`; non-zero => `custom fail strong`.
set -uo pipefail
cd "$(dirname "$0")/.." || exit 1

echo "== TerriaJS typecheck (tsc --noEmit, lib only, incremental) =="
./node_modules/.bin/tsc --noEmit --incremental \
  --tsBuildInfoFile .mix/.tsbuildinfo-verify \
  -p tsconfig-node.json
status=$?

if [ "$status" -ne 0 ]; then
  echo "== TYPECHECK FAILED (exit $status) =="
  exit "$status"
fi
echo "== TYPECHECK OK =="
exit 0
