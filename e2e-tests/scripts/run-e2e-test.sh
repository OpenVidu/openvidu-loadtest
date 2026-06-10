#!/bin/bash

# Central e2e test runner for OpenVidu Load Test
# This script runs a load test with the specified configuration and validates results
# Usage: ./run-e2e-test.sh [--keep-running|-k] [--no-build|-n] [--elk] <CONFIG_FILE> <VALIDATION_SCRIPT> <PLATFORM_URL> [API_KEY] [API_SECRET]
# Example: ./run-e2e-test.sh smoke-test-config.yaml validate-results.sh https://172-31-224-178.openvidu-local.dev:7443
# Flags:
#   --keep-running, -k  Keep Docker services running after test completion (useful for debugging)
#   --no-build, -n      Skip docker image build (use existing images)
#   --elk               Start ELK stack (Elasticsearch, Kibana, Metricbeat)

set -e

EXIT_CODE=0
KEEP_RUNNING=false
NO_BUILD=false
ELK_PROFILE=""

# Parse flags
PASSTHROUGH_ARGS=()
for arg in "$@"; do
    case "$arg" in
        --keep-running|-k)
            KEEP_RUNNING=true
            ;;
        --no-build|-n)
            NO_BUILD=true
            ;;
        --elk)
            ELK_PROFILE=" --profile elk"
            ;;
        *)
            PASSTHROUGH_ARGS+=("$arg")
            ;;
    esac
done
set -- "${PASSTHROUGH_ARGS[@]}"

echo "Starting OpenVidu Load Test E2E Test..."

# Check if docker compose is available
if ! command -v docker compose &> /dev/null; then
    echo "docker compose not found. Please install docker compose."
    exit 1
fi

