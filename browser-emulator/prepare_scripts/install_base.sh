#!/usr/bin/env bash

# Shell setup, assumes running on Ubuntu 24.04 able to build and install v4l2loopback module
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
