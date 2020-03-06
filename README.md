# OpenVidu Load Test

This repository aims to facilitate the definition, execution and review of massive load testing scenarios of an OpenVidu application in a distributed cluster of containerized browsers, located in Amazon Web Services Cloud.

Number of total sessions and participants per session must be customizable. Test will have the following default conditions:

- Every participant will be connecting from a single browser. Every browser will be launched in its own Docker container with fixed resource configuration (available RAM, number of cores and bandwidth)
- Every browser will be a Chrome instance launched with the following options: `allow-file-access-from-files`, `use-file-for-fake-video-capture=fakevideo.y4m`, `use-file-for-fake-audio-capture=fakeaudio.wav`, `window-size=1980,1280`
- OpenVidu will be deployed in a dedicated EC2 machine. Every OpenVidu session (and therefore every dockerized browser) will be connecting to this same instance
- Each session will have 7 participants by default (7 publishers and 42 subscribers), but this must be customizable
- Each video will have a resolution of 540×360 pixels, 30 fps
- Each browser will be responsible of obtaining the necessary token to connect to its specific test session (URL will contain as parameters the secret, the session identifier and the ip where to perform REST operations, so the JavaScript code can get the token)
- Client HTML/JS code will show up 1 local video and 6 remotes videos (for 7 users per session), including WebRTC stats for all of them
- Every RTCPeerConnection object will be exposed to gather statistics thanks to method [`RTCPeerConnection.getStats()`](https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection/getStats)
- The following statistics will be the ones gathered for each RTCPeerConnection object: Sender Round-Trip-Time (googRtt), Receviers Round-Trip-Time (googRtt), Received Bit-Rate, Sent Bit-Rate, Packet loss
- Every browser will be monitored to ensure each one of the videos is playing media
- It must be possible to configure browsers to be recorded, so real quality can be then analysed

The testing process for every client node will be:

