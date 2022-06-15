import subprocess as sp
from vidgear.gears import WriteGear
import cv2
from qoe_scripts.logger_handler import get_logger
from qoe_scripts.arg_reader import debug
import ray

logger = get_logger(__name__, debug)


@ray.remote
def prepare_presenter(ffmpeg_path, presenter, padding_duration_secs, fragment_duration_secs, presenter_audio, PESQ_AUDIO_SAMPLE_RATE, debug=False):
    logger.info("Starting preparing presenter files")
    if debug:
        out = sp.PIPE
    else:
        out = sp.DEVNULL
    errout = sp.STDOUT
    ffmpeg_command_to_save = ' '.join([
        ffmpeg_path, "-n", "-threads", "1",
        "-i", presenter, "-ss", str(padding_duration_secs), "-to", str(padding_duration_secs + fragment_duration_secs), "presenter.yuv"])
    process_video = sp.Popen(ffmpeg_command_to_save,
                             stdout=out, stderr=errout, shell=True)
    ffmpeg_command_to_save = ' '.join([
        ffmpeg_path, "-n", "-threads", "1",
        "-i", presenter_audio, "-ss", str(padding_duration_secs), "-to", str(
            padding_duration_secs + fragment_duration_secs), "-async", "1", "presenter.wav",
        "-ar", PESQ_AUDIO_SAMPLE_RATE, "presenter-pesq.wav"])
    process_audio = sp.Popen(ffmpeg_command_to_save,
                             stdout=out, stderr=errout, shell=True)
    process_video.wait()
    process_audio.wait()
    logger.info("Finished preparing presenter files")
    return True


@ray.remote
def extract_audio(cut_index, fragment_duration_secs, viewer, prefix, PESQ_AUDIO_SAMPLE_RATE, debug=False):
    logger.info("Starting audio extraction on cut %d", cut_index)
    start_cut = fragment_duration_secs * cut_index
    end_cut = str(start_cut + fragment_duration_secs)
    start_cut = str(start_cut)
    logger.info("Starting audio extraction on cut %d, %s to %s",
                cut_index, start_cut, end_cut)
    ffmpeg_command_to_save_audio = [
        "-y", "-threads", "1", "-i", viewer, "-ss", start_cut, "-to", end_cut, "-async", "1", "outputs_audio/%s_%d.wav" % (
            prefix, cut_index),
        "-ar", str(PESQ_AUDIO_SAMPLE_RATE), "outputs_audio/%s_pesq_%d.wav" % (
            prefix, cut_index)
    ]
    logger.info(ffmpeg_command_to_save_audio)
    writer = WriteGear(output_filename="outputs_audio/%s_%d.wav" %
                       (prefix, cut_index), logging=debug)
    writer.execute_ffmpeg_cmd(ffmpeg_command_to_save_audio)
    writer.close()
    logger.info("Finished audio extraction on cut %d", cut_index)
    return "outputs_audio/%s_%d.wav" % (prefix, cut_index), "outputs_audio/%s_pesq_%d.wav" % (prefix, cut_index)


@ray.remote
def write_video(cut_frames, cut_index, ffmpeg_path, dim, fps, prefix, presenter_prepared, debug=False):
    if not presenter_prepared:
        logger.error("Something went wrong, presenter not prepared")
        raise Exception("Something went wrong, presenter not prepared")
    logger.info("Starting saving video file on cut %d, for %d frames",
                cut_index, len(cut_frames))
    ffmpeg_command_to_save = ' '.join([
        ffmpeg_path, "-y", "-threads", "1", "-f", "image2pipe", "-framerate", str(
            fps), "-s", "%dx%d" % dim,
        "-i", "pipe:0", "-b:v", "3M", "-pix_fmt", "yuv420p", "outputs/%s_%d.y4m" % (prefix, cut_index)])
    if debug:
        out = sp.PIPE
        logger.debug("Executing FFmpeg command: %s", ffmpeg_command_to_save)
    else:
        out = sp.DEVNULL
    errout = sp.STDOUT
    ffmpeg_process = sp.Popen(
        ffmpeg_command_to_save, stdout=out, stdin=sp.PIPE, stderr=errout, shell=True)
    for frame in cut_frames:
        try:
            ffmpeg_process.stdin.write(
                cv2.imencode('.jpg', frame)[1].tobytes())
        except (OSError, IOError) as e:
            logger.error("Failed to write to ffmpeg process")
            logger.error(e)
    ffmpeg_process.stdin.close()
    ffmpeg_process.wait()
    logger.info("Finished writing cut %d", cut_index)
    return "outputs/%s_%d.y4m" % (prefix, cut_index)
