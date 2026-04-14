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

## Script Architecture

The e2e test scripts follow a modular architecture:

- **`run-all-e2e-tests.sh`** - Unified test runner that discovers and runs all tests sequentially
- **`run-e2e-test.sh`** - Central test runner for a single test (called by unified runner)
- **`validate-default.sh`** - Default validation script for smoke test expectations

## Running All Tests

To run all e2e tests in one command:

```bash
cd e2e-tests/scripts
./run-all-e2e-tests.sh <PLATFORM_URL> [API_KEY] [API_SECRET]

# Example
./run-all-e2e-tests.sh https://172-31-224-178.openvidu-local.dev:7443 devkey secret
```

The unified runner will:

1. Discover all `*-config.yaml` files in the `config/` directory
2. Map each config to its validation script using convention (see below)
3. Run each test sequentially
4. Print a summary of all test results

## Running Individual Tests

### Smoke Test (Chrome)

```bash
cd e2e-tests/scripts
./run-e2e-test.sh emulated-smoke-test-config.yaml validate-default.sh <PLATFORM_URL> [API_KEY] [API_SECRET]
```

### Emulated Browser Test

```bash
cd e2e-tests/scripts
./run-e2e-test.sh smoke-test-config.yaml validate-default.sh <PLATFORM_URL> [API_KEY] [API_SECRET]
```

## Test Discovery and Validation Mapping

The unified runner uses convention-based mapping to determine which validation script to use for each config file:

1. For a config file named `foo-config.yaml`, the runner looks for `validate-foo.sh`
2. If a specific validation script is not found, it falls back to `validate-default.sh`

**Example:**

- `smoke-test-config.yaml` → looks for `validate-smoke-test.sh` → falls back to `validate-default.sh`
- `emulated-smoke-test-config.yaml` → looks for `validate-emulated-smoke-test.sh` → falls back to `validate-default.sh`

## Adding New Test Types

To add a new test type:

1. **Create a configuration file** in `config/` (e.g., `my-test-config.yaml`)

2. **Optionally create a validation script** in `scripts/` if the expected results differ from the default:
   - Name it `validate-my-test.sh` (matching the config name without `-config.yaml`)
   - If not created, `validate-default.sh` will be used automatically

3. **No workflow changes needed** - the unified runner automatically discovers and runs all config files

## Configuration-Validation Mapping Examples

| Config file                       | Validation script (if exists)     | Fallback              |
| --------------------------------- | --------------------------------- | --------------------- |
| `smoke-test-config.yaml`          | `validate-smoke-test.sh`          | `validate-default.sh` |
| `emulated-smoke-test-config.yaml` | `validate-emulated-smoke-test.sh` | `validate-default.sh` |
| `load-test-config.yaml`           | `validate-load-test.sh`           | `validate-default.sh` |

## Expected Results

All smoke tests should:

- Start both loadtest-controller and browser-emulator services
- Create a single session with 2 participants in N:N topology
- Generate results in the `results/` directory:
  - `results-{timestamp}.txt` (text summary)
  - `report-{timestamp}.html` (HTML report)
- Complete successfully and shut down cleanly

### Validation Checks (Default)

**results-{timestamp}.txt validation:**

- \"Test Case Report\"
- \"Number of sessions created: 1\"
- \"Number of participants created: 2\"
- \"Stop reason: Test finished\"
- \"User start times:\"
- User start time lines in the format: \"Day Mon DD HH:MM:SS TZ YYYY | LoadTestSessionX | UserY\"

**report-{timestamp}.html validation:**

- "OpenVidu Load Test Report"
- "Sessions Created"
- "Total Participants"
- "User Connections" (mandatory)
 - Table columns: User, Session, Join Date, Retries, Retry Details
- Two user rows (User1 and User2) present

If validation fails, the result files are kept in the `results/` directory for debugging.

## Notes

- Make sure your OpenVidu instance is accessible from the Docker containers
- For troubleshooting, check the Docker Compose logs with `docker compose logs`
- Tests run sequentially to avoid resource conflicts
