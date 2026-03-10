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

- [**Loadtest Controller**](#loadtest-controller): Controller service in charge of the coordination of the browser-emulator workers. It reads the load test scenario from a file and control the browser-emulator workers to connect participants loading OpenVidu platform.

- [**Browser-emulator**](#browser-emulator): Worker service capable of connecting to an OpenVidu room and sending and receiving WebRTC media. It is able to start and launch **Chrome/Firefox browsers** using Selenium, emulating a fully real user.

## **Usage Instructions**

### 1. Launch workers

<details>
  <summary><strong>For testing on AWS (Recommended)</strong></summary>

<br>
  If you want to launch the load tests in a production environment, you can do that with AWS.

The browser-emulator services will be launched (**_by the loadtest-controller_**) in EC2 instances with the aim of emulate real users connected to OpenVidu.

**Requirements**

- **Create browser-emulator AMI**:

  Before trying to create an AMI, ensure that your AWS credentials are properly configured. You can check it running `aws configure`.

  **Once aws credentials have been configured in your PC**, it's time to create the browser-emulator AMI. For creating it, you only have to run the `createAMI.sh` script.

  ```bash
  cd ./browser-emulator/aws/
  ./createAMI.sh
  ```

  You can change the default values of the [`createAMI.sh`](browser-emulator/aws/createAMI.sh) script for customizing the AMI. You can get detailed help about the parameters running `./createAMI.sh --help`:

  ```bash
  cd ./browser-emulator/aws/
  ./createAMI.sh --help
  ```

  After AMI was created, you must set the **AMI ID** to [`load-test/src/main/resources/application.properties`](loadtest-controller/src/main/resources/application.properties), in particular `WORKER_AMI_ID` property.

- **Create a security group**:

  The instance which will contain the browser-emulator service **must have** the **5000** _(REST API)_ and **5001** _(WebSocket)_ ports opened. For doing this, **you will have to create a AWS Security Group (SG)** with these requeriments.

  After SG was created, you must set the **security group ID** to [`load-test/src/main/resources/application.properties`](loadtest-controller/src/main/resources/application.properties), in particular `WORKER_SECURITY_GROUP_ID` property.

The _loadtest-controller_ will use the BrowserEmulator AMI (previously created) for create instances on demand. All you have to do is fill the [AWS configuration](#AWS-parameters-for-testing-on-AWS) in loadtest-controller properties besides the [required parameters](#Required-parameters)

</details>
<details>
  <summary><strong>For testing with manually provisioned workers</strong></summary>

<br>

> WARNING: These instructions assume you are using **Ubuntu** and that your kernel can build and install the module v4l2loopback. To check if you can build v4l2loopback, run the following commands:

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
We recommend using a clean Ubuntu 24.04 installation for the workers (for example, running a virtual machine), as the install script(s) will install all necessary dependencies for the browser-emulator to work, including the browsers, and the installation might conflict with already existing software in the machine.

To install browser-emulator, run these commands:

```bash
git clone https://github.com/OpenVidu/openvidu-loadtest.git
git checkout v4.0.0 # Latest release, you can also use the tag or branch you want
cd openvidu-loadtest/browser-emulator
./prepare_scripts/install_base.sh
```

(Optional) If you want to use the QoE analysis features, run the following command for installing the necessary dependencies:

```bash
./prepare_scripts/install_qoe.sh
```

Note: We recommend running QoE analysis in a different machine that the ones running workers, as the analysis can be long-running and resource consuming. To set up the machine for running QoE analysis, you can follow the same steps as for setting up a worker, running both `install_base.sh` and `install_qoe.sh` scripts.

</details>

### 2. Execute controller

In the machine you want to execute the controller you need to have at least **Java 11** platform installed.

Then follow these steps:

#### 1. Clone this repository

```bash
git clone https://github.com/OpenVidu/openvidu-loadtest.git
git checkout v4.0.0 # Latest release, you can also use the tag or branch you want
```

#### 2. Configure Loadtest Controller

Running the following command **under project root directory** you will be able to edit the [`load-test/src/main/resources/application.properties`](loadtest-controller/src/main/resources/application.properties) which contains a list of configuration parameters that you can customize.

```bash
nano loadtest-controller/src/main/resources/application.properties
```

In this file you will see:

#### Required parameters

By default, OpenVidu 3 is enabled (also works for LiveKit, as OpenVidu 3 is LiveKit compatible), to use this tool for OpenVidu 2 please comment and uncomment the indicated properties.

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

> WARNING: **The experiments we made have been tested with Elasticsearch 7.8.0 version. A deployment with a different version could cause errors**.

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

When test finishes, the recording(s) will be saved in the S3 Bucket configured.

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
# Perform qoe analysis in the same worker as they were recorded in, if false the recordings will only be uploaded to S3
QOE_ANALYSIS_IN_SITU=false
# Video information needed for in situ QoE analysis, read https://github.com/OpenVidu/openvidu-loadtest/tree/master/browser-emulator#running-qoe-analysis for more information
VIDEO_PADDING_DURATION=1
VIDEO_FRAGMENT_DURATION=15

################################################
#### For saving recordings in S3
################################################
# Bucket name where the recordings will be saved. Remember to set AWS_ACCESS_KEY and AWS_SECRET_ACCESS_KEY
S3_BUCKET_NAME=
# S3 region. Defaults to us-east-1 if not specified. Remember to set AWS_ACCESS_KEY and AWS_SECRET_ACCESS_KEY
S3_REGION=us-east-1
# (Optional) S3 endpoint, needed if you are using a S3 compatible storage like MinIO
S3_HOST=
# (Optional) S3 endpoint's access key and secret key, needed if you are using a S3 compatible storage like MinIO.
# If S3_HOST is specified but these keys are not, it will try to connect using the AWS_ACCESS_KEY and AWS_SECRET_ACCESS_KEY keys if available.
S3_HOST_ACCESS_KEY=
S3_HOST_SECRET_KEY=
```

#### For retrying the participant creation

These properties allow retry the participant creation when it fails

```properties
RETRY_MODE=false
RETRY_TIMES=5
```

#### For selecting the video to use

These properties allow you to select the video to use.
There are 3 default options provided by the OpenVidu team that you can use for your tests:

- BUNNY: [Blender animated demo video](https://peach.blender.org/)
  - Available resolutions and frame rates:
    - Width: 640, height: 480, fps: 30
    - Width: 640, height: 480, fps: 60
    - Width: 1280, height: 720, fps: 30
    - Width: 1280, height: 720, fps: 60
    - Width: 1920, height: 1080, fps: 30
    - Width: 1920, height: 1080, fps: 60
- INTERVIEW: interview video
  - Available resolutions and frame rates:
    - Width: 640, height: 480, fps: 30
- GAME: gameplay video with commentary
  - Available resolutions and frame rates:
    - Width: 640, height: 480, fps: 30

You can also use a custom video. For that, you will have to provide the video and audio URLs and set `VIDEO_TYPE=CUSTOM`. The video and audio files must be downloadable by the workers via HTTP(S) request.

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

#### 3. Configure session topology

Controller is being developed to allow the configuration of the load test cases: number of participants, topology, number of sessions, etc.

Currently, the only available option is the change of the number of participants of the session.

To configure the test cases the file [`loadtest-controller/src/main/resources/test_cases.json`](loadtest-controller/src/main/resources/test_cases.json) has to be edited:

```json
{
  "testcases": [
    {
      "topology": "N:M",
      "participants": [
        "1:10",
        "1:100",
        "2:10",
        "2:30",
        "2:50",
        "3:10",
        "3:30",
        "3:50"
      ],
      "sessions": "infinite",
      "desciption": "This test case will add infinite sessions (until it reaches its limit) with as many PUBLISHERS and SUBSCRIBERS as the participants array indicates."
    },
    {
      "topology": "TEACHING",
      "participants": ["2:10", "2:30", "2:50", "3:10", "3:30", "3:50"],
      "sessions": "infinite",
      "desciption": "This test case will add infinite sessions (until it reaches its limit) with as many PUBLISHERS (teachers:students) as the participants array indicates. The students (FAKE SUBSCRIBERS, they will be PUBLIHSERS with only audio) will only publish audio"
    },
    {
      "topology": "TERMINATE",
      "desciption": "This terminate all EC2 instances launched for loadtest purposes"
    }
  ]
}
```

##### Test Case JSON properties

| Properties                   | Type                                    | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ---------------------------- | --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **topology** \*              | `N:N`, `N:M`, `TEACHING` or `TERMINATE` | **N:N**: All users will be PUBLISHERS and SUBSCRIBERS <br> **N:M**: **_N_** number will be PUBLISHERS and **_M_** number will be SUBSCRIBERS <br> **TEACHING**: It will emulate a teaching videoconference. The students (FAKE SUBSCRIBERS, they will be PUBLIHSERS with only audio) will only publish audio <br> **TERMINATE**: It will terminate all EC2 instances launched for loadtest purposes                                                                                    |
| **participants** \*          | String []                               | Number of participants in each session. It will run the same test case as many time as the positions in the array. <br> For example: <br>For **_N:N_** topology: `["2","5"]` where all of them will be _publishers_ and test case will be run twice (sessions with 2 and 5 participants) <br>For **_N:M_** topology: `["2:30"]` where 2 will be _publishers_ and 30 will be _subscribers_ <br>For **_TEACHING_** topology: `["2:30"]` where 2 will be teachers and 30 will be students |
| **sessions** \*              | `infinite` or Number                    | **infinite**: It will create infinite sessions until the limit is reached. <br> **Number value**: It will create only (**_number value_**) sessions                                                                                                                                                                                                                                                                                                                                    |
| **startingParticipants**     | Number                                  | Create this number of participants at the beginning of the test in a batch. Useful for loading the media server up to a certain point before adding users in a more controlled manner. Defaults to 0                                                                                                                                                                                                                                                                                   |
| **resolution**               | String                                  | Desired resolution of the video. <br> `640x480` or `1280x720` <br> Default `640x480`                                                                                                                                                                                                                                                                                                                                                                                                   |
| **frameRate**                | Number (0-30)                           | Desired framerate of the video in frames per second. Default `30`                                                                                                                                                                                                                                                                                                                                                                                                                      |
| **browser**                  | String                                  | Desired browser to use in the test. <br> `chrome` or `firefox` <br> Default `chrome`                                                                                                                                                                                                                                                                                                                                                                                                   |
| **openviduRecordingMode**    | String                                  | (OpenVidu 2 only) `COMPOSED` or `INDIVIDUAL` <br> See [OpenVidu recording](https://docs.openvidu.io/en/stable/advanced-features/recording/).                                                                                                                                                                                                                                                                                                                                           |
| **browserRecording**         | Boolean                                 | If `browserMode` is `REAL` and you want record the Chrome browser using ffmpeg. Otherwise, If `browserMode` is `EMULATE` and you have started browser-emulator with `KMS` user type (see [worker running options](#running-options)) Default `false`.                                                                                                                                                                                                                                  |
| **showBrowserVideoElements** | Boolean                                 | If `browserMode` is `REAL` and you want show videos elements into the app running in Chrome. Default `true`                                                                                                                                                                                                                                                                                                                                                                            |
| **headlessBrowser**          | Boolean                                 | If `browserMode` is `REAL` and you want launch a headless Chrome. Default `false`. [See Headless Chromium](https://chromium.googlesource.com/chromium/src/+/lkgr/headless/README.md)                                                                                                                                                                                                                                                                                                   |

### 3. Run load test

When you execute the load test the controller will create sessions and will connect participants into them automatically.

The load test has **several stop conditions**. It will stop when any of the following conditions occur:

- When loadtest-controller receives an **exception error** from any of the workers (or the number of exceptions in RETRY_TIMES when RETRY_MODE is true).

- When any of workers **can't create a new participant** because of lack of resources or a long time trying creating it (will retry if RETRY_MODE is true).

Take into account that errors can be produced by OpenVidu errors or if the worker itself is overloaded. Please control CPU usage in workers.

When an error in a worker is produced, the load test will stop and will order destroying and closing all participants and sessions to the workers.

For start with it, run the following command:

```bash
cd loadtest-controller
mvn spring-boot:run
```

# Acknowledgments

This work has been supported by the Regional Government of Madrid (Spain) (CM) through project EDGEDATA-CM (P2018/TCS-4499) cofunded by FSE & FEDER.
