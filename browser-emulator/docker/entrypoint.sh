#!/bin/sh

[[ -z "${OPENVIDU_URL}" ]] && export OPENVIDU_URL=$(curl -s ifconfig.co)
[[ -z "${OPENVIDU_SECRET}" ]] && export OPENVIDU_SECRET=$(cat /dev/urandom | tr -dc 'a-zA-Z0-9' | fold -w 32 | head -n 1)

# browser-emulator configuration
cat>/opt/browser-emulator/.env<<EOF
SERVER_PORT=${SERVER_PORT}
OPENVIDU_URL=${OPENVIDU_URL}
OPENVIDU_SECRET=${OPENVIDU_SECRET}
EOF


# Enable fake camera
# ls -al /dev/video*
# modprobe -r v4l2loopback
# git clone https://github.com/umlaeute/v4l2loopback/
# cd v4l2loopback
# ffmpeg -re -i /opt/browser-emulator/video_sample.mp4 -map 0:v -f v4l2 /dev/video0
# sudo modprobe v4l2loopback exclusive_caps=1





nodemon /opt/browser-emulator/server.js