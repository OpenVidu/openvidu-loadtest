#!/bin/bash

# Central e2e test runner for OpenVidu Load Test
# This script runs a load test with the specified configuration and validates results
# Usage: ./run-e2e-test.sh <CONFIG_FILE> <VALIDATION_SCRIPT> <PLATFORM_URL> [API_KEY] [API_SECRET]
# Example: ./run-e2e-test.sh smoke-test-config.yaml validate-results.sh https://172-31-224-178.openvidu-local.dev:7443

set -e

echo "Starting OpenVidu Load Test E2E Test..."

# Check if docker compose is available
if ! command -v docker compose &> /dev/null; then
    echo "docker compose not found. Please install docker compose."
    exit 1
fi

# Check arguments
if [ $# -lt 3 ]; then
    echo "Usage: $0 <CONFIG_FILE> <VALIDATION_SCRIPT> <PLATFORM_URL> [API_KEY] [API_SECRET]"
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

# Clean previous results to avoid false positives
rm -f "$LOCAL_RESULTS_DIR/results.txt" "$LOCAL_RESULTS_DIR/report.html" "$LOCAL_RESULTS_DIR/docker-compose.log"

# Start services
echo "Starting services with docker compose..."
cd "$E2E_TEST_DIR"
docker compose up --build -d

MAX_WAIT=120
ELAPSED=0
while [ $ELAPSED -lt $MAX_WAIT ]; do
    # Check if loadtest-controller has finished (results and HTML report exist)
    if [ -f "$LOCAL_RESULTS_DIR/results.txt" ] && [ -f "$LOCAL_RESULTS_DIR/report.html" ]; then
        echo "Results and HTML report found. Test appears to be complete."
        break
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

# If results exist, wait for both containers to stop (max 30 seconds)
if [ -f "$LOCAL_RESULTS_DIR/results.txt" ]; then
    echo "Waiting for containers to stop..."
    TIMEOUT=30
    ELAPSED=0
    while [ $ELAPSED -lt $TIMEOUT ]; do
        RUNNING_CONTAINERS=$(docker compose ps --status running -q 2>/dev/null || true)
        if [ -z "$RUNNING_CONTAINERS" ]; then
            echo "All containers stopped."
            break
        fi
        sleep 2
        ELAPSED=$((ELAPSED + 2))
        echo "Waiting for containers to stop... ($ELAPSED/$TIMEOUT seconds)"
    done
    if [ $ELAPSED -ge $TIMEOUT ]; then
        echo "WARNING: Some containers did not stop within $TIMEOUT seconds."
    fi
fi

# Check if any containers are still running after shutdown
echo "Checking for leftover containers..."
REMAINING_CONTAINERS=$(docker compose ps --status running -q 2>/dev/null || true)
if [ -n "$REMAINING_CONTAINERS" ]; then
    echo "ERROR: Containers still running after shutdown:"
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

# Stop services
docker compose logs > "$LOCAL_RESULTS_DIR/docker-compose.log" 2>&1
echo "Stopping services..."
docker compose down

# Stop and remove any remaining selenium containers
SELENIUM_CONTAINERS=$(docker ps -aq --filter "name=selenium" 2>/dev/null || true)
if [ -n "$SELENIUM_CONTAINERS" ]; then
    echo "Removing remaining Selenium containers..."
    docker rm -f $SELENIUM_CONTAINERS >/dev/null 2>&1 || true
fi

if [ "${EXIT_CODE:-0}" -eq 0 ]; then
    echo "✓ All containers stopped successfully"
fi

# Run validation script
VALIDATION_SCRIPT_PATH="$SCRIPT_DIR/$VALIDATION_SCRIPT"
if [ ! -f "$VALIDATION_SCRIPT_PATH" ]; then
    echo "ERROR: Validation script not found at $VALIDATION_SCRIPT_PATH"
    exit 1
fi

bash "$VALIDATION_SCRIPT_PATH" "$LOCAL_RESULTS_DIR"
VALIDATION_EXIT_CODE=$?

if [ "${EXIT_CODE:-0}" -ne 0 ] || [ "$VALIDATION_EXIT_CODE" -ne 0 ]; then
    echo "E2E test failed."
    exit 1
fi

echo "E2E test completed successfully!"
exit 0
