#!/bin/bash
export FFREPORT=file=/opt/openvidu-loadtest/browser-emulator/ffmpeg_logs/ffmpeg-$(date +%Y%m%s).log:level=24
ffmpeg -y \
    -stream_loop -1 -re -i $1 \
    -stream_loop -1 -re -i $2 \
    -map 0 \
    -vcodec rawvideo -pix_fmt yuv420p -threads 0 -f v4l2 -shortest /dev/video0 \
    -map 1 \
    -f s16le -ar 48000 -ac 2 -shortest /tmp/virtmic > /dev/null 2>&1 < /dev/null > /dev/null 2>&1 < /dev/null