# Check arguments
if [ $# -lt 3 ]; then
    echo "Usage: $0 [--keep-running|-k] [--no-build|-n] [--elk] <CONFIG_FILE> <VALIDATION_SCRIPT> <PLATFORM_URL> [API_KEY] [API_SECRET]"
    echo "Example: $0 smoke-test-config.yaml validate-results.sh https://openvidu.example.com:7443 devkey secret"
    exit 1
fi

CONFIG_FILE="$1"
VALIDATION_SCRIPT="$2"
PLATFORM_URL="$3"
PLATFORM_APIKEY="${4:-devkey}"
PLATFORM_APISECRET="${5:-secret}"

# Configuration
SCRIPT_DIR="$(dirname "$(realpath "$0")")"
E2E_TEST_DIR="$(realpath "$SCRIPT_DIR/..")"

export PLATFORM_URL
export PLATFORM_APIKEY
export PLATFORM_APISECRET
export LOADTEST_CONFIG="/config/$CONFIG_FILE"
export LOCAL_CONFIG_DIR="$E2E_TEST_DIR/config"
export LOCAL_RESULTS_DIR="$E2E_TEST_DIR/results"
export MEDIAFILES_HOST_DIR="$E2E_TEST_DIR/../browser-emulator/mediafiles"
export SCRIPTS_LOGS_HOST_DIR="$E2E_TEST_DIR/../browser-emulator/logs"
export METRICBEAT_CONFIG="$E2E_TEST_DIR/../browser-emulator/src/assets/metricbeat-config/metricbeat.yml"

# Auto-detect host user/group IDs for non-root container execution
export HOST_UID="${HOST_UID:-$(id -u)}"
export HOST_GID="${HOST_GID:-$(id -g)}"
if [ -z "${DOCKER_GID:-}" ] && [ -e /var/run/docker.sock ]; then
	export DOCKER_GID=$(stat -c '%g' /var/run/docker.sock 2>/dev/null || echo "")
fi
export DOCKER_GID="${DOCKER_GID:-1001}"

# Ensure /tmp/openvidu-loadtest exists and is world-writable
# Docker bind mounts create this directory as root:root 755 by default,
# but browser-emulator (running as non-root UID 1000) needs write access.
if [ ! -d /tmp/openvidu-loadtest ]; then
	mkdir -m 777 /tmp/openvidu-loadtest
fi

# Clean previous results to avoid false positives
rm -f $LOCAL_RESULTS_DIR/results-*.txt $LOCAL_RESULTS_DIR/report-*.html $LOCAL_RESULTS_DIR/docker-compose.log

# Start services
echo "Starting services with docker compose..."
cd "$E2E_TEST_DIR"
if [ "$NO_BUILD" = true ]; then
    # shellcheck disable=SC2086
    docker compose up$ELK_PROFILE -d
else
    # shellcheck disable=SC2086
    docker compose up$ELK_PROFILE --build -d
fi

MAX_WAIT=120
ELAPSED=0
while [ $ELAPSED -lt $MAX_WAIT ]; do
    # Check if loadtest-controller has finished (results and HTML report exist)
    TXT_REPORT=$(ls -t $LOCAL_RESULTS_DIR/results-*.txt 2>/dev/null | head -1)
    HTML_REPORT=$(ls -t $LOCAL_RESULTS_DIR/report-*.html 2>/dev/null | head -1)
    if [ -n "$TXT_REPORT" ] && [ -n "$HTML_REPORT" ]; then
        echo "Results and HTML report found. Test appears to be complete."
        break
    fi
    
    # Check if loadtest-controller has exited without producing results
    CONTROLLER_STATE=$(docker inspect --format='{{.State.Status}}' loadtest-controller-e2e 2>/dev/null || echo "unknown")
    if [ "$CONTROLLER_STATE" = "exited" ]; then
        echo "loadtest-controller has exited without producing results. Test failed."
        docker compose logs loadtest-controller
        exit 1
    fi
    
    # Check if containers are still running
    RUNNING_CONTAINERS=$(docker compose ps -q)
    if [ -z "$RUNNING_CONTAINERS" ]; then
        echo "No running containers found. Something went wrong."
        docker compose logs
        exit 1
    fi
    
    sleep 5
    ELAPSED=$((ELAPSED + 5))
    echo "Waiting for test to complete... ($ELAPSED/$MAX_WAIT seconds)"
done

if [ $ELAPSED -ge $MAX_WAIT ]; then
    echo "Timeout waiting for test to complete after $MAX_WAIT seconds."
    docker compose ps
    docker compose logs
fi

# Save logs before stopping anything
docker compose logs > "$LOCAL_RESULTS_DIR/docker-compose.log" 2>&1

# Run validation script while services are still up (ELK test needs ES/Kibana running)
VALIDATION_SCRIPT_PATH="$SCRIPT_DIR/$VALIDATION_SCRIPT"
if [ ! -f "$VALIDATION_SCRIPT_PATH" ]; then
    echo "ERROR: Validation script not found at $VALIDATION_SCRIPT_PATH"
    exit 1
fi

set +e
bash "$VALIDATION_SCRIPT_PATH" "$LOCAL_RESULTS_DIR"
VALIDATION_EXIT_CODE=$?
set -e

if [ "$KEEP_RUNNING" = true ]; then
    echo "Skipping service shutdown (--keep-running flag is set)."
    echo "Docker services are still running. Stop them manually with:"
    echo "  docker compose down -t 60"
else
    # Stop all services
    echo "Stopping services..."
    docker compose down -t 60

    # Stop and remove any remaining selenium containers
    SELENIUM_CONTAINERS=$(docker ps -aq --filter "name=selenium" 2>/dev/null || true)
    if [ -n "$SELENIUM_CONTAINERS" ]; then
        echo "Removing remaining Selenium containers..."
        docker rm -f $SELENIUM_CONTAINERS >/dev/null 2>&1 || true
    fi

    if [ "${EXIT_CODE:-0}" -eq 0 ] && [ "$VALIDATION_EXIT_CODE" -eq 0 ]; then
        echo "✓ All containers stopped successfully"
    fi

    # Check for any containers still running or created
    echo "Checking for leftover containers..."
    REMAINING_CONTAINERS=$(docker compose ps -q 2>/dev/null || true)
    if [ -n "$REMAINING_CONTAINERS" ]; then
        echo "ERROR: Containers still remaining after shutdown:"
        docker compose ps
        EXIT_CODE=1
    fi

    # Check for any Selenium browser containers that might have been left running
    echo "Checking for leftover Selenium containers..."
    SELENIUM_CONTAINERS=$(docker ps -q --filter "name=selenium" 2>/dev/null || true)
    if [ -n "$SELENIUM_CONTAINERS" ]; then
        echo "ERROR: Selenium containers still running:"
        docker ps --filter "name=selenium"
        EXIT_CODE=1
    fi
fi

if [ "${EXIT_CODE:-0}" -ne 0 ] || [ "$VALIDATION_EXIT_CODE" -ne 0 ]; then
    echo "E2E test failed."
    exit 1
fi

echo "E2E test completed successfully!"
if [ "$KEEP_RUNNING" = true ]; then
    echo "(Docker services left running as requested)"
fi
exit 0
