#!/bin/sh

##################################################################################
# DEFAULT VALUES
##################################################################################

# Big Buck Bunny is the default source video
BUNNY_ZIP_URL="https://download.blender.org/demo/movies/BBB/bbb_sunflower_1080p_60fps_normal.mp4.zip"
BUNNY_ZIP_FILE="bbb_sunflower_1080p_60fps_normal.mp4.zip"
BUNNY_VIDEO_FILE="bbb_sunflower_1080p_60fps_normal.mp4"
INTERVIEW_VIDEO_URL="https://archive.org/download/e-dv548_lwe08_christa_casebeer_003.ogg/e-dv548_lwe08_christa_casebeer_003.mp4"

VIDEO_SAMPLE_URL="$BUNNY_VIDEO_FILE"  # Default to bunny (will be downloaded if needed)
WIDTH=640
HEIGHT=480
VIDEO_DURATION=00:00:05
START_POSITION=00:00:52
PADDING_DURATION_SEC=1
AUDIO_SAMPLE_RATE_HZ=48000
TONE_FREQUENCY_HZ=1000
AUDIO_CHANNELS_NUMBER=2
FPS=30
USE_BUNNY=true  # Bunny is default
FFMPEG_LOG="-loglevel error"
GENERATE_DEFAULT_REF=false
DEFAULT_VIDEO_REF=./test-no-padding.yuv
DEFAULT_AUDIO_REF=./test-no-padding.wav
FONT=./arial.ttf
CLEANUP=true
GET_ORIGINAL_STATS=false
GENERATE_STREAMING=true
USAGE="Usage: $(basename $0) [-d=duration] [-p=padding_duration_sec] [--game] [--interview] [--generate_default_ref] [--no_cleanup] [--clean] [--no-streaming] [-v=video_url] [-w=width] [-h=height] [-a=audio_url] [-f=fps] [--original]"

##################################################################################
# FUNCTIONS
##################################################################################

cleanup() {
   echo "Deleting temporal files"
   rm -rf test-no-frame-number.mp4 test-no-padding-raw.mp4 test-no-padding.mp4 test-no-padding-numbered.mp4 test-content-audio.wav test-padding-audio.wav test-audio-raw.wav padding.mp4 test.mp4 test-mixed.mp4 concat-list.txt concat-list-audio.txt bound* diag*
}

get_video_frame_count() {
   file="$1"
   frames=""

   frames=$(ffprobe -v error -count_frames -select_streams v:0 -show_entries stream=nb_read_frames -of default=noprint_wrappers=1:nokey=1 "$file")
   if [ -z "$frames" ] || [ "$frames" = "N/A" ]; then
      frames=$(ffprobe -v error -select_streams v:0 -show_entries stream=nb_frames -of default=noprint_wrappers=1:nokey=1 "$file")
   fi

   echo "$frames"
}

compute_audio_samples_for_video() {
   frames="$1"
   frame_rate="$2"
   sample_rate="$3"

   awk -v frames="$frames" -v frame_rate="$frame_rate" -v sample_rate="$sample_rate" '
      BEGIN {
         split(frame_rate, fps_parts, "/")
         if (fps_parts[2] > 0) {
            fps = fps_parts[1] / fps_parts[2]
         } else {
            fps = frame_rate + 0
         }

         if (fps <= 0 || frames <= 0 || sample_rate <= 0) {
            print 0
            exit
         }

         target_samples = int(((frames * sample_rate) / fps) + 0.5)
         print target_samples
      }
   '
}

duration_to_seconds() {
   duration="$1"

   awk -v duration="$duration" '
      BEGIN {
         split(duration, parts, ":")
         if (length(parts) == 3) {
            print (parts[1] * 3600) + (parts[2] * 60) + parts[3]
         } else if (length(parts) == 2) {
            print (parts[1] * 60) + parts[2]
         } else {
            print duration + 0
         }
      }
   '
}

