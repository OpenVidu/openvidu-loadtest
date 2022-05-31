#!/usr/bin/env bash

# Shell setup
# ===========

# Bash options for strict error checking.
set -o errexit -o errtrace -o pipefail -o nounset
shopt -s inherit_errexit 2>/dev/null || true

# Trace all commands.
set -o xtrace

DOCKER_CONTAINER="${IS_DOCKER_CONTAINER:-false}"


# Check Node.js
# =============

command -v node >/dev/null || {
    echo "Installing Node.js"
    curl -sL https://deb.nodesource.com/setup_14.x | bash -
    apt-get install --no-install-recommends --yes \
        nodejs
}


# Check Docker
# ============

command -v docker >/dev/null || {
    echo "Installing Docker CE"
    apt-get install --no-install-recommends --yes \
        apt-transport-https \
        ca-certificates \
        curl \
        software-properties-common
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | apt-key add -
    source /etc/lsb-release # Get Ubuntu version definitions (DISTRIB_CODENAME).
    add-apt-repository "deb [arch=amd64] https://download.docker.com/linux/ubuntu $DISTRIB_CODENAME stable"
    apt-get update && apt-get install --no-install-recommends --yes \
        docker-ce
    # usermod -aG docker "$USER"
    # newgrp docker
}

# Check Pip3
# ==========
command -v python3-pip >/dev/null || {
    apt-get install -y python3-pip
}


# Check FFmpeg
# ============

## Ffmpeg is only used with NODE_CANVAS strategy. However, this strategy consume more resources than we expected so, for now, it will be disabled
# command -v ffmpeg >/dev/null || {
#     echo "Installing Ffmpeg"
#     snap install ffmpeg
# }

SELF_PATH="$(cd -P -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)" # Absolute canonical path

# Download mediafiles
# ============

if [ "$DOCKER_CONTAINER" = false ]; then
    echo "Downloading media files..."
    "$SELF_PATH"/download_mediafiles.sh
fi

## Give execution rights to the scripts
chmod +x "$SELF_PATH"/qoe-scripts/*.sh

## Install Bazel apt repo (needed for ViSQOL)
curl -fsSL https://bazel.build/bazel-release.pub.gpg | gpg --dearmor > bazel.gpg
mv bazel.gpg /etc/apt/trusted.gpg.d/
echo "deb [arch=amd64] https://storage.googleapis.com/bazel-apt stable jdk1.8" | tee /etc/apt/sources.list.d/bazel.list

## Install necessary packages
apt-get update
apt-get install --no-install-recommends -y apt-transport-https curl gnupg
apt-get update
apt-get install --no-install-recommends -y build-essential bc make cmake git libopencv-dev python3-opencv bazel libnetpbm10-dev \
    libjpeg-turbo-progs imagemagick-6.q16 jq automake ca-certificates g++ libtool libleptonica-dev pkg-config nasm ninja-build \
    meson doxygen libx264-dev libx265-dev libnuma-dev
pkg-config --cflags --libs opencv4

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

## Install ffmpeg
git clone https://git.ffmpeg.org/ffmpeg.git ffmpeg
cd ffmpeg
./configure --enable-gpl --enable-libx264 --enable-libx265 --enable-libvmaf --enable-version3
make -j4
make install
export LD_LIBRARY_PATH=/usr/local/lib${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}
echo export LD_LIBRARY_PATH=/usr/local/lib${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH} | tee -a /etc/profile

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

## Install PESQ
git clone https://github.com/dennisguse/ITU-T_pesq
cd ITU-T_pesq
make
mv ./bin/itu-t-pesq2005 /usr/local/bin/pesq
cd ..
rm -rf ITU-T_pesq
export PESQ_PATH=/usr/local/bin
echo export PESQ_PATH=/usr/local/bin | tee -a /etc/profile

## Install VISQOL
curl --output "/tmp/visqol.tar.gz" \
        --continue-at - \
        --location "https://github.com/google/visqol/archive/refs/tags/v3.1.0.tar.gz"
cd /tmp
tar -xvf visqol.tar.gz
rm visqol.tar.gz
cd visqol-3.1.0
bazel build :visqol -c opt
cd ..
mv visqol-3.1.0 /usr/local/visqol
export VISQOL_PATH=/usr/local/visqol
echo export VISQOL_PATH=/usr/local/visqol | tee -a /etc/profile
rm -rf visqol-3.1.0
cd $SELF_PATH

## Install GOCR

# curl --output "/tmp/gocr-0.52.tar.gz" \
#         --continue-at - \
#         --location "https://www-e.ovgu.de/jschulen/ocr/gocr-0.52.tar.gz"
# cd /tmp
# tar -xvf gocr-0.52.tar.gz
# rm gocr-0.52.tar.gz
# cd gocr-0.52
# ./configure
# make
# make install
# cd ..
# rm -rf gocr-0.52
# cd $SELF_PATH

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
ldconfig
cd ../../..
rm -rf tesseract-4.1.3
cd $SELF_PATH
curl --output "/usr/local/share/tessdata/eng.traineddata" \
        --continue-at - \
        --location "https://github.com/tesseract-ocr/tessdata/raw/main/eng.traineddata"
		
## Install python dependencies
pip3 install -r /opt/openvidu-loadtest/browser-emulator/qoe-scripts/requirements.txt

echo "Instance is ready"
