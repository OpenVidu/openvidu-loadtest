#!/bin/bash

# Smoke test for OpenVidu Load Test
# This script runs a basic end-to-end test with 2 participants
# Usage: ./run-smoke-test.sh <PLATFORM_URL> [PLATFORM_APIKEY] [PLATFORM_APISECRET]
# Example: ./run-smoke-test.sh https://openvidu.example.com:7443 mysecret mysecret

set -e  # Exit on any error

echo "Starting OpenVidu Load Test Smoke Test..."

# Check if docker-compose is available
if ! command -v docker-compose &> /dev/null; then
    echo "docker-compose not found. Please install docker-compose."
    exit 1
fi

# Check arguments
if [ $# -lt 1 ]; then
    echo "Usage: $0 <PLATFORM_URL> [PLATFORM_APIKEY] [PLATFORM_APISECRET]"
    echo "Example: $0 https://openvidu.example.com:7443 mykey mysecret"
    exit 1
fi

export PLATFORM_URL="$1"
export PLATFORM_APIKEY="${2:-devkey}"  # Default to "devkey" if not provided
export PLATFORM_APISECRET="${3:-secret}"  # Default to "secret" if not provided

# Configuration
E2E_TEST_DIR="$(dirname "$(realpath "$0")")/.."

# Setting env var config
export LOCAL_CONFIG_DIR="$E2E_TEST_DIR/config" 
export LOCAL_RESULTS_DIR="$E2E_TEST_DIR/results"
export LOADTEST_CONFIG="/config/smoke-test-config.yaml"

# Start services
echo "Starting services with docker-compose..."
docker-compose up --build -d

MAX_WAIT=120
ELAPSED=0
while [ $ELAPSED -lt $MAX_WAIT ]; do
    # Check if loadtest-controller has finished (results file exists)
    if [ -f "$LOCAL_RESULTS_DIR/results.txt" ]; then
        echo "Results file found. Test appears to be complete."
        break
    fi
    
    # Check if containers are still running
    RUNNING_CONTAINERS=$(docker-compose ps -q)
    if [ -z "$RUNNING_CONTAINERS" ]; then
        echo "No running containers found. Something went wrong."
        docker-compose logs
        exit 1
    fi
    
    sleep 5
    ELAPSED=$((ELAPSED + 5))
    echo "Waiting for test to complete... ($ELAPSED/$MAX_WAIT seconds)"
done

if [ $ELAPSED -ge $MAX_WAIT ]; then
    echo "Timeout waiting for test to complete after $MAX_WAIT seconds."
    docker-compose ps
    docker-compose logs
fi

# Stop services
echo "Stopping services..."
docker-compose down

    # Check results
    echo "Checking test results..."
    if [ -f "$LOCAL_RESULTS_DIR/results.txt" ]; then
        echo "=== TEST RESULTS ==="
        cat "$LOCAL_RESULTS_DIR/results.txt"
        echo "=== END RESULTS ==="
        
        # Validation - check for required strings in results
        VALIDATION_PASSED=true
        
        # Check for Test Case Report
        if grep -q "Test Case Report" "$LOCAL_RESULTS_DIR/results.txt"; then
            echo "✓ Found 'Test Case Report'"
        else
            echo "✗ Missing 'Test Case Report'"
            VALIDATION_PASSED=false
        fi
        
        # Check for Number of sessions created: 1
        if grep -q "Number of sessions created: 1" "$LOCAL_RESULTS_DIR/results.txt"; then
            echo "✓ Found 'Number of sessions created: 1'"
        else
            echo "✗ Missing 'Number of sessions created: 1'"
            VALIDATION_PASSED=false
        fi
        
        # Check for Number of participants created: 2
        if grep -q "Number of participants created: 2" "$LOCAL_RESULTS_DIR/results.txt"; then
            echo "✓ Found 'Number of participants created: 2'"
        else
            echo "✗ Missing 'Number of participants created: 2'"
            VALIDATION_PASSED=false
        fi
        
        # Check for Stop reason: Test finished
        if grep -q "Stop reason: Test finished" "$LOCAL_RESULTS_DIR/results.txt"; then
            echo "✓ Found 'Stop reason: Test finished'"
        else
            echo "✗ Missing 'Stop reason: Test finished'"
            VALIDATION_PASSED=false
        fi
        
        # Check for User start times:
        if grep -q "User start times:" "$LOCAL_RESULTS_DIR/results.txt"; then
            echo "✓ Found 'User start times:'"
        else
            echo "✗ Missing 'User start times:'"
            VALIDATION_PASSED=false
        fi
        
        # Check for user start time lines (pattern: Day Mon DD HH:MM:SS TZ YYYY | LoadTestSession | UserX)
        # Using a more flexible pattern that matches the expected format
        if grep -E "[A-Za-z]{3} [A-Za-z]{3} [0-9]{2} [0-9]{2}:[0-9]{2}:[0-9]{2} [A-Z]+ [0-9]{4} \| LoadTestSession[0-9]+ \| User[0-9]+" "$LOCAL_RESULTS_DIR/results.txt"; then
            echo "✓ Found user start time lines matching expected pattern"
        else
            echo "✗ Missing user start time lines matching expected pattern (e.g., 'Fri Mar 20 12:53:18 GMT 2026 | LoadTestSession1 | User1')"
            VALIDATION_PASSED=false
        fi
        
        if [ "$VALIDATION_PASSED" = true ]; then
            echo "SUCCESS: All validation checks passed."
        else
            echo "FAILURE: One or more validation checks failed."
        fi
        
        # Delete results file after reading
        echo "Deleting results file..."
        rm -f "$LOCAL_RESULTS_DIR/results.txt"
else
    echo "ERROR: Results file not found at $LOCAL_RESULTS_DIR/results.txt"
    exit 1
fi

echo "Smoke test completed successfully!"

exit 0