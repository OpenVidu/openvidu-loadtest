#!/bin/bash

# Validation script for OpenVidu Load Test e2e results
# This script validates that results contain expected smoke test output
# Usage: ./validate-results.sh <RESULTS_DIR>
# Returns exit code 0 on success, 1 on failure

set -e

RESULTS_DIR="${1:?Results directory required}"

EXIT_CODE=0

echo "Checking test results..."
if [ -f "$RESULTS_DIR/results.txt" ]; then
    echo "=== TEST RESULTS ==="
    cat "$RESULTS_DIR/results.txt"
    echo "=== END RESULTS ==="
    
    VALIDATION_PASSED=true
    
    # Check for Test Case Report
    if grep -q "Test Case Report" "$RESULTS_DIR/results.txt"; then
        echo "✓ Found 'Test Case Report'"
    else
        echo "✗ Missing 'Test Case Report'"
        VALIDATION_PASSED=false
    fi
    
    # Check for Number of sessions created: 1
    if grep -q "Number of sessions created: 1" "$RESULTS_DIR/results.txt"; then
        echo "✓ Found 'Number of sessions created: 1'"
    else
        echo "✗ Missing 'Number of sessions created: 1'"
        VALIDATION_PASSED=false
    fi
    
    # Check for Number of participants created: 2
    if grep -q "Number of participants created: 2" "$RESULTS_DIR/results.txt"; then
        echo "✓ Found 'Number of participants created: 2'"
    else
        echo "✗ Missing 'Number of participants created: 2'"
        VALIDATION_PASSED=false
    fi
    
    # Check for Stop reason: Test finished
    if grep -q "Stop reason: Test finished" "$RESULTS_DIR/results.txt"; then
        echo "✓ Found 'Stop reason: Test finished'"
    else
        echo "✗ Missing 'Stop reason: Test finished'"
        VALIDATION_PASSED=false
    fi
    
    # Check for User start times:
    if grep -q "User start times:" "$RESULTS_DIR/results.txt"; then
        echo "✓ Found 'User start times:'"
    else
        echo "✗ Missing 'User start times:'"
        VALIDATION_PASSED=false
    fi
    
    # Check for user start time lines
    if grep -E "[A-Za-z]{3} [A-Za-z]{3} [0-9]{2} [0-9]{2}:[0-9]{2}:[0-9]{2} [A-Z]+ [0-9]{4} \\| [^|]* \\| [^|]*" "$RESULTS_DIR/results.txt"; then
        echo "✓ Found user start time lines matching expected pattern"
    else
        echo "✗ Missing user start time lines matching expected pattern"
        VALIDATION_PASSED=false
    fi
    
    # HTML report validation
    HTML_VALIDATION_PASSED=true
    HTML_FILE="$RESULTS_DIR/report.html"
    if [ -f "$HTML_FILE" ]; then
        echo "✓ HTML report found"
        
        if grep -q "OpenVidu Load Test Report" "$HTML_FILE"; then
            echo "✓ HTML contains 'OpenVidu Load Test Report'"
        else
            echo "✗ HTML missing 'OpenVidu Load Test Report'"
            HTML_VALIDATION_PASSED=false
        fi
        
        if grep -q "Sessions Created" "$HTML_FILE"; then
            echo "✓ HTML contains 'Sessions Created'"
        else
            echo "✗ HTML missing 'Sessions Created'"
            HTML_VALIDATION_PASSED=false
        fi
        
        if grep -q "Total Participants" "$HTML_FILE"; then
            echo "✓ HTML contains 'Total Participants'"
        else
            echo "✗ HTML missing 'Total Participants'"
            HTML_VALIDATION_PASSED=false
        fi
        
        if grep -q "User Connections" "$HTML_FILE"; then
            echo "✓ HTML contains 'User Connections'"
            if grep -q "Join Date" "$HTML_FILE" && grep -q "Retries" "$HTML_FILE" && grep -q "Retry Details" "$HTML_FILE"; then
                echo "✓ HTML contains expected table columns"
                if grep -q "User1" "$HTML_FILE" && grep -q "User2" "$HTML_FILE"; then
                    echo "✓ HTML contains two user rows"
                else
                    echo "✗ HTML missing user rows (expected User1 and User2)"
                    HTML_VALIDATION_PASSED=false
                fi
            else
                echo "✗ HTML missing expected table columns (Join Date, Retries, Retry Details)"
                HTML_VALIDATION_PASSED=false
            fi
        else
            echo "✗ HTML missing 'User Connections'"
            HTML_VALIDATION_PASSED=false
        fi
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
        rm -f "$RESULTS_DIR/results.txt"
        rm -f "$HTML_FILE"
        rm -f "$RESULTS_DIR/docker-compose.log"
    else
        echo "Keeping result files for debugging."
    fi
else
    echo "ERROR: Results file not found at $RESULTS_DIR/results.txt"
    EXIT_CODE=1
fi

exit $EXIT_CODE
