from asyncore import write
from vidgear.gears import CamGear
from vidgear.gears.helper import get_valid_ffmpeg_path
from qoe_scripts.logger_handler import get_logger
import cv2
import os
import json
import qoe_scripts.arg_reader as ar
import qoe_scripts.video_processing_tasks as vpt
import qoe_scripts.analysis_tasks as at
from qoe_scripts.padding_matcher import match_image
from qoe_scripts.ocr_aligner import align_ocr
import ray
import time
start_time = time.time()

ray.init(ignore_reinit_error=True)

debug = ar.debug
remux = ar.remux

PESQ_AUDIO_SAMPLE_RATE = "16000"

logger = get_logger(__name__, debug)

dim = (ar.width, ar.height)
ffmpeg_path = get_valid_ffmpeg_path()

# put into ray shared memory objects that are reused frequently between tasks so that ray doesn't have to put and get them everytime
fds_ref = ray.put(ar.fragment_duration_secs)
fps_ref = ray.put(ar.fps)
prefix_ref = ray.put(ar.prefix)
pesq_ref = ray.put(PESQ_AUDIO_SAMPLE_RATE)
debug_ref = ray.put(debug)
width_ref = ray.put(ar.width)
height_ref = ray.put(ar.height)
ffmpeg_path_ref = ray.put(ffmpeg_path)

presenter_prepared = vpt.prepare_presenter.remote(
    ffmpeg_path, ar.presenter, ar.padding_duration_secs, fds_ref, ar.presenter_audio, pesq_ref, debug_ref)


def process_cut_frames(cut_frames, cut_index):
    # Remux step has been removed
    cut_index_ref = ray.put(cut_index)
    extract_audio_task = vpt.extract_audio.remote(
        cut_index_ref, fds_ref, ar.viewer, prefix_ref, pesq_ref, debug_ref)
    ocr_task = align_ocr(
        cut_frames, fds_ref, fps_ref, cut_index_ref)
    write_video_task = vpt.write_video.remote(
        ocr_task, cut_index_ref, ffmpeg_path_ref, width_ref, height_ref, fps_ref, prefix_ref, presenter_prepared, debug_ref)
    vmaf_task = at.run_vmaf.remote(write_video_task, prefix_ref, cut_index_ref, width_ref, height_ref, debug_ref)
    vqmt_task = at.run_vqmt.remote(write_video_task, prefix_ref, cut_index_ref, width_ref, height_ref, debug_ref)
    pesq_task = at.run_pesq.remote(extract_audio_task, prefix_ref, cut_index_ref, pesq_ref, debug_ref)
    visqol_task = at.run_visqol.remote(extract_audio_task, prefix_ref, cut_index_ref, debug_ref)
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

    final_tasks = [cut_index, parse_vmaf_task, parse_vqmt_task, parse_pesq_task, parse_visqol_task]
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
    video = CamGear(source=ar.viewer, logging=debug).start()
    i = 0
    is_begin_padding = False
    frames_for_cut = []
    cut_index = 0
    async_tasks = []
    while True:
        frame = video.read()
        if frame is None:
            # video ended
            break
        frame = cv2.resize(frame, dim, interpolation=cv2.INTER_AREA)
        if is_begin_padding:
            if not match_image(frame):
                # padding ended
                is_begin_padding = False
                frames_for_cut.append(frame)
        else:
            is_begin_padding = match_image(frame)
            if is_begin_padding:
                len_frames = len(frames_for_cut)
                if len_frames > 0:
                    logger.info("Padding found on frame %d", i)
                    if len_frames > (ar.fragment_duration_secs * ar.fps):
                        logger.warn("Fragment is longer than expected, skipping...")
                    else:
                        tasks = process_cut_frames(frames_for_cut, cut_index)
                        async_tasks.append(tasks)
                    cut_index += 1
                    frames_for_cut = []
            else:
                frames_for_cut.append(frame)

        if debug:
            cv2.imwrite("frames/" + ar.viewer + str(i) + ".jpg", frame)
        i += 1

    video.stop()
    logger.info("Finished reading frames. Finishing processing cut fragments and normalizing data...")
    results_list = []
    VMAF_MAX = 100
    VMAF_MIN = 0
    VMAF_RANGE = VMAF_MAX - VMAF_MIN
    PSNR_MAX = 60
    PSNR_MIN = 20
    PSNR_RANGE = PSNR_MAX - PSNR_MIN
    AUDIO_MAX = 5
    AUDIO_MIN = 1
    AUDIO_RANGE = AUDIO_MAX - AUDIO_MIN
    for tasks in async_tasks:
        cut_results = ray.get(tasks[1:])
        analysis_results_dict = {
            "cut_index": tasks[0],
            "vmaf": (cut_results[0][0] - VMAF_MIN) / VMAF_RANGE,
            "msssim": cut_results[1][0][0],
            "psnr": (cut_results[1][0][1] - PSNR_MIN) / PSNR_RANGE,
            "psnrhvs": (cut_results[1][0][2] - PSNR_MIN) / PSNR_RANGE,
            "ssim": cut_results[1][0][3],
            "vifp": cut_results[1][0][4],
            "psnrhvsm": (cut_results[1][0][5] - PSNR_MIN) / PSNR_RANGE,
            "pesq": (cut_results[2][0] - AUDIO_MIN) / AUDIO_RANGE,
            "visqol": (cut_results[3][0] - AUDIO_MIN) / AUDIO_RANGE
        }
        results_list.append(analysis_results_dict)
    with open(ar.prefix + "_cuts.json", 'w') as f:
        json.dump(results_list, f)
    logger.info("End video processing")
    logger.info("Time used: %s seconds", str(time.time() - start_time))


if __name__ == '__main__':
    main()
