# OpenVidu Load Test

A distributed load testing tool for performing stress tests against OpenVidu 3 deployments. Simulates realistic video conferencing scenarios with browser-emulated users.

# **Table of Contents**

1. [Quick Start](#quick-start)
2. [Project Architecture](#project-architecture)
3. [Configuration](#configuration)
4. [Advanced Options](#advanced-options)

## **Quick Start**

### Run your first test with Docker Compose

Docker Compose starts three services:

- **LiveKit server**: Acts as the media server used by OpenVidu 3
- **Browser-emulator**: The worker that launches Chrome browsers to connect to rooms
- **Loadtest-controller**: Orchestrates the test by coordinating the browser-emulator

The configuration file `config/config.yaml` defines the test:

```yaml
platform:
  url: http://livekit-server:7880
  apiKey: devkey
  apiSecret: secret

testcases:
  - topology: N:N
    participants:
      - "2"
    sessions: 1
    browser: chrome

workers:
  urls: browser-emulator
  disableHttps: true

distribution:
  manual: true
  usersPerWorker: 2
```

#### Configuration explanation

**platform**: Defines connection to the platform under test

- `url`: Points to the deployment, in this case the LiveKit server running in Docker. The hostname `livekit-server` is resolved by Docker Compose networking
- `apiKey` / `apiSecret`: Credentials for authentication with the platform

**testcases**: Defines a list of the tests that will be done. One test will be performed with the following configuration:

- `topology: N:N`: All participants publish video/audio and subscribe to all other participants
- `participants: ["2"]`: Test with 2 participants per session. If more elements are added to the list, the test will be repeated with each of those values (e.g. 2, 8, 100 participants)
- `sessions: 1`: Create a single session with the number of participants established above. To create sessions until the platform fails, set this to `infinite`
- `browser: chrome`: Use Chrome as the browser for the test

**workers**: Where the browsers run

- `urls: browser-emulator`: URL(s) of the workers to be used. Connect to the browser-emulator service running in Docker
- `disableHttps: true`: Disable HTTPS verification if your deployed platform does not use HTTPS. We enable it here since we're using HTTP locally

**distribution**: How participants are distributed across workers

- `manual: true`: Manually assign participants to workers
- `usersPerWorker: 2`: Each browser-emulator worker handles 2 participants maximum

This configuration tests a basic 2-user video call. The minimal setup makes it ideal for verifying the environment works correctly before running larger scale tests.

To run the test:

```bash
# Start all services with Docker Compose
docker compose up --build
```

The controller will execute the test cases and output results at `results/results.txt`.

For more detailed instructions on how to configure the tests, see [Configuration](#configuration).

### Large scale testing on AWS:

1. **Create browser-emulator AMI:**

   ```bash
   cd ./browser-emulator/aws/
   ./createAMI.sh --help
   ```

2. **Create security group** with at least port 5000 open.

3. **Configure** `config/config-aws.yaml`

## **Project Architecture**

![Load test architecture](resources/diagram.png)

- **Loadtest Controller**: Orchestrates the load test by coordinating browser-emulator workers. Reads configuration from `config/config.yaml` (see [Configuration](#configuration)).

- **Browser-emulator**: Worker service that connects to OpenVidu rooms, sending and receiving WebRTC media. Launches Chrome/Firefox browsers via Selenium.

## **Configuration**

The controller uses a YAML configuration file located in the `config` directory at the project root.

### Configuration File Location

- **Default**: `config/config.yaml`
- **Custom path**: Set `LOADTEST_CONFIG` environment variable

```bash
# Use a custom config file path
export LOADTEST_CONFIG=/path/to/my-config.yaml
```

When using Docker Compose, the `config` directory is mounted into the container, making it easy to edit configuration files on your host machine.

### Configuration Precedence

Environment variables override values in the config file:

```bash
export PLATFORM_URL=https://your-openvidu-url
export PLATFORM_APIKEY=your_api_key
export PLATFORM_APISECRET=your_api_secret
```

### Platform

Connection settings for the platform under test.

| Property    | Required | Default | Description                    |
| ----------- | -------- | ------- | ------------------------------ |
| `url`       | **Yes**  | -       | URL of the OpenVidu deployment |
| `apiKey`    | **Yes**  | -       | API key for authentication     |
| `apiSecret` | **Yes**  | -       | API secret for authentication  |

### Session

Naming and timing configuration for test sessions.

| Property                     | Required | Default           | Description                                 |
| ---------------------------- | -------- | ----------------- | ------------------------------------------- |
| `namePrefix`                 | No       | `LoadTestSession` | Prefix for session names                    |
| `usersNamePrefix`            | No       | `User`            | Prefix for participant names                |
| `secondsBetweenParticipants` | No       | `0`               | Seconds to wait between adding participants |
| `secondsBetweenSessions`     | No       | `0`               | Seconds to wait between sessions            |
| `secondsBetweenTestCases`    | No       | `0`               | Seconds to wait between test cases          |
| `secondsBeforeTestFinished`  | No       | `0`               | Seconds to wait before test ends            |

### Test Cases

Define multiple test scenarios that run sequentially. Each test case can have the following properties:

| Property                   | Required | Default   | Description                                                                                                |
| -------------------------- | -------- | --------- | ---------------------------------------------------------------------------------------------------------- |
| `topology`                 | **Yes**  | -         | `N:N`, `N:M`, `TEACHING`, `ONE_SESSION`, or `TERMINATE`                                                    |
| `participants`             | **Yes**  | -         | List of participant counts (e.g., `["2", "10"]`). Each element of the list will create a new test scenario |
| `sessions`                 | **Yes**  | -         | Number of sessions or `infinite`                                                                           |
| `browser`                  | No       | `chrome`  | Browser to use: `chrome` or `firefox`                                                                      |
| `resolution`               | No       | `640x480` | Try to force video to resolution: `640x480`, `1280x720`, `1920x1080`                                       |
| `frameRate`                | No       | `30`      | Try to force video frame rate                                                                              |
| `startingParticipants`     | No       | `0`       | Adds a configurable initial batch of participants                                                          |
| `headlessBrowser`          | No       | `false`   | Run browser in headless mode                                                                               |
| `browserRecording`         | No       | `false`   | Record browser output                                                                                      |
| `showBrowserVideoElements` | No       | `true`    | Show video elements in browser                                                                             |

**Topology Types:**

| Topology      | Description                            | Format   |
| ------------- | -------------------------------------- | -------- |
| `N:N`         | All participants publish and subscribe | `"10"`   |
| `N:M`         | N publishers, M subscribers            | `"5:50"` |
| `TEACHING`    | Publisher with audio-only subscribers  | `"2:30"` |
| `ONE_SESSION` | Single session with N participants     | `"100"`  |
| `TERMINATE`   | Terminate all EC2 instances            | (none)   |

### Workers

Configuration for where browsers run. Workers can be manually provided and managed (Local workers) or automatically managed on AWS.

#### Common settings

| Property       | Required | Default | Description                |
| -------------- | -------- | ------- | -------------------------- |
| `disableHttps` | No       | `false` | Disable HTTPS verification |

#### Local Workers

| Property | Required | Default | Description                 |
| -------- | -------- | ------- | --------------------------- |
| `urls`   | **Yes**  | -       | Comma-separated worker URLs |

#### AWS Workers

| Property           | Required | Default      | Description                                                      |
| ------------------ | -------- | ------------ | ---------------------------------------------------------------- |
| `accessKey`        | **Yes**  | -            | AWS access key                                                   |
| `secretAccessKey`  | **Yes**  | -            | AWS secret access key                                            |
| `amiId`            | **Yes**  | -            | AMI ID for worker instances                                      |
| `instanceType`     | No       | `c5.xlarge`  | EC2 instance type                                                |
| `keyPairName`      | No       | -            | EC2 key pair name                                                |
| `securityGroupId`  | No       | -            | Security group ID                                                |
| `region`           | No       | `us-east-1`  | AWS region                                                       |
| `availabilityZone` | No       | `us-east-1f` | AWS availability zone                                            |
| `workersAtStart`   | No       | `0`          | Number of instances to start the test with                       |
| `rampUpWorkers`    | No       | `0`          | Workers instances to add when the test runs out of existing ones |
| `forceContinue`    | No       | `false`      | Continue the test if there are not enough workers                |

### Distribution

How participants are distributed across workers.

| Property         | Required          | Default | Description                                                                                                                              |
| ---------------- | ----------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `manual`         | No                | `false` | Use manual distribution. If false, a preliminary test will be run to determine the number of users required to reach the target CPU load |
| `maxLoadPercent` | No                | `70`    | If `manual: false`, when CPU load exceeds this percentage, new workers will be started                                                   |
| `usersPerWorker` | If `manual: true` | -       | Max number of users per worker                                                                                                           |

### Video

Video source and quality settings. Note: these options will be ignored when using firefox, which does not support custom video sources.

| Property         | Required          | Default | Description                                                                                                                          |
| ---------------- | ----------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `type`           | No                | `BUNNY` | Video type: `BUNNY`, `INTERVIEW`, `GAME`, `CUSTOM`. The first 3 options are pre-defined video sources provided by the OpenVidu team. |
| `width`          | No                | `640`   | Video width in pixels                                                                                                                |
| `height`         | No                | `480`   | Video height in pixels                                                                                                               |
| `fps`            | No                | `30`    | Frames per second                                                                                                                    |
| `customVideoUrl` | If `type: CUSTOM` | -       | URL to custom video file                                                                                                             |
| `customAudioUrl` | If `type: CUSTOM` | -       | URL to custom audio file                                                                                                             |

The predefined options available are:

- **BUNNY**:
  - Available resolutions: 640x480, 1280x720, 1920x1080
  - Available frame rates: 30fps, 60fps
- **INTERVIEW**:
  - Available resolutions: 640x480
  - Available frame rates: 30fps
- **GAME**:
  - Available resolutions: 640x480
  - Available frame rates: 30fps

### Monitoring

Elasticsearch and Kibana integration for metrics visualization. Expects Elastichsearch 9.x and Kibana 9.x.

| Property                 | Required | Default | Description            |
| ------------------------ | -------- | ------- | ---------------------- |
| `elasticsearch.host`     | No       | -       | Elasticsearch URL      |
| `elasticsearch.username` | No       | -       | Elasticsearch username |
| `elasticsearch.password` | No       | -       | Elasticsearch password |
| `kibana.host`            | No       | -       | Kibana URL             |

### Advanced User Management Options

Performance and retry settings.

| Property                                 | Required | Default         | Description                                                                                                                                                              |
| ---------------------------------------- | -------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `advanced.retry.enabled`                 | No       | `true`          | Enable participant insertion retries on failure                                                                                                                          |
| `advanced.retry.times`                   | No       | `5`             | Number of retry attempts                                                                                                                                                 |
| `advanced.batches.enabled`               | No       | `true`          | Enable batch mode: Users will be inserted in batches                                                                                                                     |
| `advanced.batches.maxConcurrentRequests` | No       | `CPU cores + 1` | Max concurrent requests when in batch mode                                                                                                                               |
| `advanced.waitForCompletion`             | No       | `true`          | Wait for all participants in the batch to confirm insertion into the platform before inserting the next batch. Will wait for individual participants if `batches: false` |

### Environment Variables

All configuration values can be set via environment variables. Environment variables take precedence over config file values. Any configuration value can be overridden by an environment variable. Some examples are:

| Variable                | Description                 |
| ----------------------- | --------------------------- |
| `PLATFORM_URL`          | Platform URL                |
| `PLATFORM_APIKEY`       | API key                     |
| `PLATFORM_APISECRET`    | API secret                  |
| `WORKERS_URLS`          | Comma-separated worker URLs |
| `AWS_ACCESS_KEY`        | AWS access key              |
| `AWS_SECRET_ACCESS_KEY` | AWS secret key              |
| `STORAGE_BUCKET`        | S3 bucket for recordings    |

### Example Configurations

| File                     | Purpose                   |
| ------------------------ | ------------------------- |
| `config/config.yaml`     | Default configuration     |
| `config/config-all.yaml` | All configuration options |
| `config/config-aws.yaml` | Production AWS deployment |

## **Advanced Options**

See [Advanced Configuration Options](docs/advanced-options.md) for:

- QoE Analysis configuration
- Recording settings
- Custom video sources
- Storage configuration for saving recordings and raw statistics

---

# Acknowledgments

This work has been supported by the Regional Government of Madrid (Spain) (CM) through project EDGEDATA-CM (P2018/TCS-4499) co-funded by FSE & FEDER.
