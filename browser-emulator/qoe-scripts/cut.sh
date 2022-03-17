#!/bin/bash

##################################################################################
# DEFAULT VALUES
##################################################################################

FFMPEG_LOG="-loglevel error"
JPG_FOLDER=jpg
FPS=30
VIDEO_BITRATE=3M
YUV_PROFILE=yuv420p
FFMPEG_OPTIONS="-c:v libvpx -b:v $VIDEO_BITRATE -pix_fmt $YUV_PROFILE"
PRESENTER=false
AUDIO=audio
AUDIO_OUTPUT=audio
PESQ_AUDIO_SAMPLE_RATE=16000
USAGE="Usage: $(basename "$0") [-i=input] [-o=output] [-p=prefix] [-w=width] [-h=height] [-f=fps] [--presenter] [-a=audio] [-ao=audio_output]"

##################################################################################
# FUNCTIONS
##################################################################################

check_inputs() {
    inputs=$1
    
    for input in $inputs; do
        if [ ! -f $input ]; then
            checked_inputs=false
            return 1
        fi
    done
    return 0
}

strindex() {
    x="${1%%$2*}"
    retval=$([[ "$x" = "$1" ]] && echo -1 || echo "${#x}")
}

duration() {
    num=$1
    decimals=
    
    strindex $1 .
    if [ $retval -gt 0 ]; then
        num=$(echo $1 | cut -d'.' -f 1)
        decimals=$(echo $1 | cut -d'.' -f 2)
    fi
    
    ((h=num/3600))
    ((m=num%3600/60))
    ((s=num%60))
    
    retval=$(printf "%02d:%02d:%02d\n" $h $m $s)
    
    if [ ! -z "$decimals" ]; then
        retval="${retval}.${decimals}"
    fi
}

