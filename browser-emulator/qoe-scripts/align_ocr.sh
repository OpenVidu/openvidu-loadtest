#!/bin/bash

##################################################################################
# DEFAULT VALUES
##################################################################################

JPG_FOLDER=jpg
FFMPEG_LOG="-loglevel error"
VIDEO_LENGTH_SEC=5
FPS=30
WIDTH=640
HEIGHT=480
USAGE="Usage: $(basename "$0") [-i=input] [-o=output] [-a=audio_input] [-l=length] [-f=fps] [-p=prefix] [-w=width] [-h=height]"

##################################################################################
# FUNCTIONS
##################################################################################

check_number() {
    re='^[0-9]+$'
    input=$1
    
    if [ -n "$input" ] && [ "$input" -eq "$input" ] 2>/dev/null; then
        retval=true
    else
        retval=false
    fi
}

align_ocr() {
    video_ocr=$1
    output_ocr=$2
    wav_ocr=$3
    prefix_ocr=$4
    
    echo "Aligning $video_ocr based on frame OCR recognition"
    
    cut_folder=$JPG_FOLDER/cut
    mkdir -p $cut_folder
    
    ffmpeg $FFMPEG_LOG -i $video_ocr -qscale:v 2 $JPG_FOLDER/$prefix_ocr%04d.jpg
    
    next=$(($VIDEO_LENGTH_SEC * $FPS))
    skipped=0
    ocr_errors=0
    ORIG_PWD=$PWD
    cd $JPG_FOLDER
    files=($prefix_ocr*.jpg)
    for ((i=${#files[@]}-1; i>=0; i--)); do
        filename=${files[i]}
        
        left=$(expr $WIDTH / 2 - 50)
        top=$(expr $HEIGHT - 50)
        crop_value=100x45+$left+$top
        convert $filename -crop $crop_value cut/_$filename
        
        #frame=$(tesseract cut/_$filename stdout --psm 7 digits 2>/dev/null | sed -r '/^\s*$/d')
        frame=$(gocr -C 0-9 cut/_$filename | tr -d '[:space:]')
        rm cut/_$filename
        
        check_number $frame
        is_number=$retval
        
        if $is_number; then
            #echo "$filename = $frame"
            j=$frame
            while [ $j -le $next ];do
                output=$(printf "$prefix_ocr%04d\n" $j)
                cp $filename cut/${output}.jpg
                if [ $j -ne $next ]; then
                    skipped=$(($skipped+1))
                fi
                j=$(($j+1))
            done
            next=$(($frame-1))
        else
            #echo "Skipping $filename (recognized: $frame)"
            ocr_errors=$(($ocr_errors+1))
        fi
    done
    i=1
    while [ $i -le $next ]; do
        output=$(printf "$prefix_ocr%04d\n" $i)
        cp $filename cut/${output}.jpg
        i=$(($i+1))
    done
    cd $ORIG_PWD
    echo "Number of frames skipped in $output_ocr: $skipped"
    echo "Number of frames not recognized by OCR in $output_ocr: $ocr_errors"
    
    ffmpeg $FFMPEG_LOG -y -framerate $FPS -f image2 -i $JPG_FOLDER/cut/$prefix_ocr%04d.jpg -i $wav_ocr $output_ocr

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
        -a=*|--audio=*)
            AUDIO_INPUT="${i#*=}"
            shift
        ;;
        -p=*|--prefix=*)
            PREFIX="${i#*=}"
            shift
        ;;
        -l=*|--length=*)
            VIDEO_LENGTH_SEC="${i#*=}"
            shift
        ;;
        -f=*|--fps=*)
            FPS="${i#*=}"
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

####################################
# Alignment based on OCR recognition
####################################

if [ ! -f $OUTPUT ]; then
    align_ocr $INPUT $OUTPUT $AUDIO_INPUT $PREFIX
fi