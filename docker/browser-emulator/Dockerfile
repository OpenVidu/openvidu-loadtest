# Build browser-emulator
FROM ubuntu:20.04

WORKDIR /opt/browser-emulator
ARG DEBIAN_FRONTEND=noninteractive
ENV IS_DOCKER_CONTAINER=true

# Install curl and git
RUN apt-get update && apt-get install -yq \
  	wget curl git && \
	rm -rf /var/lib/apt/lists/*

COPY browser-emulator .

RUN ./prepare.sh && \
  	npm install && \
	npm run build

# Entrypoint
COPY ./entrypoint.sh /usr/local/bin
RUN chmod +x /usr/local/bin/entrypoint.sh

EXPOSE 5000
EXPOSE 5001

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["sh"]