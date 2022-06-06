import math
import cv2
import pytesseract
from LoggerHandler import get_logger
from concurrent.futures import ThreadPoolExecutor as Pool
import numpy as np
import os
import random


def is_int(n):
    try:
        return int(n)
    except ValueError:
        return ''


class OCRAligner:
    def __init__(self, pool, fragment_duration_secs, target_fps, debug=False):
        self.pool = pool
        OCRAligner.initial_counter_frames = fragment_duration_secs * target_fps
        self.debug = debug

        OCRAligner.logger = get_logger("OCRAligner", debug)
        OCRAligner.ocr_configs = [
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

    @staticmethod
    def get_ocr(frame, custom_config_idx=0):
        custom_config_dict = OCRAligner.ocr_configs[custom_config_idx]
        custom_config = custom_config_dict['config']
        use_threshold = custom_config_dict['use_threshold']
        height = frame.shape[0]
        width = frame.shape[1]
        left = math.floor(width / 2.5)
        right = math.floor(width / 1.7)
        top = math.floor(height / 1.12)
        bottom = math.floor(height / 1.02)
        img_crop = frame[top:bottom, left:right]
        ocr_img = None
        img_gray = cv2.cvtColor(img_crop, cv2.COLOR_BGR2GRAY)
        ocr_img = img_gray
        if use_threshold:
            ocr_img = cv2.threshold(
                img_gray, 0, 255, cv2.THRESH_BINARY | cv2.THRESH_OTSU)[1]
        frame_number = pytesseract.image_to_data(
            ocr_img, output_type=pytesseract.Output.DICT, config=custom_config)
        conf_idx = np.argmax(np.array(frame_number['conf'], dtype=np.int32))
        conf = frame_number['conf'][conf_idx]
        text = frame_number['text'][conf_idx]
        integer = is_int(text)
        if (conf == '-1') or (integer == '') or (integer > OCRAligner.initial_counter_frames) or (conf <= 43):
            if custom_config_idx < len(OCRAligner.ocr_configs) - 1:
                #OCRAligner.logger.warn("Error in OCR (text: %s, confidence: %d), retrying with different config: %d", text, conf, custom_config_idx + 1)
                return OCRAligner.get_ocr(frame, custom_config_idx + 1)
            else:
                OCRAligner.logger.warn(
                    "Error in OCR (text: %s, confidence: %s), no more configs available, skipping frame and saving image of cropped frame number in error directory", text, str(conf))
                os.makedirs("./error", exist_ok=True)
                cv2.imwrite("./error/" + text + "_" + str(conf) + "_" +
                            str(random.randint(0, 100000)) + "_gray.png", img_gray)
                cv2.imwrite("./error/" + text + "_" + str(conf) + "_" +
                            str(random.randint(0, 100000)) + "_ocr.png", ocr_img)
                return -1
        OCRAligner.logger.debug(
            "OCR result: " + text + " with conf: " + str(conf))
        if type(integer) is int:
            return integer
        return text

    def align_ocr_alg(self, frames, frame_numbers):
        l = np.array(list(filter(lambda x: x != -1, frame_numbers)))
        if not np.array_equal(l, np.sort(l)):
            OCRAligner.logger.warn("not sorted")
            OCRAligner.logger.warn(frame_numbers)

        skipped_frames = 0
        error_ocr = 0
        counter_frames = OCRAligner.initial_counter_frames
        tmp_frames = np.empty(shape=counter_frames, dtype=np.ndarray)
        for i in reversed(range(len(frames))):
            frame_number = frame_numbers[i]
            if (type(frame_number) is int) and (frame_number > -1):
                frame = frames[i]
                j = frame_number
                OCRAligner.logger.debug("Frame number: %d", frame_number)
                while j <= counter_frames:
                    tmp_frames[j - 1] = frame
                    OCRAligner.logger.debug(
                        "Inserted frame %d using %d", j, frame_number)
                    if j != counter_frames:
                        skipped_frames += 1
                    j += 1
                counter_frames = frame_number - 1
            else:
                error_ocr += 1
        first_frame_number = frame_numbers[0]
        first_frame = frames[0]
        for j in range(1, first_frame_number):
            tmp_frames[j - 1] = first_frame
            OCRAligner.logger.debug(
                "Inserted frame %d using %d", j, first_frame_number)
            if j != counter_frames:
                skipped_frames += 1
            j -= 1
        OCRAligner.logger.debug("Skipped frames: %d", skipped_frames)
        OCRAligner.logger.debug("Error OCR: %d", error_ocr)
        return tmp_frames

    def align_ocr(self, frames, cut_index):
        self.logger.info("Starting OCR processing of cut %d", cut_index)
        resolved_tasks = list(self.pool.map(OCRAligner.get_ocr, frames))
        future = self.pool.submit(self.align_ocr_alg, frames, resolved_tasks)
        return future


# cpus = len(os.sched_getaffinity(0))
# if cpus < 1:
#     cpus = 1
# pool = Pool(cpus)
# ocr = OCRAligner(pool, 5, 30)
# frames = []
# for i in range(798, 803):
#     frames.append(cv2.imread("./frames/bunny-viewer.webm" + str(i) + ".jpg"))
# resolved_tasks = list(pool.map(OCRAligner.get_ocr, frames))
# f = pool.submit(ocr.align_ocr_alg(frames, resolved_tasks))
# print(f.result())