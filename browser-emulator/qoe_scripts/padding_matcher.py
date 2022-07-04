import numpy as np
import math
import logging as logger
import ray

colors_rgb = np.array([
    [0, 255, 255],  # cyan
    [255, 0, 255],  # magenta
    [0, 0, 255],  # blue
    [255, 255, 0],  # yellow
    [0, 255, 0],  # green
    [255, 0, 0]  # red
])


def match_image(frame, debug_ref):
    height = frame.shape[0]
    width = frame.shape[1]
    match_height = math.floor(height / 3)
    bar = math.floor(width / 8)
    halfbar = math.floor(bar / 2)

    colors_widths = np.array([math.floor(halfbar + (bar * x))
                              for x in range(1, 7)])
    logger.debug("coords: %s", str(colors_widths))
    # resolved_tasks = pool.map(match_color,
    #                         repeat(frame),
    #                         colors_widths,
    #                         repeat(match_height),
    #                         repeat(threshold),
    #                         colors_rgb
    #                         )
    put_frame = ray.put(frame)
    match_height_ref = ray.put(match_height)
    # batch match color calls by splitting into half the array and creating a task per half instead of creating a task per color
    color_widths_split = np.array_split(colors_widths, 2)
    color_rgb_split = np.array_split(colors_rgb, 2)
    tasks = []
    for x in range(len(color_widths_split)):
        color_widths_chunk = color_widths_split[x]
        color_rgb_chunk = color_rgb_split[x]
        tasks.append(match_color.remote(put_frame, color_widths_chunk,
                     match_height_ref, color_rgb_chunk, debug_ref))
    results = ray.get(tasks)

    logger.debug("results: %s", str(results))
    return np.all(results)


@ray.remote
def match_color(frame, width_locations, height, expected_colors, debug):
    logger.basicConfig(level=logger.DEBUG if debug else logger.INFO)
    solutions = []
    for x in range(len(width_locations)):
        width = width_locations[x]
        expected = expected_colors[x]
        logger.debug("match_color: %d, %d -- %s", width, height, str(expected))
        blue = frame[height - 1, width - 1, 0]
        green = frame[height - 1, width - 1, 1]
        red = frame[height - 1, width - 1, 2]
        rgb_section = np.array([red, green, blue])
        solutions.append(np.allclose(
            rgb_section, expected, rtol=0, atol=50))  # 50 is the threshold
    logger.debug("match_color return %s for colors %s",
                 str(solutions), str(expected))
    return np.all(solutions)
