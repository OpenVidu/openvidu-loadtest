from numpy import Infinity
from qoe_scripts.get_ffmpeg_path import get_valid_ffmpeg_path
import logging as logger
import cv2
import os
import json
import qoe_scripts.video_processing_tasks as vpt
import qoe_scripts.analysis_tasks as at
from qoe_scripts.padding_matcher import match_image
from qoe_scripts.ocr_aligner import align_ocr
import ray
import time
import argparse

start_time = time.time()
parser = argparse.ArgumentParser(description="QoE analyzer")
parser.add_argument("--debug", action="store_true",
                    default=False, help="Enable debug mode")
parser.add_argument("--remux", action="store_true",
                    default=False, help="Enable remux mode")
parser.add_argument("--viewer", type=str, default="viewer.yuv",
                    help="Distorted viewer video")
parser.add_argument("--prefix", type=str, default="qoe_",
                    help="Prefix for output files")
parser.add_argument("--fragment_duration_secs", type=int,
                    default=5, help="Fragment duration in seconds")
parser.add_argument("--padding_duration_secs", type=int,
                    default=1, help="Padding duration in seconds")
parser.add_argument("--width", type=int, default=640,
                    help="Width of the video")
parser.add_argument("--height", type=int, default=480,
                    help="Height of the video")
parser.add_argument("--fps", type=int, default=30, help="FPS of the video")
parser.add_argument("--presenter", type=str,
                    default="presenter.yuv", help="Original video")
parser.add_argument("--presenter_audio", type=str,
                    default="presenter.wav", help="Original audio")
parser.add_argument("--max_cpus", type=int, help="Max number of CPUs to use")

args = parser.parse_args()
debug = args.debug
fps = args.fps
fragment_duration_secs = args.fragment_duration_secs
padding_duration_secs = args.padding_duration_secs
width = args.width
height = args.height
presenter = args.presenter
presenter_audio = args.presenter_audio
remux = args.remux
viewer = args.viewer
prefix = args.prefix
max_cpus = args.max_cpus

logger.basicConfig(level=logger.DEBUG if debug else logger.INFO)

logger.info("Debug: %s", debug)
logger.info("FPS: %d", fps)
logger.info("Fragment duration (s): %d s", fragment_duration_secs)
logger.info("Padding duration (s): %d s", padding_duration_secs)
logger.info("Dimensions: %d x %d", width, height)
logger.info("Presenter video: %s", presenter)
logger.info("Presenter audio: %s", presenter_audio)
logger.info("Viewer video: %s", viewer)
logger.info("Prefix: %s", prefix)
logger.info("Max CPUs: %s", max_cpus)
logger.info("Initializing Ray")


if ray.is_initialized():
    ray.shutdown()
if max_cpus is None:
    ray.init(ignore_reinit_error=True, include_dashboard=debug)
else:
    ray.init(ignore_reinit_error=True,
             include_dashboard=debug, num_cpus=max_cpus)

logger.info("Ray initialized")
PESQ_AUDIO_SAMPLE_RATE = "16000"

dim = (width, height)
ffmpeg_path = get_valid_ffmpeg_path()

# put into ray shared memory objects that are reused frequently between tasks so that ray doesn't have to put and get them everytime
fds_ref = ray.put(fragment_duration_secs)
fps_ref = ray.put(fps)
prefix_ref = ray.put(prefix)
pesq_ref = ray.put(PESQ_AUDIO_SAMPLE_RATE)
debug_ref = ray.put(debug)
width_ref = ray.put(width)
height_ref = ray.put(height)
ffmpeg_path_ref = ray.put(ffmpeg_path)

presenter_prepared = vpt.prepare_presenter.remote(
    ffmpeg_path, presenter, padding_duration_secs, fds_ref, presenter_audio, pesq_ref, debug_ref)


def process_cut_frames(cut_frames, cut_index, start_fragment_time, end_fragment_time):
    # Remux step has been removed
    cut_index_ref = ray.put(cut_index)
    extract_audio_task = vpt.extract_audio.remote(
        cut_index_ref, ffmpeg_path_ref, start_fragment_time, end_fragment_time, viewer, prefix_ref, pesq_ref, presenter_prepared, debug_ref)
    ocr_task = align_ocr(
        cut_frames, fds_ref, fps_ref, cut_index_ref, debug_ref)
    write_video_task = vpt.write_video.remote(
        ocr_task, cut_index_ref, ffmpeg_path_ref, width_ref, height_ref, fps_ref, prefix_ref, presenter_prepared, debug_ref)
    vmaf_task = at.run_vmaf.remote(
        write_video_task, prefix_ref, cut_index_ref, width_ref, height_ref, debug_ref)
    vqmt_task = at.run_vqmt.remote(
        write_video_task, prefix_ref, cut_index_ref, width_ref, height_ref, debug_ref)
    pesq_task = at.run_pesq.remote(
        extract_audio_task, prefix_ref, cut_index_ref, pesq_ref, debug_ref)
    visqol_task = at.run_visqol.remote(
        extract_audio_task, prefix_ref, cut_index_ref, debug_ref)
    if not debug:
        remove_processing_task = at.remove_processing_files.remote(
            vmaf_task, vqmt_task, pesq_task, visqol_task)
    parse_vmaf_task = at.parse_vmaf.remote(vmaf_task)
    parse_vqmt_task = at.parse_vqmt.remote(vqmt_task)
    parse_pesq_task = at.parse_pesq.remote(pesq_task)
    parse_visqol_task = at.parse_visqol.remote(visqol_task)
    if not debug:
        remove_analysis_task = at.remove_analysis_files.remote(
            parse_vmaf_task, parse_vqmt_task, parse_pesq_task, parse_visqol_task)

    final_tasks = [cut_index, parse_vmaf_task,
                   parse_vqmt_task, parse_pesq_task, parse_visqol_task]
    if not debug:
        final_tasks.append(remove_processing_task)
        final_tasks.append(remove_analysis_task)
    return final_tasks


