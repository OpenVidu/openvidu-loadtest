# OpenVidu Load Test

This repository aims to facilitate the definition, execution and review of massive load testing scenarios of an OpenVidu application in a distributed cluster of containerized browsers, located in Amazon Web Services Cloud.

Number of total sessions and participants must be customizable. Test will have the following default conditions:

- Every participant will be connecting from a single browser. Eveyr browser will be launched in its own Docker container with fixed resource configuration (available RAM, number of cores and bandwidth)
- Every browser will be a Chrome instance launched with the following options: `allow-file-access-from-files`, `use-file-for-fake-video-capture=fakevideo.y4m`, `use-file-for-fake-audio-capture=fakeaudio.wav`, `window-size=1980,1280`
- OpenVidu will be deployed in a dedicated EC2 machine. Every OpenVidu session (and therefore every dockerized browser) will be connecting to this same instance
- Each session will have 7 participants (7 publishers and 42 subscribers)
- Each video will have a resolution of 540×360 pixels, 30 fps
- Each browser will be responsible of obtaining the necessary token to connect to its specific test session (URL will contain as parameters the secret, the session identifier and the ip where to perform REST operations, so the JavaScript code can get the token)
- Any kind of complexity in the client code will be avoided: just HTML videos displaying the local and remote streams
- Every RTCPeerConnection object will be exposed to gather statistics thanks to method getStats()
- The following statistics will be the ones gathered for each RTCPeerConnection object: Sender Round-Trip-Time (googRtt), Receviers Round-Trip-Time (googRtt), Received Bit-Rate, Sent Bit-Rate, Packet loss
- Every browser will be monitored to ensure each one of the 7 videos is playing media

The testing process for every client node will be:

1. Launch Chrome with the required flags (selenium code in the test orchestrator will launch every client node)
2. Wait fot the testing web application to load. This static web app will be hosted in the same EC22 machine as OpenVidu Server. RECORD TIME
3. Wait for the browser to connect to the session in OpenVidu Server (`connectionCreated` event). RECORD TIME
4. Wait for the local video to be playing (`videoPlaying` event). RECORD TIME
5. Wait for each one of the 6 remote videos to be playing (`videoPlaying` event). RECORD TIME
6. Gather statistics. Each call to getStats over each RTCPeerConnection object (7 calls to getStats in total) will take place every second, n times (n=8 by default)
7. Close browser


## Configuration parameters

Configuration properties when running `mvn test` in `selenium-test/.` (configure with `-DPROPERTY_NAME=property_value`)

- `OPENVIDU_SECRET`: secret of OpenVidu Server. Default value = `MY_SECRET`
- `OPENVIDU_URL`: url of OpenVidu Server. Default value = `https://localhost:4443/`
- `APP_URL`: url of the web application where to connect the browsers to perform the test. Default value = `http://localhost:8080/`
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
- `DOWNLOAD_OPENVIDU_LOGS`: whether to download OpenVidu Server and Kurento Media Server logs from the SuT machine or not at the end of the test. This includes downloading file `openvidu.log` (outuput from OpenVidu Server Java process), `errors.log` (error output from Kurento Media Server), `20*.log` (standard output from Kurento Media Server) and `turn_*.log` (coturn server logs). All logs will be downloaded through _scp_ thanks to `SERVER_SSH_USER` and `PRIVATE_KEY_PATH` properties, and will be properly stored under `RESULTS_PATH` parent directory. Default value = `true`
- `TCPDUMP_CAPTURE_TIME`: how long network packet information should be captured in each browser (only applies if `REMOTE` is true). The `tcpdump` process will always start before connecting to OpenVidu session. The it will run for `TCPDUMP_CAPTURE_TIME` seconds, storing the results in a log file (_tcpdump.pcap_) that will be downloaded to the test node just before terminating the browser's instance. If you don't want this information to be colleccted, just set this property to `0`. Default value: `5`


## Results format

The resulting output file (configured with parameter `RESULTS_PATH`) contains one JSON formatted string in each line. It can be:

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