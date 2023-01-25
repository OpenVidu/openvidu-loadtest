#!/bin/bash
ffmpeg -y -stream_loop -1 -re -i $1 -f s16le -ar 48000 -ac 2 - > /tmp/virtmic