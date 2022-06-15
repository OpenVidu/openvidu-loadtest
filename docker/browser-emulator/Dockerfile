# Build dependencies
FROM ubuntu:20.04 AS base

ARG DEBIAN_FRONTEND=noninteractive
ENV TZ=Europe/Madrid

RUN apt-get update && apt-get install -yq --no-install-recommends \
  	curl git apt-transport-https ca-certificates software-properties-common gnupg && \
	curl -fsSL https://bazel.build/bazel-release.pub.gpg | gpg --dearmor > bazel.gpg && \
	mv bazel.gpg /etc/apt/trusted.gpg.d/ && \
	echo "deb [arch=amd64] https://storage.googleapis.com/bazel-apt stable jdk1.8" | tee /etc/apt/sources.list.d/bazel.list && \
	apt-get update && \
	apt-get install -yq --no-install-recommends \
	build-essential bc make cmake libopencv-dev python3-opencv bazel libnetpbm10-dev xxd \
    libjpeg-turbo-progs imagemagick-6.q16 jq automake g++ libtool libleptonica-dev pkg-config nasm ninja-build \
    meson doxygen libx264-dev libx265-dev libnuma-dev && \
	pkg-config --cflags --libs opencv4 && \
	rm -rf /var/lib/apt/lists/*

# Install dependencies that can't be installed via apt-get
# Build VMAF
FROM base AS vmaf
WORKDIR /tmp
RUN curl --output "/tmp/vmaf.tar.gz" \
        --continue-at - \
        --location "https://github.com/Netflix/vmaf/archive/refs/tags/v2.3.0.tar.gz"
RUN tar -xvf vmaf.tar.gz
WORKDIR /tmp/vmaf-2.3.0/libvmaf/
RUN meson build --buildtype release && \
	ninja -vC build && \
	ninja -vC build install

FROM base AS vqmt
# Build VQMT
WORKDIR /tmp
RUN git clone https://github.com/Rolinh/VQMT
WORKDIR /tmp/VQMT
RUN make

FROM base AS pesq
# Build PESQ
WORKDIR /tmp
RUN git clone https://github.com/dennisguse/ITU-T_pesq
WORKDIR /tmp/ITU-T_pesq
RUN make

FROM base AS visqol
# Build VISQOL
WORKDIR /tmp
RUN curl --output "/tmp/visqol.tar.gz" \
        --continue-at - \
        --location "https://github.com/google/visqol/archive/refs/tags/v3.1.0.tar.gz"
RUN tar -xvf visqol.tar.gz
WORKDIR /tmp/visqol-3.1.0/
RUN bazel build :visqol -c opt

FROM base AS tesseract
# Build tesseract
## Building tesseract ST for better performance, check https://tesseract-ocr.github.io/tessdoc/Compiling-%E2%80%93-GitInstallation.html#release-builds-for-mass-production
WORKDIR /tmp
RUN curl --output "/tmp/tesseract.tar.gz" \
        --continue-at - \
        --location "https://github.com/tesseract-ocr/tesseract/archive/refs/tags/4.1.3.tar.gz"
RUN tar -xvf tesseract.tar.gz
WORKDIR /tmp/tesseract-4.1.3/
RUN ./autogen.sh && \
	./configure --disable-openmp --disable-shared 'CXXFLAGS=-g -O2 -fno-math-errno -Wall -Wextra -Wpedantic' && \
	make -j$(nproc) && \
	make install

# Build and run browser-emulator
FROM ubuntu:20.04

WORKDIR /opt/openvidu-loadtest/browser-emulator
ARG DEBIAN_FRONTEND=noninteractive
ENV IS_DOCKER_CONTAINER=true
ENV VMAF_PATH=/usr/local/bin
ENV VQMT_PATH=/usr/local/bin
ENV PESQ_PATH=/usr/local/bin
ENV VISQOL_PATH=/usr/local/visqol
ENV LD_LIBRARY_PATH=/usr/local/lib
ENV PYTHONPATH=/opt/openvidu-loadtest/browser-emulator

# Get libraries
COPY --from=base /usr/local/bin/ /usr/local/bin/
COPY --from=base /usr/local/share/ /usr/local/share/
COPY --from=base /usr/local/lib/ /usr/local/lib/
COPY --from=base /usr/local/include/ /usr/local/include/
COPY --from=base /usr/include/ /usr/include/
COPY --from=base /usr/bin/ /usr/bin/
COPY --from=base /usr/lib/ /usr/lib/
COPY --from=base /usr/lib64/ /usr/lib64/

COPY --from=vmaf /usr/local/bin/ /usr/local/bin/
COPY --from=vmaf /usr/local/share/ /usr/local/share/
COPY --from=vmaf /usr/local/lib/ /usr/local/lib/
COPY --from=vmaf /usr/local/include/ /usr/local/include/
COPY --from=vmaf /usr/include/ /usr/include/
COPY --from=vmaf /usr/bin/ /usr/bin/
COPY --from=vmaf /usr/lib/ /usr/lib/
COPY --from=vmaf /usr/lib64/ /usr/lib64/

COPY --from=tesseract /usr/local/bin/ /usr/local/bin/
COPY --from=tesseract /usr/local/share/ /usr/local/share/
COPY --from=tesseract /usr/local/lib/ /usr/local/lib/
COPY --from=tesseract /usr/local/include/ /usr/local/include/
COPY --from=tesseract /usr/include/ /usr/include/
COPY --from=tesseract /usr/bin/ /usr/bin/
COPY --from=tesseract /usr/lib/ /usr/lib/
COPY --from=tesseract /usr/lib64/ /usr/lib64/

# Get VMAF
COPY --from=vmaf /tmp/vmaf-2.3.0/model/* /usr/local/share/vmaf/models/

# Get VQMT
COPY --from=vqmt /tmp/VQMT/build/bin/Release/vqmt /usr/local/bin/vqmt

# Get PESQ
COPY --from=pesq /tmp/ITU-T_pesq/bin/itu-t-pesq2005 /usr/local/bin/pesq

# Get VISQOL
COPY --from=visqol /root/.cache/bazel/ /root/.cache/bazel/
COPY --from=visqol /tmp/visqol-3.1.0 /usr/local/visqol

# Install dependencies
RUN apt-get update && apt-get install -yq --no-install-recommends \
  	curl apt-transport-https ca-certificates software-properties-common python3-pip gnupg && \
	curl -sL https://deb.nodesource.com/setup_14.x | bash - && \
	apt-get install -yq --no-install-recommends \
	nodejs ffmpeg libopencv-dev python3-opencv jq pkg-config && \
	pkg-config --cflags --libs opencv4 && \
	rm -rf /var/lib/apt/lists/*

# Get tesseract
RUN curl --output "/usr/local/share/tessdata/eng.traineddata" \
        --continue-at - \
        --location "https://github.com/tesseract-ocr/tessdata/raw/main/eng.traineddata"

COPY ["browser-emulator/package.json", "browser-emulator/package-lock.json*", "./"]
RUN npm install

COPY ["browser-emulator/qoe_scripts/requirements.txt", "./qoe_scripts/"]

## Install python dependencies
RUN pip3 install -r /opt/openvidu-loadtest/browser-emulator/qoe_scripts/requirements.txt

COPY browser-emulator/ .
RUN npm run build

# Entrypoint
COPY ./entrypoint.sh /usr/local/bin
RUN chmod +x /usr/local/bin/entrypoint.sh

EXPOSE 5000
EXPOSE 5001

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["sh"]