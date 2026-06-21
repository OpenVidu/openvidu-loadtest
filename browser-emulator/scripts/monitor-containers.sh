#!/usr/bin/env bash
# monitor-containers.sh
# Polls docker stats every 5s and writes per-container CPU/memory CSV
# Classifies containers into: local-deployment, browser-emulator, livekit-cli, other
set -euo pipefail

OUTPUT_DIR="stats/perf-results"
OUTPUT_FILE="$OUTPUT_DIR/cpu-monitoring.csv"
INTERVAL=5

mkdir -p "$OUTPUT_DIR"

write_csv_header() {
	echo "timestamp,container_name,container_group,cpu_percent,mem_percent,mem_usage_mb" > "$OUTPUT_FILE"
}

get_group() {
	local name="$1"
	if [ "$name" = "browser-emulator-tests" ]; then
		echo "browser-emulator"
		return
	fi
	if [[ "$name" == lk-* ]]; then
		echo "livekit-cli"
		return
	fi
	local label
	label=$(docker inspect --format '{{index .Config.Labels "com.docker.compose.project"}}' "$name" 2>/dev/null || true)
	if [ "$label" = "openvidu-local-deployment" ]; then
		echo "local-deployment"
	else
		echo "other"
	fi
}

convert_to_mb() {
	local val="$1"
	val="${val%% /*}"
	val="${val#"${val%%[![:space:]]*}"}"
	val="${val%"${val##*[![:space:]]}"}"
	local num="${val%%[A-Za-z]*}"
	local unit="${val#$num}"
	case "${unit,,}" in
		kib|kb)   awk "BEGIN {printf \"%.1f\", $num / 1024}" ;;
		mib|mb|"") awk "BEGIN {printf \"%.1f\", $num}" ;;
		gib|gb)   awk "BEGIN {printf \"%.1f\", $num * 1024}" ;;
		*)        echo "0" ;;
	esac
}

cleanup() {
	echo "# Monitor stopped at $(date -u +"%Y-%m-%dT%H:%M:%SZ")" >> "$OUTPUT_FILE"
	exit 0
}

trap cleanup SIGTERM SIGINT SIGQUIT

write_csv_header
echo "Container monitor started, writing to $OUTPUT_FILE every ${INTERVAL}s" >&2

while true; do
	timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
	docker stats --no-stream --format "{{.Name}}\t{{.CPUPerc}}\t{{.MemPerc}}\t{{.MemUsage}}" 2>/dev/null | while IFS=$'\t' read -r name cpu mem_pct mem_raw; do
		[ -z "$name" ] && continue
		name="${name#/}"
		cpu="${cpu%%%}"
		mem_pct="${mem_pct%%%}"
		mem_mb=$(convert_to_mb "$mem_raw")
		group=$(get_group "$name")
		echo "$timestamp,$name,$group,$cpu,$mem_pct,$mem_mb" >> "$OUTPUT_FILE"
	done
	sleep "$INTERVAL"
done
