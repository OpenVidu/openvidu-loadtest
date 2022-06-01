#!/bin/bash

##################################################################################
# DEFAULT VALUES
##################################################################################

PESQ_AUDIO_SAMPLE_RATE=16000
USAGE="Usage: $(basename "$0") [-ip=input_presenter] [-iv=input_viewer] [-o=output]"

##################################################################################
# PARSE ARGUMENTS
##################################################################################

for i in "$@"; do
    case $i in
        -ip=*|--input_presenter=*)
            INPUT_PRESENTER="${i#*=}"
            shift
        ;;
        -iv=*|--input_viewer=*)
            INPUT_VIEWER="${i#*=}"
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

##########
# Run PESQ
##########
if [ ! -f ${OUTPUT}_pesq.txt ]; then
    echo "Running PESQ on resampled_${INPUT_PRESENTER} and resampled_${INPUT_VIEWER}"
    ORIG_PWD=$PWD
    cd $PESQ_PATH
    ./pesq +$PESQ_AUDIO_SAMPLE_RATE $ORIG_PWD/${INPUT_PRESENTER} $ORIG_PWD/${INPUT_VIEWER} | tail -n 1 > $ORIG_PWD/${OUTPUT}_pesq.txt
    cd $ORIG_PWD
fi