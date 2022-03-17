#!/bin/bash

##################################################################################
# DEFAULT VALUES
##################################################################################

YUV_PROFILE=yuv420p
FFMPEG_LOG="-loglevel error"
USAGE="Usage: $(basename "$0") [-i=input] [-o=output]"

##################################################################################
# FUNCTIONS
##################################################################################

convert_yuv() {
    input=$1
    output=$2
    
    echo "Converting $input to $output ($YUV_PROFILE profile)"
    ffmpeg $FFMPEG_LOG -i $input -pix_fmt $YUV_PROFILE -c:v rawvideo -an -y $output
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
        *) # unknown option
            echo "$USAGE"
            exit 0
        ;;
    esac
done

######################
# Convert video to YUV
######################
if [ ! -f $OUTPUT ]; then
    convert_yuv $INPUT $OUTPUT
fi