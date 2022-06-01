#!/bin/bash

##################################################################################
# DEFAULT VALUES
##################################################################################

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

############
# Run ViSQOL
############
if [ ! -f ${OUTPUT}_visqol.txt ]; then
    echo "Running ViSQOL on $INPUT_PRESENTER and $INPUT_VIEWER"
    ORIG_PWD=$PWD
    cd $VISQOL_PATH
            ./bazel-bin/visqol --reference_file $ORIG_PWD/$INPUT_PRESENTER --degraded_file $ORIG_PWD/$INPUT_VIEWER --verbose | grep MOS-LQO > $ORIG_PWD/${OUTPUT}_visqol.txt
    cd $ORIG_PWD
fi