import subprocess as sp
import cv2
import logging as logger
import ray


@ray.remote
def prepare_presenter(ffmpeg_path, presenter, padding_duration_secs, fragment_duration_secs, presenter_audio, PESQ_AUDIO_SAMPLE_RATE, debug=False):
    logger.basicConfig(level=logger.DEBUG if debug else logger.INFO)
    logger.info("Starting preparing presenter files")
    if debug:
        out = sp.PIPE
    else:
        out = sp.DEVNULL
    errout = sp.STDOUT
    ffmpeg_command_to_save = ' '.join([
        ffmpeg_path, "-n", "-threads", "1",
        "-i", presenter, "-an", "-ss", str(padding_duration_secs), "-to", str(padding_duration_secs + fragment_duration_secs), "-async", "1", "presenter.yuv"])
    process_video = sp.Popen(ffmpeg_command_to_save,
                             stdout=out, stderr=errout, shell=True)
    start_cut = str(padding_duration_secs)
    end_cut = str(padding_duration_secs + fragment_duration_secs)
    ffmpeg_command_to_save = ' '.join([
        ffmpeg_path, "-n", "-threads", "1",
        "-i", presenter_audio, "-ss", start_cut, "-to", end_cut, "-async", "1", "presenter.wav",
        "-ss", start_cut, "-to", end_cut, "-async", "1", "-ar", PESQ_AUDIO_SAMPLE_RATE, "presenter-pesq.wav"])
    process_audio = sp.Popen(ffmpeg_command_to_save,
                             stdout=out, stderr=errout, shell=True)
    process_video.wait()
    process_audio.wait()
    logger.info("Finished preparing presenter files")
    return True


@ray.remote
def extract_audio(cut_index, ffmpeg_path, start_cut_n, end_cut_n, viewer, prefix, PESQ_AUDIO_SAMPLE_RATE, presenter_prepared, debug=False):
    logger.basicConfig(level=logger.DEBUG if debug else logger.INFO)
    if not presenter_prepared:
        logger.error("Something went wrong, presenter not prepared")
        raise Exception("Something went wrong, presenter not prepared")
    # offset = 0.1 # offset is needed because the start cut time is not as precise as it should be atm
    end_cut = str(end_cut_n)
    start_cut = str(start_cut_n)
    logger.info("Starting audio extraction on cut %d, %s to %s",
                cut_index, start_cut, end_cut)
    ffmpeg_command_to_save_audio = ' '.join([
        ffmpeg_path, "-y", "-threads", "1", "-i", viewer, "-ss", start_cut, "-to", end_cut, "-async", "1", "outputs_audio/%s_%d.wav" % (
            prefix, cut_index),
        "-ss", start_cut, "-to", end_cut, "-async", "1", "-ar", str(PESQ_AUDIO_SAMPLE_RATE), "outputs_audio/%s_pesq_%d.wav" % (
            prefix, cut_index)
    ])
    logger.info(ffmpeg_command_to_save_audio)
    if debug:
        out = sp.PIPE
        logger.debug("Executing FFmpeg command: %s",
                     ffmpeg_command_to_save_audio)
    else:
        out = sp.DEVNULL
    errout = sp.STDOUT
    ffmpeg_process = sp.Popen(
        ffmpeg_command_to_save_audio, stdout=out, stdin=sp.PIPE, stderr=errout, shell=True)
    ffmpeg_process.wait()
    logger.info("Finished audio extraction on cut %d", cut_index)
    return "outputs_audio/%s_%d.wav" % (prefix, cut_index), "outputs_audio/%s_pesq_%d.wav" % (prefix, cut_index)


@ray.remote
def write_video(cut_frames, cut_index, ffmpeg_path, width, height, fps, prefix, presenter_prepared, debug=False):
    logger.basicConfig(level=logger.DEBUG if debug else logger.INFO)
    if not presenter_prepared:
        logger.error("Something went wrong, presenter not prepared")
        raise Exception("Something went wrong, presenter not prepared")
    logger.info("Starting saving video file on cut %d, for %d frames",
                cut_index, len(cut_frames))
    ffmpeg_command_to_save = ' '.join([
        ffmpeg_path, "-y", "-threads", "1", "-f", "image2pipe", "-framerate", str(
            fps), "-s", "%dx%d" % (width, height),
        "-i", "pipe:0", "-b:v", "3M", "-pix_fmt", "yuv420p", "outputs/%s_%d.yuv" % (prefix, cut_index)])
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
    del cut_frames
    return "outputs/%s_%d.yuv" % (prefix, cut_index)
