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
import csv
import json
import math

optlist, args = getopt.getopt(sys.argv[1:], '', [
                              'debug', 'viewer=', 'prefix=', 'fragment_duration_secs=', 'padding_duration_secs=', 'width=', 'height=', 'fps=', 'presenter=', 'presenter_audio=', 'remux'])

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
    if o == '--padding_duration_secs':
        padding_duration_secs = int(a)
    if o == '--width':
        width = int(a)
    if o == '--height':
        height = int(a)
    if o == '--fps':
        fps = int(a)
    if o == '--remux':
        remux = True
    if o == '--presenter':
        presenter = a
    if o == '--presenter_audio':
        presenter_audio = a

PESQ_AUDIO_SAMPLE_RATE = "16000"

logger = get_logger("VideoProcessing", debug)

dim = (width, height)

cpus = len(os.sched_getaffinity(0)) + 1
if cpus < 6:
    cpus = 6

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


def prepare_presenter():
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


presenter_prepared = pool.submit(prepare_presenter)


def process_cut_frames(cut_frames, cut_index):
    # Remux step has been removed
    logger.info("Starting processing of cut %d", cut_index)
    extract_audio_future = pool.submit(extract_audio, cut_index)
    ocr_cut_frames_future = ocr_aligner.align_ocr(cut_frames, cut_index)
    ocr_cut_frames = ocr_cut_frames_future.result()
    logger.info("Finished OCR Alignment on cut %d", cut_index)
    write_video_future = pool.submit(write_video, ocr_cut_frames, cut_index)
    written_video, prefix = write_video_future.result()
    written_audio, written_audio_pesq = extract_audio_future.result()
    presenter_prepared.result()
    run_analysis_future = pool.submit(
        run_analysis, written_video, written_audio, written_audio_pesq, prefix, cut_index)
    files_to_remove, analysis_files = run_analysis_future.result()
    if not debug:
        remove_future = pool.submit(remove_files, files_to_remove)
    analysis_parsing_futures = [pool.submit(
        parse_csv, file, 1, True) for file in analysis_files[1:-3]]
    analysis_parsing_futures.insert(0, pool.submit(parse_csv, analysis_files[0], 0, False))
    analysis_parsing_futures.append(
        pool.submit(parse_pesq, analysis_files[-3]))
    analysis_parsing_futures.append(
        pool.submit(parse_visqol, analysis_files[-2]))
    analysis_results = []
    for future in analysis_parsing_futures:
        analysis_results.append(future.result())
    if not debug:
        remove_analysis_future = pool.submit(remove_files, analysis_files)
    analysis_results_dict = {
        "cut_index": cut_index,
        "vmaf": analysis_results[0],
        "msssim": analysis_results[1],
        "psnr": analysis_results[2],
        "psnrhvs": analysis_results[3],
        "ssim": analysis_results[4],
        "vifp": analysis_results[5],
        "psnrhvsm": analysis_results[6],
        "pesq": analysis_results[7],
        "visqol": analysis_results[8]
    }
    if not debug:
        remove_analysis_future.result()
        remove_future.result()
    return analysis_results_dict


def extract_audio(cut_index):
    logger.info("Starting audio extraction on cut %d", cut_index)
    start_cut = fragment_duration_secs * cut_index
    end_cut = str(start_cut + fragment_duration_secs)
    start_cut = str(start_cut)
    logger.info("Starting audio extraction on cut %d, %s to %s",
                cut_index, start_cut, end_cut)
    ffmpeg_command_to_save_audio = [
        "-y", "-threads", "1", "-i", viewer, "-ss", start_cut, "-to", end_cut, "-async", "1", "outputs_audio/%s_%d.wav" % (
            prefix, cut_index),
        "-ar", PESQ_AUDIO_SAMPLE_RATE, "outputs_audio/%s_pesq_%d.wav" % (
            prefix, cut_index)
    ]
    writer = WriteGear(output_filename="outputs_audio/%s_%d.wav" %
                       (prefix, cut_index), logging=debug)
    writer.execute_ffmpeg_cmd(ffmpeg_command_to_save_audio)
    writer.close()
    logger.info("Finished audio extraction on cut %d", cut_index)
    return "outputs_audio/%s_%d.wav" % (prefix, cut_index), "outputs_audio/%s_pesq_%d.wav" % (prefix, cut_index)


