## **Browser Emulator documentation**

 Worker service implemented in NodeJS and controlled with a REST protocol that capable of connecting to an OpenVidu session and sending and receiving WebRTC media using openvidu-browser library.
The browser-emulator service provides several connection modes:

+ **Traditional mode**: It is able to start and launch **containerized Chrome browsers** using Docker and Selenium emulating a fully real user.

+ **Emulated mode**: It is capable to emulate a user connection without use a browser:
	+ Overriding a WebRTC API using [node-webrtc library](https://github.com/node-webrtc/node-webrtc) and getting the media from a canvas publishing a moving image.
	+ ~~Overriding a WebRTC API using [node-webrtc library](https://github.com/node-webrtc/node-webrtc) and getting the media from a **video file** using ffmpeg.~~
	+ Overriding the peerConnection objects using [Kurento](https://www.kurento.org/) and getting the media from a video file.

This app provides a simple **REST API** that will be used by **Load Test application** and it allows:
* [Ping to instance](#ping-instance). Do ping to check if instance is ready.
* [Initialize instance](#initialize-instance). Initialize monitoring stuffs like ElasticSearch env variables and Metricbeat container. This request also set the AWS public and secret keys for uploading the **video recordings files to S3** (just in case the test case includes recording).

* [Create a participant](#create-participant) (`PUBLISHER` or `SUBSCRIBER`) **using a custom token** created by you or **creating a new token**.

* [Delete a specific participant](#delete-participant-by-connectionId) by its connectionId
* [Delete all participant](#delete-participants-by-role-publisher-or-subscriber) with a specific role (`PUBLISHER` or `SUBSCRIBER`).

* [Delete all participant](#delete-participants).

This services also is listening for a **WebSocket communication** on `ws:browser-emulator-addres:5001/events`. It will send information from openvidu-browser to the loadtest-controller.

## Running QoE Analysis

BrowserEmulator can run analysis on the Quality of Experience on your video and audio. For this, the following requisites have to be met:
- The `browserMode` when adding a participant has to be `REAL` (at the moment this option doesn't work with `EMULATED` users).
- AWS public and secret keys have to be set so the recorded video fragments can be uploaded to S3.
- The original video and audio (separate files expected) need to be cut and concrete paddings added to them. This can be done with the *generate-mediafiles-qoe.sh* script. The mandatory options are:
	- -d: Duration of the cut video, the video will be cut from the beginning to the second passed in this argument.
	- -p: Duration of the padding to be added (in seconds)
	- -v: Video location URL, the script will try to download the video from this URL using wget.
	- -a: Audio location URL, the script will try to download the audio from this URL using wget.
	- -w: Video width.
	- -h: Video height.
	- -f: Video framerate.  
	The video and audio have to be saved in `src/assets/mediafiles` in y4m and wav fromat respectively so browser-emulator can see them.
		- The video file has to have the following name: `fakevideo_[framerate]fps_[width]x[height].y4m`, for example: `fakevideo_30fps_640x480.y4m`.
		- The audio file has to have the following name: `fakeaudio.wav`.  
	Alternatively you can use our already preprocessed videos that can be downloaded using the *download_mediafiles.sh* script. These have 1 secvond of padding and 5 seconds of cut video.

For the purpose of running the QoE Analysis, for each user pair 2 videos will be recorded during the run, one recording what the first user is receiving from the second and viceversa. These videos will be uploaded to S3 when [Delete all participant](#delete-participants) is run. These recordings will be called individual recordings.

When running [Initialize instance](#initialize-instance), you can add the property `"qoeAnalysis"` to the body, an object with the following options:
	- enabled: defaults `false`, setting this to true will enable the individual recordings.
	- fragment_duration: The duration of the cut video without the paddings chosen when running *generate-mediafiles-qoe.sh*
	- padding_duration: The duration of the padding chosen when running *generate-mediafiles-qoe.sh*

When [Delete all participant](#delete-participants) is run, all individual recorded videos will be uploaded to S3 with the following name structure: `QOE_[Session]_[UserFrom]_[UserTo].webm`, from here you have 2 options.

- Running the analysis in the same worker machine that recorded the videos, for that send a request to [Start QoE Analysis](#start-qoe-analysis) 
- Running the analysis on another machine, for that pull this repository in that machine, cd to browser-emulator and follow the next steps:
	- Install all the needed dependencies on the machine, which are:
		- Python3 and pip3
		- [VMAF](https://github.com/Netflix/vmaf), set a VMAF_PATH environment variable with the path to the vmaf binary and move the `vmaf_v0.6.1.json` file found in the model directory to `/usr/local/share/vmaf/models/vmaf_v0.6.1.json`
		- [VQMT](https://github.com/Rolinh/VQMT), set a VQMT_PATH environment variable with the path to the vqmt binary
		- [PESQ](https://github.com/dennisguse/ITU-T_pesq), set a PESQ_PATH environment variable with the path to the pesq binary
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
	- Save the individual recordings you want to analyze in `./recordings/qoe` directory.
	- Create a `qoe-results-processing-config.json` file (there is an example file with the same name in this repo), with the following structure:
		- elasticsearch_hostname: ELK hostname
    	- elasticsearch_username: ELK username
    	- elasticsearch_password: ELK password
		- index: ELK index to save the data
		- fragment_duration: The duration of the cut video without the paddings chosen when running *generate-mediafiles-qoe.sh*
		- padding_duration: The duration of the padding chosen when running *generate-mediafiles-qoe.sh*
		- width: Video width
		- height: Video height
		- framerate: Video framerate
		- presenter_video_file_location: Location of the original video, usually located in `src/assets/mediafiles/fakevideo_[framerate]fps_[width]x[height].y4m`
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
	- If you have the results of running the qoe scripts but have not uploaded them to ELK (*_cuts.json files) you can upload them by running:
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

### PING INSTANCE

* #### METHOD: **GET**
* #### URL:  https://localhost:5000/instance/ping



### INITIALIZE INSTANCE

* #### METHOD: **POST**
* #### URL:  https://localhost:5000/instance/initialize
* #### BODY
```json
{
	"elasticSearchHost": "your-elasticsearch-hostname",
	"elasticSearchUserName": "your-username",
	"elasticSearchPassword": "your-password",
	"elasticSearchIndex": "your-optional-index",
	"awsAccessKey": "your-AWS-access-key",
	"awsSecretAccessKey": "your-AWS-secret-key",
	"browserVideo": {
		"videoType": "bunny",
		"videoInfo": [
			{
				"width": 640,
				"height": 480,
				"fps": 30
			}, 
			{
				"width": 1920,
				"height": 1080,
				"fps": 60
			}
		]
	},
	"qoeAnalysis": {
		"enabled": true,
		"fragment_duration": 5,
		"padding_duration": 1
	}

}
```

* #### RESPONSE
```json
Instance has been initialized
```

`browserVideo` is only needed if using `browserMode REAL`. This object indicates what videos to use, which will be downloaded. There are 3 types of videos by default, having to be selected in the `videoType` property inside `browserVideo`. If using a default video type, the resolution and fps of the videos to use have to be selected in the `videoInfo` array property. All default videos have padding for possible usage in QoE Analysis. The default video types and available resolutions and framerates are the following:
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
		"videoType": {
			"audioUrl": "https://fakeurl.com/fakeaudio.wav",
			"videos": [
				{
					"url": "https://fakeurl.com/fakevideo480.y4m",
					"width": 640,
					"height": 480,
					"fps": 30
				},
				{
					"url": "https://fakeurl.com/fakevideo1080.y4m",
					"width": 1920,
					"height": 1080,
					"fps": 60
				}
			]
		}
	}
}
```

### CREATE PARTICIPANT

This endpoint provides a lot of configuration that you should take into account. As said before, you can make a request to **create a new Stream Manger using your own token** or make a request **letting the browser-emulator create a new one**.


### CREATE PARTICIPANT _(using your custom token)_

_Create a new participant with a specified **token**_

* #### METHOD: **POST**

* #### URL:  https://localhost:5000/openvidu-browser/streamManager

* #### BODY
	```json
	{
		"browserMode": "EMULATE",
		"properties": {
			"token": "*****",
			"userId": "User1",
			"role": "PUBLISHER",
			"audio": true,
			"video": true,
		}
	}
	```

* #### RESPONSE
	```json
	{
		"connectionId": "con_FmtswrvbkT",
		"workerCpuUsage": 10.00
	}
	```

### **CREATE PARTICIPANT** _(Creating a token)_

_Create a new participant with a specified **role** and connect it into a specified **sessionName**_

* #### METHOD: **POST**

* #### URL:  https://localhost:5000/openvidu-browser/streamManager

* #### BODY
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
			"video": true,
		}
	}
	```

* #### RESPONSE
```json
{
	"connectionId": "con_FmtswrvbkT",
	"workerCpuUsage": 10.00
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

|Properties|Type|Description|
|---|---|---|
|  **openviduUrl** |  String |OpenVidu URL.  |
|  **openviduSecret** |  String | OpenVidu secret.|
|  **browserMode** | String  | If `EMULATE` the service will emulate a browser. If  `REAL`, the service will launch a Chrome browser docker container. Default `EMULATE` Choosing `EMULATE`, **you must ensure that OpenVidu aren't forcing H264 coded**|
|  **properties** | JSON Object   | [See properties object](#properties-json-object) |



##### Properties JSON object

|Properties|Type|Description|
|---|---|---|
|  **userId** * |  String | Participant name   |
|  **sessionName** * |  String | Session name  |
|  **audio** * | Boolean  | If `role` is `PUBLISHER` and you want to initially publish to the session with the audio unmuted or muted [See publisher property](https://docs.openvidu.io/en/2.16.0/api/openvidu-browser/interfaces/publisherproperties.html#publishAudio)  |
|  **video** * | Boolean  | If `role` is `PUBLISHER` and you want to initially publish to the session with the video enabled or disabled. [See publisher property](https://docs.openvidu.io/en/2.16.0/api/openvidu-browser/interfaces/publisherproperties.html#publishVideo)  |
|  **token** |  String | Your custom token. If it is empty the service will create one.|
|  **role** | String  | Stream Manager role: `PUBLISHER` or `SUBSCRIBER`. Default `PUBLISHER` |
|  **resolution** | String   |Resolution of the video. Default `640x480`. [See publisher property](https://docs.openvidu.io/en/2.16.0/api/openvidu-browser/interfaces/publisherproperties.html#resolution) |
|  **recordingOutputMode** | String   | `COMPOSED` or `INDIVIDUAL`|
|**frameRate**| Number (0-30)  | Desired framerate of the video in frames per second. Default `30`|
|  **recording** | Boolean  |  If `browserMode` is `REAL` and you want record the Chrome browser using ffmpeg. Otherwise, If `browserMode` is `EMULATE` and you have started browser.emulator with `KMS` user type (see [worker running options](#running-options)) Default `false`.  |
|  **showVideoElements** | Boolean  | If `browserMode` is `REAL` and you want show videos elements into the app running in Chrome. Default `true`|
|  **headless** | Boolean  | If `browserMode` is `REAL` and you want launch a headless Chrome. Default `false`.  [See Headless Chromium](https://chromium.googlesource.com/chromium/src/+/lkgr/headless/README.md)  |


### **DISCONNECT ALL PARTICIPANTS**

_Disconnect all participants_

* #### METHOD: **DELETE**

* #### URL:  https://localhost:5000/openvidu-browser/streamManager


### **DELETE PARTICIPANT** _(by connectionId)_

_Delete a single participant by its connectionId_

* #### METHOD: **DELETE**

* #### URL:  https://localhost:5000/openvidu-browser/streamManager/connection/{{CONNECTION_ID}}


### **DELETE PARTICIPANTS** _(by ROLE: `PUBLISHER` or `SUBSCRIBER`)_

_Delete all participants with the specified ROLE_

* #### METHOD: **DELETE**

* #### URL:  https://localhost:5000/openvidu-browser/streamManager/role/{{ROLE}}

### **DELETE PARTICIPANTS**

_Delete all participants_

* #### METHOD: **DELETE**

* #### URL:  https://localhost:5000/openvidu-browser/streamManager

### **START QOE ANALYSIS**

Start QoE Analysis if qoeAnalysis has been set to _true_ when instance was initialized. Use after deleting all participants. Results will be uploaded to ELK when finished.

* #### METHOD: **POST**

* #### URL:  https://localhost:5000/qoe/analysis
