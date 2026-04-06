## **Browser Emulator documentation**

Worker service implemented in NodeJS and controlled with a REST protocol that capable of connecting to an OpenVidu session and sending and receiving WebRTC media.

It is able to start and launch **Chrome/Firefox browsers** using Selenium, emulating a fully real user.

This app provides a simple **REST API** that will be used by **loadtest-controller** and it allows:

This services also is listening for a **WebSocket communication**. It will send information from the clients to the loadtest-controller.

## API Documentation

The REST and WebSocket APIs are documented in the following files:

- **OpenAPI spec**: [docs/openapi.yaml](docs/openapi.yaml)
- **HTML documentation**: [docs/index.html](docs/index.html)

You can view the HTML docs directly in a browser or host them statically. For GitHub integration, you can use [raw.githubusercontent.com](https://raw.githubusercontent.com) to serve the HTML file.

To regenerate the docs after changes to the API:

```bash
pnpm run docs
```

# Browser Emulator development

## Development Requirements and Constraints

### Runtime Environment

Base software needed:

- Node 24.14.0+
- pnpm@10.30.3

Download at: [https://nodejs.org/en/download](https://nodejs.org/en/download) and [https://pnpm.io/installation#using-corepack](https://pnpm.io/installation#using-corepack)

Then you can run:

`pnpm install`

### Run with Docker

This repository now includes Docker artifacts to run browser-emulator in a container.

Quick start:

```bash
docker compose up --build
```

Or with npm scripts:

```bash
pnpm run docker:up
```

The service will be available at `http://localhost:5000` and `ws://browser-emulator-address:5001/events`.

Notes:

- The compose file mounts `/var/run/docker.sock` so features that launch helper containers (for example metricbeat) can work.
- If you need to pull or process large media files, keep enough free space in your host mounted directories.

### Running tests

The command `pnpm test` will only run tests that don't need any installed software, such as unit tests. For other types of tests, such as end-to-end tests, you can use the following commands:

- `pnpm test:all`: Run all tests using the Vagrant virtual machine. This will run the tests in the VM, which has all dependencies installed. Arguments can be passed to customize the test run. Use `pnpm run test:all --help` to see all available arguments.
- `pnpm test:all:native`: Run all tests in the host machine, without using Vagrant. This requires all dependencies to be installed in the native machine.

There are more options available in the `package.json` file, such as adding coverage or destroying the VM after running the tests, so check it out for more information.

## Legacy mode

On the initialization endpoint, `legacyMode` fake camera support depends on host kernel modules (`v4l2loopback`) and is not expected to work in a standard containerized setup unless you provide extra host configuration.

In this mode, the browser-emulator has several **Linux-specific dependencies** that are required. These components **cannot be easily replicated on Windows or macOS** due to kernel-level dependencies and availability. As a result, you can use one of these options:

- **Recommended**: Use the provided Vagrant + VirtualBox setup (works on Windows, macOS, Linux)
- **Alternative**: Use native Ubuntu 24.04 (or you can try WSL2, although it is mostly untested). If you want to use this option, either run `prepare_scripts/install_legacy.sh` (it may conflict with already installed dependencies if not installing on a fresh Ubuntu machine) or manually install all dependencies listed in that script.

### Host System Requirements

#### For Vagrant-based development (Recommended)

**Required:**

- [Vagrant](https://developer.hashicorp.com/vagrant/install) (>= 2.4.9)
- [VirtualBox](https://www.virtualbox.org/wiki/Downloads) (>= 7.2.6)
- ~20 GB free disk space for VM
- 4 GB RAM available (8 GB recommended)

#### For Native Linux Development

**Required:**

- All Linux-specific packages necesary (see `prepare_scripts/install_legacy.sh` for full list)

## Using Vagrant (Recommended Cross-Platform)

You can use [Vagrant](https://developer.hashicorp.com/vagrant/install) to create a virtual machine running the browser-emulator with every dependency installed. Ensure you have Vagrant and VirtualBox installed on your system.

You can either choose an already made box or make a personalized one yourself.

- **Already made box**

You can use the default Vagrantfile to create a preconfigured browser-emulator VM. You can start it with `vagrant up` to launch it with the default parameters. This box includes all the necessary dependencies to run the browser-emulator, along with both OpenVidu 2 CE and LiveKit installed and ready to use.

- **Customizable Parameters in Vagrantfile**
    - **BOX**: Box to use as base. You can choose our already made box or choose the path to a box made by yourself. Defaults to our default box with everything installed.
    - **MEMORY**: Amount of memory (in MB) to allocate for the virtual machine. Default: 4096.
    - **CPUS**: Number of CPUs to allocate for the virtual machine. Default: 4. (Note: if START_MEDIASERVER is true, OpenVidu requires at least 2 CPUs).
    - **DISK**: Disk size in GB for the virtual machine. Default: 20.
    - **START_SERVER**: Set to 'true' to start the browser-emulator server during provisioning and on each reboot. Default is 'true'.
    - **LIVEKIT**: Set to 'true' to set browser-emulator to use LiveKit client, as well as run LiveKit as the plaform instead of OpenVidu 2 when START_PLATFORM is set to 'true'. Default is 'false'.
    - **START_PLATFORM**: Set to 'true' to start the OpenVidu 2 CE or LiveKit server during provisioning and on each reboot. Default is 'true'.
      _OpenVidu note_: with this deployment, the OpenVidu URL is _https://localhost_ and the OpenVidu secret is _vagrant_.
      _LiveKit note_: With this deployment, LiveKit is deployed in dev mode, so the URL is _https://localhost_, API Key is _devkey_ and the API Secret is _secret_.
    - **NODES**: How many virtual machines will be created. Each machine will be created with the name node[i], where i is the node number. For each node, the ports open will be 5000 + (i \_ 10) and 5001 + (i \_ 10) for the BrowserEmulator server and 5900 + (i \* 10) for the VNC connection, where i is the node number. For example, the first node (node1) will have open ports 5000, 5001 and 5900, node2 will have 5010, 5011 and 5911 and so on. Defaults to 1.

- **Start vagrant**

To customize these parameters, you can set environment variables before running `vagrant up`. For example:

```bash
export BOX=ivchicano/browseremulator
vagrant up
```

- **Personalized box**

You can also construct your base personalized box with the parameters you choose. To start it, run `VAGRANT_VAGRANTFILE=./Vagrantfile_create_box vagrant up` to launch it with the default parameters. You can then package it with `VAGRANT_VAGRANTFILE=./Vagrantfile_create_box vagrant package` to create a box file.

- **Customizable Parameters in Vagrantfile**
    - **MEMORY**: Amount of memory (in MB) to allocate for the virtual machine. Default: 4096.
    - **CPUS**: Number of CPUs to allocate for the virtual machine. Default: 12.
    - **QOE**: Set to 'true' to install all necessary dependencies to run the quality of experience (QoE) analysis scripts in the browser-emulator. Slower installation. Default is 'true'.
    - **VAGRANT_PROVIDER**: Provider to use to create the virtual machine. Default is 'virtualbox'.

With this box, you can now set the **BOX** environment variable to the path of the box you just created and run `vagrant up` to start the virtual machine with the personalized box. Refer to the customizable parameters in the Vagrantfile section to customize the machine.

## Running QoE Analysis

BrowserEmulator can run analysis on the Quality of Experience on your video and audio.

Note: At the moment there is a historic bug on Chrome were the video and audio will get desynced, so audio QoE analysis will not work properly when using Chrome as the browser. It is recommended to use Firefox for accurate QoE results until this bug is fixed. This implies that you will need to have the `legacyMode` enabled and the necessary dependencies installed to run Firefox with a fake camera, either by using the Vagrant box or installing them in your machine. For more information about this bug, check [here](https://bugs.chromium.org/p/chromium/issues/detail?id=1414764).

For this, the following requisites have to be met:

- AWS's public and secret keys or any S3 compatible system's keys have to be set, so the recorded video fragments can be uploaded to S3.
- The original video and audio (separate files expected) need to be cut, and concrete paddings added to them. This can be done using the preset videos provided or making a custom one with the `mediafile_generation/generate-mediafiles-qoe.sh` script. The mandatory options are:
    - -d: Duration of the cut video, the video will be cut from the beginning to the second passed in this argument.
    - -p: Duration of the padding to be added (in seconds)
    - -v: Video location URL, the script will try to download the video from this URL using wget.
    - -a: Audio location URL, the script will try to download the audio from this URL using wget.
    - -w: Video width.
    - -h: Video height.
    - -f: Video frame rate. The video and audio have to be saved in `mediafiles` in y4m and wav format respectively so browser-emulator can see them.
        - The video file has to have the following name: `fakevideo_[framerate]fps_[width]x[height].y4m`, for example: `fakevideo_30fps_640x480.y4m`.
        - The audio file has to have the following name: `fakeaudio.wav`.

For the purpose of running the QoE Analysis, for each user pair 2 videos will be recorded during the run, one recording what the first user is receiving from the second and vice versa. These videos will be uploaded to S3 when [Delete all participant](#delete-participants) is run. These recordings will be called individual recordings.

When running [Initialize instance](#initialize-instance), you can add the property `"qoeAnalysis"` to the body, an object with the following options:

- enabled: defaults `false`, setting this to true will enable the individual recordings.
- fragment_duration: The duration of the cut video without the paddings chosen when running \_generate-mediafiles-qoe.sh\*
- padding_duration: The duration of the padding chosen when running \_generate-mediafiles-qoe.sh\*

When [Delete all participant](#delete-participants) is run, all individual recorded videos will be uploaded to S3 with the following name structure: `QOE_[Session]_[UserFrom]_[UserTo].webm`. From here you have 2 options.

- Running the analysis in the same worker machine that recorded the videos (not recommended as analysis might take hours to days for longer load tests), for that send a request to [Start QoE Analysis](#start-qoe-analysis)
- Running the analysis on another machine, for that pull this repository in that machine, cd to browser-emulator and follow the next steps:
    - Install all the needed dependencies on the machine. You can run the install script `prepare_scripts/install_qoe.sh`, or install the dependencies manually. The dependencies are:
        - ffmpeg (apt install ffmpeg)
        - [VMAF](https://github.com/Netflix/vmaf), the binary should be on PATH. Move the `vmaf_v0.6.1.json` file found in the model directory to `/usr/local/share/vmaf/models/vmaf_v0.6.1.json`
        - [ViSQOL](https://github.com/google/visqol), the binary should be on PATH. You will need the model file found in `model/libsvm_nu_svr_model.txt` directory when cloning the repository and move it to `/usr/local/share/visqol/libsvm_nu_svr_model.txt`.
        - [Tesseract OCR](https://github.com/tesseract-ocr/tesseract), it is highly recommended to build it disabling multithreading as explained [here](https://tesseract-ocr.github.io/tessdoc/Compiling-%E2%80%93-GitInstallation.html#release-builds-for-mass-production) to improve performance.
            - You will probably need to save the necessary model found [here](https://github.com/tesseract-ocr/tessdata/raw/main/eng.traineddata) in `/usr/local/share/tessdata/eng.traineddata`
        - (Optional) [VQMT](https://github.com/Rolinh/VQMT), the binary should be on PATH.
        - (Optional) [PESQ](https://github.com/dennisguse/ITU-T_pesq), the binary should be on PATH.
    - Save the individual recordings you want to analyze in `./recordings/qoe` directory.
    - Create a `qoe-results-processing-config.json` file (there is an example file with the same name in this repo), with the following structure:
        - elasticsearch_hostname: ELK hostname
        - elasticsearch_username: ELK username
        - elasticsearch_password: ELK password
        - index: ELK index to save the data
        - fragment_duration: The duration of the cut video without the paddings chosen when running \_generate-mediafiles-qoe.sh\*
        - padding_duration: The duration of the padding chosen when running \_generate-mediafiles-qoe.sh\*
        - width: Video width
        - height: Video height
        - framerate: Video frame rate
        - presenter_video_file_location: Location of the original video, usually located in `mediafiles/fakevideo*[framerate]fps\_[width]x[height].y4m`
        - presenter_audio_file_location: Location of the original audio, usually located in `mediafiles/fakeaudio.wav`
        - timestamps: Optional. An array of objects with info about when a user has been added to a session, used to make a timeline. If not added, this info will be searched in the index indicated in ELK. The objects have the following structure:
            - new_participant_id: username of the user
            - new_participant_session: session
            - @timestamp: timestamp when the user was added to the session (in ISO format)
    - Run:
        ```bash
        pnpm run qoe
        ```
    - You can also put a limit on the number of virtual cores used by the QoE scripts by adding the number as argument, for example with max 4 vcpus:
        ```bash
        pnpm run qoe -- --cpus=4
        ```
    - If you have the results of running the QoE scripts but have not uploaded them to ELK (\*\_cuts.json files) you can upload them by running:
        ```bash
        pnpm run qoe -- --process
        ```
    - If you don't want to automatically upload the data to ELK when a test finishes, use:
        ```bash
        pnpm run qoe -- --onlyfiles
        ```

After the analysis is done, the results will be uploaded to the selected index in ELK. A dashboard can be imported to Kibana importing the [loadtest.ndjson](load-test/src/main/resources/loadtest.ndjson) file. For more information about the imported data, check their respective pages: [VMAF](https://github.com/Netflix/vmaf), [VQMT](https://github.com/Rolinh/VQMT), [PESQ](https://github.com/dennisguse/ITU-T_pesq), [ViSQOL](https://github.com/google/visqol).
Note: VMAF, ViSQOL and PESQ QoE results are normalized in the range 0-1 before importing them to ELK.
