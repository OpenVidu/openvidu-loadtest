import math
import cv2
import pytesseract
import numpy as np
import os
import random
import ray
from itertools import chain
import logging as logger

ocr_configs = [
    {
        'config': r'-c tessedit_char_whitelist=0123456789 --oem 3 --psm 8',
        'use_threshold': True
    },
    {
        'config': r'-c tessedit_char_whitelist=0123456789 --oem 3 --psm 6',
        'use_threshold': True
    },
    {
        'config': r'-c tessedit_char_whitelist=0123456789 --oem 3 --psm 8',
        'use_threshold': False
    },
    {
        'config': r'-c tessedit_char_whitelist=0123456789 --oem 3 --psm 6',
        'use_threshold': False
    }
]


def is_int(n):
    try:
        return int(n)
    except ValueError:
        return ''


def align_ocr(frames, fragment_duration_secs, target_fps, cut_index_ref, debug_ref):
    cut_index = ray.get(cut_index_ref)
    logger.info("Starting OCR processing of cut %d", cut_index)
    put_frames = [ray.put(frames[x]) for x in range(len(frames))]
    # batch calls by splitting into half the array and creating a task per half instead of creating a task per frame
    put_frames_split = np.array_split(put_frames, max(len(frames) // 15, 1))
    logger.debug("number of frame splits: %d", len(put_frames_split))
    tasks = []
    for x in range(len(put_frames_split)):
        put_frames_chunk = put_frames_split[x]
        tasks.append(get_ocr.remote(put_frames_chunk,
                     fragment_duration_secs, target_fps, debug_ref))
    return align_ocr_alg.remote(tasks, put_frames, fragment_duration_secs, target_fps, cut_index_ref, debug_ref)


@ray.remote
def get_ocr(frames_refs, fragment_duration_secs, target_fps, debug):
    logger.basicConfig(level=logger.DEBUG if debug else logger.INFO)
    custom_config_idx = 0
    initial_counter_frames = fragment_duration_secs * target_fps
    results = []
    for frame_ref in frames_refs:
        frame = ray.get(frame_ref)
        height = frame.shape[0]
        width = frame.shape[1]
        left = math.floor(width / 2.5)
        right = math.floor(width / 1.7)
        top = math.floor(height / 1.12)
        bottom = math.floor(height / 1.02)
        # crop frame number and remove alpha channel (avoids having tesseract do it, since tesseract removes the alpha channel too)
        img_crop = frame[top:bottom, left:right, :3]
        # tesseract optimal font size is 30, 31 and 32, accounting for some white padding around the text optimal height is around 50 (manually tested)
        exp_height = 50
        if img_crop.shape[0] != exp_height:
            if img_crop.shape[0] < exp_height:
                interpolation = cv2.INTER_CUBIC
            else:
                interpolation = cv2.INTER_AREA
            img_crop = cv2.resize(
                img_crop, (img_crop.shape[1] * exp_height // img_crop.shape[0], exp_height), interpolation=interpolation)
        ocr_img = None
        img_gray = cv2.cvtColor(img_crop, cv2.COLOR_BGR2GRAY)
        ocr_img = img_gray
        last_error = False
        while custom_config_idx < len(ocr_configs):
            custom_config_dict = ocr_configs[custom_config_idx]
            custom_config = custom_config_dict['config']
            use_threshold = custom_config_dict['use_threshold']
            if use_threshold:
                ocr_img = cv2.threshold(
                    img_gray, 0, 255, cv2.THRESH_BINARY | cv2.THRESH_OTSU)[1]
            frame_number = pytesseract.image_to_data(
                ocr_img, output_type=pytesseract.Output.DICT, config=custom_config)
            conf_idx = np.argmax(
                np.array(frame_number['conf'], dtype=np.int32))
            conf = frame_number['conf'][conf_idx]
            text = frame_number['text'][conf_idx]
            integer = is_int(text)
            if (conf == '-1') or (integer == '') or (integer > initial_counter_frames) or (conf <= 43):
                if custom_config_idx < len(ocr_configs) - 1:
                    #logger.warning("Error in OCR (text: %s, confidence: %d), retrying with different config: %d", text, conf, custom_config_idx + 1)
                    custom_config_idx += 1
                else:
                    logger.warning(
                        "Error in OCR (text: %s, confidence: %s), no more configs available", text, str(conf))
                    # if debug:
                    #     logger.debug("skipping frame and saving image of cropped frame number in error directory")
                    #     os.makedirs("./error", exist_ok=True)
                    #     cv2.imwrite("./error/" + text + "_" + str(conf) + "_" +
                    #                 str(random.randint(0, 100000)) + "_gray.png", img_gray)
                    #     cv2.imwrite("./error/" + text + "_" + str(conf) + "_" +
                    #                 str(random.randint(0, 100000)) + "_ocr.png", ocr_img)
                    last_error = True
                    break
            else:
                break
        logger.debug(
            "OCR result: " + text + " with conf: " + str(conf))
        if last_error:
            results.append(-1)
            last_error = False
        elif type(integer) is int:
            results.append(integer)
        else:
            results.append(text)
    return results


@ray.remote
def align_ocr_alg(frame_numbers_tasks, frames_refs, fragment_duration_secs, target_fps, cut_index, debug):
    logger.basicConfig(level=logger.DEBUG if debug else logger.INFO)
    # flatten ocr_results
    frame_numbers = list(chain.from_iterable(ray.get(frame_numbers_tasks)))
    # logger.info(str(frame_numbers))
    # l = np.array(list(filter(lambda x: x != -1, frame_numbers)))
    # if not np.array_equal(l, np.sort(l)):
    #     logger.warning("not sorted")
    #     logger.warning(frame_numbers)

    skipped_frames = 0
    error_ocr = 0
    counter_frames = fragment_duration_secs * target_fps
    tmp_frames = np.empty(shape=counter_frames, dtype=np.ndarray)
    frames = ray.get(frames_refs)
    for i in reversed(range(len(frames))):
        frame_number = frame_numbers[i]
        if (type(frame_number) is int) and (frame_number > -1):
            frame = frames[i]
            j = frame_number
            logger.debug("Frame number: %d", frame_number)
            while j <= counter_frames:
                tmp_frames[j - 1] = frame
                logger.debug(
                    "Inserted frame %d using %d", j, frame_number)
                if j != counter_frames:
                    skipped_frames += 1
                j += 1
            counter_frames = frame_number - 1
        else:
            error_ocr += 1
    # find first frame which number is not -1
    first_frame_number_idx = np.where(np.array(frame_numbers) > -1)[0][0]
    first_frame_number = frame_numbers[first_frame_number_idx]
    first_frame = frames[first_frame_number_idx]
    for j in range(1, first_frame_number):
        tmp_frames[j - 1] = first_frame
        logger.debug(
            "Inserted frame %d using %d", j, first_frame_number)
        if j != counter_frames:
            skipped_frames += 1
        j -= 1
    logger.info("Finished OCR Alignment for cut %d", cut_index)
    logger.debug("Skipped frames: %d", skipped_frames)
    logger.debug("Error OCR: %d", error_ocr)
    del frames_refs
    del frames
    del frame_numbers_tasks
    del frame_numbers
    return tmp_frames
