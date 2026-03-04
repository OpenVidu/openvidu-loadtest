## **Browser Emulator documentation**

Worker service implemented in NodeJS and controlled with a REST protocol that capable of connecting to an OpenVidu session and sending and receiving WebRTC media.

It is able to start and launch **Chrome/Firefox browsers** using Selenium, emulating a fully real user.

This app provides a simple **REST API** that will be used by **Load Test application** and it allows:

- [Ping to instance](#ping-instance). Do ping to check if instance is ready.
- [Initialize instance](#initialize-instance). Initialize monitoring stuffs like ElasticSearch env variables and Metricbeat container. This request also set the AWS public and secret keys for uploading the **video recordings files and stats' files to S3**.
- [Create a participant](#create-participant) (`PUBLISHER` or `SUBSCRIBER`).
- [Delete a specific participant](#delete-participant-by-connectionId) by its connectionId
- [Delete all participant](#delete-participants).

This services also is listening for a **WebSocket communication** on `ws://browser-emulator-address:5000/events`. It will send information from the clients to the loadtest-controller.

# Browser Emulator development

## Development Requirements and Constraints

### Runtime Environment

Base software needed:
- Node 24.14.0+
- pnpm@10.30.3

Download at: [https://nodejs.org/en/download](https://nodejs.org/en/download) and [https://pnpm.io/installation#using-corepack](https://pnpm.io/installation#using-corepack)

Then you can run:

`pnpm install`

The browser-emulator has several **Linux-specific dependencies** that are required. These components **cannot be easily replicated on Windows or macOS** due to kernel-level dependencies and availability. As a result, you can use one of these options:

- **Recommended**: Use the provided Vagrant + VirtualBox setup (works on Windows, macOS, Linux)
- **Alternative**: Use native Ubuntu 24.04 (or you can try WSL2, although it is mostly untested). If you want to use this option, either run `prepare_scripts/install_base.sh` (it may conflict with already installed dependencies if not installing on a fresh Ubuntu machine) or manually install all dependencies listed in that script.

### Host System Requirements

#### For Vagrant-based development (Recommended)

**Required:**

- [Vagrant](https://developer.hashicorp.com/vagrant/install) (>= 2.4.9)
- [VirtualBox](https://www.virtualbox.org/wiki/Downloads) (>= 7.2.6)
- ~20 GB free disk space for VM
- 4 GB RAM available (8 GB recommended)

#### For Native Linux Development

**Required:**

- All Linux-specific packages necesary (see `prepare_scripts/install_base.sh` for full list)

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
    - **NODES**: How many virtual machines will be created. Each machine will be created with the name node[i], where i is the node number. For each node, the ports open will be 5000 + (i \_ 10) for the BrowserEmulator server and 5900 + (i \* 10) for the VNC connection, where i is the node number. For example, the first node (node1) will have open ports 5000 and 5900, node2 will have 5010 and 5911 and so on. Defaults to 1.

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

### Running tests

The command `pnpm test` will only run tests that don't need any installed software, such as unit tests. For other types of tests, such as end-to-end tests, you can use the following commands:

- `pnpm test:all`: Run all tests using the Vagrant virtual machine. This will run the tests in the VM, which has all dependencies installed.
- `pnpm test:all:native`: Run all tests in the host machine, without using Vagrant. This requires all dependencies to be installed in the native machine.

There are more options available in the `package.json` file, such as adding coverage or destroying the VM after running the tests, so check it out for more information.

## Running QoE Analysis

BrowserEmulator can run analysis on the Quality of Experience on your video and audio. For this, the following requisites have to be met:

- AWS's public and secret keys or any S3 compatible system's keys have to be set, so the recorded video fragments can be uploaded to S3.
- The original video and audio (separate files expected) need to be cut, and concrete paddings added to them. This can be done with the `mediafile_generation/generate-mediafiles-qoe.sh` script. The mandatory options are:
    - -d: Duration of the cut video, the video will be cut from the beginning to the second passed in this argument.
    - -p: Duration of the padding to be added (in seconds)
    - -v: Video location URL, the script will try to download the video from this URL using wget.
    - -a: Audio location URL, the script will try to download the audio from this URL using wget.
    - -w: Video width.
    - -h: Video height.
    - -f: Video frame rate. The video and audio have to be saved in `src/assets/mediafiles` in y4m and wav format respectively so browser-emulator can see them.
        - The video file has to have the following name: `fakevideo_[framerate]fps_[width]x[height].y4m`, for example: `fakevideo_30fps_640x480.y4m`.
        - The audio file has to have the following name: `fakeaudio.wav`.
          Alternatively you can use our already preprocessed videos that can be downloaded using the _download_mediafiles.sh_ script. These have 1 second of padding and 5 seconds of cut video.

For the purpose of running the QoE Analysis, for each user pair 2 videos will be recorded during the run, one recording what the first user is receiving from the second and vice versa. These videos will be uploaded to S3 when [Delete all participant](#delete-participants) is run. These recordings will be called individual recordings.

When running [Initialize instance](#initialize-instance), you can add the property `"qoeAnalysis"` to the body, an object with the following options:

- enabled: defaults `false`, setting this to true will enable the individual recordings.
- fragment_duration: The duration of the cut video without the paddings chosen when running \_generate-mediafiles-qoe.sh\*
- padding_duration: The duration of the padding chosen when running \_generate-mediafiles-qoe.sh\*

When [Delete all participant](#delete-participants) is run, all individual recorded videos will be uploaded to S3 with the following name structure: `QOE_[Session]_[UserFrom]_[UserTo].webm`. From here you have 2 options.

- Running the analysis in the same worker machine that recorded the videos (not recommended as analysis might take hours to days for longer load tests), for that send a request to [Start QoE Analysis](#start-qoe-analysis)
- Running the analysis on another machine, for that pull this repository in that machine, cd to browser-emulator and follow the next steps:
    - Install all the needed dependencies on the machine. You can run both install scripts in the `prepare_scripts` directory, or install the dependencies manually. The dependencies are:
        - Python3 and pip3
        - [VMAF](https://github.com/Netflix/vmaf), set a VMAF_PATH environment variable with the path to the vmaf binary and move the `vmaf_v0.6.1.json` file found in the model directory to `/usr/local/share/vmaf/models/vmaf_v0.6.1.json`
        - [ViSQOL](https://github.com/google/visqol), set a VISQOL_PATH environment variable with the path to the directory that contains banzel-bin/visqol
        - [Tesseract OCR](https://github.com/tesseract-ocr/tesseract), it is highly recommended to build it disabling multithreading as explained [here](https://tesseract-ocr.github.io/tessdoc/Compiling-%E2%80%93-GitInstallation.html#release-builds-for-mass-production) to improve performance.
            - You will probably need to save the necessary model found [here](https://github.com/tesseract-ocr/tessdata/raw/main/eng.traineddata) in `/usr/local/share/tessdata/eng.traineddata`
        - npm dependencies
            ```bash
            npm install
            ```
        - qoe script dependencies
            ```bash
            pip3 install -r qoe_scripts/requirements.txt
            ```
        - (Optional) [VQMT](https://github.com/Rolinh/VQMT), set a VQMT_PATH environment variable with the path to the vqmt binary
        - (Optional) [PESQ](https://github.com/dennisguse/ITU-T_pesq), set a PESQ_PATH environment variable with the path to the pesq binary
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
        - presenter_video_file_location: Location of the original video, usually located in `src/assets/mediafiles/fakevideo*[framerate]fps\_[width]x[height].y4m`
        - presenter_audio_file_location: Location of the original audio, usually located in `src/assets/mediafiles/fakeaudio.wav`
        - timestamps: Optional. An array of objects with info about when a user has been added to a session, used to make a timeline. If not added, this info will be searched in the index indicated in ELK. The objects have the following structure:
            - new_participant_id: username of the user
            - new_participant_session: session
            - @timestamp: timestamp when the user was added to the session (in ISO format)
    - Run:
        ```bash
        npm run qoe
        ```
    - You can also put a limit on the number of virtual cores used by the QoE scripts by adding the number as argument, for example with max 4 vcpus:
        ```bash
        npm run qoe -- --cpus=4
        ```
    - If you have the results of running the QoE scripts but have not uploaded them to ELK (\*\_cuts.json files) you can upload them by running:
        ```bash
        npm run qoe -- --process
        ```
    - If you don't want to automatically upload the data to ELK when a test finishes, use:
        ```bash
        npm run qoe -- --onlyfiles
        ```

After the analysis is done, the results will be uploaded to the selected index in ELK. A dashboard can be imported to Kibana importing the [loadtest.ndjson](load-test/src/main/resources/loadtest.ndjson) file. For more information about the imported data, check their respective pages: [VMAF](https://github.com/Netflix/vmaf), [VQMT](https://github.com/Rolinh/VQMT), [PESQ](https://github.com/dennisguse/ITU-T_pesq), [ViSQOL](https://github.com/google/visqol).
Note: The QoE results are normalized in the range 0-1 before importing them to ELK.

## REST API

TODO: This documentation is very old and probably incorrect, will be updated as soon as possible. For now, check the loadtest-controller for correct API usage.

### PING INSTANCE

- #### METHOD: **GET**
- #### URL: https://localhost:5000/instance/ping

### INITIALIZE INSTANCE

- #### METHOD: **POST**
- #### URL: https://localhost:5000/instance/initialize
- #### BODY

```json
{
	"elasticSearchHost": "your-elasticsearch-hostname",
	"elasticSearchUserName": "your-username",
	"elasticSearchPassword": "your-password",
	"elasticSearchIndex": "your-optional-index",
	"awsAccessKey": "your-AWS-access-key",
	"awsSecretAccessKey": "your-AWS-secret-key",
	"s3BucketName": "your-s3-bucket-name",
	"minioAccessKey": "your-Minio-access-key",
	"minioSecretKey": "your-Minio-secret-key",
	"minioHost": "your-Minio-endpoint",
	"minioBucket": "your-Minio-bucket",
	"minioPort": "your-optional-Minio-port (default 443)",
	"browserVideo": {
		"videoType": "bunny",
		"videoInfo": {
			"width": 640,
			"height": 480,
			"fps": 30
		}
	},
	"qoeAnalysis": {
		"enabled": true,
		"fragment_duration": 5,
		"padding_duration": 1
	}
}
```

- #### RESPONSE

```json
Instance has been initialized
```

Note: the Minio variables (minioAccessKey, minioSecretAccessKey, minioHost, minioBucket) and the AWS variables (awsAccessKey, awsSecretAccessKey, s3BucketName) are exclusive, in the case the request has both types of variables the Minio ones have priority, and files will try to be uploaded to Minio.

`browserVideo` is only needed if using `browserMode REAL`. This object indicates what video to use, which will be downloaded. There are 3 types of video by default, having to be selected in the `videoType` property inside `browserVideo`. If using a default video type, the resolution and fps of the video to use have to be selected in the `videoInfo` property. All default videos have padding for possible usage in QoE Analysis. The default video types and available resolutions and framerates are the following:

- `bunny`: blender animated demo video
    - available resolutions and framerates:
        - Width: 640, height: 480, fps: 30
        - Width: 640, height: 480, fps: 60
        - Width: 1280, height: 720, fps: 30
        - Width: 1280, height: 720, fps: 60
        - Width: 1920, height: 1080, fps: 30
        - Width: 1920, height: 1080, fps: 60
- `interview`: interview video
    - available resolutions and framerates:
        - Width: 640, height: 480, fps: 30
- `game`: gameplay video with commentary
    - available resolutions and framerates:
        - Width: 640, height: 480, fps: 30

In Qoe Analysis object:

- fragment_duration indicates the duration of the video fragment between the paddings
- padding_duration indicates the duration of the padding

The default videos have been already processed by adding padding, the following durations are:

- `bunny`:
    - fragment_duration: 5
    - padding_duration: 1
- `interview`:
    - fragment_duration: 15
    - padding_duration: 1
- `game`:
    - fragment_duration: 30
    - padding_duration: 1

Also, custom videos can be used by providing an url, example of using a custom video (Note: it is highly recommended that the width and height of the videos are a multiple of 16 if using the QoE Analysis features):

```json
{
	...,
	"browserVideo": {
		"videoType": "custom",
    "customVideo": {
			"audioUrl": "https://fakeurl.com/fakeaudio.wav",
			"video":
				{
					"url": "https://fakeurl.com/fakevideo480.y4m",
					"width": 640,
					"height": 480,
					"fps": 30
				}
		}
	}
}
```

### CREATE PARTICIPANT

This endpoint provides a lot of configuration that you should take into account. As said before, you can make a request to **create a new Stream Manger using your own token** or make a request **letting the browser-emulator create a new one**.

### CREATE PARTICIPANT _(using your custom token)_

_Create a new participant with a specified **token**_

- #### METHOD: **POST**
- #### URL: https://localhost:5000/openvidu-browser/streamManager
- #### BODY

    ```json
    {
    	"browserMode": "EMULATE",
    	"properties": {
    		"token": "*****",
    		"userId": "User1",
    		"role": "PUBLISHER",
    		"audio": true,
    		"video": true
    	}
    }
    ```

- #### RESPONSE

    ```json
    {
    	"connectionId": "con_FmtswrvbkT",
    	"workerCpuUsage": 10.0
    }
    ```

### **CREATE PARTICIPANT** _(Creating a token)_

_Create a new participant with a specified **role** and connect it into a specified **sessionName**_

- #### METHOD: **POST**
- #### URL: https://localhost:5000/openvidu-browser/streamManager
- #### BODY

    ```json
    {
    	"openviduUrl": "https://localhost:4443",
    	"openviduSecret": "MY_SECRET",
    	"browserMode": "EMULATE",
    	"properties": {
    		"userId": "User1",
    		"sessionName": "LoadTestSession",
    		"role": "PUBLISHER",
    		"audio": true,
    		"video": true
    	}
    }
    ```

- #### RESPONSE

```json
{
	"connectionId": "con_FmtswrvbkT",
	"workerCpuUsage": 10.0
}
```

Moreover, you can customize the request with many of the parameters that we can found in OpenVidu Browser library.

### Create Stream Manager: Body Parameters

To make the load test completely functional, the browser-emulator service also accept others extra body parameters.

```json
{
	"openviduUrl": "your OpenVidu hostname",
 	"openviduSecret": "your OpenVidu Secret",
    "browserMode": "'EMULATE' or 'REAL'",
	"properties": Properties JSON object << See properties list >>
}
```

##### Body parameters

| Properties         | Type        | Description                                                                                                                                                                                                              |
| ------------------ | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **openviduUrl**    | String      | OpenVidu URL.                                                                                                                                                                                                            |
| **openviduSecret** | String      | OpenVidu secret.                                                                                                                                                                                                         |
| **browserMode**    | String      | If `EMULATE` the service will emulate a browser. If `REAL`, the service will launch a Chrome browser docker container. Default `EMULATE` Choosing `EMULATE`, **you must ensure that OpenVidu aren't forcing H264 coded** |
| **properties**     | JSON Object | [See properties object](#properties-json-object)                                                                                                                                                                         |

##### Properties JSON object

| Properties              | Type          | Description                                                                                                                                                                                                                                           |
| ----------------------- | ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **userId** \*           | String        | Participant name                                                                                                                                                                                                                                      |
| **sessionName** \*      | String        | Session name                                                                                                                                                                                                                                          |
| **audio** \*            | Boolean       | If `role` is `PUBLISHER` and you want to initially publish to the session with the audio unmuted or muted [See publisher property](https://docs.openvidu.io/en/2.16.0/api/openvidu-browser/interfaces/publisherproperties.html#publishAudio)          |
| **video** \*            | Boolean       | If `role` is `PUBLISHER` and you want to initially publish to the session with the video enabled or disabled. [See publisher property](https://docs.openvidu.io/en/2.16.0/api/openvidu-browser/interfaces/publisherproperties.html#publishVideo)      |
| **token**               | String        | Your custom token. If it is empty the service will create one.                                                                                                                                                                                        |
| **role**                | String        | Stream Manager role:`PUBLISHER` or `SUBSCRIBER`. Default `PUBLISHER`                                                                                                                                                                                  |
| **resolution**          | String        | Resolution of the video. Default `640x480`. [See publisher property](https://docs.openvidu.io/en/2.16.0/api/openvidu-browser/interfaces/publisherproperties.html#resolution)                                                                          |
| **recordingOutputMode** | String        | `COMPOSED` or `INDIVIDUAL`                                                                                                                                                                                                                            |
| **frameRate**           | Number (0-30) | Desired framerate of the video in frames per second. Default `30`                                                                                                                                                                                     |
| **recording**           | Boolean       | If `browserMode` is `REAL` and you want record the Chrome browser using ffmpeg. Otherwise, If `browserMode` is `EMULATE` and you have started browser.emulator with `KMS` user type (see [worker running options](#running-options)) Default `false`. |
| **showVideoElements**   | Boolean       | If `browserMode` is `REAL` and you want show videos elements into the app running in Chrome. Default `true`                                                                                                                                           |
| **headless**            | Boolean       | If `browserMode` is `REAL` and you want launch a headless Chrome. Default `false`. [See Headless Chromium](https://chromium.googlesource.com/chromium/src/+/lkgr/headless/README.md)                                                                  |

### **DISCONNECT ALL PARTICIPANTS**

_Disconnect all participants_

- #### METHOD: **DELETE**
- #### URL: https://localhost:5000/openvidu-browser/streamManager

### **DELETE PARTICIPANT** _(by connectionId)_

_Delete a single participant by its connectionId_

- #### METHOD: **DELETE**
- #### URL: https://localhost:5000/openvidu-browser/streamManager/connection/}

### **DELETE PARTICIPANTS** _(by ROLE: `PUBLISHER` or `SUBSCRIBER`)_

_Delete all participants with the specified ROLE_

- #### METHOD: **DELETE**
- #### URL: https://localhost:5000/openvidu-browser/streamManager/role/}

### **DELETE PARTICIPANTS**

_Delete all participants_

- #### METHOD: **DELETE**
- #### URL: https://localhost:5000/openvidu-browser/streamManager

### **START QOE ANALYSIS**

Start QoE Analysis if qoeAnalysis has been set to _true_ when instance was initialized. Use after deleting all participants. Results will be uploaded to ELK when finished.

- #### METHOD: **POST**
- #### URL: https://localhost:5000/qoe/analysis
