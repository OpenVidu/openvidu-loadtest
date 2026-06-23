#!/usr/bin/env bash
set -euo pipefail

TEST_TYPE="${1:?"Usage: $0 {benchmarks|saturation}"}"

if [ "$TEST_TYPE" != "benchmarks" ] && [ "$TEST_TYPE" != "saturation" ]; then
	echo "Error: argument must be 'benchmarks' or 'saturation', got '$TEST_TYPE'"
	exit 1
fi

RESULTS_DIR="./stats/perf-results"
mkdir -p "$RESULTS_DIR"

# Pass through env vars that docker compose will forward
PASSTHROUGH_ENV=(
	TEST_LIVEKIT_URL
	TEST_LIVEKIT_API_KEY
	TEST_LIVEKIT_API_SECRET
	PROFILER_STEADY_WAIT_MS
	PROFILER_DURATION_MS
	COM_MODULE
	SERVER_PORT
	WEBSOCKET_PORT
)

BUILD_FLAG=""
if [ "${PERF_REBUILD:-true}" = "true" ]; then
	BUILD_FLAG="--build"
fi

# Build args for docker compose run
DOCKER_ARGS=()
for var in "${PASSTHROUGH_ENV[@]}"; do
	if [ -n "${!var:-}" ]; then
		DOCKER_ARGS+=(-e "$var=${!var}")
	fi
done

SUFFIX="${TEST_TYPE}"

echo "=== [1/3] Perf suite ($TEST_TYPE): docker mode ==="
docker compose -f docker-compose.test.yml run --rm \
	"${DOCKER_ARGS[@]}" \
	-e TEST_SCRIPT="test:perf:${TEST_TYPE}" \
	-e EMULATED_LAUNCHER_MODE=docker \
	-e PERF_RESULTS_SUFFIX="docker-${SUFFIX}" \
	$BUILD_FLAG \
	browser-emulator-tests

DOCKER_FILE=$(ls -t "$RESULTS_DIR"/run-*-docker-${SUFFIX}.json 2>/dev/null | head -1)
if [ -z "$DOCKER_FILE" ]; then
	echo "ERROR: No docker-mode results found in $RESULTS_DIR"
	exit 1
fi
echo "Docker results: $DOCKER_FILE"

echo ""
echo "=== [2/3] Perf suite ($TEST_TYPE): direct mode ==="
docker compose -f docker-compose.test.yml run --rm \
	"${DOCKER_ARGS[@]}" \
	-e TEST_SCRIPT="test:perf:${TEST_TYPE}" \
	-e EMULATED_LAUNCHER_MODE=direct \
	-e PERF_RESULTS_SUFFIX="direct-${SUFFIX}" \
	browser-emulator-tests

DIRECT_FILE=$(ls -t "$RESULTS_DIR"/run-*-direct-${SUFFIX}.json 2>/dev/null | head -1)
if [ -z "$DIRECT_FILE" ]; then
	echo "ERROR: No direct-mode results found in $RESULTS_DIR"
	exit 1
fi
echo "Direct results: $DIRECT_FILE"

echo ""
echo "=== [3/3] Comparing docker vs direct ($TEST_TYPE) ==="
pnpm run compare:perf "$DOCKER_FILE" "$DIRECT_FILE"