compute_video_frames_for_duration() {
   duration_sec="$1"
   frame_rate="$2"

   awk -v duration_sec="$duration_sec" -v frame_rate="$frame_rate" '
      BEGIN {
         split(frame_rate, fps_parts, "/")
         if (fps_parts[2] > 0) {
            fps = fps_parts[1] / fps_parts[2]
         } else {
            fps = frame_rate + 0
         }

         if (fps <= 0 || duration_sec <= 0) {
            print 0
            exit
         }

         target_frames = int((duration_sec * fps) + 0.000001)
         print target_frames
      }
   '
}


##################################################################################
# PARSE ARGUMENTS
##################################################################################

for i in "$@"; do
   case $i in
      --game)
      VIDEO_SAMPLE_URL=https://ia802808.us.archive.org/6/items/ForniteBattle8/fornite%20battle%202.mp4
      USE_BUNNY=false
      VIDEO_DURATION=00:00:30
      START_POSITION=00:00:00
      shift
      ;;
      --interview)
      VIDEO_SAMPLE_URL="$INTERVIEW_VIDEO_URL"
      USE_BUNNY=false
      VIDEO_DURATION=00:00:15
      START_POSITION=00:00:00
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
      --no-streaming)
      GENERATE_STREAMING=false
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

# Download Big Buck Bunny if it's the source and doesn't exist yet
if [ "$USE_BUNNY" = true ]; then
   # Download zip if not exists
   if [ ! -f "$BUNNY_ZIP_FILE" ] && [ ! -f "$BUNNY_VIDEO_FILE" ]; then
      echo "Downloading Big Buck Bunny video from blender.org..."
      if command -v curl &> /dev/null; then
         curl -L -o "$BUNNY_ZIP_FILE" "$BUNNY_ZIP_URL" --progress-bar
      elif command -v wget &> /dev/null; then
         wget -O "$BUNNY_ZIP_FILE" "$BUNNY_ZIP_URL"
      else
         echo "Error: curl or wget required"
         exit 1
      fi
   fi
   
   # Unzip if video file doesn't exist
   if [ ! -f "$BUNNY_VIDEO_FILE" ]; then
      echo "Extracting Big Buck Bunny video from zip..."
      unzip -o "$BUNNY_ZIP_FILE"
   fi
   
   VIDEO_SAMPLE_URL="$BUNNY_VIDEO_FILE"
fi

# Determine media type from source URL
case "$VIDEO_SAMPLE_URL" in
   *christa_casebeer*|*interview*)
      MEDIA_TYPE="interview"
      ;;
   *ForniteBattle*)
      MEDIA_TYPE="game"
      ;;
   *bbb_sunflower*|*BBB*)
      MEDIA_TYPE="bunny"
      ;;
   *)
      MEDIA_TYPE="custom"
      ;;
esac

# Output filenames using consistent naming: {type}_{height}p_{fps}fps.{extension}
BASE_NAME="${MEDIA_TYPE}_${HEIGHT}p_${FPS}fps"
TARGET_VIDEO="./${BASE_NAME}.y4m"
TARGET_AUDIO="./${MEDIA_TYPE}.wav"
STREAMING_VIDEO="./${BASE_NAME}.h264"
STREAMING_AUDIO="./${MEDIA_TYPE}.ogg"

