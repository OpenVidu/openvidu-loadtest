#!/bin/bash
ffmpeg -y \
    -stream_loop -1 -re -i $1 \
    -stream_loop -1 -re -i $2 \
    -map 0 \
    -vcodec rawvideo -pix_fmt yuv420p -threads 0 -f v4l2 /dev/video0 \
    -map 1 \
    -f s16le -ar 48000 -ac 2 -threads 0 /tmp/virtmic > /var/log/ffmpeg.log 2>&1 < /dev/null