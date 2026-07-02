#!/bin/bash

# Validation script for the multi-emulated ELK smoke test
# (multi-emulated-elk-smoke-test-config.yaml). The scenario and expected
# results are identical to the regular ELK smoke test, only the browser
# type differs (multi-emulated instead of chrome), so this simply delegates
# to validate-elk-smoke-test.sh to avoid duplicating validation logic.
#
# Usage: ./validate-multi-emulated-elk-smoke-test.sh <RESULTS_DIR>
# Returns exit code 0 on success, 1 on failure

set -e

SCRIPT_DIR="$(dirname "$(realpath "$0")")"

exec "$SCRIPT_DIR/validate-elk-smoke-test.sh" "$@"
