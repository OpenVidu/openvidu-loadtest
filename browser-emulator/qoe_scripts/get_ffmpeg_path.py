import os
import platform
import logging as logger


def get_valid_ffmpeg_path(
    custom_ffmpeg="", is_windows=False, ffmpeg_download_path="", logging=False
):
    """
    ## get_valid_ffmpeg_path

    Validate the given FFmpeg path/binaries, and returns a valid FFmpeg executable path.

    Parameters:
        custom_ffmpeg (string): path to custom FFmpeg executables
        is_windows (boolean): is running on Windows OS?
        ffmpeg_download_path (string): FFmpeg static binaries download location _(Windows only)_
        logging (bool): enables logging for its operations

    **Returns:** A valid FFmpeg executable path string.
    """
    final_path = ""
    if is_windows:
        # checks if current os is windows
        if custom_ffmpeg:
            # if custom FFmpeg path is given assign to local variable
            final_path += custom_ffmpeg

        if os.path.isfile(final_path):
            # check if valid FFmpeg file exist
            pass
        elif os.path.isfile(os.path.join(final_path, "ffmpeg.exe")):
            # check if FFmpeg directory exists, if does, then check for valid file
            final_path = os.path.join(final_path, "ffmpeg.exe")
        else:
            # else return False
            logging and logger.debug(
                "No valid FFmpeg executables found at Custom FFmpeg path!"
            )
            return False
    else:
        # otherwise perform test for Unix
        if custom_ffmpeg:
            # if custom FFmpeg path is given assign to local variable
            if os.path.isfile(custom_ffmpeg):
                # check if valid FFmpeg file exist
                final_path += custom_ffmpeg
            elif os.path.isfile(os.path.join(custom_ffmpeg, "ffmpeg")):
                # check if FFmpeg directory exists, if does, then check for valid file
                final_path = os.path.join(custom_ffmpeg, "ffmpeg")
            else:
                # else return False
                logging and logger.debug(
                    "No valid FFmpeg executables found at Custom FFmpeg path!"
                )
                return False
        else:
            # otherwise assign ffmpeg binaries from system
            final_path += "ffmpeg"

    logging and logger.debug("Final FFmpeg Path: {}".format(final_path))

    # Final Auto-Validation for FFmeg Binaries. returns final path if test is passed
    return final_path if validate_ffmpeg(final_path, logging=logging) else False


def validate_ffmpeg(path, logging=False):
    """
    ## validate_ffmpeg

    Validate FFmeg Binaries. returns `True` if tests are passed.

    Parameters:
        path (string): absolute path of FFmpeg binaries
        logging (bool): enables logging for its operations

    **Returns:** A boolean value, confirming whether tests passed, or not?.
    """
    try:
        # get the FFmpeg version
        version = check_output([path, "-version"])
        firstline = version.split(b"\n")[0]
        version = firstline.split(b" ")[2].strip()
        if logging:  # log if test are passed
            logger.debug("FFmpeg validity Test Passed!")
            logger.debug(
                "Found valid FFmpeg Version: `{}` installed on this system".format(
                    version
                )
            )
    except Exception as e:
        # log if test are failed
        if logging:
            logger.exception(str(e))
            logger.warning("FFmpeg validity Test Failed!")
        return False
    return True


def check_output(*args, **kwargs):
    """
    ## check_output

    Returns stdin output from subprocess module
    """
    # import libs
    import subprocess as sp

    # workaround for python bug: https://bugs.python.org/issue37380
    if platform.system() == "Windows":
        # see comment https://bugs.python.org/msg370334
        sp._cleanup = lambda: None

    # handle additional params
    retrieve_stderr = kwargs.pop("force_retrieve_stderr", False)

    # execute command in subprocess
    process = sp.Popen(
        stdout=sp.PIPE,
        stderr=sp.DEVNULL if not (retrieve_stderr) else sp.PIPE,
        *args,
        **kwargs,
    )
    output, stderr = process.communicate()
    retcode = process.poll()

    # handle return code
    if retcode and not (retrieve_stderr):
        cmd = kwargs.get("args")
        if cmd is None:
            cmd = args[0]
        error = sp.CalledProcessError(retcode, cmd)
        error.output = output
        raise error

    return output if not (retrieve_stderr) else stderr
