#!/usr/bin/env bash

# Shell setup, assumes running on AWS EC2 Ubuntu 22.04
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

SELF_PATH="$(cd -P -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)" # Absolute canonical path

## Install necessary packages
apt-get update
apt-get upgrade -yq
apt-get install -yq --no-install-recommends \
  	curl git apt-transport-https ca-certificates software-properties-common gnupg python3-pip
mkdir -p /etc/apt/keyrings
curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | sudo gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
NODE_MAJOR=18
echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_$NODE_MAJOR.x nodistro main" | sudo tee /etc/apt/sources.list.d/nodesource.list
curl -fsSL https://bazel.build/bazel-release.pub.gpg | gpg --dearmor > bazel.gpg
mv bazel.gpg /etc/apt/trusted.gpg.d/
echo "deb [arch=amd64] https://storage.googleapis.com/bazel-apt stable jdk1.8" | tee /etc/apt/sources.list.d/bazel.list
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | apt-key add -
source /etc/lsb-release # Get Ubuntu version definitions (DISTRIB_CODENAME).
add-apt-repository -y "deb [arch=amd64] https://download.docker.com/linux/ubuntu $DISTRIB_CODENAME stable"
apt-get update
apt-get install -yq --no-install-recommends \
	build-essential bc make cmake libopencv-dev python3-opencv bazel libnetpbm10-dev xxd \
    libjpeg-turbo-progs imagemagick-6.q16 jq automake g++ libtool libleptonica-dev pkg-config nasm ninja-build \
    meson doxygen libx264-dev libx265-dev libnuma-dev \
    ffmpeg docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin xvfb linux-modules-extra-$(uname -r) pulseaudio nodejs dkms
pkg-config --cflags --libs opencv4
# Enable fake webcam for real browsers
# Needs sudo so it works in crontab
v4l2_version=0.12.7
mkdir -p /usr/src
curl -L https://github.com/umlaeute/v4l2loopback/archive/v${v4l2_version}.tar.gz | tar xvz -C /usr/src
cd /usr/src
sudo dkms add -m v4l2loopback -v ${v4l2_version}
sudo dkms build -m v4l2loopback -v ${v4l2_version}
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
# Needed for VISQOL, put here so it doesn't conflict with other python installation parallel to it
pip3 install numpy

install_firefox() {
    apt-get install -f -yq firefox
}

install_vmaf() {
    ## Install VMAF
    if [[ ! -f "/usr/local/bin/vmaf" ]]; then
    curl --output "/tmp/vmaf.tar.gz" \
            --continue-at - \
            --location "https://github.com/Netflix/vmaf/archive/refs/tags/v2.3.0.tar.gz"
    fi
    cd /tmp
    tar -xvf vmaf.tar.gz
    cd vmaf-2.3.0/libvmaf/
    meson build --buildtype release
    ninja -vC build
    ninja -vC build install
    cp /usr/local/lib/x86_64-linux-gnu/libvmaf.* /usr/local/lib/
    cd ..
    mkdir -p /usr/local/share/vmaf/models/
    cp -r model/* /usr/local/share/vmaf/models/
    cd ..
    rm -rf vmaf-2.3.0
    rm vmaf.tar.gz
    export VMAF_PATH=/usr/local/bin
    echo export VMAF_PATH=/usr/local/bin | tee -a /etc/profile
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

install_vqmt() {
    ## Install VQMT
    git clone https://github.com/Rolinh/VQMT
    cd VQMT
    make
    mv ./build/bin/Release/vqmt /usr/local/bin/vqmt
    cd ..
    rm -rf VQMT
    export VQMT_PATH=/usr/local/bin
    echo export VQMT_PATH=/usr/local/bin | tee -a /etc/profile
    cd $SELF_PATH
}

install_pesq() {
    ## Install PESQ
    git clone https://github.com/dennisguse/ITU-T_pesq
    cd ITU-T_pesq
    make
    mv ./bin/itu-t-pesq2005 /usr/local/bin/pesq
    cd ..
    rm -rf ITU-T_pesq
    export PESQ_PATH=/usr/local/bin
    echo export PESQ_PATH=/usr/local/bin | tee -a /etc/profile
}

install_visqol() {
    ## Install VISQOL
    curl --output "/tmp/visqol.tar.gz" \
            --continue-at - \
            --location "https://github.com/google/visqol/archive/refs/tags/v3.3.3.tar.gz"
    cd /tmp
    tar -xvf visqol.tar.gz
    rm visqol.tar.gz
    cd visqol-3.3.3
    bazel build :visqol -c opt
    cd ..
    mv visqol-3.3.3 /usr/local/visqol
    export VISQOL_PATH=/usr/local/visqol
    echo export VISQOL_PATH=/usr/local/visqol | tee -a /etc/profile
    rm -rf visqol-3.3.3
    cd $SELF_PATH
}

install_tesseract() {
    ## Install tesseract
    ## Building tesseract ST for better performance, check https://tesseract-ocr.github.io/tessdoc/Compiling-%E2%80%93-GitInstallation.html#release-builds-for-mass-production
    curl --output "/tmp/tesseract.tar.gz" \
            --continue-at - \
            --location "https://github.com/tesseract-ocr/tesseract/archive/refs/tags/4.1.3.tar.gz"
    cd /tmp
    tar -xvf tesseract.tar.gz
    rm tesseract.tar.gz
    cd tesseract-4.1.3
    ./autogen.sh
    mkdir -p bin/release
    cd bin/release
    ../../configure --disable-openmp --disable-shared 'CXXFLAGS=-g -O2 -fno-math-errno -Wall -Wextra -Wpedantic'
    make
    make install
    cd ../../..
    rm -rf tesseract-4.1.3
    cd $SELF_PATH
    curl --output "/usr/local/share/tessdata/eng.traineddata" \
            --continue-at - \
            --location "https://github.com/tesseract-ocr/tessdata/raw/main/eng.traineddata"
}

install_python_dependencies() {
    ## Install python dependencies
    pip3 install -r /opt/openvidu-loadtest/browser-emulator/qoe_scripts/requirements.txt
}

install_node_dependencies_and_build() {
    ## Install node dependencies
    npm install -g yarn
    yarn --cwd /opt/openvidu-loadtest/browser-emulator install --verbose
    yarn --cwd /opt/openvidu-loadtest/browser-emulator run build
    echo "node build completed"
}

pull_images() {
    # Pull images used by browser-emulator for faster initialization time
    docker pull docker.elastic.co/beats/metricbeat-oss:7.12.0
    docker pull kurento/kurento-media-server:latest
    docker network create browseremulator
    echo "docker images pulled"
}

install_ffmpeg &
install_vqmt &
install_pesq &
install_visqol &
install_vmaf &
install_tesseract &
install_python_dependencies &
install_node_dependencies_and_build &
install_firefox &
pull_images &
wait

# Create recording directories
mkdir -p ./recordings/kms
mkdir -p ./recordings/chrome
mkdir -p ./recordings/qoe

chown -R ubuntu:ubuntu /opt/openvidu-loadtest/

echo '@reboot cd /opt/openvidu-loadtest/browser-emulator && npm run start:prod-livekit-firefox > /var/log/crontab.log 2>&1' 2>&1 | crontab -u ubuntu -
