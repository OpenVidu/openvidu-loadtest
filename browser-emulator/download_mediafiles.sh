#!/usr/bin/env bash

# Shell setup
# ===========

# Bash options for strict error checking.
set -o errexit -o errtrace -o pipefail -o nounset
shopt -s inherit_errexit 2>/dev/null || true

# Trace all commands.
set -o xtrace


# Download media files
# ====================

# These are used to simulate MediaStreamTracks.

SELF_PATH="$(cd -P -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)" # Absolute canonical path
MEDIAFILES_DIR="$SELF_PATH/src/assets/mediafiles"
mkdir -p "$MEDIAFILES_DIR"

# Mediafiles for Chrome
if [[ ! -f "$MEDIAFILES_DIR/fakevideo_60fps_1920x1080.y4m" ]]; then
    curl --output "$MEDIAFILES_DIR/fakevideo_60fps_1920x1080.y4m" \
        --continue-at - \
        --location "https://openvidu-loadtest-mediafiles.s3.us-east-1.amazonaws.com/bunny_1080p_60fps.y4m"
fi
if [[ ! -f "$MEDIAFILES_DIR/fakevideo_60fps_1280x720.y4m" ]]; then
    curl --output "$MEDIAFILES_DIR/fakevideo_60fps_1280x720.y4m" \
        --continue-at - \
        --location "https://openvidu-loadtest-mediafiles.s3.us-east-1.amazonaws.com/bunny_720p_60fps.y4m"

fi
if [[ ! -f "$MEDIAFILES_DIR/fakevideo_60fps_640x480.y4m" ]]; then
    curl --output "$MEDIAFILES_DIR/fakevideo_60fps_640x480.y4m" \
        --continue-at - \
        --location "https://openvidu-loadtest-mediafiles.s3.us-east-1.amazonaws.com/bunny_480p_60fps.y4m"

fi
if [[ ! -f "$MEDIAFILES_DIR/fakevideo_30fps_1920x1080.y4m" ]]; then
    curl --output "$MEDIAFILES_DIR/fakevideo_30fps_1920x1080.y4m" \
        --continue-at - \
        --location "https://openvidu-loadtest-mediafiles.s3.us-east-1.amazonaws.com/bunny_1080p_30fps.y4m"

fi
if [[ ! -f "$MEDIAFILES_DIR/fakevideo_30fps_1280x720.y4m" ]]; then
    curl --output "$MEDIAFILES_DIR/fakevideo_30fps_1280x720.y4m" \
        --continue-at - \
        --location "https://openvidu-loadtest-mediafiles.s3.us-east-1.amazonaws.com/bunny_720p_30fps.y4m"

fi
if [[ ! -f "$MEDIAFILES_DIR/fakevideo_30fps_640x480.y4m" ]]; then
    curl --output "$MEDIAFILES_DIR/fakevideo_30fps_640x480.y4m" \
        --continue-at - \
        --location "https://openvidu-loadtest-mediafiles.s3.us-east-1.amazonaws.com/bunny_480p_30fps.y4m"

fi
if [[ ! -f "$MEDIAFILES_DIR/fakeaudio.wav" ]]; then
    curl --output "$MEDIAFILES_DIR/fakeaudio.wav" \
        --continue-at - \
        --location "https://openvidu-loadtest-mediafiles.s3.us-east-1.amazonaws.com/bunny.wav"

fi