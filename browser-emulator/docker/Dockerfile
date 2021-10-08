FROM ubuntu:18.04


# Install Node, supervisor and netstat
RUN apt-get update && apt-get -y upgrade \
    # &&  apt-get -y install linux-headers-$(uname -r) \
    # && apt-get -y install ffmpeg \
    # && apt-get -y install v4l2loopback-utils \
    # && apt-get -y install v4l2loopback-dkms \
    # && apt-get -y install build-essential \
    # && apt-get -y install git \
    && apt-get -y install curl \
	  && curl -sL https://deb.nodesource.com/setup_14.x | bash \
  	&& apt-get -y install nodejs \
    && npm install -g nodemon \
  	&& rm -rf /var/lib/apt/lists/*


COPY ./dist /opt/browser-emulator
# COPY ./video_sample.mp4 /opt/browser-emulator
COPY ./docker/entrypoint.sh /usr/local/bin

RUN chmod +x /usr/local/bin/entrypoint.sh

CMD ["/usr/local/bin/entrypoint.sh"]
