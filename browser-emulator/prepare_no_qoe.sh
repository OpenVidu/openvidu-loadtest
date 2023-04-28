#!/usr/bin/env bash

# Shell setup, assumes running on AWS EC2 Ubuntu 20.04
# ====================================================

# Bash options for strict error checking.
set -o errexit -o errtrace -o pipefail -o nounset
shopt -s inherit_errexit 2>/dev/null || true

# Trace all commands.
set -o xtrace

DEBIAN_FRONTEND=noninteractive

SELF_PATH="$(cd -P -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)" # Absolute canonical path

## Install necessary packages
apt-get update
apt-get upgrade -yq
apt-get install -yq --no-install-recommends \
  	curl git apt-transport-https ca-certificates software-properties-common gnupg python3-pip
curl -sL https://deb.nodesource.com/setup_18.x | bash - 
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | apt-key add -
source /etc/lsb-release # Get Ubuntu version definitions (DISTRIB_CODENAME).
add-apt-repository "deb [arch=amd64] https://download.docker.com/linux/ubuntu $DISTRIB_CODENAME stable"
apt-get update
apt-get install -yq --no-install-recommends \
    ffmpeg docker-ce xvfb v4l2loopback-dkms v4l2loopback-utils linux-modules-extra-$(uname -r) pulseaudio nodejs
# Enable fake webcam for real browsers
# Needs sudo so it works in crontab
sudo modprobe v4l2loopback devices=1 exclusive_caps=1
echo "v4l2loopback devices=1 exclusive_caps=1" > /etc/modules-load.d/v4l2loopback.conf
# Add user ubuntu to docker and syslog groups
sudo usermod -a -G docker ubuntu
sudo usermod -a -G syslog ubuntu

install_chrome() {
    wget https://dl.google.com/linux/chrome/deb/pool/main/g/google-chrome-stable/google-chrome-stable_112.0.5615.165-1_amd64.deb
    apt-get install -f -yq ./google-chrome-stable_112.0.5615.165-1_amd64.deb
    apt-get install -f -yq
    rm -f google-chrome-stable_112.0.5615.165-1_amd64.deb
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
}

install_node_dependencies_and_build() {
    ## Install node dependencies
    npm --prefix /opt/openvidu-loadtest/browser-emulator install 
    npm --prefix /opt/openvidu-loadtest/browser-emulator run build
}

install_ffmpeg &
install_node_dependencies_and_build &
install_chrome &
wait

pip3 install https://s3.amazonaws.com/cloudformation-examples/aws-cfn-bootstrap-py3-latest.tar.gz

# Pull images used by browser-emulator for faster initialization time
docker pull docker.elastic.co/beats/metricbeat-oss:7.12.0
docker pull kurento/kurento-media-server:latest
docker network create browseremulator

# Create recording directories
mkdir -p ../../browser-emulator/recordings/kms
mkdir -p ../../browser-emulator/recordings/chrome
mkdir -p ../../browser-emulator/recordings/qoe

chown -R ubuntu:ubuntu /opt/openvidu-loadtest/

echo '@reboot cd /opt/openvidu-loadtest/browser-emulator && npm run start:prod > /var/log/crontab.log 2>&1' 2>&1 | crontab -u ubuntu -

# sending the finish call
/usr/local/bin/cfn-signal -e 0 --stack ${AWS_STACK} --resource BrowserInstance --region ${AWS_REGION}

echo "Instance is ready"
