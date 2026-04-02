#!/usr/bin/env bash

# Shell setup, assumes running on Ubuntu 24.04
# ====================================================

# Trace all commands.
set -o xtrace

export DEBIAN_FRONTEND=noninteractive
if [ -f "/etc/needrestart/needrestart.conf" ]; then
    sed -i "/#\$nrconf{restart} = 'i';/s/.*/\$nrconf{restart} = 'a';/" /etc/needrestart/needrestart.conf
else
    echo "No needrestart, continuing"
fi

SELF_PATH="$(cd -P -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd -P)" # Absolute canonical path

# Resolve absolute defaults for host directories and metricbeat config
DEFAULT_MEDIAFILES_HOST_DIR="${MEDIAFILES_HOST_DIR:-$SELF_PATH/mediafiles}"
DEFAULT_SCRIPTS_LOGS_HOST_DIR="${SCRIPTS_LOGS_HOST_DIR:-$SELF_PATH/logs}"
DEFAULT_METRICBEAT_CONFIG="${METRICBEAT_CONFIG:-$SELF_PATH/src/assets/metricbeat-config/metricbeat.yml}"

# Export variables so the rest of the script and subsequent shells use them
export MEDIAFILES_HOST_DIR="$DEFAULT_MEDIAFILES_HOST_DIR"
export SCRIPTS_LOGS_HOST_DIR="$DEFAULT_SCRIPTS_LOGS_HOST_DIR"
export METRICBEAT_CONFIG="$DEFAULT_METRICBEAT_CONFIG"

# Ensure directories and metricbeat config directory exist
mkdir -p "$MEDIAFILES_HOST_DIR" "$SCRIPTS_LOGS_HOST_DIR" "$(dirname "$METRICBEAT_CONFIG")"

# Persist environment variables across reboots (interactive shells and system-wide)
PROFILE_D=/etc/profile.d
ENV_FILE=/etc/environment

cat > "$PROFILE_D/openvidu-loadtest.sh" <<EOF
# OpenVidu Loadtest browser emulator environment variables
export MEDIAFILES_HOST_DIR="$MEDIAFILES_HOST_DIR"
export SCRIPTS_LOGS_HOST_DIR="$SCRIPTS_LOGS_HOST_DIR"
export METRICBEAT_CONFIG="$METRICBEAT_CONFIG"
EOF
chmod 644 "$PROFILE_D/openvidu-loadtest.sh"

# Ensure /etc/environment contains the variables (key="value" format)
touch "$ENV_FILE"
for VAR in MEDIAFILES_HOST_DIR SCRIPTS_LOGS_HOST_DIR METRICBEAT_CONFIG; do
    VALUE="$(eval echo "\$$VAR")"
    if grep -q "^$VAR=" "$ENV_FILE" 2>/dev/null; then
        sed -i "s|^$VAR=.*|$VAR=\"$VALUE\"|" "$ENV_FILE"
    else
        echo "$VAR=\"$VALUE\"" >> "$ENV_FILE"
    fi
done


## Install necessary packages
apt-get update
apt-get upgrade -yq
apt-get install -yq --no-install-recommends \
    curl git apt-transport-https ca-certificates software-properties-common gnupg procps
# Add Docker's official GPG key:
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
# Add the repository to Apt sources:
tee /etc/apt/sources.list.d/docker.sources <<EOF
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: $(. /etc/os-release && echo "${UBUNTU_CODENAME:-$VERSION_CODENAME}")
Components: stable
Signed-By: /etc/apt/keyrings/docker.asc
EOF
apt-get update
apt-get install -yq --no-install-recommends \
    docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Create recording directories
mkdir -p ./recordings/chrome
mkdir -p ./recordings/qoe

# Pull images used by browser-emulator for faster initialization time
docker pull docker.elastic.co/beats/metricbeat-oss:7.12.0
docker pull selenium/standalone-chrome:latest
docker pull selenium/standalone-firefox:latest
docker pull selenium/video:ffmpeg-8.0-20260222
docker pull jrottenberg/ffmpeg:8-alpine
docker pull livekit/livekit-cli:latest

docker compose build

# Add user ubuntu to docker, video and syslog groups
if id "ubuntu" &>/dev/null; then
    usermod -aG docker ubuntu
    usermod -aG syslog ubuntu
    usermod -aG video ubuntu
    chown -R ubuntu:ubuntu /opt/openvidu-loadtest/
fi

echo "base installation completed"
