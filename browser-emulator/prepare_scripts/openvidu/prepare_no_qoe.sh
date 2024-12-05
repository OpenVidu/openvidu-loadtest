#!/usr/bin/env bash

# Shell setup, assumes running on AWS EC2 Ubuntu 20.04 able to build and install v4l2loopback module
# ====================================================

# Bash options for strict error checking.
set -o errexit -o errtrace -o pipefail -o nounset
shopt -s inherit_errexit 2>/dev/null || true

# Trace all commands.
set -o xtrace

DEBIAN_FRONTEND=noninteractive
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
  	curl git apt-transport-https ca-certificates software-properties-common gnupg python3-pip build-essential
mkdir -p /etc/apt/keyrings
curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | sudo gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
NODE_MAJOR=18
echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_$NODE_MAJOR.x nodistro main" | sudo tee /etc/apt/sources.list.d/nodesource.list
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | apt-key add -
source /etc/lsb-release # Get Ubuntu version definitions (DISTRIB_CODENAME).
add-apt-repository -y "deb [arch=amd64] https://download.docker.com/linux/ubuntu $DISTRIB_CODENAME stable"
apt-get update
apt-get install -yq --no-install-recommends \
    ffmpeg docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin xvfb linux-generic linux-modules-extra-$(uname -r) pulseaudio nodejs dkms
# Enable fake webcam for real browsers
# Needs sudo so it works in crontab
v4l2_version=0.12.7
mkdir -p /usr/src
curl -L https://github.com/umlaeute/v4l2loopback/archive/v${v4l2_version}.tar.gz | tar xvz -C /usr/src
cd /usr/src
sudo dkms add -m v4l2loopback -v ${v4l2_version}
if sudo dkms build -m v4l2loopback -v ${v4l2_version} 2>&1 | grep -q "BUILD_EXCLUSIVE"; then
    # Modify the dkms.conf file
    conf_file="/var/lib/dkms/v4l2loopback/${v4l2_version}/source/dkms.conf"
    # use fixed_v4l2_dkms.conf
    cp $SELF_PATH/fixed_v4l2_dkms.conf $conf_file
    sudo dkms build -m v4l2loopback -v ${v4l2_version}
fi
sudo dkms install -m v4l2loopback -v ${v4l2_version}
cd $SELF_PATH
sudo modprobe v4l2loopback devices=1 exclusive_caps=1
echo "v4l2loopback" | tee /etc/modules-load.d/v4l2loopback.conf 
echo "options v4l2loopback devices=1 exclusive_caps=1" | tee /etc/modprobe.d/v4l2loopback.conf
sudo update-initramfs -c -k $(uname -r)
apt-get install -yq --no-install-recommends v4l2loopback-utils
# Add user ubuntu to docker and syslog groups
sudo usermod -a -G docker ubuntu
sudo usermod -a -G syslog ubuntu

install_chrome() {
    wget -c https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb
    apt-get install -f -yq ./google-chrome-stable_current_amd64.deb
    apt-get install -f -yq
    rm -f google-chrome-stable_current_amd64.deb
}

install_ffmpeg() {
    ## Install ffmpeg
    # git clone https://git.ffmpeg.org/ffmpeg.git ffmpeg
    # cd ffmpeg
    # ./configure --enable-gpl --enable-libx264 --enable-libx265 --enable-libvmaf --enable-version3
    # make -j4
    # make install
    export LD_LIBRARY_PATH=/usr/local/lib${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}
    echo export LD_LIBRARY_PATH=/usr/local/lib${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH} | tee -a /etc/profile
    echo "ffmpeg installed"
}

install_node_dependencies_and_build() {
    ## Install node dependencies
    corepack enable pnpm
    corepack use pnpm@9.12.1+sha512.e5a7e52a4183a02d5931057f7a0dbff9d5e9ce3161e33fa68ae392125b79282a8a8a470a51dfc8a0ed86221442eb2fb57019b0990ed24fab519bf0e1bc5ccfc4
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

install_ffmpeg &
install_node_dependencies_and_build &
install_chrome &
pull_images &
wait


# Create recording directories
mkdir -p ./recordings/chrome
mkdir -p ./recordings/qoe

chown -R ubuntu:ubuntu /opt/openvidu-loadtest/

echo '@reboot cd /opt/openvidu-loadtest/browser-emulator && npm run start:prod > /var/log/crontab.log 2>&1' 2>&1 | crontab -u ubuntu -