def main():
    os.makedirs("./outputs", exist_ok=True)
    os.makedirs("./outputs_audio", exist_ok=True)
    os.makedirs("./ocr", exist_ok=True)
    os.makedirs("./frames", exist_ok=True)
    logger.info("Starting video processing")
    cap = cv2.VideoCapture(viewer)
    i = 0
    is_begin_padding = False
    is_beginning_video = True
    frames_for_cut = []
    cut_index = 0
    async_tasks = []
    start_fragment_time = None
    end_fragment_time = None
    while cap.isOpened():
        ret, frame = cap.read()
        if not ret:
            # video ended
            break
        frame = cv2.resize(frame, dim, interpolation=cv2.INTER_AREA)
        if is_begin_padding:
            if not match_image(frame, debug_ref):
                # padding ended
                is_begin_padding = False
                start_fragment_time = (cap.get(cv2.CAP_PROP_POS_MSEC) / 1000)
                if (end_fragment_time is not None) and (start_fragment_time < end_fragment_time):
                    logger.warning("Start fragment time %f is less than last end fragment time %f, using estimate time %f",
                                           start_fragment_time, end_fragment_time, end_fragment_time + fragment_duration_secs)
                    start_fragment_time = end_fragment_time + fragment_duration_secs
                frames_for_cut.append(frame)
        else:
            is_begin_padding = match_image(frame, debug_ref)
            if is_begin_padding:
                is_beginning_video = False
                len_frames = len(frames_for_cut)
                if len_frames > 0:
                    logger.info("Padding found on frame %d", i)
                    if len_frames > (fragment_duration_secs * fps):
                        logger.warning(
                            "Fragment is longer than expected, skipping...")
                    else:
                        end_fragment_time = (
                            cap.get(cv2.CAP_PROP_POS_MSEC) / 1000)
                        if end_fragment_time <= start_fragment_time:
                            logger.warning("End fragment time %f is less than start fragment time %f, using estimate time %f",
                                           end_fragment_time, start_fragment_time, start_fragment_time + fragment_duration_secs)
                            end_fragment_time = start_fragment_time + fragment_duration_secs
                        tasks = process_cut_frames(
                            frames_for_cut, cut_index, start_fragment_time, end_fragment_time)
                        async_tasks.append(tasks)
                    cut_index += 1
                    frames_for_cut = []
            elif not is_beginning_video:  # this ignores the first fragment as it is incomplete and QoE stats would be wrong
                frames_for_cut.append(frame)

        if debug:
            cv2.imwrite("frames/" + viewer + str(i) + ".jpg", frame)
        i += 1

    cap.release()
    logger.info(
        "Finished reading frames. Finishing processing cut fragments and normalizing data...")
    results_list = []
    VMAF_MAX = 100
    VMAF_MIN = 0
    VMAF_RANGE = VMAF_MAX - VMAF_MIN
    AUDIO_MAX = 5
    AUDIO_MIN = 1
    AUDIO_RANGE = AUDIO_MAX - AUDIO_MIN
    for tasks in async_tasks:
        if len(tasks) <= 0:
            continue
        cut_results = ray.get(tasks[1:])
        analysis_results_dict = {
            "cut_index": tasks[0],
            "vmaf": (cut_results[0][0] - VMAF_MIN) / VMAF_RANGE,
            "msssim": cut_results[1][0][0],
            "psnr": cut_results[1][0][1],
            "psnrhvs": cut_results[1][0][2],
            "ssim": cut_results[1][0][3],
            "vifp": cut_results[1][0][4],
            "psnrhvsm": cut_results[1][0][5],
            "pesq": (cut_results[2][0] - AUDIO_MIN) / AUDIO_RANGE,
            "visqol": (cut_results[3][0] - AUDIO_MIN) / AUDIO_RANGE
        }
        results_list.append(analysis_results_dict)
    with open(prefix + "_cuts.json", 'w') as f:
        json.dump(results_list, f)
    logger.info("End video processing")
    logger.info("Time used: %s seconds", str(time.time() - start_time))


if __name__ == '__main__':
    main()