1. Launch Chrome with the required flags ([selenium code](https://github.com/OpenVidu/openvidu-loadtest/tree/master/selenium-test) in the test orchestrator will launch every client node)
2. Wait fot the testing web application to load. This static web app will be hosted in the same AWS EC2 machine as OpenVidu Server.
3. Wait for the browser to connect to the session in OpenVidu Server (`connectionCreated` event)
4. Wait for the local video to be playing (`videoPlaying` event)
5. Wait for each one of the remote videos to be playing (`videoPlaying` event)
6. Gather statistics. Each call to `getStats()` over each `RTCPeerConnection` object will take place periodically (customizable period)
7. Wait until the test orchestrator node terminates the test. Close browser.


## Running OpenVidu Load Test

1) First you have to generate an Amazon AMI with the browser (from now on ***Client Instance***), so your test can quickly launch clients to connect to OpenVidu sessions. Perform [this step](https://github.com/OpenVidu/openvidu-loadtest/tree/master/aws#configuration) and the [following one](https://github.com/OpenVidu/openvidu-loadtest/tree/master/aws#creating-the-ami).

2) You will need then to deploy OpenVidu Server in Amazon Web Services (from now on ***OpenVidu Server Instance***). You can do so very easily following [these instructions](https://github.com/OpenVidu/openvidu-loadtest/tree/master/aws#the-sut-subject-under-test-cloudformation-template).

3) Then you will have to deploy a Test Orchestrator instance in the same Amazon Web Services region (from now on ***Test Orchestrator Instance***). You can do it following [these instructions](https://github.com/OpenVidu/openvidu-loadtest/tree/master/aws/#the-test-orchestrator-cloudformation-template).

After successfully deploying the *Test Orchestrator Instance*, copy your key file to the instance. The test will need it to connect to *OpenVidu Server Instance*.

```
scp -i /path/to/your/key.pem /path/to/your/key.pem ubuntu@PUBLIC_IP_OF_TEST_ORCHESTRATOR_INSTANCE:.
```

Then connect to it through ssh:

```
ssh -i /path/to/your/key.pem ubuntu@PUBLIC_IP_OF_TEST_ORCHESTRATOR_INSTANCE
```

Once connected to the instance enter root mode and move your key file to path `/opt/openvidu/testload`:

```
sudo -s
mv /home/ubuntu/key.pem /opt/openvidu/testload/.
```

Now watch path `/home/ubuntu/`. When a folder `openvidu-loadtest` appears inside of it, then you will be ready to run the load test.

First modify file `/home/ubuntu/openvidu-loadtest/src/test/resources/browserProvider.sh`, setting valid values to properties

```
IMAGE_ID=
INSTANCE_TYPE=
KEY_NAME=
SECURITY_GROUP=
```

Being:

- `IMAGE_ID`: identifier of the AMI created for your *Client Instances* during [these step](https://github.com/OpenVidu/openvidu-loadtest/tree/master/aws#creating-the-ami)
- `INSTANCE_TYPE`: type of instance for your *Client Instances*. For example `c5.xlarge`
- `KEY_NAME`: the name of the key you used when deploying both *OpenVidu Server Instance* and *Test Orchestrator Instance*
- `SECURITY_GROUP`: name of the security group needed to launch *Client Instances*


You are now ready to launch the load test! Please, check out next section to learn about every configuration parameter you can pass to the `mvn test` command below:

```
cd /home/ubuntu/openvidu-loadtest/selenium-test
mvn -Dtest=OpenViduLoadTest -DCONFIGURATION_PARAMETER=value test
```

## Configuration parameters

Configuration properties when running `mvn test` in `selenium-test/.` (configure with `-DPROPERTY_NAME=property_value`)

- `OPENVIDU_SECRET`: secret of OpenVidu Server. Default value = `MY_SECRET`
- `OPENVIDU_URL`: url of OpenVidu Server. Default value = `https://localhost:4443/`
- `APP_URL`: url of the web application where to connect the browsers to perform the test. Default value = `http://localhost:8080/`
- `RECORDING_OUTPUT_MODE`: the recording output mode. Default value = `COMPOSED`
- `SESSIONS`: upper limit of sessions. Default value = `10`
- `USERS_SESSION`: number of users per session. Default value = `7`
- `SECONDS_OF_WAIT`: timeout in seconds the test will wait for each group of OpenVidu events in each browser. Default value = `40`
- `NUMBER_OF_POLLS`: number of polls to perform to each browser. There will be an interval of _BROWSER_POLL_INTERVAL_ between them. Default value = `8`
- `BROWSER_POLL_INTERVAL`: interval for polling webrtc stats from each browser. Default value = `1000`
- `SERVER_POLL_INTERVAL`: interval for polling net, cpu and mem usage from OpenVidu Server. Default value = `5000`
- `SERVER_SSH_USER` username to connect to OpenVidu Server through ssh (monitoring purposes). Default value = `ubuntu`
- `PRIVATE_KEY_PATH`: path to private key file to connect to OpenVidu Server through ssh (monitoring purposes). Default value = `/opt/openvidu/testload/key.pem`
- `REMOTE`: whether to use local web drivers or remote web drivers. Default value = `false`
- `BROWSER_INIT_AT_ONCE`: whether to initialize all browsers of each session before running asynchronous test in each one of them or not. Default value = `false`
- `RESULTS_PATH`: path where to store test results. Default value = `/opt/openvidu/testload`
- `RECORD_BROWSERS`: which browsers should be recorded during the test (only applies if `REMOTE` is true). If any browser is recorded, the video file will be downloaded to `RESULTS_PATH` just before terminating the instance. The format of this property is an array of integers, indicating how many browsers of each session should be recorded. For example, `[1,0,2]` will record 1 browser of the first session and 2 browsers of the third session. Rest of sessions will not have any recorded browsers. Default value: `[]` (no recorded browsers at all)
- `NETWORK_RESTRICTIONS_BROWSERS`: which network restrictions should be applied to each browser (only applies if `REMOTE` is true). The format of this property is an array of stringified JSON objects, indicating how many browsers of the session should be restricted in certain way. For example, `["{'TCP_ONLY':1,'TURN':1}","{}","{}","{'TURN':3}"]` will set 1 browser of the first session to *TCP_ONLY*, another one to *TURN* and the rest to *ALL_OPEN*. For the fourth session it will set 3 browsers to *TURN* and the rest to *ALL_OPEN*. Allowed keys are:
    - `ALL_OPEN`: no network restrictions. All ports in the browser's instance are opened
    - `TCP_ONLY`: all UDP ports are blocked in the browser's machine
    - `TURN`: all ports are blocked except TCP 4444, 6080, 5900, 4443, 3478, 53 and 22. This will ensure the need of TURN relay for establishing WebRTC connections.
- `DOWNLOAD_OPENVIDU_LOGS`: whether to download OpenVidu Server and Kurento Media Server logs from the SuT machine or not at the end of the test. This includes downloading file `openvidu.log` (output from OpenVidu Server Java process), `errors.log` (error output from Kurento Media Server), `20*.log` (standard output from Kurento Media Server) and `turn_*.log` (coturn server logs). All logs will be downloaded through _scp_ thanks to `SERVER_SSH_USER` and `PRIVATE_KEY_PATH` properties, and will be properly stored under `RESULTS_PATH` parent directory. Default value = `true`
- `TCPDUMP_CAPTURE_BEFORE_CONNECT`: whether to start the capture of tcpdump information before connection to a session or after session connection is stable. Default value: `true`
- `TCPDUMP_CAPTURE_TIME`: how long network packet information should be captured in each browser after session is stable (only applies if `REMOTE` is true). The `tcpdump` process will always start before connecting to OpenVidu session. Then it will run for `TCPDUMP_CAPTURE_TIME` seconds, storing the results in a log file (_tcpdump.pcap_) that will be downloaded to the test node just before terminating the browser's instance. If you don't want this information to be collected, just set this property to `0`. Default value: `5`
 - `SESSION_AFTER_FULL_CPU`: Session limit after CPU is 100%. If the limit is reached, the test will be stopped. Default value = 2.
 - `SECONDS_WITH_ALL_SESSIONS_ACTIVE`: Time that sessions will be active after max Session limit. Default value = 600


## Results format

Inside folder configured with parameter `RESULTS_PATH` you will find another folder named like `loadtest_DATE_TIME`. It containes all of the files generated during certain load test execution. This files are:

- **test.log**: log of the selenium test (from ***Test Orchestrator Instance***)
- **[DATE_TIME].pid[NUMBER].log**: standard log for Kurento Media Server (from ***OpenVidu Server Instance***)
- **errors.log**: error log for Kurento Media Server (from ***OpenVidu Server Instance***)
- **turn_[ID]**: log for TURN server (from ***OpenVidu Server Instance***)
- **loadTestInfo.txt**: useful summary of the test execution, with the specified configuration and a glance of the results
- ***.csv** files: spreadsheets containing information about Publisher and Subscriber statistics
- ***.pcap** files: network packet dumps (from ***Client Instance***). Only available if property `TCPDUMP_CAPTURE_TIME` is not set to 0
- **packetsInfo.txt**: information about the number and full protocol stack of network packets send and receive by every ***Client Instance*** (this is obtained using .pcap files). Only available if property `TCPDUMP_CAPTURE_TIME` is not set to 0. Each line of the file has the following format:

        {[SOURCE_IP]:[SOURCE_PORT]>[DESTINATION_IP]:[DESTINATION_PORT]={[protocolA-protocolB-protocolC]={[NUMBER_OF_PACKETS], [protocolX-protocolY-protocolZ]=[NUMBER_OF_PACKETS]}, ... }

        # For example
        # tcpdump-user-4-2.pcap: {172.31.44.154:26351>172.31.20.11:56140={ip-udp-rtp=229, ip-udp=6}, 172.31.25.59:48944>91.189.95.15:80={ip-tcp=6}}

- ***.png** files: useful graphs generated with gathered statistics
- ***.mp4** files: browser recordings (from ***Client Instance***). Only available for those clients configured in property `RECORD_BROWSERS`.
- **loadTestStats.txt**: file with stats and events of the test. Has one JSON formatted string in each line that can be:

    - **Test event log**: the load test will generate a log entry for certain key situations during the test execution. This includes:
        - `testStarted`: recorded when the load test has started
        - `testFinished`: recorded when the load test has finished
        - `connectingToBrowser`: recorded when the process of initializing a remote web driver starts
        - `connectedToBrowser`: recorded when the process of initializing a remote web driver ends
        - `sessionStarted`: recorded **once** when the first user of one session successfully connects to it
        - `sessionStable`: recorded when each browser reaches a stable session state: that is, the publisher video is successfully being played and each one of the 6 remote videos has media and is playing. Ideally there will be 7 _sessionStable_ events for each session
        - `sessionUnstable`: recorded if a browser is not able to reach a stable session state in the given `SECONDS_OF_WAIT` timeout. This means: a) Some OpenVidu event is not triggered (`connectionCreated`, `streamCreated`...) and therefore OpenVidu Server has not been able to send the appropriate events to the newly connected browser through its websocket or b) Some remote video is not being received by the browser

        > Each test event log has the following structure: `{"event":{"name":"EVENT_NAME","sessionId":"session-5","userId":"user-5-1","secondsSinceTestStarted":325,"secondsSinceSessionStarted":8},"timestamp":1541503314461}`

    - **Browser WebRTC stats**: each browser connecting to a session will generate WebRTC statistics gathered by the test every `BROWSER_POLL_INTERVAL` milliseconds.

    - **OpenVidu Server monitoring stats**: the test will gather cpu usage, memory usage and network activity (bytes sent and received) from OpenVidu Server every `SERVER_POLL_INTERVAL` milliseconds.

    - **OpenVidu session information**: every browser will perform a GET request to `/api/sessions/{SESSION_ID}` just before `sessionStable` or `sessionUnstable` test event is recorded.
