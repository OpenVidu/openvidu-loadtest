# End-to-End Tests for OpenVidu Load Test

This directory contains end-to-end tests that validate the complete OpenVidu Load Test system, including the integration between the loadtest-controller and browser-emulator services.

## Test Structure

- `config/` - Contains configuration files for different test scenarios
- `scripts/` - Contains scripts to run the tests
- `results/` - Directory where test results will be stored

## Prerequisites

1. Docker and Docker Compose installed
2. An OpenVidu instance available for testing (you can use a local development installation)
3. The OpenVidu instance URL, API key, and API secret

## Smoke Test

The smoke test performs a basic end-to-end test with 2 participants in a single session using the N:N topology.

### Configuration

The smoke test script accepts command-line arguments for OpenVidu connection details:

```bash
cd e2e-tests/scripts
./run-smoke-test.sh <PLATFORM_URL> [PLATFORM_APIKEY] [PLATFORM_APISECRET]
```

Where:

- `PLATFORM_URL`: Required. The URL of your OpenVidu deployment (e.g., https://your-openvidu-url.io:7443)
- `PLATFORM_APIKEY`: Optional. API key for authentication (defaults to "devkey")
- `PLATFORM_APISECRET`: Optional. API secret for authentication (defaults to "secret")

### Configuration File

The smoke test uses the configuration file `config/smoke-test-config.yaml` which specifies `advanced.reportOutput: html,txt` to generate both text and HTML reports.

### Running the Smoke Test

```bash
# Example with all parameters
cd e2e-tests/scripts
./run-smoke-test.sh https://your-openvidu-url.io:7443 myapikey myapisecret

# Example with defaults for API key and secret
cd e2e-tests/scripts
./run-smoke-test.sh https://your-openvidu-url.io:7443
```

This script will:

1. Start both services using Docker Compose
2. Wait for the test to complete
3. Stop the services
4. Display and validate the test results

### Expected Results

The test should:

- Start both loadtest-controller and browser-emulator services
- Launch 2 Chrome browsers that connect to the OpenVidu instance
- Create a single session with 2 participants in N:N topology
- Generate results in the `results/` directory:
  - `results.txt` (text summary)
  - `report.html` (HTML report, with user retry details if retries occurred)
- Complete successfully and shut down cleanly

### Validation Checks

The smoke test validates that both `results.txt` and `report.html` files are generated and contain expected content.

**results.txt validation:**

- "Test Case Report"
- "Number of sessions created: 1"
- "Number of participants created: 2"
- "Stop reason: Test finished"
- "User start times:"
- User start time lines in the format: "Day Mon DD HH:MM:SS TZ YYYY | LoadTestSessionX | UserY"

**report.html validation:**

- "OpenVidu Load Test Report"
- "Sessions Created"
- "Total Participants"
- "User Connections" (mandatory)
- Table columns: User, Session, Join date (from successful connection), Disconnect Date (captured from ParticipantDisconnected websocket event), Retry Number (count of retries per user)
- Two user rows (User1 and User2) present

The smoke test configuration uses `advanced.reportOutput: html,txt` to generate both output formats. If validation fails, the result files are kept in the `results/` directory for debugging.

## Extending the Test Suite

Additional test scenarios can be added by:

1. Creating new configuration files in `configs/` directory
2. Adding new scripts in `scripts/` directory or modifying the existing one
3. Following the same pattern as the smoke test

Examples of additional test scenarios:

- Scaling tests with different participant counts
- Different topologies (N:M, TEACHING, etc.)
- Different browsers (Chrome vs Firefox)

## Notes

- Make sure your OpenVidu instance is accessible from the Docker containers
- For troubleshooting, check the Docker Compose logs with `docker-compose logs`
