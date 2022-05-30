#!/bin/bash

##################################################################################
# DEFAULT VALUES
##################################################################################

USAGE="Usage: $(basename "$0") [-ip=input_presenter] [-iv=input_viewer] [-o=output] [-w=width] [-h=height]"

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
        -w=*|--width=*)
            WIDTH="${i#*=}"
            shift
        ;;
        -h=*|--height=*)
            HEIGHT="${i#*=}"
            shift
        ;;
        *) # unknown option
            echo "$USAGE"
            exit 0
        ;;
    esac
done

##########
# Run VMAF
##########
if [ ! -f ${OUTPUT}_vmaf.csv ]; then
    echo "Running VMAF on $INPUT_PRESENTER and $INPUT_VIEWER"
    $VMAF_PATH/vmaf -p 420 -w $WIDTH -h $HEIGHT -b 8 -r $INPUT_PRESENTER -d $INPUT_VIEWER -m path=/usr/local/share/vmaf/models/vmaf_v0.6.1.json --json -o $PWD/${OUTPUT}_vmaf.json && cat $PWD/${OUTPUT}_vmaf.json | jq '.frames[].metrics.vmaf' > $PWD/${OUTPUT}_vmaf.csv
fi