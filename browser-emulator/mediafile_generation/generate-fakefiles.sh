#!/usr/bin/env bash

if [[ -z "$1" ]] || [[ -z "$2" ]] || [[ -z "$3" ]]; then
    if [[ -z "$1" ]]; then
        echo "INPUT FILE argument is required" 1>&2
    fi
    if [[ -z "$2" ]]; then
        echo "OUTPUT FORMAT argument is required" 1>&2
    fi
	if [[ -z "$2" ]]; then
        echo "FRAME_SIZE argument is required" 1>&2
    fi
    echo "Example of use: ./generate-fakefiles.sh input.mp4 y4m 720x480" 1>&2
    exit 1
fi

INPUT_FILE=$1
OUTPUT_FILE="fakevideo.$2"
FRAME_SIZE=$3

if [ "$2" = "y4m" ]; then
	ffmpeg -i ${INPUT_FILE} -s ${OUTPUT_FORMAT} -r 30 -pix_fmt yuv420p -y ${OUTPUT_FILE} && \
	sed -i '0,/C420mpeg2/s//C420/' *.y4m && \
	ffmpeg -i ${INPUT_FILE} fakeaudio.wav
fi

if [ "$2" = "mkv" ]; then
	ffmpeg -i ${INPUT_FILE} -s ${OUTPUT_FORMAT} -r 30 -pix_fmt yuv420p -y ${OUTPUT_FILE} && \
	sed -i '0,/C420mpeg2/s//C420/' *.y4m && \
	ffmpeg -i ${INPUT_FILE} fakeaudio.wav
fi

# Chrome
#ffmpeg -i video_720x480.mp4 -s 640x480 -r 30 -pix_fmt yuv420p -y fakevideo_640x480.y4m && sed -i '0,/C420mpeg2/s//C420/' *.y4m && ffmpeg -i video_720x480.mp4 fakeaudio.wav

#KMS
# ffmpeg -i video_720x480.mkv -s 640x480 -r 30 -c:v vp8 -c:a libopus video_640x480.mkv