##########################
# 1. Download video sample
##########################
VIDEO_SAMPLE_NAME=$(echo ${VIDEO_SAMPLE_URL##*/} | sed -e 's/%20/ /g')

if [ ! -f "$VIDEO_SAMPLE_NAME" ]; then
    echo "Content video ($VIDEO_SAMPLE_NAME) not exists ... downloading"
    wget $VIDEO_SAMPLE_URL
else
    echo "Content video ($VIDEO_SAMPLE_NAME) already exists"
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
	ffmpeg $FFMPEG_LOG -y -i "$VIDEO_SAMPLE_NAME" -ss $START_POSITION -t $VIDEO_DURATION -vf scale="$WIDTH:$HEIGHT",setsar=1:1 -r $FPS test-no-frame-number.mp4
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
# 3. Prepare content stream
#########################
echo "Preparing content stream"
ffmpeg $FFMPEG_LOG -y -i $FINAL_OUTPUT -c:v copy -c:a aac -ar $AUDIO_SAMPLE_RATE_HZ -ac $AUDIO_CHANNELS_NUMBER test-no-padding-raw.mp4

#########################
# 3.1 Trim content to exact duration
#########################
echo "Trimming content to exact duration"
CONTENT_DURATION=$(duration_to_seconds "$VIDEO_DURATION")
CONTENT_FRAME_COUNT=$(awk -v duration="$CONTENT_DURATION" -v fps="$FPS" 'BEGIN { print int((duration * fps) + 0.000001) }')
ffmpeg $FFMPEG_LOG -y -i test-no-padding-raw.mp4 -frames:v "$CONTENT_FRAME_COUNT" -t "$CONTENT_DURATION" -c:v libx264 -preset veryfast -pix_fmt yuv420p -c:a aac -ar $AUDIO_SAMPLE_RATE_HZ -ac $AUDIO_CHANNELS_NUMBER test-no-padding.mp4

#########################
# 3.2 Overlay frame number on content
#########################
echo "Overlaying frame number in content"
ffmpeg $FFMPEG_LOG -y -vsync 0 -i test-no-padding.mp4 -vf "drawbox=x=(iw-135)/2:y=ih-57:w=130:h=55:color=white:t=fill,drawtext=fontfile=$FONT:text='%{eif\:n+1\:d}':x=(w-tw)/2:y=h-(2*lh)+15:fontcolor=black:fontsize=40:box=0" -c:a aac -ar $AUDIO_SAMPLE_RATE_HZ -ac $AUDIO_CHANNELS_NUMBER test-no-padding-numbered.mp4

#################################################
# 4. Create padding video based on a test pattern
#################################################
if [ "$PADDING_DURATION_SEC" -gt 0 ]; then
   echo "Creating padding video ($PADDING_DURATION_SEC seconds)"
   ffmpeg $FFMPEG_LOG -y -f lavfi -i testsrc=duration=$PADDING_DURATION_SEC:size="$WIDTH"x"$HEIGHT":rate=$FPS -f lavfi -i sine=frequency=$TONE_FREQUENCY_HZ:sample_rate=$AUDIO_SAMPLE_RATE_HZ:duration=$PADDING_DURATION_SEC -c:v libx264 -preset veryfast -pix_fmt yuv420p -c:a aac -ar $AUDIO_SAMPLE_RATE_HZ -ac $AUDIO_CHANNELS_NUMBER padding.mp4
else
   echo "Skipping padding video creation as duration is 0"
fi

############################
# 5. Concatenate final video
############################
if [ "$PADDING_DURATION_SEC" -gt 0 ]; then
   echo "Concatenating padding and content videos"
   printf "file 'padding.mp4'\nfile 'test-no-padding-numbered.mp4'\nfile 'padding.mp4'\n" > concat-list.txt
   ffmpeg $FFMPEG_LOG -y -f concat -safe 0 -i concat-list.txt -c copy test.mp4
else
   echo "Skipping concatenation as padding duration is 0"
   cp test-no-padding-numbered.mp4 test.mp4
fi

##########################################
# 5.1 Compute exact shared media timeline
##########################################
SYNC_FRAME_RATE=$(ffprobe -v error -select_streams v:0 -show_entries stream=r_frame_rate -of default=noprint_wrappers=1:nokey=1 test.mp4)
TARGET_CONTENT_DURATION_SEC=$(duration_to_seconds "$VIDEO_DURATION")
TARGET_TOTAL_DURATION_SEC=$(awk -v content="$TARGET_CONTENT_DURATION_SEC" -v padding="$PADDING_DURATION_SEC" 'BEGIN { print content + (2 * padding) }')
SYNC_FRAME_COUNT=$(compute_video_frames_for_duration "$TARGET_TOTAL_DURATION_SEC" "$SYNC_FRAME_RATE")
SYNC_AUDIO_SAMPLES=$(awk -v duration="$TARGET_TOTAL_DURATION_SEC" -v sample_rate="$AUDIO_SAMPLE_RATE_HZ" 'BEGIN { print int((duration * sample_rate) + 0.5) }')

if [ -z "$SYNC_FRAME_RATE" ] || [ "$SYNC_FRAME_RATE" = "N/A" ]; then
   echo "Unable to determine final video frame rate"
   exit 1
fi

if [ -z "$TARGET_TOTAL_DURATION_SEC" ] || [ "$TARGET_TOTAL_DURATION_SEC" -le 0 ]; then
   echo "Unable to compute target total duration"
   exit 1
fi

if [ -z "$SYNC_FRAME_COUNT" ] || [ "$SYNC_FRAME_COUNT" -le 0 ]; then
   echo "Unable to compute target video frame count"
   exit 1
fi

if [ -z "$SYNC_AUDIO_SAMPLES" ] || [ "$SYNC_AUDIO_SAMPLES" -le 0 ]; then
   echo "Unable to compute target audio sample count"
   exit 1
fi

echo "Shared sync target: ${TARGET_TOTAL_DURATION_SEC}s, $SYNC_FRAME_COUNT frames at $SYNC_FRAME_RATE, $SYNC_AUDIO_SAMPLES audio samples @ ${AUDIO_SAMPLE_RATE_HZ} Hz"

#########################
# 6. Convert video to Y4M
#########################
echo "Converting resulting video to Y4M ($TARGET_VIDEO)"
ffmpeg $FFMPEG_LOG -y -vsync 0 -i test.mp4 -map 0:v:0 -frames:v "$SYNC_FRAME_COUNT" -pix_fmt yuv420p $TARGET_VIDEO

#########################
# 7. Convert audio to WAV
#########################
echo "Converting resulting audio to WAV ($TARGET_AUDIO)"
TARGET_CONTENT_AUDIO_SAMPLES=$(awk -v duration="$TARGET_CONTENT_DURATION_SEC" -v sample_rate="$AUDIO_SAMPLE_RATE_HZ" 'BEGIN { print int((duration * sample_rate) + 0.5) }')

if [ -z "$TARGET_CONTENT_AUDIO_SAMPLES" ] || [ "$TARGET_CONTENT_AUDIO_SAMPLES" -le 0 ]; then
   echo "Unable to compute target content audio sample count"
   exit 1
fi

ffmpeg $FFMPEG_LOG -y -i test-no-padding-numbered.mp4 -map 0:a:0 -vn -acodec pcm_s16le -ar $AUDIO_SAMPLE_RATE_HZ -ac $AUDIO_CHANNELS_NUMBER -af "apad=whole_len=$TARGET_CONTENT_AUDIO_SAMPLES,atrim=end_sample=$TARGET_CONTENT_AUDIO_SAMPLES" test-content-audio.wav

if [ "$PADDING_DURATION_SEC" -gt 0 ]; then
   ffmpeg $FFMPEG_LOG -y -f lavfi -i sine=frequency=$TONE_FREQUENCY_HZ:sample_rate=$AUDIO_SAMPLE_RATE_HZ:duration=$PADDING_DURATION_SEC -ac $AUDIO_CHANNELS_NUMBER -acodec pcm_s16le test-padding-audio.wav
   printf "file 'test-padding-audio.wav'\nfile 'test-content-audio.wav'\nfile 'test-padding-audio.wav'\n" > concat-list-audio.txt
   ffmpeg $FFMPEG_LOG -y -f concat -safe 0 -i concat-list-audio.txt -acodec pcm_s16le test-audio-raw.wav
else
   cp test-content-audio.wav test-audio-raw.wav
fi

ffmpeg $FFMPEG_LOG -y -i test-audio-raw.wav -af "apad=whole_len=$SYNC_AUDIO_SAMPLES,atrim=end_sample=$SYNC_AUDIO_SAMPLES" $TARGET_AUDIO

###############################
# 8. Generate default reference
###############################
if $GENERATE_DEFAULT_REF; then
   echo "Overlaying frame number in default reference source"
   ffmpeg $FFMPEG_LOG -y -i test-no-padding.mp4 -vf drawtext="fontfile=$FONT:text='\\   %{frame_num}  \\ ':start_number=1:x=(w-tw)/2:y=h-(2*lh)+15:fontcolor=black:fontsize=40:box=1:boxcolor=white:boxborderw=10" -c:a aac -ac 2 test-no-padding-numbered.mp4

   echo "Generating default video reference ($DEFAULT_VIDEO_REF)"
   ffmpeg $FFMPEG_LOG -y -i test-no-padding-numbered.mp4 -pix_fmt yuv420p -c:v rawvideo -an $DEFAULT_VIDEO_REF

   echo "Generating default audio reference ($DEFAULT_AUDIO_REF)"
   ffmpeg $FFMPEG_LOG -y -i test-no-padding-numbered.mp4 -vn -acodec pcm_s16le -ar $AUDIO_SAMPLE_RATE_HZ -ac $AUDIO_CHANNELS_NUMBER $DEFAULT_AUDIO_REF
fi

################################
# 9. Generate streaming files (H.264 + Opus Ogg)
################################
if $GENERATE_STREAMING; then
   echo "=========================================="
   echo "Generating streaming media files for LiveKit"
   echo "=========================================="
   
   # Get FPS as integer for keyint calculation
   FPS_INT=$(echo "$FPS" | awk '{if ($1 ~ /\//) {split($1, a, "/"); print a[1]/a[2]} else {print $1}}' | awk '{printf "%d", $1}')
   if [ -z "$FPS_INT" ] || [ "$FPS_INT" -le 0 ]; then
      FPS_INT=30
   fi
   
   # Generate H.264 Annex B video from test.mp4 (same content as QoE Y4M)
   echo "Generating H.264 video ($STREAMING_VIDEO)..."
   ffmpeg $FFMPEG_LOG -y -i test.mp4 \
     -c:v libx264 -preset veryfast -profile:v baseline \
     -pix_fmt yuv420p \
     -x264-params "keyint=$((FPS_INT * 4)):min-keyint=$((FPS_INT * 4))" \
     -bf 0 -b:v 2M \
     -an \
     -f h264 \
     "$STREAMING_VIDEO"
   
   echo "  -> $(ls -lh "$STREAMING_VIDEO" 2>/dev/null | awk '{print $5}' || echo 'not found')"
   
   # Generate Opus Ogg audio from test-audio-raw.wav (same content as QoE WAV)
   echo "Generating Opus audio ($STREAMING_AUDIO)..."
   ffmpeg $FFMPEG_LOG -y -i test-audio-raw.wav \
     -c:a libopus -page_duration 20000 \
     -ar $AUDIO_SAMPLE_RATE_HZ -ac $AUDIO_CHANNELS_NUMBER \
     -f opus \
     "$STREAMING_AUDIO"
   
   echo "  -> $(ls -lh "$STREAMING_AUDIO" 2>/dev/null | awk '{print $5}' || echo 'not found')"
   
   echo ""
   echo "Streaming files generated:"
   echo "  Video: $(pwd)/$STREAMING_VIDEO"
   echo "  Audio: $(pwd)/$STREAMING_AUDIO"
   echo ""
   echo "These files are compatible with LiveKit CLI's h264:// and opus:// protocols."
   echo "=========================================="

   echo ""
   echo "=========================================="
   echo "All generated files:"
   ls -lh ./${BASE_NAME}.* 2>/dev/null | awk '{print "  " $NF " (" $5 ")"}'
   echo "=========================================="
fi

################################
# 10. Delete temporal video files
################################
if $CLEANUP; then
   cleanup
fi
