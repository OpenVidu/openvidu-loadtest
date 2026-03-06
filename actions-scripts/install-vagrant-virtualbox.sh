#!/usr/bin/env bash
set -euox pipefail

wait_for_apt_locks() {
    local max_wait_seconds=600
    local waited_seconds=0
    local lock_files=(
        /var/lib/dpkg/lock-frontend
        /var/lib/dpkg/lock
        /var/lib/apt/lists/lock
        /var/cache/apt/archives/lock
    )

    while fuser "${lock_files[@]}" >/dev/null 2>&1; do
        if [[ ${waited_seconds} -ge ${max_wait_seconds} ]]; then
            echo "Timed out waiting for apt/dpkg locks after ${max_wait_seconds}s."
            return 1
        fi

        echo "Waiting for other apt/dpkg process to release locks..."
        sleep 5
        waited_seconds=$((waited_seconds + 5))
    done
}

apt_with_retry() {
    local max_attempts=10
    local attempt=1

    until [[ ${attempt} -gt ${max_attempts} ]]; do
        wait_for_apt_locks

        if apt-get "$@"; then
            return 0
        fi

        echo "apt-get $* failed (attempt ${attempt}/${max_attempts}), retrying in 10s..."
        attempt=$((attempt + 1))
        sleep 10
    done

    echo "apt-get $* failed after ${max_attempts} attempts."
    return 1
}

curl -fsSL https://apt.releases.hashicorp.com/gpg | gpg --dearmor --batch --yes -o /usr/share/keyrings/hashicorp-archive-keyring.gpg
echo "deb [signed-by=/usr/share/keyrings/hashicorp-archive-keyring.gpg] https://apt.releases.hashicorp.com $(lsb_release -cs) main" | tee /etc/apt/sources.list.d/hashicorp.list
curl -fsSL https://www.virtualbox.org/download/oracle_vbox_2016.asc | gpg --dearmor --batch --yes -o /usr/share/keyrings/oracle-virtualbox-2016.gpg
echo "deb [arch=amd64 signed-by=/usr/share/keyrings/oracle-virtualbox-2016.gpg] https://download.virtualbox.org/virtualbox/debian $(lsb_release -cs) contrib" | tee /etc/apt/sources.list.d/virtualbox.list
apt_with_retry update
apt_with_retry install -y vagrant virtualbox-7.1