find_index() {
    x="${1%%$2*}"
    retval=${#x}
}

get_r() {
    input=$1
    find_index $input "$rgb("
    i=$retval
    str=${input:i}
    find_index $str ","
    j=$retval
    retval=$(echo $str | cut -c2-$j)
}


get_g() {
    input=$1
    find_index $input ","
    i=$(($retval + 1))
    str=${input:i}
    find_index $str ","
    j=$retval
    retval=$(echo $str | cut -c1-$j)
}

get_b() {
    input=$1
    find_index $input ","
    i=$(($retval + 1))
    str=${input:i}
    find_index $str ","
    i=$(($retval + 1))
    str=${str:i}
    find_index $str ","
    j=$(($retval - 1))
    retval=$(echo $str | cut -c1-$j)
}

get_rgb() {
    image=$1
    width=$2
    height=$3
    
    retval=$(convert $image -format "%[pixel:u.p{$width,$height}]" -colorspace rgb info:)
}

match_threshold() {
    input=$1
    expected=$2
    threshold=$3
    diff=$((input-expected))
    absdiff=${diff#-}
    
    #echo "$input==$expected -> $absdiff<=$threshold"
    
    if [ "$absdiff" -le "$threshold" ]; then
        retval=true
    else
        retval=false
    fi
}

match_rgb() {
    r=$1
    g=$2
    b=$3
    exp_r=$4
    exp_g=$5
    exp_b=$6
    
    match_threshold $r $exp_r $threshold
    match_r=$retval
    match_threshold $g $exp_g $threshold
    match_g=$retval
    match_threshold $b $exp_b $threshold
    match_b=$retval
    
    #echo "$r==$exp_r->$match_r $g==$exp_g->$match_g $b==$exp_b->$match_b"
    
    if $match_r && $match_g && $match_b; then
        retval=true
    else
        retval=false
    fi
}

match_color() {
    image=$1
    width=$2
    height=$3
    threshold=$4
    expected_r=$5
    expected_g=$6
    expected_b=$7
    
    #echo "match_color($1): $2,$3 -- $5 $6 $7"
    
    get_rgb $image $width $height
    color=$retval
    get_r "$color"
    r=$retval
    get_g "$color"
    g=$retval
    get_b "$color"
    b=$retval
    
    match_rgb $r $g $b $expected_r $expected_g $expected_b
}

# Expected values for lavfi padding video: width,height rgb(r,g,b) [color]:
# 120,240 rgb(0,255,255)  [cyan]
# 200,240 rgb(255,0,253) [purple]
# 280,240 rgb(0,0,253) [blue]
# 360,240 rgb(253,255,0) [yellow]
# 420,240 rgb(0,255,0) [green]
# 500,240 rgb(253,0,0) [red]
match_image() {
    image=$1
    threshold=50
    
    height=$(($HEIGHT / 3))
    bar=$(($WIDTH / 8))
    halfbar=$(($bar / 2))
    
    cyan=$((halfbar + ($bar * 1)))
    purple=$((halfbar + ($bar * 2)))
    blue=$((halfbar + ($bar * 3)))
    yellow=$((halfbar + ($bar * 4)))
    green=$((halfbar + ($bar * 5)))
    red=$((halfbar + ($bar * 6)))
    
    match_color $image $cyan $height $threshold 0 255 255
    match_cyan=$retval
    match_color $image $purple $height $threshold 255 0 255
    match_purple=$retval
    match_color $image $blue $height $threshold 0 0 255
    match_blue=$retval
    match_color $image $yellow $height $threshold 255 255 0
    match_yellow=$retval
    match_color $image $green $height $threshold 0 255 0
    match_green=$retval
    match_color $image $red $height $threshold 255 0 0
    match_red=$retval
    
    if $match_cyan && $match_purple && $match_blue && $match_yellow && $match_red; then
        retval=true
    else
        retval=false
    fi
}

cut_video() {
    input_cut=$1
    output_cut=$2
    prefix_cut=$3
    audio_input_cut=$4
    audio_output_cut=$5
    
    mkdir -p $JPG_FOLDER

    #echo "Checking padding in $input_cut (result: $output_cut)"
    
    # Extract images per frame (to find out change from padding to video and viceversa)
    ffmpeg $FFMPEG_LOG -i $input_cut $JPG_FOLDER/$prefix_cut%04d.jpg
    ORIG_PWD=$PWD
    cd $JPG_FOLDER
    jpgs=$(ls -v "$prefix_cut"*.jpg)
    first_found=false
    cut_frames_from=()
    cut_frames_to=()
    for i in $jpgs; do
        file=$(echo $i)
        match_image "$file"
        match=$retval
        if $first_found; then
            if $match; then
                cut_frames_to+=($(("$(echo "$file" | tr -dc '0-9' | sed 's/^0*//')" - 1)))
                b="$(("$(echo "$file" | tr -dc '0-9' | sed 's/^0*//')" - 1))"
                echo "cut_video: $a -> $b"
                first_found=false
                if $PRESENTER; then
                    break
                fi
            fi
        else
            if [ -z "$first_padding" ]; then
                if $match; then
                    first_padding=$(echo "$file" | tr -dc '0-9' | sed 's/^0*//')
                fi
            else
                if ! $match; then
                    cut_frames_from+=($(("$(echo "$file" | tr -dc '0-9'| sed 's/^0*//')")))
                    a=$(("$(echo "$file" | tr -dc '0-9'| sed 's/^0*//')"))
                    first_padding=
                    first_found=true
                fi
            fi
        fi
    done
    first_found=false
    first_padding=
    for i in "${!cut_frames_to[@]}"; do
        cut_time_from=$(jq -n ${cut_frames_from[i]}/$FPS)
        cut_time_to=$(jq -n ${cut_frames_to[i]}/$FPS)
        cut_time=$(jq -n ${cut_time_to}-${cut_time_from})
        
        duration $cut_time_from
        from=$retval
        duration $cut_time
        to=$retval
        echo "Cutting $1 from $cut_time_from to $cut_time_to"
        cd $ORIG_PWD
        if $PRESENTER; then
            ffmpeg $FFMPEG_LOG -y -i $input_cut -ss $from -t $to $FFMPEG_OPTIONS $output_cut
            ffmpeg $FFMPEG_LOG -y -i $audio_input_cut -ss $from -t $to $audio_output_cut
            ffmpeg $FFMPEG_LOG -y -i $audio_input_cut -ar $PESQ_AUDIO_SAMPLE_RATE  -ss $from -t $to resampled_${audio_output_cut}
            break
        else
            ffmpeg $FFMPEG_LOG -y -i $input_cut -ss $from -t $to $FFMPEG_OPTIONS $output_cut-${i}.webm
        fi
    done
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
        --presenter)
            PRESENTER=true
            shift
        ;;
        -a=*|--audio=*)
            AUDIO="${i#*=}"
            shift
        ;;
        -ao=*|--audio_output=*)
            AUDIO_OUTPUT="${i#*=}"
            shift
        ;;
        *) # unknown option
            echo "$USAGE"
            exit 0
        ;;
    esac
done

#######################
# Cut (remove paddings)
#######################

check_inputs $OUTPUT*
checked_inputs=$?
if [ $checked_inputs -ne 0 ]; then
    cut_video $INPUT $OUTPUT $PREFIX $AUDIO $AUDIO_OUTPUT
fi