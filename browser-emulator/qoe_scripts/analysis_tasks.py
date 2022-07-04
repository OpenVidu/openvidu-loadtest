import subprocess as sp
import os
import csv
import math
import logging as logger
import ray


vmaf_path = os.environ.get('VMAF_PATH')
if not vmaf_path:
    logger.error("VMAF_PATH environment variable not set")
    raise Exception("VMAF_PATH environment variable not set")
vmaf_path = os.path.join(vmaf_path, 'vmaf')
if not os.path.exists(vmaf_path):
    logger.error("VMAF not found in VMAF_PATH")
    raise Exception("VMAF not found in VMAF_PATH")
vqmt_path = os.environ.get('VQMT_PATH')
if not vqmt_path:
    logger.error("VQMT_PATH environment variable not set")
    raise Exception("VQMT_PATH environment variable not set")
vqmt_path = os.path.join(vqmt_path, 'vqmt')
if not os.path.exists(vqmt_path):
    logger.error("VQMT not found in VQMT_PATH")
    raise Exception("VQMT not found in VQMT_PATH")
pesq_path = os.environ.get('PESQ_PATH')
if not pesq_path:
    logger.error("PESQ_PATH environment variable not set")
    raise Exception("PESQ_PATH environment variable not set")
pesq_path = os.path.join(pesq_path, 'pesq')
if not os.path.exists(pesq_path):
    logger.error("PESQ not found in PESQ_PATH")
    raise Exception("PESQ not found in PESQ_PATH")
visqol_path = os.environ.get('VISQOL_PATH')
if not visqol_path:
    logger.error("VISQOL_PATH environment variable not set")
    raise Exception("VISQOL_PATH environment variable not set")
if not os.path.exists(os.path.join(visqol_path, 'bazel-bin/visqol')):
    logger.error("VISQOL not found in VISQOL_PATH")
    raise Exception("VISQOL not found in VISQOL_PATH")

# TODO: Use ray shared memory instead of files for saving the analysis results then reading them back


@ray.remote
def remove_processing_files(*args):
    logger.basicConfig(level=logger.INFO)
    logger.info("Remove processed files")
    files = list(map(lambda x: x[0], args[1:]))
    logger.info(str(files))
    for file in files:
        if os.path.isfile(file):
            os.remove(file)
        else:
            logger.warning("File not found: %s", file)


@ray.remote
def remove_analysis_files(*args):
    logger.basicConfig(level=logger.INFO)
    files = []
    logger.info("Remove analysis files")
    for arg in args:
        for file in arg[1]:
            files.append(file)
    logger.info(str(files))
    for file in files:
        if os.path.isfile(file):
            os.remove(file)
        else:
            logger.warning("File not found: %s", file)


@ray.remote
def run_vmaf(vid_file, prefix, cut_index, width, height, debug):
    logger.basicConfig(level=logger.DEBUG if debug else logger.INFO)
    logger.info("Starting VMAF Analysis of cut %d", cut_index)
    prefix_with_index = prefix + '-' + str(cut_index)
    vmaf_command = "%s --threads 1 -p 420 -w %d -h %d -b 8 -r presenter.yuv -d %s -m path=/usr/local/share/vmaf/models/vmaf_v0.6.1.json --json -o $PWD/%s_vmaf.json && cat $PWD/%s_vmaf.json | jq '.frames[].metrics.vmaf' > $PWD/%s_vmaf.csv" % (
        vmaf_path, width, height, vid_file, prefix_with_index, prefix_with_index, prefix_with_index)
    return run_analysis_command(vmaf_command, [
        vid_file, "%s-%d_vmaf.csv" % (prefix, cut_index), "%s-%d_vmaf.json" % (prefix, cut_index)],
        debug=debug)


@ray.remote
def run_vqmt(vid_file, prefix, cut_index, width, height, debug):
    logger.basicConfig(level=logger.DEBUG if debug else logger.INFO)
    logger.info("Starting VQMT Analysis of cut %d", cut_index)
    prefix_with_index = prefix + '-' + str(cut_index)
    vqmt_command = "%s presenter.yuv %s %d %d 1500 1 %s PSNR SSIM VIFP MSSSIM PSNRHVS PSNRHVSM >> /dev/null 2>&1" % (
        vqmt_path, vid_file, width, height, prefix_with_index)
    return run_analysis_command(vqmt_command, [
        vid_file, "%s-%d_msssim.csv" % (prefix, cut_index),
        "%s-%d_psnr.csv" % (prefix,
                            cut_index), "%s-%d_psnrhvs.csv" % (prefix, cut_index),
        "%s-%d_ssim.csv" % (prefix,
                            cut_index), "%s-%d_vifp.csv" % (prefix, cut_index),
        "%s-%d_psnrhvsm.csv" % (prefix, cut_index)], debug=debug)


@ray.remote
def run_pesq(audio_files, prefix, cut_index, PESQ_AUDIO_SAMPLE_RATE, debug):
    logger.basicConfig(level=logger.DEBUG if debug else logger.INFO)
    audio_file_pesq = audio_files[1]
    prefix_with_index = prefix + '-' + str(cut_index)
    pesq_command = "%s +%s presenter-pesq.wav %s | tail -n 1 > %s_pesq.txt" % (
        pesq_path, PESQ_AUDIO_SAMPLE_RATE, audio_file_pesq, prefix_with_index)
    return run_analysis_command(pesq_command, [
        audio_file_pesq, "%s-%d_pesq.txt" % (prefix, cut_index)],
        debug=debug)


@ray.remote
def run_visqol(audio_files, prefix, cut_index, debug):
    logger.basicConfig(level=logger.DEBUG if debug else logger.INFO)
    audio_file = audio_files[0]
    prefix_with_index = prefix + '-' + str(cut_index)
    visqol_command = "%s/bazel-bin/visqol --reference_file presenter.wav --degraded_file %s --verbose --similarity_to_quality_model %s/model/libsvm_nu_svr_model.txt | grep MOS-LQO > %s_visqol.txt" % (
        visqol_path, audio_file, visqol_path, prefix_with_index)
    return run_analysis_command(visqol_command, [
        audio_file, "%s-%d_visqol.txt" % (prefix, cut_index)],
        debug=debug)


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
    with open(file, 'r') as f:
        reader = csv.reader(f)
        if headers:
            next(reader)
        results = [float(row[column]) if not math.isnan(
            float(row[column])) else 0 for row in reader]
        return sum(results) / len(results)


@ray.remote
def parse_vmaf(analysis_results):
    file = analysis_results[1]
    return parse_csv(file, 0, False), [file, analysis_results[2]]


@ray.remote
def parse_vqmt(analysis_results):
    files = analysis_results[1:]
    results = []
    for file in files:
        results.append(parse_csv(file, 1, True))
    return results, files


@ray.remote
def parse_pesq(analysis_results):
    file = analysis_results[1]
    with open(file, 'r') as f:
        text = f.read()
        if text == '':
            return 0, [file]
        first_split = text.split("\t")
        rawMOS = float(first_split[0].split("= ")[1])
        MOSLQO = float(first_split[1])
        return ((rawMOS + MOSLQO) / 2), [file]


@ray.remote
def parse_visqol(analysis_results):
    file = analysis_results[1]
    with open(file, 'r') as f:
        text = f.read()
        if text == '':
            return 0, [file]
        return (float(text.split("MOS-LQO:		")[1])), [file]
