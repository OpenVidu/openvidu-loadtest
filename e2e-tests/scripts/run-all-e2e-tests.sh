#!/bin/bash

# Unified e2e test runner for OpenVidu Load Test
# This script discovers and runs all e2e tests sequentially
# Usage: ./run-all-e2e-tests.sh <PLATFORM_URL> [API_KEY] [API_SECRET]
# Example: ./run-all-e2e-tests.sh https://172-31-224-178.openvidu-local.dev:7443 devkey secret

set -e

echo "Starting OpenVidu Load Test E2E Test Suite..."

# Check if docker compose is available
if ! command -v docker compose &> /dev/null; then
    echo "docker compose not found. Please install docker compose."
    exit 1
fi

# Check arguments
if [ $# -lt 1 ]; then
    echo "Usage: $0 <PLATFORM_URL> [API_KEY] [API_SECRET]"
    echo "Example: $0 https://openvidu.example.com:7443 devkey secret"
    exit 1
fi

PLATFORM_URL="$1"
PLATFORM_APIKEY="${2:-devkey}"
PLATFORM_APISECRET="${3:-secret}"

# Configuration
SCRIPT_DIR="$(dirname "$(realpath "$0")")"
E2E_TEST_DIR="$(realpath "$SCRIPT_DIR/..")"
CONFIG_DIR="$E2E_TEST_DIR/config"
DEFAULT_VALIDATION="validate-default.sh"

# Discover all config files
CONFIG_FILES=()
for config in "$CONFIG_DIR"/*.yaml; do
    if [ -f "$config" ]; then
        CONFIG_FILES+=("$config")
    fi
done

if [ ${#CONFIG_FILES[@]} -eq 0 ]; then
    echo "ERROR: No configuration files found in $CONFIG_DIR"
    exit 1
fi

echo "Found ${#CONFIG_FILES[@]} test configuration(s)"

# Track test results
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0
FAILED_TEST_NAMES=()

# Run each test
for config_path in "${CONFIG_FILES[@]}"; do
    config_file="$(basename "$config_path")"
    
    # Extract test name: e.g., "smoke-test" from "smoke-test-config.yaml"
    test_name="$(echo "$config_file" | sed 's/-config\.yaml$//')"
    
    # Determine validation script using convention:
    # Look for validate-<test-name>.sh, fallback to validate-default.sh
    specific_validation="validate-${test_name}.sh"
    if [ -f "$SCRIPT_DIR/$specific_validation" ]; then
        validation_script="$specific_validation"
    else
        validation_script="$DEFAULT_VALIDATION"
    fi
    
    if [ ! -f "$SCRIPT_DIR/$validation_script" ]; then
        echo "ERROR: Validation script not found: $validation_script"
        exit 1
    fi
    
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    
    echo ""
    echo "========================================"
    echo "Running test $TOTAL_TESTS: $test_name"
    echo "  Config: $config_file"
    echo "  Validation: $validation_script"
    echo "========================================"
    echo ""
    
    # Run the test
    if bash "$SCRIPT_DIR/run-e2e-test.sh" "$config_file" "$validation_script" "$PLATFORM_URL" "$PLATFORM_APIKEY" "$PLATFORM_APISECRET"; then
        echo "✓ Test '$test_name' PASSED"
        PASSED_TESTS=$((PASSED_TESTS + 1))
    else
        echo "✗ Test '$test_name' FAILED"
        FAILED_TESTS=$((FAILED_TESTS + 1))
        FAILED_TEST_NAMES+=("$test_name")
    fi
done

# Print summary
echo ""
echo "========================================"
echo "E2E Test Suite Summary"
echo "========================================"
echo "Total tests: $TOTAL_TESTS"
echo "Passed: $PASSED_TESTS"
echo "Failed: $FAILED_TESTS"

if [ $FAILED_TESTS -gt 0 ]; then
    echo ""
    echo "Failed tests:"
    for name in "${FAILED_TEST_NAMES[@]}"; do
        echo "  - $name"
    done
    echo ""
    echo "E2E Test Suite FAILED"
    exit 1
fi

echo ""
echo "E2E Test Suite PASSED"
exit 0
