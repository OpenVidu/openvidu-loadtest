#!/usr/bin/env bash
set -euo pipefail

DEFAULT_BOX=$(sed -n "s/box = ENV\['BOX'\] || '\([^']*\)'.*/\1/p" browser-emulator/Vagrantfile | head -n1)
DEFAULT_PROVIDER=$(sed -n "s/provider = ENV\['VAGRANT_PROVIDER'\] || '\([^']*\)'.*/\1/p" browser-emulator/Vagrantfile | head -n1)
BOX_NAME="${BOX:-$DEFAULT_BOX}"
BOX_PROVIDER="${VAGRANT_PROVIDER:-$DEFAULT_PROVIDER}"
BOX_USER="${BOX_NAME%%/*}"
BOX_SHORT_NAME="${BOX_NAME#*/}"

BOX_METADATA=$(curl -fsSL "https://app.vagrantup.com/api/v1/box/${BOX_USER}/${BOX_SHORT_NAME}" | tr -d '\n')
BOX_VERSION=$(ruby -rjson -e 'j = JSON.parse(STDIN.read); print(j.dig("current_version", "version").to_s)' <<<"$BOX_METADATA")

BOX_VERSION_METADATA=$(curl -fsSL "https://app.vagrantup.com/api/v1/box/${BOX_USER}/${BOX_SHORT_NAME}/version/${BOX_VERSION}" | tr -d '\n')
BOX_HASH=$(BOX_PROVIDER="$BOX_PROVIDER" ruby -rjson -e 'j = JSON.parse(STDIN.read); providers = j["providers"] || []; provider = providers.find { |p| p["name"] == ENV["BOX_PROVIDER"] } || providers.first; print((provider && provider["checksum"]).to_s)' <<<"$BOX_VERSION_METADATA")

if [ -z "$BOX_VERSION" ]; then
    BOX_VERSION="unknown"
fi

if [ -z "$BOX_HASH" ]; then
    BOX_HASH="unknown"
fi

echo "box_name=$BOX_NAME" >>"$GITHUB_OUTPUT"
echo "box_version=$BOX_VERSION" >>"$GITHUB_OUTPUT"
echo "box_hash=$BOX_HASH" >>"$GITHUB_OUTPUT"
