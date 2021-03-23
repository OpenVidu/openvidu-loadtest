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


# Download media files
# ====================

# These are used to simulate MediaStreamTracks.

MEDIAFILES_DIR="./src/assets/mediafiles"
mkdir -p "$MEDIAFILES_DIR"

if [[ ! -f "$MEDIAFILES_DIR/fakevideo.y4m" ]]; then
    curl --output "$MEDIAFILES_DIR/fakevideo.y4m" \
        "https://s3-eu-west-1.amazonaws.com/public.openvidu.io/fakevideo.y4m"
fi
if [[ ! -f "$MEDIAFILES_DIR/fakeaudio.wav" ]]; then
    curl --output "$MEDIAFILES_DIR/fakeaudio.wav" \
        "https://s3-eu-west-1.amazonaws.com/public.openvidu.io/fakeaudio.wav"
fi
if [[ ! -f "$MEDIAFILES_DIR/video.mkv" ]]; then
    curl --output "$MEDIAFILES_DIR/video.mkv" \
        "https://s3-eu-west-1.amazonaws.com/public.openvidu.io/fakevideo_vp8_opus.mkv"
    # https://s3-eu-west-1.amazonaws.com/public.openvidu.io/fakevideo_h264_opus.mkv
fi



echo "Instance is ready"
