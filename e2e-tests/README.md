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

### Common Flags

Both `run-e2e-test.sh` and `run-all-e2e-tests.sh` accept:

- `--keep-running`, `-k` - Keep Docker services running after the test completes (useful for debugging)
- `--keep-results`, `-r` - Skip deleting previous `results/*.txt`/`results/*.html` before the run, and skip the validation script's own cleanup of its result files on success; reports from every run remain in the `results/` directory

`run-e2e-test.sh` additionally accepts `--no-build`/`-n` (skip image build) and `--elk` (start the ELK stack).

## Running All Tests

To run all e2e tests in one command:

```bash
cd e2e-tests/scripts
./run-all-e2e-tests.sh [--keep-running|-k] [--keep-results|-r] <PLATFORM_URL> [API_KEY] [API_SECRET]

# Example
./run-all-e2e-tests.sh https://172-31-224-178.openvidu-local.dev:7443 devkey secret

# Keep the results/ directory from being wiped before each test, so every
# test's results-*.txt and report-*.html remain available for inspection afterwards
./run-all-e2e-tests.sh --keep-results https://172-31-224-178.openvidu-local.dev:7443 devkey secret
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
./run-e2e-test.sh smoke-test-config.yaml validate-default.sh <PLATFORM_URL> [API_KEY] [API_SECRET]

# Keep previous results in place instead of deleting them before the run
./run-e2e-test.sh --keep-results smoke-test-config.yaml validate-default.sh <PLATFORM_URL> [API_KEY] [API_SECRET]
```

### Emulated Browser Test

```bash
cd e2e-tests/scripts
./run-e2e-test.sh emulated-smoke-test-config.yaml validate-default.sh <PLATFORM_URL> [API_KEY] [API_SECRET]
```

### Multi-emulated Browser Test (LOADTEST mode)

Requires a LiveKit platform (LOADTEST mode uses LiveKit's native `lk load-test`, see the root README's "LOADTEST mode" section).

```bash
cd e2e-tests/scripts
./run-e2e-test.sh multi-emulated-smoke-test-config.yaml validate-default.sh <PLATFORM_URL> [API_KEY] [API_SECRET]
```

### ELK Smoke Test (validates Metricbeat + Kibana integration)

```bash
cd e2e-tests/scripts
./run-e2e-test.sh --elk elk-smoke-test-config.yaml validate-elk-smoke-test.sh <PLATFORM_URL> [API_KEY] [API_SECRET]
```

### Multi-emulated ELK Smoke Test (LOADTEST mode + Metricbeat/Kibana integration)

Same scenario and validations as the ELK Smoke Test above, but using multi-emulated browsers (LOADTEST mode) instead of Chrome. Requires a LiveKit platform.

```bash
cd e2e-tests/scripts
./run-e2e-test.sh --elk multi-emulated-elk-smoke-test-config.yaml validate-multi-emulated-elk-smoke-test.sh <PLATFORM_URL> [API_KEY] [API_SECRET]
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

| Config file                       | Validation script (if exists)       | Fallback              |
| --------------------------------- | ----------------------------------- | --------------------- |
| `smoke-test-config.yaml`          | `validate-smoke-test.sh`            | `validate-default.sh` |
| `emulated-smoke-test-config.yaml` | `validate-emulated-smoke-test.sh`   | `validate-default.sh` |
| `elk-smoke-test-config.yaml`      | `validate-elk-smoke-test.sh`        | `validate-default.sh` |
| `multi-emulated-elk-smoke-test-config.yaml` | `validate-multi-emulated-elk-smoke-test.sh` (delegates to `validate-elk-smoke-test.sh`) | `validate-default.sh` |
| `load-test-config.yaml`           | `validate-load-test.sh`             | `validate-default.sh` |

## Expected Results

All smoke tests should:

- Start all services (loadtest-controller, browser-emulator, elasticsearch, kibana, metricbeat-masternode, metricbeat-medianode)
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

### ELK Smoke Test Additional Validation

The ELK smoke test (`elk-smoke-test-config.yaml`) adds these validations on top of the default checks:

**Elasticsearch validation:**

- Elasticsearch is reachable at `http://localhost:9200`
- `metricbeat-*` has ≥1 document with `fields.node_role:masternode`
- `metricbeat-*` has ≥1 document with `fields.node_role:medianode`
- `metricbeat-*` has ≥1 document with `fields.node_role:browseremulator`
- `loadtest-openvidu-metrics-*` has 0 documents (controller does not index platform metrics)
- `loadtest-webrtc-stats-*` has exactly 2 documents: one with `new_participant_id:User1` and one with `new_participant_id:User2`, both with `node_role:browseremulator`

**Kibana URL validation:**

- Text report contains `Kibana url: http://kibana:5601/app/kibana#/dashboard/...`
- HTML report contains a clickable link `<a href="http://kibana:5601/app/kibana#/dashboard/..."`

**How it works:**

The test config sets `monitoring.elasticsearch.host` (so the controller passes it to the browser-emulator, which launches its own Metricbeat) and `monitoring.kibana.host` (so dashboards are imported and the report includes a dashboard URL). Grafana is intentionally omitted — the controller's `collectPlatformMetrics()` returns an empty list, so `indexPlatformMetrics()` is never called, and no documents are written to `loadtest-openvidu-metrics-*`.

If validation fails, the result files are kept in the `results/` directory for debugging. On success, the validation scripts normally delete the result files — pass `--keep-results`/`-r` to keep them regardless of the validation outcome.

## Notes

- Make sure your OpenVidu instance is accessible from the Docker containers
- For troubleshooting, check the Docker Compose logs with `docker compose logs`
- Tests run sequentially to avoid resource conflicts
