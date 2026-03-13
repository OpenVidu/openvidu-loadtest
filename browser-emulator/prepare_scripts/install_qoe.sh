#!/usr/bin/env bash

# Shell setup of needed software for QoE analysis, assumes running on Ubuntu 20.04
# Should have run install_base.sh before this to set up the base installation
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
apt-get install -yq --no-install-recommends build-essential bc make cmake libopencv-dev python3-opencv libnetpbm10-dev xxd \
    libjpeg-turbo-progs imagemagick-6.q16 jq automake g++ libtool libleptonica-dev pkg-config nasm ninja-build \
    meson doxygen libx264-dev libx265-dev libnuma-dev python3-venv python3-numpy
pkg-config --cflags --libs opencv4
# Create a python virtual environment usable by any user
# Add venv activation to /etc/profile.d so it's loaded for all users by default
python3 -m venv /opt/venv --system-site-packages
chmod -R 755 /opt/venv
echo 'export PATH=/opt/venv/bin:$PATH' | tee -a /etc/profile.d/venv.sh
export PATH=/opt/venv/bin:$PATH

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
}

install_vqmt() {
    ## Install VQMT
    git clone https://github.com/Rolinh/VQMT
    cd VQMT
    make
    mv ./build/bin/Release/vqmt /usr/local/bin/vqmt
    cd ..
    rm -rf VQMT
    cd "$SELF_PATH"
}

install_pesq() {
    ## Install PESQ
    git clone https://github.com/dennisguse/ITU-T_pesq
    cd ITU-T_pesq
    # Newer GCC defaults to -fno-common which treats common symbols as multiple
    # definitions. Build with -fcommon to allow legacy common symbol definitions
    # present in this upstream code.
    make CFLAGS="-fcommon"
    mv ./bin/itu-t-pesq2005 /usr/local/bin/pesq
    cd ..
    rm -rf ITU-T_pesq
}

install_visqol() {
    ## Install VISQOL
    # Based on https://github.com/google/visqol/issues/136#issuecomment-4007213267
    # 0. Install bazelisk
    curl -L -o /usr/local/bin/bazel https://github.com/bazelbuild/bazelisk/releases/download/v1.28.1/bazelisk-linux-amd64
    chmod +x /usr/local/bin/bazel

    # 1. First, perform the fetch with the experimental flag.
    # This downloads the dependencies into the cache.
    git clone https://github.com/google/visqol.git
    cd visqol
    bazel fetch --experimental_repo_remote_exec :visqol

    # 2. Now that the files are downloaded, find and patch spectrogram.cc
    TFLITE_FILE=$(find $(bazel info output_base)/external -name spectrogram.cc | grep "internal/spectrogram.cc" | head -n 1)

    if [ -n "$TFLITE_FILE" ]; then
        echo "Patching $TFLITE_FILE..."
        # Add the missing header required for GCC 11+
        sed -i '1i #include <cstdint>' "$TFLITE_FILE"
    else
        echo "Error: spectrogram.cc not found. Check if the fetch step failed."
    fi

    # 3. Finally, run the build
    bazel build :visqol -c opt --copt=-w --experimental_repo_remote_exec

    cp $(bazel info bazel-bin)/visqol /usr/local/bin/visqol
    chmod 755 /usr/local/bin/visqol

    mkdir -p /usr/local/share/visqol/
    cp model/libsvm_nu_svr_model.txt /usr/local/share/visqol/libsvm_nu_svr_model.txt
    cd ..
    rm -rf visqol

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

install_vqmt &
install_pesq &
install_visqol &
install_vmaf &
install_tesseract &
install_python_dependencies &
wait

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
