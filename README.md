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

* [**Browser-emulator**](#browser-emulator): Worker service implemented in NodeJS and controlled with a REST protocol that **is able to start and launch real containerized Chrome browsers** using Docker and Selenium and **emulate browsers** capable of connecting to an OpenVidu session and sending and receiving WebRTC media using openvidu-browser library.

	There are two ways to emulate a browser:
	+ [node-webrtc library](https://github.com/node-webrtc/node-webrtc).
	+ [Kurento](https://www.kurento.org/)

* [**Loadtest Controller**](#loadtest-controller): Controller service in charge of the coordination of the browser-emulator workers. It read the load test scenario from a file and control the browser-emulator workers to connect participants loading OpenVidu platform.

## **Usage Instructions**

These instructions assume that OpenVidu CE or PRO is already deployed. See [how deploy OpenVidu PRO](https://docs.openvidu.io/en/stable/openvidu-pro/#how).

### 1. Launch workers

<details>
  <summary><strong>For testing locally</strong></summary>

<br>
To start with the load test you will have to start a worker first and the execute the controller.

>This instructions assume you are using a **linux system**. Windows and Mac can require some adaptation.


In the machines where you want to execute the workers you need to have **NodeJS** and **Docker** platform installed.

Then follow these steps:

**1. Clone this repository**

```bash
git clone https://github.com/OpenVidu/openvidu-loadtest.git
```

**2. Start browser-emulator (worker)**

```bash
cd openvidu-loadtest/browser-emulator/
# Assuming that you're in a clean environment, the script will install:
# - NodeJS
# - Docker
# - Ffmpeg
# - Download te required media files for executing the containerized Chrome Browsers
sudo su
./prepare.sh
npm install
npm run start
```

**3. Configure the [required loadtest-controller parameters](#Required-parameters) and the [worker ip address](#Development-mode-parameters-for-testing-locally).

##### Running options
By default, this worker is listening on port `5000` that you have to specify later in the controller configuration. If you want to run it on another port just add `SERVER_PORT=port_number` before `npm run start` command:

```bash
SERVER_PORT=6000 npm run start
```

Moreover, the worker will assign `NODE_WEBRTC` for [emulated user types](browser-emulator/src/types/config.type.ts). You can set `KMS` type adding `EMULATED_USER_TYPE=KMS` or run the following script:

```bash
npm run start:kms
```

</details>

<details>
  <summary><strong>For testing on AWS</strong></summary>

  If we want launch our load tests in a prodction environment, we can do that on AWS.

  The browser-emulator services will be launched (**_by the loadtest-controller_**) in EC2 instances with the aim of emulate real users connected to OpenVidu.

  The *loadtest-controller* will use the BrowserEmulator AMI (previously created) for create instances on demand. All you have to do is fill the [AWS configuration](#AWS-parameters-for-testing-on-AWS) in loadtest-controller properties besides the [required parameters](#Required-parameters)


</details>


### 2. Execute controller

In the machine you want to execute the controller you need to have **Java 11** platform installed.

Then follow these steps:

#### 1. Clone this repository

```bash
git clone https://github.com/OpenVidu/openvidu-loadtest.git
```

#### 2. Configure Loadtest Controller

Running the following command **under project root directory** you will be able to edit the [`load-test/src/main/resources/application.properties`](loadtest-controller/src/main/resources/application.properties) which contains a list of configuration parameters that you will can customize.

```bash
nano loadtest-controller/src/main/resources/application.properties
```

In this file you will see:

#### Required parameters

```properties
# Load Test Parameters (Required)
OPENVIDU_URL=https://openvidu_pro_url
OPENVIDU_SECRET=openvidu_pro_secret
SESSION_NAME_PREFIX=LoadTestSession
USER_NAME_PREFIX =User
SECONDS_TO_WAIT_BETWEEN_PARTICIPANTS=1
SECONDS_TO_WAIT_BETWEEN_SESSIONS=2
SECONDS_TO_WAIT_BEFORE_TEST_FINISHED=10
SECONDS_TO_WAIT_BETWEEN_TEST_CASES=10
```
#### Development mode parameters (for testing locally)

```properties
# For testing locally, fill it with the worker ip address: 195.166.0.0
WORKER_URL_LIST=
```

#### AWS parameters (for testing on AWS)

```properties
# For testing on AWS
WORKER_AMI_ID=
# We recommend c5 type. https://aws.amazon.com/ec2/instance-types/
WORKER_INSTANCE_TYPE=
# By default, the browser-emulator service is listening on:
# 5000 (API REST)
# 5001 (WebSocket)
# The SG will need this ports opened.
WORKER_SECURITY_GROUP_ID=
WORKER_INSTANCE_REGION=
# Numbers of workers to launch before the test starts
WORKERS_NUMBER_AT_THE_BEGINNING=
# Overcoming this threshold a new worker will be launched
WORKER_MAX_LOAD=
# Number of new workers incrementation
WORKERS_RUMP_UP=
```

#### Monitoring parameters

```properties
# Monitoring Parameters (Optional)
ELASTICSEARCH_USERNAME=elasticusername
ELASTICSEARCH_PASSWORD=password
KIBANA_HOST=https://kibanahost
```

#### 3. Configure session typology

Controller is being developed to allow the configuration of the load test cases: number of participants, typology, number of sessions, etc.

Currently, the only available option is the change of the number of participants of the session.

To configure the test cases the file [`loadtest-controller/src/main/resources/test_cases.json`](loadtest-controller/src/main/resources/test_cases.json) has to be edited:

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
		},
		{
			"typology": "TERMINATE",
			"desciption": "This terminate all EC2 instances launched for loadtest purposes"
		}
	]
}
```

### 3. Run load test

When you execute the load test the controller will create sessions and will connect participants into them automatically.

The load test will stop when any of the browser-emulators return something different from a `200` status response. Take into account that errors can be produced by OpenVidu errors or if the worker itself is overloaded. Please control CPU usage in workers.

When an error in a worker is produced, the load test will stop and will order to destroy and close every participants and sessions to the workers.

For start with it, run the following command:

```bash
cd loadtest-controller
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

The loadtest-controller will create a report result on the root directory `/openvidu-loadtest/loadtest-controller` with the name **result.txt**.

If you're testing **OpenVidu PRO**, the Load Test App **will import a Kibana Dashboard automatically** at the beginning of the test. This dashboard will include Kibana Visualizations with all metrics retrieved from OpenVidu.

![Load Test Dashboard](resources/kibana.png)

To allow that the Load Test App import it, **you must fill** the [monitoring parameters](#Monitoring-parameters).

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


See [browser-emulator docummentation](browser-emulator/README.md) for more info.
