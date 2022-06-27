#!/bin/sh

##################################################################################
# DEFAULT VALUES
##################################################################################

VIDEO_SAMPLE_URL=https://archive.org/download/e-dv548_lwe08_christa_casebeer_003.ogg/e-dv548_lwe08_christa_casebeer_003.mp4
WIDTH=640
HEIGHT=480
VIDEO_DURATION=00:00:30
PADDING_DURATION_SEC=5
AUDIO_SAMPLE_RATE_HZ=48000
TONE_FREQUENCY_HZ=1000
AUDIO_CHANNELS_NUMBER=2
FFMPEG_LOG="-loglevel error"
TARGET_VIDEO=./test.y4m
TARGET_AUDIO=./test.wav
GENERATE_DEFAULT_REF=false
DEFAULT_VIDEO_REF=./test-no-padding.yuv
DEFAULT_AUDIO_REF=./test-no-padding.wav
FONT=/usr/share/fonts/truetype/msttcorefonts/Arial.ttf
CLEANUP=true
GET_ORIGINAL_STATS=false
USAGE="Usage: `basename $0` [-d=duration] [-p=padding_duration_sec] [--game] [--generate_default_ref] [--no_cleanup] [--clean] [-v=video_url] [-w=width] [-h=height] [-a=audio_url] [-f=fps] [--original]"

##################################################################################
# FUNCTIONS
##################################################################################

cleanup() {
   echo "Deleting temporal files"
   rm -rf test-no-frame-number.mp4 test-no-padding.mp4 padding.mp4 test.mp4 test-mixed.mp4
}


##################################################################################
# PARSE ARGUMENTS
##################################################################################

for i in "$@"; do
   case $i in
      --game)
      VIDEO_SAMPLE_URL=https://ia802808.us.archive.org/6/items/ForniteBattle8/fornite%20battle%202.mp4
      WIDTH=1280
      HEIGHT=720
      shift
      ;;
      --generate_default_ref)
      GENERATE_DEFAULT_REF=true
      shift
      ;;
      -d=*|--duration=*)
      VIDEO_DURATION="${i#*=}"
      shift
      ;;
      -p=*|--padding=*)
      PADDING_DURATION_SEC="${i#*=}"
      shift
      ;;
      --no_cleanup)
      CLEANUP=false
      shift
      ;;
      --clean)
      cleanup
      exit 0
      shift
      ;;
      -v=*)
      VIDEO_SAMPLE_URL="${i#*=}"
      shift
      ;;
      -w=*)
      WIDTH="${i#*=}"
      shift
      ;;
      -h=*)
      HEIGHT="${i#*=}"
      shift
      ;;
      -a=*)
      AUDIO_SAMPLE_URL="${i#*=}"
      shift
      ;;
      -f=*)
      FPS="${i#*=}"
      shift
      ;;
      --original)
      GET_ORIGINAL_STATS=true
      shift
      ;;
      *) # unknown option
      echo $USAGE
      exit 0
      ;;
   esac
done

##################################################################################
# INIT
##################################################################################


