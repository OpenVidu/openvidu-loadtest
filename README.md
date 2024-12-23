# OpenVidu Load Test

This repository contains a distributed tool that allows you to perform a load test against an OpenVidu 3 or OpenVidu 2 deployment.

Take into account that you must to deploy OpenVidu platform before using this tool.

<br>

# **Table of Contents**
1. [Project Architecture](#project-architecture)
2. [Usage instructions](#usage-instructions)

<hr>

## **Project Architecture**

![Load test architecture](resources/diagram.png)

* [**Loadtest Controller**](#loadtest-controller): Controller service in charge of the coordination of the browser-emulator workers. It reads the load test scenario from a file and control the browser-emulator workers to connect participants loading OpenVidu platform.

* [**Browser-emulator**](#browser-emulator): Worker service implemented in NodeJS and controlled with a REST protocol that capable of connecting to an OpenVidu session and sending and receiving WebRTC media using openvidu-browser library. It is able to start and launch **Chrome/Firefox browsers** using Selenium, emulating a fully real user.

## **Usage Instructions**

### 1. Launch workers

<details>
  <summary><strong>For testing on AWS (Recommended)</strong></summary>

<br>
  If you want to launch the load tests in a production environment, you can do that with AWS.


  The browser-emulator services will be launched (**_by the loadtest-controller_**) in EC2 instances with the aim of emulate real users connected to OpenVidu.

**Requirements**
* **Create browser-emulator AMI**:

	Before run the create an AMI, ensure that your AWS credentials are properly configured. You can check it running `aws configure`.

	**Once aws credentials have been configured in your pc**, it's time to create the browser-emulator AMI. For creating it, you only have to run the `createAMI.sh` script.

	```bash
	cd ./browser-emulator/aws/
	./createAMI.sh
	```

	Defaults to creating the AMI:
	- In the us-east-1 AWS region.
	- Using Chrome as the browser for tests.
	- Not installing QoE analysis software required if doing QoE analysis in situ (generally not necessary).

	After AMI was created, you must set the  **AMI ID** to [`load-test/src/main/resources/application.properties`](loadtest-controller/src/main/resources/application.properties), in particular `WORKER_AMI_ID` property.

	You can change the default values of the script in the [`createAMI.sh`](browser-emulator/aws/createAMI.sh) script like this:

	```bash
	cd ./browser-emulator/aws/
	./createAMI.sh --region eu-west-1 --version ./EC2-browser-emulator-firefox.yml
	```

	The following versions are available:
	- Chrome with no qoe analysis software preinstalled (default): `./EC2-browser-emulator-no-qoe.yml`
	- Chrome with qoe analysis software preinstalled: `./EC2-browser-emulator.yml`
	- Firefox with no qoe analysis software preinstalled: `./EC2-browser-emulator-firefox-no-qoe.yml`
	- Firefox with qoe analysis software preinstalled: `./EC2-browser-emulator-firefox.yml`

* **Create a security group**:

	The instance which will contain the browser-emulator service **must have** the **5000** _(REST API)_ and **5001** _(WebSocket)_ ports opened. For doing this, **you will have to create a AWS Security Group (SG)** with these requeriments.


	After SG was created, you must set the **security group ID** to [`load-test/src/main/resources/application.properties`](loadtest-controller/src/main/resources/application.properties), in particular `WORKER_SECURITY_GROUP_ID` property.

The *loadtest-controller* will use the BrowserEmulator AMI (previously created) for create instances on demand. All you have to do is fill the [AWS configuration](#AWS-parameters-for-testing-on-AWS) in loadtest-controller properties besides the [required parameters](#Required-parameters)


</details>
<details>
  <summary><strong>For testing with manually provisioned workers</strong></summary>

<br>

>WARNING: These instructions assume you are using **Ubuntu** and that your kernel can build and install the module v4l2loopback. To check if you can build v4l2loopback, run the following commands:
```bash
cat /usr/src/linux-headers-$(uname -r)/.config | grep CONFIG_VIDEO_DEV
cat /usr/src/linux-headers-$(uname -r)/.config | grep CONFIG_VIDEO_V4L2
```
If one of them has output similar to:
```
CONFIG_VIDEO_DEV=m
or
CONFIG_VIDEO_V4L2=m
```
It means your system is compatible. If there is no output, your system is not compatible with v4l2loopback (this is common when using virtualized kernel releases such as kvm or wsl2).

<br>
To start with the load test you will have to start a worker first and the execute the controller.

Then follow these steps:

- **Clone this repository**

```bash
git clone https://github.com/OpenVidu/openvidu-loadtest.git
cd openvidu-loadtest/browser-emulator
```
- **Install and run**

You will need to choose if you want the worker to launch Chrome or Firefox browsers, as well as if you want to run QoE analysis on the worker's recorded videos.

If you are unsure, choose the **prepare_scripts/openvidu/prepare.sh** script to perform the installation (installs the browser-emulator with Chrome), as follows:

```bash
cd openvidu-loadtest/browser-emulator/
sudo su
./prepare_scripts/openvidu/prepare.sh # Install script, use the one you want
npm run start:prod-none # Start script, use the one you want depending on your installation
```

These are all the options available:

| **Browser to use** | **QoE Analysis Ready** | **Install Script to run**                            | **npm run start command to run** |
|--------------------|------------------------|------------------------------------------------------|----------------------------------|
| Chrome             | YES                    | ./prepare_scripts/openvidu/prepare.sh                | npm run start:prod-none          |
| Chrome             | NO                     | ./prepare_scripts/openvidu/prepare_no_qoe.sh         | npm run start:prod-none          |
| Firefox            | YES                    | ./prepare_scripts/openvidu/prepare_firefox.sh        | npm run start:prod-none-firefox  |
| Firefox            | NO                     | ./prepare_scripts/openvidu/prepare_no_qoe_firefox.sh | npm run start:prod-none-firefox  |
<!-- **3. Configure the [required loadtest-controller parameters](#Required-parameters) and the [worker ip address](#Development-mode-parameters-for-testing-locally)**. -->

<!-- Moreover, the last run command will assign `NODE_WEBRTC` for [emulated user types](browser-emulator/src/types/config.type.ts). You can run the following command for use KMS WebRTC:

```bash
npm run start:dev-kms
``` -->

</details>

### 2. Execute controller

In the machine you want to execute the controller you need to have at least **Java 11** platform installed.

Then follow these steps:

#### 1. Clone this repository

```bash
git clone https://github.com/OpenVidu/openvidu-loadtest.git
```

#### 2. Configure Loadtest Controller

Running the following command **under project root directory** you will be able to edit the [`load-test/src/main/resources/application.properties`](loadtest-controller/src/main/resources/application.properties) which contains a list of configuration parameters that you can customize.

```bash
nano loadtest-controller/src/main/resources/application.properties
```

In this file you will see:

#### Required parameters

By default, OpenVidu 3 is enabled, to use this tool for OpenVidu 2 please comment and uncomment the indicated properties.

```properties
# Load Test Parameters (Required)
# Uncomment the following property and add your OpenVidu Secret if you are using OpenVidu 2
# OPENVIDU_SECRET=
# If using OpenVidu 3 fill these properties with the LiveKit API Key and Secret, otherwise comment the following 2 properties
LIVEKIT_API_KEY=
LIVEKIT_API_SECRET=

SESSION_NAME_PREFIX=LoadTestSession
USER_NAME_PREFIX=User
SECONDS_TO_WAIT_BETWEEN_PARTICIPANTS=1
SECONDS_TO_WAIT_BETWEEN_SESSIONS=2
SECONDS_TO_WAIT_BEFORE_TEST_FINISHED=10
SECONDS_TO_WAIT_BETWEEN_TEST_CASES=10
```

#### Monitoring parameters (optional)

>WARNING: **The experiments we made have been tested with Elasticsearch 7.8.0 version. A deployment with a different version could cause errors**.

```properties
# Monitoring Parameters (Optional)
ELASTICSEARCH_USERNAME=elasticusername
ELASTICSEARCH_PASSWORD=password
KIBANA_HOST=https://kibanahost
```

| Make sure your OpenVidu Configuration has the following properties for a good monitoring:

- `OPENVIDU_PRO_STATS_MONITORING_INTERVAL=1`
- `OPENVIDU_PRO_STATS_WEBRTC_INTERVAL=1`

#### Manual provisioning of workers

```properties
################################################
#### Manual provisioning of workers
################################################
# For manual provision of workers, fill it with the workers ip addresses: WORKER_URL_LIST=195.166.0.1, 195.166.0.2
WORKER_URL_LIST=127.0.0.1
```

#### AWS parameters (only for testing on AWS)

General AWS parameters

```properties
################################################
#### For testing with AWS
################################################

# For launching EC2 instances and allowing to workers upload recordings to S3 bucket
AWS_ACCESS_KEY=
AWS_SECRET_ACCESS_KEY=

# Browser Emulator AMI which will be used for deploying worker instances
WORKER_AMI_ID=
WORKER_INSTANCE_TYPE=c5.xlarge

# Key pair name for worker instances to allow ssh manually connect
WORKER_INSTANCE_KEY_PAIR_NAME=

# By default, the browser-emulator service is listening on:
# 5000 (API REST)
# 5001 (WebSocket)
# 5900 (VNC, only needed if DEBUG_VNC=true)
# The SG will need these ports opened.
WORKER_SECURITY_GROUP_ID=
# AWS Region where the workers will be launched, beware of them being in the same region as the AMI
WORKER_INSTANCE_REGION=us-east-1
WORKER_AVAILABILITY_ZONE=us-east-1f
# Numbers of workers to launch before the test starts
WORKERS_NUMBER_AT_THE_BEGINNING=
# Number of new workers incrementation, if 0 it won't launch a any workers during the test
WORKERS_RAMP_UP=
# Continue the test without asking if there aren't enough workers when ramp up is 0
FORCE_CONTINUE=false
```

##### For the MANUAL distribution of participants to workers
```properties
# Boolean param for MANUAL participants allocation
MANUAL_PARTICIPANTS_ALLOCATION=false
# Number of participants per worker
USERS_PER_WORKER=
```


##### For the AUTOMATIC distribution of participants to workers
```properties
# Percentage worker limit (based on streams created)
# Reacher this limit, the controller will use a new worker
# An estimation of CPU load will be done before starting the test using one worker
WORKER_MAX_LOAD=70
```

##### For video quality control
These properties allow record a participant (launching an external browser) for check the received video quality. Another option is to record in-browser media streams, which can be used for QoE Analysis later.

When test finishes, the recording(s) will be saved in the S3 Bucket if MinIO isn't configured.

```properties
################################################
#### For VIDEO QUALITY control
################################################

# AWS only
# It will start a new ec2 instance where a new participant will be connected using a real browser
# it will start to record the session when media node has archieved this value
# Needs an ElasticSearch instance to work
MEDIANODE_LOAD_FOR_START_RECORDING=0
# it will start to record the sessions gruped by the specifyed value. 
# 0: Recording disabled, 1 recording starts each session, 2 recording starts each two session ...
RECORDING_SESSION_GRUPED_BY=0
# Number of new recording workers incrementation, if 0 it won't launch a any workers
RECORDING_WORKERS_AT_THE_BEGINNING=0

################################################
#### QoE Analysis
################################################

# Record each MediaStream in each worker for Quality of Experience analysis
QOE_ANALYSIS_RECORDINGS=false
# Perform qoe analysis in the same worker as they were recorded in, if false the recordings will only be uploaded to S3 or MinIO
QOE_ANALYSIS_IN_SITU=false
# Video information needed for in situ QoE analysis, read https://github.com/OpenVidu/openvidu-loadtest/tree/master/browser-emulator#running-qoe-analysis for more information
VIDEO_PADDING_DURATION=1
VIDEO_FRAGMENT_DURATION=15

################################################
#### For saving recordings in S3
################################################
# Bucket name where the recordings will be saved. Remember to set AWS_ACCESS_KEY and AWS_SECRET_ACCESS_KEY
S3_BUCKET_NAME=
```

##### If you want to save the recordings in MinIO
```properties
################################################
#### MinIO credentials and information if using it to save recordings instead of S3
################################################
# MinIO Endpoint
MINIO_HOST=
# MinIO Port (default 443)
MINIO_PORT=443
# MinIO Access Key
MINIO_ACCESS_KEY=
# MinIO Secret Key
MINIO_SECRET_KEY=
# MinIO Bucket Name
MINIO_BUCKET=
```
#### For retrying the participant creation

These properties allow retry the participant creation when it fails
```properties
RETRY_MODE=false
RETRY_TIMES=5
```

#### For selecting the video to use
These properties allow you to select the video to use.
There are 3 default options, and you can also use a custom video, check the description of the [browser-emulator Initialize instance API](https://github.com/OpenVidu/openvidu-loadtest/tree/master/browser-emulator#initialize-instance) for more information about these options:
```properties
# Video type options: BUNNY, INTERVIEW, GAME, CUSTOM
VIDEO_TYPE=BUNNY
VIDEO_WIDTH=640
VIDEO_HEIGHT=480
VIDEO_FPS=30
# If VIDEO_TYPE is CUSTOM, you have to specify the video and audio URLs
VIDEO_URL=
AUDIO_URL=
```

### Miscellaneous configuration
Recommended to leave default values unless you know what you are doing.

```properties
# Insert the users in batches or one by one
BATCHES=true
# Maximum number of concurrent requests. If left blank, defaults to number of available processors + 1.
BATCHES_MAX_REQUESTS=10
# Wait after user or batch insertion
WAIT_COMPLETE=true
# Install VNC server on workers for debug purposes. Usually not needed
DEBUG_VNC=false
```

#### 3. Configure session typology

Controller is being developed to allow the configuration of the load test cases: number of participants, typology, number of sessions, etc.

Currently, the only available option is the change of the number of participants of the session.

To configure the test cases the file [`loadtest-controller/src/main/resources/test_cases.json`](loadtest-controller/src/main/resources/test_cases.json) has to be edited:

```json
{
	"testcases": [
		{
			"typology": "N:M",
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

##### Test Case JSON properties

|Properties|Type|Description|
|---|---|---|
|  **typology** * |  `N:N`, `N:M`, `TEACHING` or `TERMINATE`| **N:N**: All users will be PUBLISHERS and SUBSCRIBERS <br> **N:M**: **_N_** number will be PUBLISHERS and **_M_** number will be SUBSCRIBERS <br> **TEACHING**:  It will emulate a teaching videoconference. The students (FAKE SUBSCRIBERS, they will be PUBLIHSERS with only audio) will only publish audio <br> **TERMINATE**: It will terminate all EC2 instances launched for loadtest purposes  |
|  **participants** *  |  String [] | Number of participants in each session. It will run the same test case as many time as the positions in the array. <br> For example: <br>For **_N:N_** typology: `["2","5"]` where all of them will be _publishers_ and test case will be run twice (sessions with 2 and 5 participants)  <br>For **_N:M_** typology: `["2:30"]` where 2 will be _publishers_ and 30 will be _subscribers_ <br>For **_TEACHING_** typology: `["2:30"]` where 2 will be teachers and 30 will be students   |
|  **sessions** *  |  `infinite` or Number | **infinite**: It will create infinite sessions until the limit is reached. <br> **Number value**: It will create only (**_number value_**) sessions  |
|  **startingParticipants** |  Number | Create this number of participants at the beginning of the test in a batch. Useful for loading the media server up to a certain point before adding users in a more controlled manner. Defaults to 0 |
|**resolution**| String | Desired resolution of the video. <br> `640x480` or `1280x720` <br> Default `640x480`|
|**frameRate**| Number (0-30)  | Desired framerate of the video in frames per second. Default `30`|
|  **openviduRecordingMode** | String   | `COMPOSED` or `INDIVIDUAL` <br> See [OpenVidu recording](https://docs.openvidu.io/en/stable/advanced-features/recording/).|
|  **browserRecording** | Boolean  |  If `browserMode` is `REAL` and you want record the Chrome browser using ffmpeg. Otherwise, If `browserMode` is `EMULATE` and you have started browser-emulator with `KMS` user type (see [worker running options](#running-options)) Default `false`.  |
|  **showBrowserVideoElements** | Boolean  | If `browserMode` is `REAL` and you want show videos elements into the app running in Chrome. Default `true`|
|  **headlessBrowser** | Boolean  | If `browserMode` is `REAL` and you want launch a headless Chrome. Default `false`.  [See Headless Chromium](https://chromium.googlesource.com/chromium/src/+/lkgr/headless/README.md)  |


### 3. Run load test

When you execute the load test the controller will create sessions and will connect participants into them automatically.

The load test has **several stop conditions**. It will stop when any of the following conditions occur:

* When loadtest-controller receives an **exception error** from any of the workers (or the number of exceptions in RETRY_TIMES when RETRY_MODE is true).

* When any of workers **can't create a new participant** because of lack of resources or a long time trying creating it (will retry if RETRY_MODE is true).

Take into account that errors can be produced by OpenVidu errors or if the worker itself is overloaded. Please control CPU usage in workers.

When an error in a worker is produced, the load test will stop and will order to destroy and close every participants and sessions to the workers.

For start with it, run the following command:

```bash
cd loadtest-controller
mvn spring-boot:run
```

# Browser Emulator development

Now you can use [Vagrant](https://developer.hashicorp.com/vagrant/install) to create a virtual machine running the browser-emulator. Ensure you have Vagrant and VirtualBox installed on your system.

You can either choose an already made box or make a personalized one yourself.

- **Already made box**

You can use the default Vagrantfile to create a preconfigured browser-emulator VM. You can start it with `vagrant up` to launch it with the default parameters.

- **Customizable Parameters in Vagrantfile**

    - **BOX**: Box to use as base. You can choose one of our already made boxes or choose the path to a box made by youself. Defaults to a box with the latest OpenVidu 2 CE and Firefox installed.
	- **MEMORY**: Amount of memory (in MB) to allocate for the virtual machine. Default: 4096. (Note: if START_MEDIASERVER is true, OpenVidu requires at least 8GB of memory).
	- **CPUS**: Number of CPUs to allocate for the virtual machine. Default: 4. (Note: if START_MEDIASERVER is true, OpenVidu requires at least 2 CPUs).
	- **VAGRANT_PROVIDER**: Virtualization provider to use (e.g., 'virtualbox', 'vmware'). Default: 'virtualbox'.
	- **NODES**: How many virtual machines will be created. Each machine will be created with the name node[i], where i is the node number. For each node, the ports open will be 5000 + (i * 10) for the BrowserEmulator server, 5001 + (i * 10) for the WebSocket connection and 5900 + (i * 10) for the VNC connection, where i is the node number. For example, the first node (node1) will have open ports 5000, 5001 and 5900, node2 will have 5010, 5011 and 5911 and so on. Defaults to 1.

- **Available boxes**

Here are our already made boxes that you can use:

	- ivchicano/browseremulator-ov-ff: Default box. Comes ready to use against OpenVidu 2, using Firefox as the browser.
	- ivchicano/browseremulator-lk-ff: Comes ready to use against LiveKit, using Firefox as the browser.
	- ivchicano/browseremulator-ov-ff-dev: Comes with the latest OpenVidu 2 CE and Firefox installed. Starts an OpenVidu 2 CE server in the same machine.
	- ivchicano/browseremulator-lk-ff-dev: Comes with the latest LiveKit and Firefox installed. Starts a LiveKit server in the same machine.

- **Start vagrant**

To customize these parameters, you can set environment variables before running `vagrant up`. For example:

```bash
export BOX=ivchicano/browseremulator-lk-ff
vagrant up
```

- **Personalized box**

You can also construct your personalized box with the parameters you choose. You can start it with `VAGRANT_VAGRANTFILE=./Vagrantfile_create_box vagrant up` to launch it with the default parameters. You can then use this box as is or package it with `VAGRANT_VAGRANTFILE=./Vagrantfile_create_box vagrant package` to create a box file.

- **Customizable Parameters in Vagrantfile**

	- **MEMORY**: Amount of memory (in MB) to allocate for the virtual machine. Default: 8192. (Note: if START_MEDIASERVER is true, OpenVidu requires at least 8GB of memory).
	- **CPUS**: Number of CPUs to allocate for the virtual machine. Default: 4. (Note: if START_MEDIASERVER is true, OpenVidu requires at least 2 CPUs).
	- **VAGRANT_PROVIDER**: Virtualization provider to use (e.g., 'virtualbox', 'vmware'). Default: 'virtualbox'.
	- **FIREFOX**: Set to 'true' to use Firefox instead of Chrome for testing. Default is 'false'.
	- **START_MEDIASERVER**: Set to 'true' to start the media server (either the latest Openvidu 2 CE or LiveKit) during provisioning. Default is 'true'.
	OpenVidu note: with this deployment, the OpenVidu URL is ^*https://localhost* and the OpenVidu secret is *vagrant*.
	LiveKit note: (Experimental) with this deployment, LiveKit is deployed in dev mode, so the API Key is *devkey* and the API Secret is *secret*.
	- **QOE**: Set to 'true' to install all necessary dependencies to run the quality of experience (QoE) analysis scripts in the browser-emulator. Slower installation. Default is 'false'.
	- **LIVEKIT**: (Experimental) Set to 'true' to use LiveKit instead of OpenVidu. Default: 'false'.
	- **NODES**: How many virtual machines will be created. Each machine will be created with the name node[i], where i is the node number. For each node, the ports open will be 5000 + (i * 10) for the BrowserEmulator server, 5001 + (i * 10) for the WebSocket connection and 5900 + (i * 10) for the VNC connection, where i is the node number. For example, the first node (node1) will have open ports 5000, 5001 and 5900, node2 will have 5010, 5011 and 5911 and so on. Defaults to 1.

# Acknowledgments

This work has been supported by the Regional Government of Madrid (Spain) (CM) through project EDGEDATA-CM (P2018/TCS-4499) cofunded by FSE & FEDER.
