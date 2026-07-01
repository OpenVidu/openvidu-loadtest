#!/bin/bash

# Validation script for OpenVidu Load Test e2e ELK smoke test
# This script validates standard smoke test results AND ELK integration:
#   - metricbeat-* has docs for masternode, medianode, browseremulator
#   - loadtest-openvidu-metrics-* has zero documents
#   - loadtest-webrtc-stats-* has exactly 2 documents (User1 and User2, node_role:browseremulator)
#   - TXT and HTML reports contain a valid Kibana dashboard URL
#
# Usage: ./validate-elk-smoke-test.sh <RESULTS_DIR>
# Returns exit code 0 on success, 1 on failure

set -e

RESULTS_DIR="${1:?Results directory required}"
KEEP_RESULTS="${KEEP_RESULTS:-false}"

EXIT_CODE=0

ES_HOST="${ES_HOST:-localhost}"
ES_PORT="${ES_PORT:-9200}"
ES_BASE_URL="http://${ES_HOST}:${ES_PORT}"

# ─── Helper: wait for ES ────────────────────────────────────────────────

wait_for_es() {
	local max_attempts=12
	local attempt=0
	while [ $attempt -lt $max_attempts ]; do
		if curl -sf "$ES_BASE_URL" > /dev/null 2>&1; then
			return 0
		fi
		attempt=$((attempt + 1))
		sleep 5
	done
	return 1
}

# ─── Helper: count ES documents matching a query ────────────────────────

count_docs() {
	local index_pattern="$1"
	local query="$2"
	local url="${ES_BASE_URL}/${index_pattern}/_count"
	if [ -n "$query" ]; then
		url="${url}?q=${query}"
	fi
	curl -sf "$url" 2>/dev/null | python3 -c "import sys,json; print(json.load(sys.stdin).get('count', 0))" 2>/dev/null || echo 0
}

# ─── Helper: check index exists ─────────────────────────────────────────

index_exists() {
	local index="$1"
	curl -sf -o /dev/null "${ES_BASE_URL}/${index}" 2>/dev/null
}

# ─── Standard smoke test validation ─────────────────────────────────────

echo "=== Standard smoke test validation ==="
TXT_REPORT=$(ls -t "$RESULTS_DIR"/results-*.txt 2>/dev/null | head -1)
HTML_REPORT=$(ls -t "$RESULTS_DIR"/report-*.html 2>/dev/null | head -1)

VALIDATION_PASSED=true

if [ -z "$TXT_REPORT" ] || [ ! -f "$TXT_REPORT" ]; then
	echo "✗ Text report not found"
	VALIDATION_PASSED=false
	EXIT_CODE=1
fi

if [ -z "$HTML_REPORT" ] || [ ! -f "$HTML_REPORT" ]; then
	echo "✗ HTML report not found"
	VALIDATION_PASSED=false
	EXIT_CODE=1
fi

if [ "$VALIDATION_PASSED" = true ]; then
	echo "=== TEST RESULTS ==="
	cat "$TXT_REPORT"
	echo "=== END RESULTS ==="

	# Test Case Report
	if grep -q "Test Case Report" "$TXT_REPORT"; then
		echo "✓ Found 'Test Case Report'"
	else
		echo "✗ Missing 'Test Case Report'"
		VALIDATION_PASSED=false
	fi

	# Number of sessions created: 1
	if grep -q "Number of sessions created: 1" "$TXT_REPORT"; then
		echo "✓ Found 'Number of sessions created: 1'"
	else
		echo "✗ Missing 'Number of sessions created: 1'"
		VALIDATION_PASSED=false
	fi

	# Number of participants created: 2
	if grep -q "Number of participants created: 2" "$TXT_REPORT"; then
		echo "✓ Found 'Number of participants created: 2'"
	else
		echo "✗ Missing 'Number of participants created: 2'"
		VALIDATION_PASSED=false
	fi

	# Stop reason: Test finished
	if grep -q "Stop reason: Test finished" "$TXT_REPORT"; then
		echo "✓ Found 'Stop reason: Test finished'"
	else
		echo "✗ Missing 'Stop reason: Test finished'"
		VALIDATION_PASSED=false
	fi

	# User start times header
	if grep -q "User start times:" "$TXT_REPORT"; then
		echo "✓ Found 'User start times:'"
	else
		echo "✗ Missing 'User start times:'"
		VALIDATION_PASSED=false
	fi

	# User start time lines
	if grep -E "[A-Za-z]{3} [A-Za-z]{3} [0-9]{2} [0-9]{2}:[0-9]{2}:[0-9]{2} [A-Z]+ [0-9]{4} \\| [^|]* \\| [^|]*" "$TXT_REPORT"; then
		echo "✓ Found user start time lines matching expected pattern"
	else
		echo "✗ Missing user start time lines matching expected pattern"
		VALIDATION_PASSED=false
	fi

	# HTML report validation
	HTML_VALIDATION_PASSED=true
	if [ -n "$HTML_REPORT" ] && [ -f "$HTML_REPORT" ]; then
		echo "✓ HTML report found"

		if grep -q "OpenVidu Load Test Report" "$HTML_REPORT"; then
			echo "✓ HTML contains 'OpenVidu Load Test Report'"
		else
			echo "✗ HTML missing 'OpenVidu Load Test Report'"
			HTML_VALIDATION_PASSED=false
		fi

		if grep -q "Sessions Created" "$HTML_REPORT"; then
			echo "✓ HTML contains 'Sessions Created'"
		else
			echo "✗ HTML missing 'Sessions Created'"
			HTML_VALIDATION_PASSED=false
		fi

		if grep -q "Total Participants" "$HTML_REPORT"; then
			echo "✓ HTML contains 'Total Participants'"
		else
			echo "✗ HTML missing 'Total Participants'"
			HTML_VALIDATION_PASSED=false
		fi

		if grep -q "User Connections" "$HTML_REPORT"; then
			echo "✓ HTML contains 'User Connections'"
			if grep -q "Join Date" "$HTML_REPORT" && grep -q "Retries" "$HTML_REPORT" && grep -q "Retry Details" "$HTML_REPORT"; then
				echo "✓ HTML contains expected table columns"
				if grep -q "User1" "$HTML_REPORT" && grep -q "User2" "$HTML_REPORT"; then
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
		echo "✗ HTML report not found"
		HTML_VALIDATION_PASSED=false
	fi
