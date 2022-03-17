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
	"qoeAnalysis": true

}
```

* #### RESPONSE
```json
Instance has been initialized
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

Start QoE Analysis if qoeAnalysis has been set to _true_ when instance was initialized. Use after deleting all participants.

* #### METHOD: **POST**

* #### URL:  https://localhost:5000/qoe/analysis* #### RESPONSE
```json
{
	"remainingFiles": 20,
	"finished": 0,
	"remux": 0,
	"cut": 0,
	"extractAudio": 0,
	"alignOcr": 0,
	"analyze": 0,
	"cleanup": 0
}
```

QoE analysis results will be uploaded to the S3 bucket.

### **QOE ANALYSIS STATUS**

Check current status of the QoE Analysis.

* #### METHOD: **GET**

* #### URL:  https://localhost:5000/qoe/analysis

* #### RESPONSE
```json
{
	"remainingFiles": 18,
	"finished": 1,
	"remux": 3,
	"cut": 13,
	"extractAudio": 0,
	"alignOcr": 1,
	"analyze": 0,
	"cleanup": 1
}
```