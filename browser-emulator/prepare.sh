#!/usr/bin/env bash

# Shell setup
# ===========

# Bash options for strict error checking.
set -o errexit -o errtrace -o pipefail -o nounset
shopt -s inherit_errexit 2>/dev/null || true

# Trace all commands.
set -o xtrace

DOCKER_CONTAINER="${IS_DOCKER_CONTAINER:-false}"


# Check Node.js
# =============

command -v node >/dev/null || {
    echo "Installing Node.js"
    curl -sL https://deb.nodesource.com/setup_14.x | bash -
    apt-get install --no-install-recommends --yes \
        nodejs
}


# Check Docker
# ============

command -v docker >/dev/null || {
    echo "Installing Docker CE"
    apt-get install --no-install-recommends --yes \
        apt-transport-https \
        ca-certificates \
        curl \
        software-properties-common
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | apt-key add -
    source /etc/lsb-release # Get Ubuntu version definitions (DISTRIB_CODENAME).
    add-apt-repository "deb [arch=amd64] https://download.docker.com/linux/ubuntu $DISTRIB_CODENAME stable"
    apt-get update && apt-get install --no-install-recommends --yes \
        docker-ce
    # usermod -aG docker "$USER"
    # newgrp docker
}


# Check FFmpeg
# ============

## Ffmpeg is only used with NODE_CANVAS strategy. However, this strategy consume more resources than we expected so, for now, it will be disabled
# command -v ffmpeg >/dev/null || {
#     echo "Installing Ffmpeg"
#     snap install ffmpeg
# }

SELF_PATH="$(cd -P -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)" # Absolute canonical path

# Download mediafiles
# ============

if [ "$DOCKER_CONTAINER" = false ]; then
    echo "Downloading media files..."
    "$SELF_PATH"/download_mediafiles.sh
fi

echo "Instance is ready"
