#!/usr/bin/env bash

# Shell setup, assumes running on Ubuntu 20.04 able to build and install v4l2loopback module
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
    curl git apt-transport-https ca-certificates software-properties-common gnupg python3-pip build-essential libgtk-3-0 libdbus-glib-1-2 xorg libnm0
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
NODE_MAJOR=24
curl -fsSL https://deb.nodesource.com/setup_$NODE_MAJOR.x | sudo -E bash -
apt-get update
apt-get install -yq --no-install-recommends \
    ffmpeg docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin xvfb linux-generic linux-modules-extra-$(uname -r) pulseaudio nodejs dkms
# Config needed for ffmpeg to work
export LD_LIBRARY_PATH=/usr/local/lib${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}
echo export LD_LIBRARY_PATH=/usr/local/lib${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH} | tee -a /etc/profile

snap remove firefox

# Create recording directories
mkdir -p ./recordings/chrome
mkdir -p ./recordings/qoe

# Add user ubuntu to docker, video and syslog groups
if id "ubuntu" &>/dev/null; then
    usermod -aG docker ubuntu
    usermod -aG syslog ubuntu
    usermod -aG video ubuntu
    chown -R ubuntu:ubuntu /opt/openvidu-loadtest/
elif id "vagrant" &>/dev/null; then
    usermod -aG docker vagrant
    usermod -aG syslog vagrant
    usermod -aG video vagrant
    chown -R vagrant:vagrant /opt/openvidu-loadtest/
else
    echo "No ubuntu or vagrant user found, skipping usermod"
fi

install_v4l2loopback() {
    # Enable fake webcam for real browsers
    # Needs sudo so it works in crontab
    # Don't update the version! only this version works for using the same video source for multiple sources, which is needed for
    # having multiple browsers in one machine. Newer versions have "fixed this bug", now working the same as any OS, limiting to
    # one browser using the webcam at the same time, which is not good for our use case.
    v4l2_version=0.12.7
    mkdir -p /usr/src
    curl -L https://github.com/umlaeute/v4l2loopback/archive/v${v4l2_version}.tar.gz | tar xvz -C /usr/src
    cd /usr/src
    sudo dkms add -m v4l2loopback -v ${v4l2_version}
    if sudo dkms build -m v4l2loopback -v ${v4l2_version} 2>&1 | grep -q "BUILD_EXCLUSIVE"; then
        # Modify the dkms.conf file
        conf_file="/var/lib/dkms/v4l2loopback/${v4l2_version}/source/dkms.conf"
        # use fixed_v4l2_dkms.conf
        cp $SELF_PATH/prepare_scripts/fixed_v4l2_dkms.conf $conf_file
        sudo dkms build -m v4l2loopback -v ${v4l2_version}
    fi
    sudo dkms install -m v4l2loopback -v ${v4l2_version}
    cd $SELF_PATH
    sudo modprobe v4l2loopback devices=1 exclusive_caps=1
    echo "v4l2loopback" | tee /etc/modules-load.d/v4l2loopback.conf
    echo "options v4l2loopback devices=1 exclusive_caps=1" | tee /etc/modprobe.d/v4l2loopback.conf
}

install_node_dependencies_and_build() {
    ## Install node dependencies
    corepack enable pnpm
    corepack use pnpm@10
    pnpm install
    pnpm run build
    echo "node build completed"
}

pull_images() {
    # Pull images used by browser-emulator for faster initialization time
    docker pull docker.elastic.co/beats/metricbeat-oss:7.12.0
    docker network create browseremulator
    echo "docker images pulled"
}

install_firefox() {
    # Get the latest Firefox release version
    FFCHANNEL="latest"
    ARCH=$(uname -m)
    if [ "$ARCH" = "x86_64" ]; then
        LIBDIRSUFFIX="64"
    elif [[ "$ARCH" = i?86 ]]; then
        ARCH=i686
        LIBDIRSUFFIX=""
    else
        echo "The architecture $ARCH is not supported." >&2
        exit 1
    fi
    FFLANG="en-US"
    VERSION=$(wget --spider -S --max-redirect 0 "https://download.mozilla.org/?product=firefox-${FFCHANNEL}&os=linux${LIBDIRSUFFIX}&lang=${FFLANG}" 2>&1 | sed -n '/Location: /{s|.*/firefox-\(.*\)\.tar.*|\1|p;q;}')
    wget "https://download.mozilla.org/?product=firefox-${FFCHANNEL}&os=linux${LIBDIRSUFFIX}&lang=${FFLANG}" -O "firefox-${VERSION}.tar.xz"
    tar xJf "firefox-${VERSION}.tar.xz"
    mv firefox /opt
    ln -s /opt/firefox/firefox /usr/bin/firefox
    rm "firefox-${VERSION}.tar.xz"
    echo "firefox installed"
}

download_chrome() {
    wget -c https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb
}

install_v4l2loopback &
pull_images &
install_node_dependencies_and_build &
install_firefox &
install_chrome &
wait


apt-get install -f -yq ./google-chrome-stable_current_amd64.deb
apt-get install -f -yq
apt-get install -yq --no-install-recommends v4l2loopback-utils
rm -f google-chrome-stable_current_amd64.deb
echo "chrome installed"

