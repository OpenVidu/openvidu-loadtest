#!/bin/bash

##################################################################################
# DEFAULT VALUES
##################################################################################

FFMPEG_LOG="-loglevel error"
PESQ_AUDIO_SAMPLE_RATE=16000
USAGE="Usage: $(basename "$0") [-i=input] [-o=output]"

##################################################################################
# FUNCTIONS
##################################################################################

extract_wav() {
    input=$1
    output=$2
    
    echo "Extracting $output from $input"
    ffmpeg $FFMPEG_LOG -y -i $input -async 1 $output
    
    echo "Resampling audio for PESQ analysis ($PESQ_AUDIO_SAMPLE_RATE Hz) resampled_$output from $input"
    ffmpeg $FFMPEG_LOG -y -i $input -ar $PESQ_AUDIO_SAMPLE_RATE resampled_$output
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

#######################
# Extract audio to WAV
#######################
if [ ! -f $OUTPUT ]; then
    extract_wav $INPUT $OUTPUT
fi