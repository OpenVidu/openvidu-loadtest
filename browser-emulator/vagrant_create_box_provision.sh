#!/bin/bash

# Trace all commands.
set -o xtrace

QOE=$1
echo "QOE: $QOE"

JOB_LOG="/var/log/provision_jobs.log"
mkdir -p /var/log
: >"$JOB_LOG"
declare -a JOB_PIDS=()
declare -a JOB_NAMES=()

start_bg() {
    local name=$1
    shift
    local log="/var/log/${name}.log"
    local ts
    ts=$(date '+%Y-%m-%d %H:%M:%S')
    echo "[$ts] START name=$name log=$log" | tee -a "$JOB_LOG"
    "$@" >"$log" 2>&1 &
    local pid=$!
    JOB_PIDS+=("$pid")
    JOB_NAMES+=("$name")
    ts=$(date '+%Y-%m-%d %H:%M:%S')
    echo "[$ts] PID name=$name pid=$pid" | tee -a "$JOB_LOG"
}

run_install_qoe() {
    if [ "$QOE" = "true" ]; then
        ${PREPARE_SCRIPT_PATH}/install_qoe.sh
    fi
}

run_openvidu_install() {
    cd /opt
    curl -sSL https://s3-eu-west-1.amazonaws.com/aws.openvidu.io/install_openvidu_latest.sh | bash
    cd openvidu
    rm docker-compose.override.yml
    sed -i "s/DOMAIN_OR_PUBLIC_IP=/DOMAIN_OR_PUBLIC_IP=127.0.0.1/g" .env
    sed -i "s/OPENVIDU_SECRET=/OPENVIDU_SECRET=vagrant/g" .env
    sed -i "s/OPENVIDU_STREAMS_VIDEO_MAX_RECV_BANDWIDTH=1000/OPENVIDU_STREAMS_VIDEO_MAX_RECV_BANDWIDTH=0/g" .env
    sed -i "s/OPENVIDU_STREAMS_VIDEO_MIN_RECV_BANDWIDTH=300/OPENVIDU_STREAMS_VIDEO_MIN_RECV_BANDWIDTH=0/g" .env
    sed -i "s/OPENVIDU_STREAMS_VIDEO_MAX_SEND_BANDWIDTH=1000/OPENVIDU_STREAMS_VIDEO_MAX_SEND_BANDWIDTH=0/g" .env
    sed -i "s/OPENVIDU_STREAMS_VIDEO_MIN_SEND_BANDWIDTH=300/OPENVIDU_STREAMS_VIDEO_MIN_SEND_BANDWIDTH=0/g" .env
    docker compose pull
}

# Start memory monitoring
MEMORY_LOG="/var/log/memory_usage.log"
MEMORY_PEAK_LOG="/var/log/memory_peak.log"
echo "Starting memory monitoring..." | tee $MEMORY_LOG
set +o xtrace
(
    PEAK_USED=0
    PEAK_TIMESTAMP=""
    while true; do
        # Get all memory info at once
        read TOTAL USED FREE AVAILABLE <<<$(free -m | awk 'NR==2{print $2, $3, $4, $7}')
        TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

        # Track peak usage
        if [ $USED -gt $PEAK_USED ]; then
            PEAK_USED=$USED
            PEAK_TIMESTAMP=$TIMESTAMP
            echo "[$TIMESTAMP] New peak: ${USED}MB / ${TOTAL}MB (Available: ${AVAILABLE}MB)" | tee -a $MEMORY_LOG
            echo "PEAK_USED=${PEAK_USED}" >$MEMORY_PEAK_LOG
            echo "PEAK_TIMESTAMP=${PEAK_TIMESTAMP}" >>$MEMORY_PEAK_LOG
            echo "TOTAL_MEMORY=${TOTAL}" >>$MEMORY_PEAK_LOG
        fi

        sleep 0.5
    done
) &
set -o xtrace
MEMORY_MONITOR_PID=$!
echo "Memory monitoring started (PID: $MEMORY_MONITOR_PID)" | tee -a $MEMORY_LOG

