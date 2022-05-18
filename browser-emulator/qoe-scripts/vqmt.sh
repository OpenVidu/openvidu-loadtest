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
# Run VQMT
##########
if [[ ! -f ${OUTPUT}_msssim.csv || ! -f ${OUTPUT}_psnr.csv || ! -f ${OUTPUT}_psnrhvs.csv || ! -f ${OUTPUT}_psnrhvsm.csv || ! -f ${OUTPUT}_ssim.csv || ! -f ${OUTPUT}_vifp.csv ]] ; then
    echo "Running VQMT on $INPUT_PRESENTER and $INPUT_VIEWER"
    $VQMT_PATH/vqmt $INPUT_PRESENTER $INPUT_VIEWER $HEIGHT $WIDTH 1500 1 $OUTPUT PSNR SSIM VIFP MSSSIM PSNRHVS PSNRHVSM >> /dev/null 2>&1
fi