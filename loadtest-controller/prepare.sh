#!/usr/bin/env bash

# Shell setup
# ===========

# Bash options for strict error checking.
set -o errexit -o errtrace -o pipefail -o nounset
shopt -s inherit_errexit 2>/dev/null || true

# Trace all commands.
set -o xtrace

# Check Maven
# =============

command -v mvn >/dev/null || {
    echo "Installing Maven"
    sudo apt-get update && sudo apt-get install --yes maven
}
