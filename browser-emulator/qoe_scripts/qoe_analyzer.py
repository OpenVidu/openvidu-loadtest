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
from multiprocessing import cpu_count
import time
start_time = time.time()

cpus = max(cpu_count() - 1, 1)

ray.init(num_cpus=cpus)

debug = ar.debug
remux = ar.remux

PESQ_AUDIO_SAMPLE_RATE = "16000"

logger = get_logger(__name__, debug)

dim = (ar.width, ar.height)
ffmpeg_path = get_valid_ffmpeg_path()

presenter_prepared = vpt.prepare_presenter.remote(
    ffmpeg_path, ar.presenter, ar.padding_duration_secs, ar.fragment_duration_secs, ar.presenter_audio, PESQ_AUDIO_SAMPLE_RATE, debug)


def process_cut_frames(cut_frames, cut_index):
    # Remux step has been removed
    extract_audio_task = vpt.extract_audio.remote(
        cut_index, ar.fragment_duration_secs, ar.viewer, ar.prefix, PESQ_AUDIO_SAMPLE_RATE, debug)
    ocr_task = align_ocr(
        cut_frames, ar.fragment_duration_secs, ar.fps, cut_index)
    write_video_task = vpt.write_video.remote(
        ocr_task, cut_index, ffmpeg_path, dim, ar.fps, ar.prefix, presenter_prepared, debug)
    vmaf_task = at.run_vmaf.remote(write_video_task, ar.prefix, cut_index, ar.width, ar.height, debug)
    vqmt_task = at.run_vqmt.remote(write_video_task, ar.prefix, cut_index, ar.width, ar.height, debug)
    pesq_task = at.run_pesq.remote(extract_audio_task, ar.prefix, cut_index, PESQ_AUDIO_SAMPLE_RATE, debug)
    visqol_task = at.run_visqol.remote(extract_audio_task, ar.prefix, cut_index, debug)
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
                if len(frames_for_cut) > 0:
                    logger.info("Padding found on frame %d", i)
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
    logger.info("Finished reading frames. Finishing processing cut fragments...")
    results_list = []
    for tasks in async_tasks:
        cut_results = ray.get(tasks[1:])
        analysis_results_dict = {
            "cut_index": tasks[0],
            "vmaf": cut_results[0][0],
            "msssim": cut_results[1][0][0],
            "psnr": cut_results[1][0][1],
            "psnrhvs": cut_results[1][0][2],
            "ssim": cut_results[1][0][3],
            "vifp": cut_results[1][0][4],
            "psnrhvsm": cut_results[1][0][5],
            "pesq": cut_results[2][0],
            "visqol": cut_results[3][0]
        }
        results_list.append(analysis_results_dict)
    with open(ar.prefix + "_cuts.json", 'w') as f:
        json.dump(results_list, f)
    logger.info("End video processing")
    logger.info("Time used: %s seconds", str(time.time() - start_time))


if __name__ == '__main__':
    main()
