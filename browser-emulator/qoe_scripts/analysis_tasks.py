import subprocess as sp
import os
import shutil
import csv
import math
import logging as logger
import ray

# Binaries are expected on PATH; we don't store their absolute paths.


def validate_install(all_analysis):
    # Verify required binaries are available on PATH
    vmaf_bin = shutil.which("vmaf")
    if not vmaf_bin:
        logger.error("vmaf binary not found on PATH")
        raise Exception("vmaf binary not found on PATH")
    visqol_bin = shutil.which("visqol")
    if not visqol_bin:
        logger.error("visqol binary not found on PATH")
        raise Exception("visqol binary not found on PATH")
    if all_analysis:
        vqmt_bin = shutil.which("vqmt")
        if not vqmt_bin:
            logger.error("vqmt binary not found on PATH")
            raise Exception("vqmt binary not found on PATH")
        pesq_bin = shutil.which("pesq")
        if not pesq_bin:
            logger.error("pesq binary not found on PATH")
            raise Exception("pesq binary not found on PATH")


# TODO: Use ray shared memory instead of files for saving the analysis results then reading them back


@ray.remote
def remove_processing_files(*args):
    logger.basicConfig(level=logger.INFO)
    logger.info("Remove processed files")
    for arg in args:
        file = arg[0]
        if ("skip" not in file) and os.path.isfile(file):
            os.remove(file)
        else:
            logger.warning("File not found: %s", file)


@ray.remote
def remove_analysis_files(*args):
    logger.basicConfig(level=logger.INFO)
    files = []
    logger.info("Remove analysis files")
    for arg in args:
        files = arg[1]
        for file in files:
            if ("skip" not in file) and os.path.isfile(file):
                os.remove(file)
            else:
                logger.warning("File not found: %s", file)


@ray.remote
def run_vmaf(vid_file, prefix, cut_index, width, height, debug):
    logger.basicConfig(level=logger.DEBUG if debug else logger.INFO)
    if vid_file == "skip":
        return vid_file
    logger.info("Starting VMAF Analysis of cut %d", cut_index)
    prefix_with_index = prefix + "-" + str(cut_index)
    vmaf_command = (
        "vmaf --threads 1 -p 420 -w %d -h %d -b 8 -r presenter.yuv -d %s -m path=/usr/local/share/vmaf/models/vmaf_v0.6.1.json --json -o $PWD/%s_vmaf.json && cat $PWD/%s_vmaf.json | jq '.frames[].metrics.vmaf' > $PWD/%s_vmaf.csv"
        % (
            width,
            height,
            vid_file,
            prefix_with_index,
            prefix_with_index,
            prefix_with_index,
        )
    )
    return run_analysis_command(
        vmaf_command,
        [
            vid_file,
            "%s-%d_vmaf.csv" % (prefix, cut_index),
            "%s-%d_vmaf.json" % (prefix, cut_index),
        ],
        debug=debug,
    )


@ray.remote
def run_vqmt(vid_file, prefix, cut_index, width, height, debug):
    if vid_file == "skip":
        return vid_file
    logger.basicConfig(level=logger.DEBUG if debug else logger.INFO)
    logger.info("Starting VQMT Analysis of cut %d", cut_index)
    prefix_with_index = prefix + "-" + str(cut_index)
    vqmt_command = (
        "vqmt presenter.yuv %s %d %d 1500 1 %s PSNR SSIM VIFP MSSSIM PSNRHVS PSNRHVSM >> /dev/null 2>&1"
        % (vid_file, width, height, prefix_with_index)
    )
    return run_analysis_command(
        vqmt_command,
        [
            vid_file,
            "%s-%d_msssim.csv" % (prefix, cut_index),
            "%s-%d_psnr.csv" % (prefix, cut_index),
            "%s-%d_psnrhvs.csv" % (prefix, cut_index),
            "%s-%d_ssim.csv" % (prefix, cut_index),
            "%s-%d_vifp.csv" % (prefix, cut_index),
            "%s-%d_psnrhvsm.csv" % (prefix, cut_index),
        ],
        debug=debug,
    )


@ray.remote
def run_pesq(audio_files, prefix, cut_index, PESQ_AUDIO_SAMPLE_RATE, debug):
    logger.basicConfig(level=logger.DEBUG if debug else logger.INFO)
    audio_file_pesq = audio_files[1]
    prefix_with_index = prefix + "-" + str(cut_index)
    pesq_command = "pesq +%s presenter-pesq.wav %s | tail -n 1 > %s_pesq.txt" % (
        PESQ_AUDIO_SAMPLE_RATE,
        audio_file_pesq,
        prefix_with_index,
    )
    return run_analysis_command(
        pesq_command,
        [audio_file_pesq, "%s-%d_pesq.txt" % (prefix, cut_index)],
        debug=debug,
    )


@ray.remote
def run_visqol(audio_files, prefix, cut_index, debug):
    logger.basicConfig(level=logger.DEBUG if debug else logger.INFO)
    audio_file = audio_files[0]
    prefix_with_index = prefix + "-" + str(cut_index)
    visqol_command = (
        "visqol --reference_file presenter.wav --degraded_file %s --verbose --similarity_to_quality_model /usr/local/share/visqol/libsvm_nu_svr_model.txt | grep MOS-LQO > %s_visqol.txt"
        % (audio_file, prefix_with_index)
    )
    return run_analysis_command(
        visqol_command,
        [audio_file, "%s-%d_visqol.txt" % (prefix, cut_index)],
        debug=debug,
    )


def run_analysis_command(command, return_values, debug=False):
    if debug:
        out = sp.PIPE
        logger.debug("Executing QoE command: %s", command)
    else:
        out = sp.DEVNULL
    errout = sp.STDOUT
    result = sp.call(command, stdout=out, stderr=errout, shell=True)
    logger.info("Exit code for QoE command %s: %d", command, result)
    return return_values


def parse_csv(file, column, headers):
    with open(file, "r") as f:
        reader = csv.reader(f)
        if headers:
            try:
                next(reader)
            except:
                logger.warn("No headers found in file %s, it's probably empty", file)
        results = [
            float(row[column]) if not math.isnan(float(row[column])) else 0
            for row in reader
        ]
        return sum(results) / len(results)


@ray.remote
def parse_vmaf(analysis_results):
    if analysis_results == "skip":
        return analysis_results
    file = analysis_results[1]
    return parse_csv(file, 0, False), [file, analysis_results[2]]


@ray.remote
def parse_vqmt(analysis_results):
    if analysis_results == "skip":
        return analysis_results
    files = analysis_results[1:]
    results = []
    for file in files:
        results.append(parse_csv(file, 1, True))
    return results, files


@ray.remote
def parse_pesq(analysis_results):
    file = analysis_results[1]
    with open(file, "r") as f:
        text = f.read()
        try:
            if text == "":
                return 0, [file]
            first_split = text.split("\t")
            rawMOS = float(first_split[0].split("= ")[1])
            MOSLQO = float(first_split[1])
            return ((rawMOS + MOSLQO) / 2), [file]
        except:
            return 0, [file]


@ray.remote
def parse_visqol(analysis_results):
    file = analysis_results[1]
    with open(file, "r") as f:
        text = f.read()
        if text == "":
            return 0, [file]
        try:
            return (float(text.split("MOS-LQO:		")[1])), [file]
        except:
            return 0, [file]
