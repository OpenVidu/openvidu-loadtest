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
#
# Usage:
#   ./prepare_scripts/download_mediafiles.sh                                 # Downloads all bunny files
#   ./prepare_scripts/download_mediafiles.sh 1080x60 720x30                  # Downloads only bunny 1080p@60fps and 720p@30fps
#   ./prepare_scripts/download_mediafiles.sh 480 720 1080 30 60              # Downloads all combinations of bunny at specified resolutions and fps
#   ./prepare_scripts/download_mediafiles.sh interview 1080x60               # Downloads interview media at 1080p@60fps
#   ./prepare_scripts/download_mediafiles.sh game 480 720 30                 # Downloads game media at 480p and 720p at 30fps

SELF_PATH="$(cd -P -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)" # Absolute canonical path
MEDIAFILES_DIR="$SELF_PATH/mediafiles"
mkdir -p "$MEDIAFILES_DIR"

# S3 bucket URL for media files
S3_BUCKET_URL="https://openvidu-loadtest-mediafiles.s3.us-east-1.amazonaws.com"

# Parse arguments to determine which files to download
declare -A DOWNLOAD_FILES
RESOLUTIONS=()
FPS_VALUES=()
HAS_SPECIFIC_COMBINATIONS=false
MEDIA_TYPE="bunny"

if [[ $# -eq 0 ]]; then
    # No arguments: download all files (default behavior)
    RESOLUTIONS=(480 720 1080)
    FPS_VALUES=(30 60)
else
    # Parse arguments
    for arg in "$@"; do
        if [[ "$arg" =~ ^([0-9]+)x([0-9]+)$ ]]; then
            # Format: 1080x60
            res="${BASH_REMATCH[1]}"
            fps="${BASH_REMATCH[2]}"
            DOWNLOAD_FILES["${res}x${fps}"]=1
            HAS_SPECIFIC_COMBINATIONS=true
        elif [[ "$arg" =~ ^(480|720|1080)$ ]]; then
            # Resolution value
            if [[ ! " ${RESOLUTIONS[*]} " =~ \ $arg\  ]]; then
                RESOLUTIONS+=("$arg")
            fi
        elif [[ "$arg" =~ ^(30|60)$ ]]; then
            # FPS value
            if [[ ! " ${FPS_VALUES[*]} " =~ \ $arg\  ]]; then
                FPS_VALUES+=("$arg")
            fi
        elif [[ "$arg" =~ ^(bunny|interview|game)$ ]]; then
            # Media type
            MEDIA_TYPE="$arg"
        else
            echo "Warning: Ignoring unrecognized argument: $arg" >&2
        fi
    done

    # If specific combinations weren't provided but resolutions and fps were,
    # generate all combinations
    # If the user passed only a media type (no resolutions or fps),
    # default to all supported resolutions and framerates.
    if [[ "$HAS_SPECIFIC_COMBINATIONS" == false ]] && [[ ${#RESOLUTIONS[@]} -eq 0 ]] && [[ ${#FPS_VALUES[@]} -eq 0 ]]; then
        RESOLUTIONS=(480 720 1080)
        FPS_VALUES=(30 60)
    fi

    if [[ "$HAS_SPECIFIC_COMBINATIONS" == false ]] && [[ ${#RESOLUTIONS[@]} -gt 0 ]] && [[ ${#FPS_VALUES[@]} -gt 0 ]]; then
        for res in "${RESOLUTIONS[@]}"; do
            for fps in "${FPS_VALUES[@]}"; do
                DOWNLOAD_FILES["${res}x${fps}"]=1
            done
        done
    fi
fi

# Function to check if a combination should be downloaded
should_download() {
    local res=$1
    local fps=$2

    if [[ "$HAS_SPECIFIC_COMBINATIONS" == false ]]; then
        # No specific combinations: download based on resolution and fps arrays
        [[ " ${RESOLUTIONS[*]} " =~ \ $res\  ]] && [[ " ${FPS_VALUES[*]} " =~ \ $fps\  ]]
    else
        # Check if specific combination is requested
        [[ -n "${DOWNLOAD_FILES[${res}x${fps}]:-}" ]]
    fi
}

# Map resolution to video dimensions
declare -A DIMENSIONS
DIMENSIONS[1080]="1920x1080"
DIMENSIONS[720]="1280x720"
DIMENSIONS[480]="640x480"

# Fetch S3 bucket listing to discover available files
echo "Fetching available media files from S3..."
S3_LISTING=$(curl --silent --location "$S3_BUCKET_URL/")

# Extract all file keys from the XML
# Parse <Key>...</Key> entries and filter by media type
declare -a AVAILABLE_FILES
while IFS= read -r key; do
    if [[ -n "$key" ]]; then
        AVAILABLE_FILES+=("$key")
    fi
done < <(echo "$S3_LISTING" | grep -oP '(?<=<Key>)[^<]+' || true)

# Download video files based on requested combinations
for res in 480 720 1080; do
    for fps in 30 60; do
        if should_download "$res" "$fps"; then
            dim="${DIMENSIONS[$res]}"
            # Build expected filename pattern for the media type
            pattern="${MEDIA_TYPE}_${res}p_${fps}fps.y4m"

            # Find matching file in S3 listing
            matching_file=""
            for file in "${AVAILABLE_FILES[@]}"; do
                if [[ "$file" == "$pattern" ]]; then
                    matching_file="$file"
                    break
                fi
            done

            if [[ -n "$matching_file" ]]; then
                filename="fakevideo_${MEDIA_TYPE}_${fps}fps_${dim}.y4m"
                if [[ ! -f "$MEDIAFILES_DIR/$filename" ]]; then
                    echo "Downloading $matching_file as $filename..."
                    curl --output "$MEDIAFILES_DIR/$filename" \
                        --continue-at - \
                        --location "$S3_BUCKET_URL/$matching_file"
                fi
            fi
        fi
    done
done

# Download audio file for the selected media type
audio_pattern="${MEDIA_TYPE}.wav"
matching_audio=""
for file in "${AVAILABLE_FILES[@]}"; do
    if [[ "$file" == "$audio_pattern" ]]; then
        matching_audio="$file"
        break
    fi
done

if [[ -n "$matching_audio" ]]; then
    if [[ ! -f "$MEDIAFILES_DIR/fakeaudio_${MEDIA_TYPE}.wav" ]]; then
        echo "Downloading $matching_audio as fakeaudio_${MEDIA_TYPE}.wav..."
        curl --output "$MEDIAFILES_DIR/fakeaudio_${MEDIA_TYPE}.wav" \
            --continue-at - \
            --location "$S3_BUCKET_URL/$matching_audio"
    fi
else
    echo "Warning: No audio file found for ${MEDIA_TYPE}" >&2
fi
