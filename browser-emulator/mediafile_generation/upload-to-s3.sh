#!/usr/bin/env bash
set -euo pipefail

# Configuration
BUCKET_URI="s3://openvidu-loadtest-mediafiles"
AWS_CLI="${AWS_CLI:-aws}"

# --- Helpers -----------------------------------------------------------------

die() {
    echo "Error: $*" >&2
    exit 1
}

require_cmd() {
    command -v "$1" >/dev/null 2>&1 || die "Required command not found: $1"
}

# Pick a SHA-256 tool that's available
detect_sha256() {
    if command -v sha256sum >/dev/null 2>&1; then
        echo "sha256sum"
    elif command -v shasum >/dev/null 2>&1; then
        echo "shasum -a 256"
    else
        die "Neither 'sha256sum' nor 'shasum' found. Please install one."
    fi
}

mime_for() {
    local f="$1"
    shopt -s nocasematch
    case "$f" in
    *.y4m) echo "video/y4m" ;; # common for Y4M; if your system lacks this type, S3 will still accept it
    *.wav) echo "audio/wav" ;;
    *) echo "application/octet-stream" ;;
    esac
    shopt -u nocasematch
}

# --- Preconditions ------------------------------------------------------------

require_cmd "$AWS_CLI"
HASH_CMD="$(detect_sha256)"

# Optional: quick check that AWS is configured
$AWS_CLI sts get-caller-identity >/dev/null 2>&1 ||
    die "AWS CLI not configured or no credentials available."

# --- Main ---------------------------------------------------------------------

# Find .y4m and .wav files in the current directory (non-recursive), safely handling spaces
mapfile -d '' FILES < <(find . -maxdepth 1 -type f \( -iname "*.y4m" -o -iname "*.wav" -o -iname "*.h264" -o -iname "*.ogg" \) -print0)

if [[ ${#FILES[@]} -eq 0 ]]; then
    echo "No valid files found in the current directory."
    exit 0
fi

echo "Discovered ${#FILES[@]} media file(s) to upload to ${BUCKET_URI}."

for f in "${FILES[@]}"; do
    # Strip leading ./ from find
    f="${f#./}"

    # Compute SHA-256 (extract just the hex digest)
    HASH="$($HASH_CMD "$f" | awk '{print $1}')"

    MIME_TYPE="$(mime_for "$f")"
    KEY="$(basename "$f")"

    echo "Uploading: $f"
    echo "  SHA-256: $HASH"
    echo "  Content-Type: $MIME_TYPE"
    echo "  S3 Key: $KEY"

    # --metadata "sha256=<hash>" becomes header x-amz-meta-sha256:<hash> in S3
    # Use --metadata-directive REPLACE to ensure only our metadata is set on new objects
    # Add --acl public-read so uploaded objects are publicly readable
    $AWS_CLI s3 cp "$f" "${BUCKET_URI}/${KEY}" \
        --metadata "sha256=${HASH}" \
        --metadata-directive REPLACE \
        --content-type "${MIME_TYPE}" \
        --acl public-read \
        --no-progress

    echo "✔ Uploaded ${KEY} with x-amz-meta-sha256=${HASH} (public-read)"
done

echo "All done."
