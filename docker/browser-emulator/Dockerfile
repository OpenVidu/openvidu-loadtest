# Build browser-emulator
FROM ubuntu:20.04

WORKDIR /opt/openvidu-loadtest/browser-emulator
ARG DEBIAN_FRONTEND=noninteractive
ENV IS_DOCKER_CONTAINER=true
ENV VMAF_PATH=/usr/local/bin
ENV VQMT_PATH=/usr/local/bin
ENV PESQ_PATH=/usr/local/bin
ENV VISQOL_PATH=/usr/local/visqol

# Install curl and git
RUN apt-get update && apt-get install -yq \
  	curl git && \
	rm -rf /var/lib/apt/lists/*

COPY browser-emulator .
RUN ./prepare.sh 
RUN npm install && \
	npm run build

# Entrypoint
COPY ./entrypoint.sh /usr/local/bin
RUN chmod +x /usr/local/bin/entrypoint.sh

EXPOSE 5000
EXPOSE 5001

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["sh"]