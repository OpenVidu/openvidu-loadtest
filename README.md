# OpenVidu Load Test

> WARNING: The current tool is under development which means that bugs could be present in the code and you can expect some changes in usage.

This repository contains a distributed tool that allows you to perform a load test against an OpenVidu CE or an OpenVidu PRO deployment.

Take into account that you must to deploy OpenVidu platform before using this tool.

<br>

# **Table of Contents**
1. [Project Architecture](#project-architecture)
2. [Usage instructions](#usage-instructions)
3. [Sample test execution](#sample-test-execution)
4. [Analyze test results](#analyze-test-results)
5. [Browser Emulator documentation](#browser-emulator-documentation)

<hr>

## **Project Architecture**

![Load test architecture](resources/diagram.png)

* [**Browser-emulator**](#browser-emulator): Worker service that **is able to start and launch real containerized Chrome browsers** using Docker and Selenium and **emulate browsers** capable of connecting to an OpenVidu session and sending and receiving WebRTC media provided by [node-webrtc library](https://github.com/node-webrtc/node-webrtc) using openvidu-browser library. It is implemented in NodeJS and controlled with a REST protocol.
* [**Load Test**](#load-test): Controller service in charge of the coordination of the browser-emulator workers. It read the load test scenario from a file and control the browser-emulator workers to connect participants loading OpenVidu platform.

## **Usage Instructions**

These instructions assume that OpenVidu CE or PRO is already deployed. See [how deploy OpenVidu PRO](https://docs.openvidu.io/en/stable/openvidu-pro/#how).


To start with the load test you will have to deploy the workers first and the execute the controller.

>This instructions assume you are using a linux system. Windows and Mac can require some adaptation.

### 1. Deploy workers

In the machines were you want to execute the workers you need to have NodeJS platform installed.

Then follow these steps:

**1. Clone this repository**

```bash
git clone https://github.com/OpenVidu/openvidu-loadtest.git
```

**2. Start browser-emulator (worker)**

```bash
cd openvidu-loadtest/browser-emulator/
# Assuming that you're in a clean environment, the script will install Node, Docker and it will download te required media files for executing the containerized Chrome Browsers
./prepare.sh
npm install
npm run start
```

By default, this worker is listening on port `5000` that you have to specify later in the controller configuration. If you want to run it on another port just add `SERVER_PORT=port_number` before `npm run start` command:

```bash
SERVER_PORT=6000 npm run start
```

Moreover, the worker will assign `NODE_WEBRTC` for emulated users. You can set `KMS` type adding `EMULATED_USER_TYPE=KMS`

```bash
EMULATED_USER_TYPE=KMS npm run start
```
See [emulated user types](browser-emulator/src/types/config.type.ts).

### 2. Execute controller

In the machine you want to execute the controller you need to have Java 11 platform installed.

Then follow these steps:

**1. Clone this repository**

```bash
git clone https://github.com/OpenVidu/openvidu-loadtest.git
```

**2. Configure OpenVidu platform and workers**

Fill `OPENVIDU_URL`, `OPENVIDU_SECRET` and  `WORKER_URL_LIST` parameters in load-test [`load-test/src/main/resources/application.properties`](load-test/src/main/resources/application.properties):

Run this command **under project root directory**:

```bash
nano load-test/src/main/resources/application.properties
```
After these three parameters are being filled, save changes and go to the next step.

```properties
# Load Test Parameters (Required)
OPENVIDU_URL=https://openvidu_pro_url
OPENVIDU_SECRET=openvidu_pro_secret
WORKER_URL_LIST=https://worker_host1:port,https://worker_host2:port
SESSION_NAME_PREFIX =LoadTestSession
USER_NAME_PREFIX =User
SECONDS_TO_WAIT_BETWEEN_PARTICIPANTS=1
SECONDS_TO_WAIT_BETWEEN_SESSIONS=2
SECONDS_TO_WAIT_BEFORE_TEST_FINISHED=10
SECONDS_TO_WAIT_BETWEEN_TEST_CASES=10


# Monitoring Parameters (Optional)
ELASTICSEARCH_USERNAME=elasticusername
ELASTICSEARCH_PASSWORD=password
KIBANA_HOST=https://kibanahost
```

**3. Configure session typology:**

Controller is being developed to allow the configuration of the load test cases: number of participants, typology, number of sessions, etc.

Currently, the only available option is the change of the number of participants of the session.

To configure the test cases the file [`load-test/src/main/resources/test_cases.json`](load-test/src/main/resources/test_cases.json) has to be edited:

```json
{
	"testcases": [
		{
			"typology": "N:N", // All users will be PUBLISHERS and SUBSCRIBERS
			"participants": [2], // Sessions with 2 users
			"sessions": "infinite", // Session limit. Test will create infinite sessions
			"desciption": "This test case will add infinite sessions (until it reaches its limit) of publishers that the array of participants indicates"
		},
		{
			"typology": "N:M", // N number will be PUBLISHERS and M number will be SUBSCRIBERS
			"participants": ["1:10", "1:100", "2:10", "2:30", "2:50", "3:10", "3:30", "3:50"],
			"sessions": "infinite",
			"desciption": "This test case will add infinite sessions (until it reaches its limit) with as many PUBLISHERS and SUBSCRIBERS as the participants array indicates."
		},
		{
			"typology": "TEACHING",
			"participants": ["2:10", "2:30", "2:50", "3:10", "3:30", "3:50"],
			"sessions": "infinite",
			"desciption": "This test case will add infinite sessions (until it reaches its limit) with as many PUBLISHERS (teachers:students) as the participants array indicates. The students (FAKE SUBSCRIBERS, they will be PUBLIHSERS with only audio) will only publish audio"
		}
	]
}
```

**3. Run load test:**

When you execute the load test the controller will create sessions and will connect participants into them automatically.

The load test will stop when any of the browser-emulators return something different from a `200` status response. Take into account that errors can be produced by OpenVidu errors or if the worker itself is overloaded. Please control CPU usage in workers.

When an error in a worker is produced, the load test will stop and will order to destroy and close every participants and sessions to the workers.

For start with it, run the following command:

```bash
cd load-test
mvn spring-boot:run
```

## **Sample test execution**

For illustration proporses here is an example composed by 2 workers and the load test app all of them running locally.

As you can see in the load test and workers logs, the load test app will create sessions and will add participants into them following a [**round-robin scheduling**](https://en.wikipedia.org/wiki/Round-robin_scheduling).

**Load test logs**
![Load Test Controller Logs](resources/load-test.png)

Which it means that, for this sample with sessions of 2 participans, each participant will be create by one different worker. The `User0` will be create by the worker 1 and the `User1` will be created by the worker2.

Thus achieving more capacity in the load test and less resource consumption.

**Worker 1 logs**

![Worker 1 Logs](resources/worker1.png)

**Worker 2 logs**

![Worker 2 Logs](resources/worker2.png)

## **Analyze test results**

If you're testing **OpenVidu PRO**, the Load Test App **will import a Kibana Dashboard automatically** at the beginning of the test. This dashboard will include Kibana Visualizations with all metrics retrieved from OpenVidu.

![Load Test Dashboard](resources/kibana.png)

To allow that the Load Test App import it, **you must fill the ElasticSearch and Kibana parameters** declared in the [application.properties](load-test/src/main/resources/application.properties#L15-L17) file.

**What happen if the dashboard have not been imported automatically?**

An alternative if the dashboard is not imported automatically is **import it manually**. You just to follow these steps:

1. Go to your Kibana Home
2. Open the toggle menu and go to `Management > Stack Management`.
3. Once inside of Stack Management, you must click on `Saved Objects` option, under Kibana section.
4. Here, you can find an import button. You have to clik on it and import the [loadtest.ndjson](load-test/src/main/resources/loadtest.ndjson) file.


Besides, if you have deployed OpenVidu PRO you can [create your own visualizations in Kibana](https://docs.openvidu.io/en/2.16.0/openvidu-pro/monitoring-elastic-stack/#creating-your-own-visualizations-and-dashboards) or you can export the raw data and use another tool. Remember that ELK stack has monitoring information about the platform (CPU, memory usage, bandwidth, etc) and also high level information (sessions, participants, etc.)

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
|  **recording** | Boolean  |  If `browserMode` is `REAL` and you want record the Chrome browser using ffmpeg. Default `false`.  |
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

