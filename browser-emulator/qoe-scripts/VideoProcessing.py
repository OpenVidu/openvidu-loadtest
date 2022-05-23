from vidgear.gears import CamGear, WriteGear
from vidgear.gears.helper import get_valid_ffmpeg_path
from LoggerHandler import get_logger
import cv2
from PaddingMatcher import match_image
from OCRAligner import OCRAligner
from concurrent.futures import ThreadPoolExecutor as Pool
import os
import sys
import getopt
import subprocess as sp

optlist, args = getopt.getopt(sys.argv[1:], '', [
                              'debug', 'viewer=', 'prefix=', 'fragment_duration_secs=', 'width=', 'height=', 'fps=', 'remux'])

debug = False
remux = False

for o, a in optlist:
    if o == '--debug':
        debug = True
    if o == '--viewer':
        viewer = a
    if o == '--prefix':
        prefix = a
    if o == '--fragment_duration_secs':
        fragment_duration_secs = int(a)
    if o == '--width':
        width = int(a)
    if o == '--height':
        height = int(a)
    if o == '--fps':
        fps = int(a)
    if o == '--remux':
        remux = True

PESQ_AUDIO_SAMPLE_RATE = "16000"

logger = get_logger("VideoProcessing", debug)

dim = (width, height)

cpus = len(os.sched_getaffinity(0))
if cpus < 2:
    cpus = 2

if remux:
    output_params = {
        "-output_dimensions": dim,
        "-disable_force_termination": True,
        "-b:v": "3M",
        "-filter:v": "minterpolate='mi_mode=dup:fps=%d'" % fps,
        "-pix_fmt": "yuv420p",
        "-vcodec": "rawvideo",
        "-input_framerate": "30",
    }
else:
    output_params = {
        "-disable_force_termination": True,
        "-b:v": "3M",
        "-pix_fmt": "yuv420p",
        "-vcodec": "rawvideo",
        "-input_framerate": "30",
        "-loglevel": "debug"
    }


pool = Pool(cpus)
ocr_aligner = OCRAligner(pool, fragment_duration_secs, fps, debug=debug)
ffmpeg_path = get_valid_ffmpeg_path()


def process_cut_frames(cut_frames, cut_index):
    # Remux step has been removed
    logger.info("Starting processing of cut %d", cut_index)
    #extract_audio_future = pool.submit(extract_audio, cut_index)
    ocr_cut_frames_future = ocr_aligner.align_ocr(cut_frames, cut_index)
    ocr_cut_frames = ocr_cut_frames_future.result()
    logger.info("Finished OCR Alignment on cut %d", cut_index)
    write_video_future = pool.submit(write_video, ocr_cut_frames, cut_index)
    return [write_video_future]


def extract_audio(cut_index):
    logger.info("Starting audio extraction on cut %d", cut_index)
    start_cut = fragment_duration_secs * cut_index
    end_cut = str(start_cut + fragment_duration_secs)
    start_cut = str(start_cut)
    logger.info("Starting audio extraction on cut %d, %s to %s",
                cut_index, start_cut, end_cut)
    ffmpeg_command_to_save_audio = [
        "-y", "-threads", "1", "-i", viewer, "-ss", start_cut, "-to", end_cut, "-async", "1", "outputs_audio/%s_%d.wav" % (prefix, cut_index),
        "-ar", PESQ_AUDIO_SAMPLE_RATE, "outputs_audio/%s_pesq_%d.wav" % (prefix, cut_index)
    ]
    writer = WriteGear(output_filename="outputs_audio/%s_%d.wav" %
                       (prefix, cut_index), logging=debug)
    writer.execute_ffmpeg_cmd(ffmpeg_command_to_save_audio)
    writer.close()
    logger.info("Finished audio extraction on cut %d", cut_index)


def write_video(cut_frames, cut_index):
    logger.info("Starting saving video file on cut %d, for %d frames",
                cut_index, len(cut_frames))
    ffmpeg_command_to_save = ' '.join([
        ffmpeg_path, "-y", "-threads", "1", "-f", "image2pipe", "-framerate", str(fps), "-s", "%dx%d" % dim,
        "-i", "pipe:0", "-b:v", "3M", "-pix_fmt", "yuv420p", "outputs/%s_%d.y4m" % (prefix, cut_index)])
    if debug:
        out = sp.PIPE
        errout = None
        logger.debug("Executing FFmpeg command: %s", ffmpeg_command_to_save)
    else:
        out = sp.DEVNULL
        errout = sp.STDOUT
    ffmpeg_process = sp.Popen(ffmpeg_command_to_save, stdout=out, stdin=sp.PIPE, stderr=errout, shell=True)
    for frame in cut_frames:
        try:
            ffmpeg_process.stdin.write(cv2.imencode('.jpg', frame)[1].tobytes())
        except (OSError, IOError) as e:
            logger.error("Failed to write to ffmpeg process")
            logger.error(e)
    ffmpeg_process.stdin.close()
    ffmpeg_process.wait()
    logger.info("Finished writing cut %d", cut_index)


def main():
    os.makedirs("./outputs", exist_ok=True)
    os.makedirs("./outputs_audio", exist_ok=True)
    os.makedirs("./ocr", exist_ok=True)
    os.makedirs("./frames", exist_ok=True)
    logger.info("Starting video processing")
    video = CamGear(source=viewer, logging=debug).start()
    i = 0
    is_begin_padding = False
    frames_for_cut = []
    cut_index = 0
    logger.debug("cpus: %d", cpus)
    async_results = []
    while True:
        frame = video.read()
        if frame is None:
            # video ended
            break
        frame = cv2.resize(frame, dim, interpolation=cv2.INTER_AREA)
        if is_begin_padding:
            if not match_image(frame, pool):
                # padding ended
                is_begin_padding = False
                frames_for_cut.append(frame)
        else:
            is_begin_padding = match_image(frame, pool)
            if is_begin_padding:
                logger.info("Padding found on frame %d", i)
                result = pool.submit(process_cut_frames,
                                     frames_for_cut, cut_index)
                async_results.append(result)
                cut_index += 1
                frames_for_cut = []
            else:
                frames_for_cut.append(frame)

        if debug:
            cv2.imwrite("frames/" + viewer + str(i) + ".jpg", frame)
        i += 1

    video.stop()
    logger.info("Finished reading frames. Finishing processing cut fragments...")
    for result_list_future in async_results:
        result_list = result_list_future.result()
        for result in result_list:
            result.result()
    pool.shutdown()
    logger.info("End video processing")


main()
