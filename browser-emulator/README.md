## **Browser Emulator documentation**

Service with the aim of emulating a standard browser using [OpenVidu Browser library](https://github.com/OpenVidu/openvidu#readme) and overriding WebRTC API with [node-webrtc library](https://github.com/node-webrtc/node-webrtc). This service is also **capable to launch Chrome containerized browsers** and connect them to Openvidu emulating a fully real user.

This app provides a simple REST API that will be used by **Load Test application** and it allows:
* [Create a Stream Manager](#create-stream-manager) (`PUBLISHER` or `SUBSCRIBER`) **using a custom token** created by you or **creating a new token**.

* [Delete a specific Stream Manager](#delete-stream-manager-by-connectionId) by its connectionId
* [Delete all Stream Manager](#delete-stream-managers-by-role-publisher-or-subscriber) with a specific role (`PUBLISHER` or `SUBSCRIBER`).

### API REST

#### CREATE STREAM MANAGER

This endpoint provides a lot of configuration that you should take into account. As said before, you can make a request to **create a new Stream Manger using your own token** or make a request **letting the browser-emulator create a new one**.


#### CREATE STREAM MANAGER _(using your custom token)_

_Create a new Stream Manager with a specified **token**_

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

#### **CREATE STREAM MANAGER** _(Creating a token)_

_Create a new Stream Manager with a specified **role** and connect it into a specified **sessionName**_

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


#### Create Stream Manager: Body Parameters

To make the load test completely functional, the browser-emulator service also accept others extra body parameters.

//TODO upadate

```json
{
	"openviduUrl": "your OpenVidu hostname",
 	"openviduSecret": "your OpenVidu Secret",
    "elasticSearchHost": "your ElasticSearch hostname",
    "elasticSearchUserName": "your ElasticSearch usename",
    "elasticSearchPassword": "your ElasticSearch password",
    "browserMode": "'EMULATE' or 'REAL'",
	"properties": Properties JSON object << See properties list >>
}
```

##### Body parameters

|Properties|Type|Description|
|---|---|---|
|  **openviduUrl** |  String |OpenVidu URL.  |
|  **openviduSecret** |  String | OpenVidu secret.|
|  **elasticSearchHost** |  String | ElasticSearch hostname.|
|  **elasticSearchUserName** | String  | ElasticSearch username.  |
|  **elasticSearchPassword** | String  | ElasticSearch password.  |
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


#### **DELETE STREAM MANAGER** _(by connectionId)_

_Delete a single Stream Manager by its connectionId_

* #### METHOD: **DELETE**

* #### URL:  https://localhost:5000/openvidu-browser/streamManager/connection/{{CONNECTION_ID}}


#### **DELETE STREAM MANAGER's** _(by ROLE: `PUBLISHER` or `SUBSCRIBER`)_

_Delete all Stream Manager with the specified ROLE_

* #### METHOD: **DELETE**

* #### URL:  https://localhost:5000/openvidu-browser/streamManager/role/{{ROLE}}

