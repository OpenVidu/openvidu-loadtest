#!/bin/bash
ffmpeg -hide_banner -loglevel warning -nostdin -y -stream_loop -1 -re -i $1 -vcodec rawvideo -pix_fmt yuv420p -threads 0 -f v4l2 /dev/video0