fi

# ─── ELK-specific validations ───────────────────────────────────────────

echo ""
echo "=== ELK integration validation ==="
ELK_VALIDATION_PASSED=true

# Wait for ES to be reachable (ports exposed on host)
echo "Waiting for Elasticsearch at ${ES_BASE_URL}..."
if wait_for_es; then
	echo "✓ Elasticsearch is reachable"
else
	echo "✗ Elasticsearch is not reachable after 60s"
	ELK_VALIDATION_PASSED=false
	EXIT_CODE=1
fi

if [ "$ELK_VALIDATION_PASSED" = true ]; then
	# Small pause for documents to be indexed
	sleep 5

	# Check metricbeat-* docs with node_role:masternode
	MASTER_COUNT=$(count_docs "metricbeat-*" "fields.node_role:masternode")
	if [ "$MASTER_COUNT" -ge 1 ]; then
		echo "✓ metricbeat-* has ${MASTER_COUNT} document(s) with node_role:masternode"
	else
		echo "✗ metricbeat-* missing documents with node_role:masternode"
		ELK_VALIDATION_PASSED=false
	fi

	# Check metricbeat-* docs with node_role:medianode
	MEDIA_COUNT=$(count_docs "metricbeat-*" "fields.node_role:medianode")
	if [ "$MEDIA_COUNT" -ge 1 ]; then
		echo "✓ metricbeat-* has ${MEDIA_COUNT} document(s) with node_role:medianode"
	else
		echo "✗ metricbeat-* missing documents with node_role:medianode"
		ELK_VALIDATION_PASSED=false
	fi

	# Check metricbeat-* docs with node_role:browseremulator
	WORKER_COUNT=$(count_docs "metricbeat-*" "fields.node_role:browseremulator")
	if [ "$WORKER_COUNT" -ge 1 ]; then
		echo "✓ metricbeat-* has ${WORKER_COUNT} document(s) with node_role:browseremulator"
	else
		echo "✗ metricbeat-* missing documents with node_role:browseremulator"
		ELK_VALIDATION_PASSED=false
	fi

	# Verify loadtest-openvidu-metrics-* has zero documents
	if index_exists "loadtest-openvidu-metrics-*"; then
		LOADTEST_COUNT=$(count_docs "loadtest-openvidu-metrics-*" "")
		if [ "$LOADTEST_COUNT" -eq 0 ]; then
			echo "✓ loadtest-openvidu-metrics-* has 0 documents (no platform metrics indexed)"
		else
			echo "✗ loadtest-openvidu-metrics-* has ${LOADTEST_COUNT} document(s) (expected 0)"
			ELK_VALIDATION_PASSED=false
		fi
	else
		echo "✓ loadtest-openvidu-metrics-* does not exist (no platform metrics indexed)"
	fi

	# Verify loadtest-webrtc-stats-* has exactly 2 documents: one per user (User1, User2),
	# both indexed by the browser-emulator worker
	WEBRTC_STATS_COUNT=$(count_docs "loadtest-webrtc-stats-*" "")
	if [ "$WEBRTC_STATS_COUNT" -eq 2 ]; then
		echo "✓ loadtest-webrtc-stats-* has exactly 2 documents"
	else
		echo "✗ loadtest-webrtc-stats-* has ${WEBRTC_STATS_COUNT} document(s) (expected 2)"
		ELK_VALIDATION_PASSED=false
	fi

	WEBRTC_STATS_USER1_COUNT=$(count_docs "loadtest-webrtc-stats-*" "new_participant_id:User1")
	if [ "$WEBRTC_STATS_USER1_COUNT" -eq 1 ]; then
		echo "✓ loadtest-webrtc-stats-* has 1 document with new_participant_id:User1"
	else
		echo "✗ loadtest-webrtc-stats-* has ${WEBRTC_STATS_USER1_COUNT} document(s) with new_participant_id:User1 (expected 1)"
		ELK_VALIDATION_PASSED=false
	fi

	WEBRTC_STATS_USER2_COUNT=$(count_docs "loadtest-webrtc-stats-*" "new_participant_id:User2")
	if [ "$WEBRTC_STATS_USER2_COUNT" -eq 1 ]; then
		echo "✓ loadtest-webrtc-stats-* has 1 document with new_participant_id:User2"
	else
		echo "✗ loadtest-webrtc-stats-* has ${WEBRTC_STATS_USER2_COUNT} document(s) with new_participant_id:User2 (expected 1)"
		ELK_VALIDATION_PASSED=false
	fi

	WEBRTC_STATS_BROWSEREMULATOR_COUNT=$(count_docs "loadtest-webrtc-stats-*" "node_role:browseremulator")
	if [ "$WEBRTC_STATS_BROWSEREMULATOR_COUNT" -eq 2 ]; then
		echo "✓ loadtest-webrtc-stats-* has 2 document(s) with node_role:browseremulator"
	else
		echo "✗ loadtest-webrtc-stats-* has ${WEBRTC_STATS_BROWSEREMULATOR_COUNT} document(s) with node_role:browseremulator (expected 2)"
		ELK_VALIDATION_PASSED=false
	fi