cd /opt/openvidu-loadtest/browser-emulator
chmod +x ./*.sh
PREPARE_SCRIPT_PATH=/opt/openvidu-loadtest/browser-emulator/prepare_scripts/
chmod +x $PREPARE_SCRIPT_PATH/*.sh

${PREPARE_SCRIPT_PATH}/install_base.sh >/var/log/install.log 2>&1

start_bg "install_qoe" run_install_qoe
start_bg "install_livekit" bash -c "curl -sSL https://get.livekit.io | bash"
start_bg "install_openvidu" run_openvidu_install
start_bg "download_mediafiles" bash -c "cd /opt/openvidu-loadtest/browser-emulator && ./prepare_scripts/download_mediafiles.sh"

set +o xtrace
(
    while true; do
        local_ts=$(date '+%Y-%m-%d %H:%M:%S')
        echo "[$local_ts] Running jobs:" | tee -a "$JOB_LOG"
        for idx in "${!JOB_PIDS[@]}"; do
            pid="${JOB_PIDS[$idx]}"
            name="${JOB_NAMES[$idx]}"
            if kill -0 "$pid" 2>/dev/null; then
                echo "[$local_ts]  - name=$name pid=$pid status=running" | tee -a "$JOB_LOG"
            fi
        done
        sleep 30
    done
) &
set -o xtrace
JOB_MONITOR_PID=$!

for idx in "${!JOB_PIDS[@]}"; do
    pid="${JOB_PIDS[$idx]}"
    name="${JOB_NAMES[$idx]}"
    if wait "$pid"; then
        status=0
    else
        status=$?
    fi
    ts=$(date '+%Y-%m-%d %H:%M:%S')
    echo "[$ts] DONE name=$name pid=$pid status=$status log=/var/log/${name}.log" | tee -a "$JOB_LOG"
done

kill "$JOB_MONITOR_PID" 2>/dev/null || true

cd /opt/openvidu-loadtest/browser-emulator
./debug_vnc.sh

usermod -aG docker vagrant
usermod -aG syslog vagrant
usermod -aG video vagrant
chown -R vagrant:vagrant /opt/openvidu-loadtest/

umount /vagrant

apt-get autoremove -y
apt-get clean -y
apt-get autoclean -y

dd if=/dev/zero of=/EMPTY bs=1M
rm -f /EMPTY

unset HISTFILE
rm -f /root/.bash_history
rm -f /home/vagrant/.bash_history

# Stop memory monitoring and report peak usage
kill $MEMORY_MONITOR_PID 2>/dev/null
sleep 1

echo "============================================" | tee -a $MEMORY_LOG
echo "PROVISIONING COMPLETE - MEMORY REPORT" | tee -a $MEMORY_LOG
echo "============================================" | tee -a $MEMORY_LOG
if [ -f $MEMORY_PEAK_LOG ]; then
    source $MEMORY_PEAK_LOG
    PERCENTAGE=$((PEAK_USED * 100 / TOTAL_MEMORY))
    echo "Peak Memory Usage: ${PEAK_USED}MB / ${TOTAL_MEMORY}MB (${PERCENTAGE}%)" | tee -a $MEMORY_LOG
    echo "Peak Timestamp: ${PEAK_TIMESTAMP}" | tee -a $MEMORY_LOG
    echo "" | tee -a $MEMORY_LOG
    echo "Recommendation: Allocate at least $((PEAK_USED + 1024))MB to the VM" | tee -a $MEMORY_LOG
else
    echo "WARNING: Memory peak log not found" | tee -a $MEMORY_LOG
fi
echo "============================================" | tee -a $MEMORY_LOG
echo "" | tee -a $MEMORY_LOG
echo "Full memory log saved to: $MEMORY_LOG"
echo "Peak memory data saved to: $MEMORY_PEAK_LOG"
