#!/bin/bash

# Smoke test for OpenVidu Load Test
# This script runs a basic end-to-end test with 2 participants
# Usage: ./run-smoke-test.sh <PLATFORM_URL> [PLATFORM_APIKEY] [PLATFORM_APISECRET]
# Example: ./run-smoke-test.sh https://openvidu.example.com:7443 mysecret mysecret

set -e  # Exit on any error

echo "Starting OpenVidu Load Test Smoke Test..."
EXIT_CODE=0

# Check if docker compose is available
if ! command -v docker compose &> /dev/null; then
    echo "docker compose not found. Please install docker compose."
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
# Clean previous results to avoid false positives
rm -f "$LOCAL_RESULTS_DIR/results.txt" "$LOCAL_RESULTS_DIR/report.html" "$LOCAL_RESULTS_DIR/docker-compose.log"
# Start services
echo "Starting services with docker compose..."
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
docker compose logs > $LOCAL_RESULTS_DIR/docker-compose.log 2>&1
echo "Stopping services..."
docker compose down
# Stop and remove any remaining selenium containers
SELENIUM_CONTAINERS=$(docker ps -aq --filter "name=selenium" 2>/dev/null || true)
if [ -n "$SELENIUM_CONTAINERS" ]; then
    echo "Removing remaining Selenium containers..."
    docker rm -f $SELENIUM_CONTAINERS >/dev/null 2>&1 || true
fi

if [ $EXIT_CODE -eq 0 ]; then
    echo "✓ All containers stopped successfully"
fi

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
        
        # Check for user start time lines (pattern: Day Mon DD HH:MM:SS TZ YYYY | session | user)
        # Using a flexible pattern that matches any session/user values (including empty)
        if grep -E "[A-Za-z]{3} [A-Za-z]{3} [0-9]{2} [0-9]{2}:[0-9]{2}:[0-9]{2} [A-Z]+ [0-9]{4} \\| [^|]* \\| [^|]*" "$LOCAL_RESULTS_DIR/results.txt"; then
            echo "✓ Found user start time lines matching expected pattern"
        else
            echo "✗ Missing user start time lines matching expected pattern (e.g., 'Fri Mar 20 12:53:18 GMT 2026 | LoadTestSession1 | User1')"
            VALIDATION_PASSED=false
        fi
        
        # HTML report validation
        HTML_VALIDATION_PASSED=true
        HTML_FILE="$LOCAL_RESULTS_DIR/report.html"
        if [ -f "$HTML_FILE" ]; then
            echo "✓ HTML report found"
            
            # Check for basic HTML structure
            if grep -q "OpenVidu Load Test Report" "$HTML_FILE"; then
                echo "✓ HTML contains 'OpenVidu Load Test Report'"
            else
                echo "✗ HTML missing 'OpenVidu Load Test Report'"
                HTML_VALIDATION_PASSED=false
            fi
            
            # Check for sessions created
            if grep -q "Sessions Created" "$HTML_FILE"; then
                echo "✓ HTML contains 'Sessions Created'"
            else
                echo "✗ HTML missing 'Sessions Created'"
                HTML_VALIDATION_PASSED=false
            fi
            
            # Check for total participants
            if grep -q "Total Participants" "$HTML_FILE"; then
                echo "✓ HTML contains 'Total Participants'"
            else
                echo "✗ HTML missing 'Total Participants'"
                HTML_VALIDATION_PASSED=false
            fi
            
            # Check for User Connections section (mandatory)
            if grep -q "User Connections" "$HTML_FILE"; then
                echo "✓ HTML contains 'User Connections'"
                # Check for new column headers
                if grep -q "Join date" "$HTML_FILE" && grep -q "Disconnect Date" "$HTML_FILE" && grep -q "Retry Number" "$HTML_FILE"; then
                    echo "✓ HTML contains new table columns"
                    # Check for two user rows (User1 and User2)
                    if grep -q "User1" "$HTML_FILE" && grep -q "User2" "$HTML_FILE"; then
                        echo "✓ HTML contains two user rows"
                    else
                        echo "✗ HTML missing user rows (expected User1 and User2)"
                        HTML_VALIDATION_PASSED=false
                    fi
                else
                    echo "✗ HTML missing new table columns"
                    HTML_VALIDATION_PASSED=false
                fi
            else
                echo "✗ HTML missing 'User Connections'"
                HTML_VALIDATION_PASSED=false
            fi
            
            # HTML file will be deleted later if validation passes
        else
            echo "✗ HTML report not found at $HTML_FILE"
            HTML_VALIDATION_PASSED=false
        fi
        
        # Combine validation results
        if [ "$VALIDATION_PASSED" = true ] && [ "$HTML_VALIDATION_PASSED" = true ]; then
            echo "SUCCESS: All validation checks passed."
        else
            echo "FAILURE: One or more validation checks failed."
            EXIT_CODE=1
        fi
        
        # Delete result files only if validation passed
        if [ $EXIT_CODE -eq 0 ]; then
            echo "Deleting result files..."
            rm -f "$LOCAL_RESULTS_DIR/results.txt"
            rm -f "$HTML_FILE"
            rm -f "$LOCAL_RESULTS_DIR/docker-compose.log"
        else
            echo "Keeping result files for debugging."
        fi
else
    echo "ERROR: Results file or HTML report not found at $LOCAL_RESULTS_DIR/results.txt or report.html"
    EXIT_CODE=1
fi

if [ $EXIT_CODE -eq 0 ]; then
    echo "Smoke test completed successfully!"
fi
exit $EXIT_CODE