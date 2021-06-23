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