##########################
# 1. Download video sample
##########################
VIDEO_SAMPLE_NAME=$(echo ${VIDEO_SAMPLE_URL##*/} | sed -e 's/%20/ /g')

if [ ! -f "$VIDEO_SAMPLE_NAME" ]; then
    echo "Content video ($VIDEO_SAMPLE_NAME) not exits ... downloading"
    wget $VIDEO_SAMPLE_URL
else
    echo "Content video ($VIDEO_SAMPLE_NAME) already exits"
fi
if [ -z "$FPS" ]; then
	FPS=$(ffprobe -v error -select_streams v -show_entries stream=r_frame_rate -of default=noprint_wrappers=1:nokey=1 "$VIDEO_SAMPLE_NAME")
fi
####################################
# 1.1. Get original stats (optional)
####################################
if [ "$GET_ORIGINAL_STATS" = true ]; then
	WIDTH=$(ffprobe -v error -show_entries stream=width -of default=noprint_wrappers=1:nokey=1 "$VIDEO_SAMPLE_NAME")
	HEIGHT=$(ffprobe -v error -show_entries stream=height -of default=noprint_wrappers=1:nokey=1 "$VIDEO_SAMPLE_NAME")
	VIDEO_DURATION=$(ffprobe -v error -show_entries stream=duration -of default=noprint_wrappers=1:nokey=1 -sexagesimal "$VIDEO_SAMPLE_NAME")
	OUTPUT="$VIDEO_SAMPLE_NAME"
fi

#######################
# 2. Cut original video
#######################
if [ "$GET_ORIGINAL_STATS" = false ]; then
	echo "Cutting original video (duration $VIDEO_DURATION)"
	ffmpeg $FFMPEG_LOG -y -i "$VIDEO_SAMPLE_NAME" -ss 00:00:00 -t $VIDEO_DURATION -vf scale="$WIDTH:$HEIGHT",setsar=1:1 -r $FPS test-no-frame-number.mp4
	OUTPUT="test-no-frame-number.mp4"
fi

#####################################
# 2.1. Mix video and audio (optional)
#####################################
if [ -n "$AUDIO_SAMPLE_URL" ]; then
        echo "External audio source found, downloading and mixing"
        AUDIO_SAMPLE_NAME=$(echo ${AUDIO_SAMPLE_URL##*/} | sed -e 's/%20/ /g')

        if [ ! -f "$AUDIO_SAMPLE_NAME" ]; then
                echo "Content audio ($AUDIO_SAMPLE_NAME) not exits ... downloading"
                wget $AUDIO_SAMPLE_URL
        else
                echo "Content audio ($AUDIO_SAMPLE_NAME) already exits"
        fi
        echo "Mixing audio and video"
	FINAL_OUTPUT=test-mixed.mp4
	ffmpeg $FFMPEG_LOG -i $OUTPUT -i $AUDIO_SAMPLE_NAME -c:v copy -c:a aac $FINAL_OUTPUT
else
	FINAL_OUTPUT=$OUTPUT
fi

#########################
# 3. Overlay frame number
#########################
echo "Overlaying frame number in the video content"
ffmpeg $FFMPEG_LOG -y -i $FINAL_OUTPUT -vf drawtext="fontfile=$FONT:text='\   %{frame_num}  \ ':start_number=1:x=(w-tw)/2:y=h-(2*lh)+15:fontcolor=black:fontsize=40:box=1:boxcolor=white:boxborderw=10" test-no-padding.mp4

#################################################
# 4. Create padding video based on a test pattern
#################################################
echo "Creating padding video ($PADDING_DURATION_SEC seconds)"
ffmpeg $FFMPEG_LOG -y -f lavfi -i testsrc=duration=$PADDING_DURATION_SEC:size="$WIDTH"x"$HEIGHT":rate=$FPS -f lavfi -i sine=frequency=$TONE_FREQUENCY_HZ:duration=$PADDING_DURATION_SEC padding.mp4

############################
# 5. Concatenate final video
############################
echo "Concatenating padding and content videos"
ffmpeg $FFMPEG_LOG -y -i padding.mp4 -i test-no-padding.mp4 -i padding.mp4 -filter_complex concat=n=3:v=1:a=1 test.mp4

#########################
# 6. Convert video to Y4M
#########################
echo "Converting resulting video to Y4M ($TARGET_VIDEO)"
ffmpeg $FFMPEG_LOG -y -i test.mp4 -pix_fmt yuv420p $TARGET_VIDEO

#########################
# 7. Convert audio to WAV
#########################
echo "Converting resulting audio to WAV ($TARGET_AUDIO)"
ffmpeg $FFMPEG_LOG -y -i test.mp4 -vn -acodec pcm_s16le -ar $AUDIO_SAMPLE_RATE_HZ -ac $AUDIO_CHANNELS_NUMBER $TARGET_AUDIO

###############################
# 8. Generate default reference
###############################
if $GENERATE_DEFAULT_REF; then
   echo "Generating default video reference ($DEFAULT_VIDEO_REF)"
   ffmpeg $FFMPEG_LOG -y -i test-no-padding.mp4 -pix_fmt yuv420p -c:v rawvideo -an $DEFAULT_VIDEO_REF

   echo "Generating default audio reference ($DEFAULT_AUDIO_REF)"
   ffmpeg $FFMPEG_LOG -y -i test-no-padding.mp4 -vn -acodec pcm_s16le -ar $AUDIO_SAMPLE_RATE_HZ -ac $AUDIO_CHANNELS_NUMBER $DEFAULT_AUDIO_REF
fi

################################
# 9. Delete temporal video files
################################
if $CLEANUP; then
   cleanup
fi