fi

# ─── Kibana URL validation in reports ───────────────────────────────────

echo ""
echo "=== Kibana dashboard URL validation ==="
KIBANA_VALIDATION_PASSED=true

if [ -n "$TXT_REPORT" ] && [ -f "$TXT_REPORT" ]; then
	if grep -q "Kibana url: http://kibana:5601/app/kibana#/dashboard/" "$TXT_REPORT"; then
		echo "✓ TXT report contains Kibana dashboard URL"
	else
		echo "✗ TXT report missing Kibana dashboard URL"
		KIBANA_VALIDATION_PASSED=false
	fi
fi

if [ -n "$HTML_REPORT" ] && [ -f "$HTML_REPORT" ]; then
	if grep -q '<a href="http://kibana:5601/app/kibana#/dashboard/' "$HTML_REPORT"; then
		echo "✓ HTML report contains clickable Kibana dashboard link"
	else
		echo "✗ HTML report missing Kibana dashboard link"
		KIBANA_VALIDATION_PASSED=false
	fi
fi

# ─── Overall result ─────────────────────────────────────────────────────

echo ""
echo "=== Validation summary ==="
if [ "$VALIDATION_PASSED" = true ] && [ "$HTML_VALIDATION_PASSED" = true ] && [ "$ELK_VALIDATION_PASSED" = true ] && [ "$KIBANA_VALIDATION_PASSED" = true ]; then
	echo "SUCCESS: All validation checks passed."
	EXIT_CODE=0
else
	echo "FAILURE: One or more validation checks failed."
	echo "  Smoke test:          $([ "$VALIDATION_PASSED" = true ] && echo PASS || echo FAIL)"
	echo "  HTML report:         $([ "$HTML_VALIDATION_PASSED" = true ] && echo PASS || echo FAIL)"
	echo "  ELK integration:     $([ "$ELK_VALIDATION_PASSED" = true ] && echo PASS || echo FAIL)"
	echo "  Kibana URL:          $([ "$KIBANA_VALIDATION_PASSED" = true ] && echo PASS || echo FAIL)"
	EXIT_CODE=1
fi

# Clean up result files only on success and when --keep-results was not requested
if [ $EXIT_CODE -eq 0 ] && [ "$KEEP_RESULTS" != true ]; then
	echo "Deleting result files..."
	rm -f "$RESULTS_DIR"/results-*.txt
	rm -f "$RESULTS_DIR"/report-*.html
	rm -f "$RESULTS_DIR"/docker-compose.log
else
	echo "Keeping result files for debugging."
fi

exit $EXIT_CODE
