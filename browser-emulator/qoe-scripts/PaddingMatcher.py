from LoggerHandler import get_logger
import numpy as np
import math
from itertools import repeat

debug = False

logger = get_logger("PaddingMatcher", debug)

colors_rgb = np.array([
    [0, 255, 255],  # cyan
    [255, 0, 255],  # magenta
    [0, 0, 255],  # blue
    [255, 255, 0],  # yellow
    [0, 255, 0],  # green
    [255, 0, 0]  # red
])


def match_color(frame, width, height, threshold, expected):
    logger.debug("match_color: %d, %d -- %s", width, height, str(expected))
    blue = frame[height - 1, width - 1, 0]
    green = frame[height - 1, width - 1, 1]
    red = frame[height - 1, width - 1, 2]
    rgb_section = np.array([red, green, blue])
    solution = np.allclose(rgb_section, expected, rtol=0, atol=threshold)
    logger.debug("match_color return %s for color %s", str(solution), str(expected))
    return solution


def match_image(frame, pool, threshold=50):
    height = frame.shape[0]
    width = frame.shape[1]
    match_height = math.floor(height / 3)
    bar = math.floor(width / 8)
    halfbar = math.floor(bar / 2)

    colors_widths = np.array([math.floor(halfbar + (bar * x))
                             for x in range(1, 7)])
    logger.debug("coords: %s", str(colors_widths))
    resolved_tasks = pool.map(match_color,
                              repeat(frame),
                              colors_widths,
                              repeat(match_height),
                              repeat(threshold),
                              colors_rgb
                              )
    results = list(resolved_tasks)

    logger.debug("results: %s", str(results))
    return np.all(results)
