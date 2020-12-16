# OpenVidu Load Test

## **Browser emulator**

App based on NodeJS with the aim of emulating a standard browser using [OpenVidu Browser library](https://github.com/OpenVidu/openvidu#readme) and overriding WebRTC API with [node-webrtc library](https://github.com/node-webrtc/node-webrtc).

This app provides a simple REST API that allows:
* Create a [Stream Manager](https://docs.openvidu.io/en/2.16.0/api/openvidu-browser/classes/streammanager.html) (`PUBLISHER` or `SUBSCRIBER`)
* Delete a Stream Manager by its connectionId
* Delete all Stream Manager with a specific role (`PUBLISHER` or `SUBSCRIBER`).


### API REST


#### CREATE STREAM MANAGER

_Create a new Stream Manager with a specified **role** and connect it into a specified **sessionName**_

* #### METHOD: **POST**

* #### URL:  http://localhost:5000/openvidu-browser/streamManager

* #### BODY
	```
	{
		"userId": "User1",
		"sessionName": "LoadTestSession",
		"role": "PUBLISHER"
	}
	```

* #### RESPONSE
	```
	{
		"connectionId": "con_FmtswrvbkT"
	}
	```

#### DELETE STREAM MANAGER (by connectionId)

_Delete a single Stream Manager by its connectionId_

* #### METHOD: **DELETE**

* #### URL:  http://localhost:5000/openvidu-browser/streamManager/connection/{{CONNECTION_ID}}


#### DELETE STREAM MANAGER's (by ROLE: `PUBLISHER` or `SUBSCRIBER`)

_Delete all Stream Manager with the specified ROLE_

* #### METHOD: **DELETE**

* #### URL:  http://localhost:8080/openvidu-browser/streamManager/role/{{ROLE}}


