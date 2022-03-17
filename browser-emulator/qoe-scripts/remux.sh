#!/bin/bash

##################################################################################
# DEFAULT VALUES
##################################################################################
WIDTH=640
HEIGHT=480
FPS=30
VIDEO_BITRATE=3M
YUV_PROFILE=yuv420p
FFMPEG_OPTIONS="-c:v libvpx -b:v $VIDEO_BITRATE -pix_fmt $YUV_PROFILE"
FFMPEG_LOG="-loglevel error"
USAGE="Usage: $(basename "$0") [-i=input] [-o=output] [-p=prefix] [-w=width] [-h=height] [-f=fps]"

remux() {
    input=$1
    output2=$2
    
    echo "Remuxing $input to $output2"
    ffmpeg $FFMPEG_LOG -y -i $input -s ${WIDTH}x${HEIGHT} $FFMPEG_OPTIONS $PREFIX-remux.webm
    ffmpeg $FFMPEG_LOG -y -i $PREFIX-remux.webm -filter:v "minterpolate='mi_mode=dup:fps=$FPS'" $output2
}

##################################################################################
# PARSE ARGUMENTS
##################################################################################

for i in "$@"; do
    case $i in
        -i=*|--input=*)
            INPUT="${i#*=}"
            shift
        ;;
        -o=*|--output=*)
            OUTPUT="${i#*=}"
            shift
        ;;
        -p=*|--prefix=*)
            PREFIX="${i#*=}"
            shift
        ;;
        -w=*|--width=*)
            WIDTH="${i#*=}"
            shift
        ;;
        -h=*|--height=*)
            HEIGHT="${i#*=}"
            shift
        ;;
        -f=*|--fps=*)
            FPS="${i#*=}"
            shift
        ;;
        *) # unknown option
            echo "$USAGE"
            exit 0
        ;;
    esac
done


################################################################
# Remux presenter and viewer with a fixed bitrate and resolution
################################################################
if [ -z "$VMAF_PATH" ]; then
    echo "You need to provide the path to VMAF binaries (check out from https://github.com/Netflix/vmaf) in the environmental variable VMAF_PATH"
    exit 1
fi
if [ -z "$VQMT_PATH" ]; then
    echo "You need to provide the path to VQMT binaries (check out from https://github.com/Rolinh/VQMT) in the environmental variable VQMT_PATH"
    exit 1
fi
if [ -z "$PESQ_PATH" ]; then
    echo "You need to provide the path to PESQ binaries (https://github.com/dennisguse/ITU-T_pesq) in the environmental variable PESQ_PATH"
    exit 1
fi
if [ -z "$VISQOL_PATH" ]; then
    echo "You need to provide the path to ViSQOL binaries (https://sites.google.com/a/tcd.ie/sigmedia/) in the environmental variable VISQOL_PATH"
    exit 1
fi
if [ ! -f "$OUTPUT" ]; then
    remux "$INPUT" "$OUTPUT"
fi