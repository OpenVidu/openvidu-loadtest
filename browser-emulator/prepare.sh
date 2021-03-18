#!/usr/bin/env bash

# Shell setup
# ===========

# Bash options for strict error checking.
set -o errexit -o errtrace -o pipefail -o nounset
shopt -s inherit_errexit 2>/dev/null || true

# Trace all commands.
set -o xtrace



# Check permissions
# =================

[[ "$(id -u)" -eq 0 ]] || {
    echo "ERROR: Please run as root user (or with 'sudo')"
    exit 1
}



# Check Node.js
# =============

command -v node >/dev/null || {
    echo "Installing Node.js"
    curl -sL https://deb.nodesource.com/setup_14.x | bash -
    apt-get update && apt-get install --no-install-recommends --yes \
        nodejs
}



# Check Docker
# ============

command -v docker >/dev/null || {
    echo "Installing Docker CE"
    apt-get update && apt-get install --no-install-recommends --yes \
        apt-transport-https \
        ca-certificates \
        curl \
        software-properties-common
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | apt-key add -
    source /etc/lsb-release # Get Ubuntu version definitions (DISTRIB_CODENAME).
    add-apt-repository "deb [arch=amd64] https://download.docker.com/linux/ubuntu $DISTRIB_CODENAME stable"
    apt-get update && apt-get install --no-install-recommends --yes \
        docker-ce
    usermod -aG docker "$USER"
    newgrp docker
}


# Check Docker
# ============

command -v ffmpeg >/dev/null || {
    echo "Installing Ffmpeg"
    snap install ffmpeg
}


# Download necessary media files for containerized Chrome Browser
if [[ ! -f ./src/assets/mediafiles/fakevideo.y4m ]]; then
    echo "Downloading video media file"
    curl --url https://s3-eu-west-1.amazonaws.com/public.openvidu.io/bbb-fakevideo.y4m --output ./src/assets/mediafiles/fakevideo.y4m --create-dirs
fi
if [[ ! -f ./src/assets/mediafiles/fakeaudio.wav ]]; then
    echo "Downloading audio media file"
    curl --url https://s3-eu-west-1.amazonaws.com/public.openvidu.io/bbb-fakeaudio.wav --output ./src/assets/mediafiles/fakeaudio.wav --create-dirs
fi



echo "Instance is ready"
