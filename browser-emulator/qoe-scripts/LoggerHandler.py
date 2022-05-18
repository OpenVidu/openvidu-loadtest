from colorlog import ColoredFormatter
import logging as log
from threading import current_thread, get_ident, get_native_id


def logger_handler():
    formatter = ColoredFormatter(
        "{green}{asctime}{reset} :: {bold_purple}{name:^13}{reset} :: {bold_cyan}{thread}{reset} :: {log_color}{levelname:^8}{reset} :: {bold_white}{message}",
        datefmt="%H:%M:%S",
        reset=True,
        log_colors={
            "INFO": "bold_cyan",
            "DEBUG": "bold_yellow",
            "WARNING": "bold_red,fg_thin_yellow",
            "ERROR": "bold_red",
            "CRITICAL": "bold_red,bg_white",
        },
        style="{",
    )
    handler = log.StreamHandler()
    handler.setFormatter(formatter)
    handler.addFilter(get_thread)
    return handler


def get_thread(record):
    record.thread = str(current_thread().getName())
    return record


def get_logger(name, debug=False):
    logger = log.getLogger(name)
    logger.propagate = False
    logger.addHandler(logger_handler())
    if debug:
        logger.setLevel(log.DEBUG)
    else:
        logger.setLevel(log.INFO)
    return logger