def write_video(cut_frames, cut_index):
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
    return "outputs/%s_%d.y4m" % (prefix, cut_index), prefix


path = '/'.join(os.path.realpath(__file__).split('/')[:-1])


def run_analysis(vid_file, audio_file, audio_file_pesq, prefix, cut_index):
    logger.info("Starting QoE analysis of %s, %s and %s",
                vid_file, audio_file, audio_file_pesq)
    vmaf_command = "%s/vmaf.sh -ip=presenter.yuv -iv=%s -o=%s-%d -w=%d -h=%d" % (
        path, vid_file, prefix, cut_index, width, height)
    vqmt_command = "%s/vqmt.sh -ip=presenter.yuv -iv=%s -o=%s-%d -w=%d -h=%d" % (
        path, vid_file, prefix, cut_index, width, height)
    pesq_command = "%s/pesq.sh -ip=presenter-pesq.wav -iv=%s -o=%s-%d" % (
        path, audio_file_pesq, prefix, cut_index)
    visqol_command = "%s/visqol.sh -ip=presenter.wav -iv=%s -o=%s-%d" % (
        path, audio_file, prefix, cut_index)
    vmaf_future = pool.submit(run_analysis_command, vmaf_command)
    vqmt_future = pool.submit(run_analysis_command, vqmt_command)
    pesq_future = pool.submit(run_analysis_command, pesq_command)
    visqol_future = pool.submit(run_analysis_command, visqol_command)

    vmaf_result = vmaf_future.result()
    vqmt_result = vqmt_future.result()
    pesq_result = pesq_future.result()
    visqol_result = visqol_future.result()
    logger.info("Finished QoE analysis of of %s, %s and %s",
                vid_file, audio_file, audio_file_pesq)
    return [vid_file, audio_file, audio_file_pesq], [
        "%s-%d_vmaf.csv" % (prefix, cut_index),
        "%s-%d_msssim.csv" % (prefix, cut_index),
        "%s-%d_psnr.csv" % (prefix, cut_index),
        "%s-%d_psnrhvs.csv" % (prefix, cut_index),
        "%s-%d_ssim.csv" % (prefix, cut_index),
        "%s-%d_vifp.csv" % (prefix, cut_index),
        "%s-%d_psnrhvsm.csv" % (prefix, cut_index),
        "%s-%d_pesq.txt" % (prefix, cut_index),
        "%s-%d_visqol.txt" % (prefix, cut_index),
        "%s-%d_vmaf.json" % (prefix, cut_index)
    ]


def remove_files(files):
    logger.info("Removing %s", str(files))
    remove_futures = []
    for file in files:
        remove_futures.append(pool.submit(os.remove, file))
    for future in remove_futures:
        future.result()
    logger.info("Finished removing %s", str(files))


def run_analysis_command(command):
    if debug:
        out = sp.PIPE
        logger.debug("Executing QoE command: %s", command)
    else:
        out = sp.DEVNULL
    errout = sp.STDOUT
    result = sp.call(command, stdout=out, stderr=errout, shell=True)
    logger.info("Exit code for QoE command %s: %d", command, result)
    return result


def parse_csv(file, column, headers):
    with open(file, 'r') as f:
        reader = csv.reader(f)
        if headers:
            next(reader)
        results = [float(row[column]) if not math.isnan(float(row[column])) else 0 for row in reader]
        return sum(results) / len(results)


def parse_pesq(file):
    with open(file, 'r') as f:
        text = f.read()
        if text == '':
            return 0
        first_split = text.split("\t")
        rawMOS = float(first_split[0].split("= ")[1])
        MOSLQO = float(first_split[1])
        return (rawMOS + MOSLQO) / 2


def parse_visqol(file):
    with open(file, 'r') as f:
        text = f.read()
        if text == '':
            return 0
        return float(text.split("MOS-LQO:		")[1])


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
                if len(frames_for_cut) > 0:
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
    results_list = []
    for result in async_results:
        cut_results = result.result()
        results_list.append(cut_results)
    with open(prefix + "_cuts.json", 'w') as f:
        json.dump(results_list, f)
    pool.shutdown()
    logger.info("End video processing")


main()
