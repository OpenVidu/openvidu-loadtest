#!/usr/bin/env bash

# Shell setup, assumes running on Ubuntu 24.04 able to build and install v4l2loopback module
# ====================================================

# Trace all commands.
set -o xtrace

export DEBIAN_FRONTEND=noninteractive
if [ -f "/etc/needrestart/needrestart.conf" ]; then
    sed -i "/#\$nrconf{restart} = 'i';/s/.*/\$nrconf{restart} = 'a';/" /etc/needrestart/needrestart.conf
else
    echo "No needrestart, continuing"
fi

SELF_PATH="$(cd -P -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd -P)" # Absolute canonical path

# Install a small script and systemd unit to recalculate /dev/shm at boot
# This ensures instances created from AMIs or Vagrant boxes with resized RAM
# will recalculate and set an appropriate /dev/shm size on each boot.
resize_script_path="/usr/local/sbin/resize-dev-shm.sh"
cat >"$resize_script_path" <<'RESIZE_SH'
#!/usr/bin/env bash
set -e

if [ "$(id -u)" -ne 0 ]; then
    echo "resize-dev-shm: must be run as root"
    exit 1
fi

if ! command -v mountpoint >/dev/null 2>&1 || ! mountpoint -q /dev/shm; then
    echo "/dev/shm not present or not a mountpoint, exiting"
    exit 0
fi

# Determine system memory and pick half for shm (bounded)
mem_kb=$(awk '/MemTotal/ {print $2}' /proc/meminfo || echo 0)
if [ "$mem_kb" -le 0 ]; then
    echo "Could not determine MemTotal, leaving /dev/shm untouched"
    exit 0
fi
desired_kb=$((mem_kb / 2))
min_kb=262144               # 256MB
max_kb=$((2 * 1024 * 1024)) # 2GB
[ "$desired_kb" -lt "$min_kb" ] && desired_kb=$min_kb
[ "$desired_kb" -gt "$max_kb" ] && desired_kb=$max_kb
desired_size="${desired_kb}k"

if mount -o remount,size=$desired_size /dev/shm 2>/dev/null; then
    echo "/dev/shm remounted with size $desired_size"
else
    echo "resize-dev-shm: remount failed (permission or unsupported), continuing to fstab ensure"
fi

# Persist in /etc/fstab idempotently
fstab="/etc/fstab"
backup="/etc/fstab.bak.$(date +%s)"
cp "$fstab" "$backup" || echo "Warning: could not backup $fstab"
tmpfile=$(mktemp)
found=0
while IFS= read -r line; do
    # Preserve comments and blank lines
    if [[ -z "$line" || "$line" =~ ^[[:space:]]*# ]]; then
        echo "$line" >> "$tmpfile"
        continue
    fi
    if echo "$line" | grep -qE '[[:space:]]/dev/shm[[:space:]]'; then
        found=1
        # split fields preserving defaults
        fs_spec=$(echo "$line" | awk '{print $1}')
        fs_file=$(echo "$line" | awk '{print $2}')
        fs_vfstype=$(echo "$line" | awk '{print $3}')
        fs_mntopts=$(echo "$line" | awk '{print $4}')
        fs_freq=$(echo "$line" | awk '{print $5}')
        fs_pass=$(echo "$line" | awk '{print $6}')
        if echo "$fs_mntopts" | grep -q 'size='; then
            fs_mntopts=$(echo "$fs_mntopts" | sed -E "s/size=[^,]+/size=${desired_size}/")
        else
            fs_mntopts="${fs_mntopts},size=${desired_size}"
        fi
        printf "%s\t%s\t%s\t%s\t%s\t%s\n" "$fs_spec" "$fs_file" "$fs_vfstype" "$fs_mntopts" "${fs_freq:-0}" "${fs_pass:-0}" >> "$tmpfile"
    else
        echo "$line" >> "$tmpfile"
    fi
done < "$fstab"
if [ $found -eq 0 ]; then
    echo "tmpfs /dev/shm tmpfs defaults,size=${desired_size} 0 0" >> "$tmpfile"
fi
mv "$tmpfile" "$fstab" && echo "/etc/fstab updated to persist /dev/shm size (backup at $backup)" || echo "Failed to update /etc/fstab"
RESIZE_SH

chmod 0755 "$resize_script_path"

service_path="/etc/systemd/system/resize-dev-shm.service"
cat >"$service_path" <<'UNIT'
[Unit]
Description=Resize /dev/shm on boot to match available RAM
After=local-fs.target

[Service]
Type=oneshot
ExecStart=/usr/local/sbin/resize-dev-shm.sh

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload || true
systemctl enable --now resize-dev-shm.service || echo "Failed to enable/start resize-dev-shm.service (non-fatal)"

# Increase file descriptor limits to at least 65535 and persist
target_fds=65535
# Apply immediately
ulimit -n "$target_fds" 2>/dev/null || echo "Could not set ulimit -n $target_fds (non-fatal)"

# Persist via limits.conf for user/system-wide settings
limits_conf="/etc/security/limits.conf"
if [ -f "$limits_conf" ]; then
    # Backup original
    cp "$limits_conf" "${limits_conf}.bak.$(date +%s)" || true
    # Remove any existing entries for nofile and add new ones
    sed -i '/^[^#]*\bnofile\b/d' "$limits_conf" || true
    cat >>"$limits_conf" <<EOF
# Increased file descriptor limits for browser-emulator
* soft nofile $target_fds
* hard nofile $target_fds
root soft nofile $target_fds
root hard nofile $target_fds
EOF
    echo "Updated $limits_conf with fd limit $target_fds"
fi

# Persist via systemd system.conf for system services
systemd_conf="/etc/systemd/system.conf"
if [ -f "$systemd_conf" ]; then
    cp "$systemd_conf" "${systemd_conf}.bak.$(date +%s)" || true
    # Remove existing DefaultLimitNOFILE entries and add new
    sed -i '/^DefaultLimitNOFILE=/d' "$systemd_conf" || true
    echo "DefaultLimitNOFILE=$target_fds:$target_fds" >>"$systemd_conf"
    systemctl daemon-reexec 2>/dev/null || true
    echo "Updated $systemd_conf with DefaultLimitNOFILE=$target_fds"
fi

## Ensure PAM enforces session limits so limits.conf is applied for logins
pam_file="/etc/pam.d/common-session"
if [ -f "$pam_file" ]; then
    cp "$pam_file" "${pam_file}.bak.$(date +%s)" || true
    if ! grep -qE '^[[:space:]]*session[[:space:]]+.*pam_limits.so' "$pam_file"; then
        echo "session required pam_limits.so" >>"$pam_file"
        echo "Appended 'session required pam_limits.so' to $pam_file"
    else
        echo "$pam_file already contains pam_limits configuration"
    fi
fi

## Install necessary packages
apt-get update
apt-get upgrade -yq
apt-get install -yq --no-install-recommends \
    curl git apt-transport-https ca-certificates software-properties-common gnupg python3-pip build-essential libgtk-3-0 libdbus-glib-1-2 xorg libnm0
# Add Docker's official GPG key:
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
# Add the repository to Apt sources:
tee /etc/apt/sources.list.d/docker.sources <<EOF
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: $(. /etc/os-release && echo "${UBUNTU_CODENAME:-$VERSION_CODENAME}")
Components: stable
Signed-By: /etc/apt/keyrings/docker.asc
EOF
NODE_MAJOR=24
curl -fsSL https://deb.nodesource.com/setup_$NODE_MAJOR.x | sudo -E bash -
apt-get update
apt-get install -yq --no-install-recommends \
    ffmpeg docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin xvfb linux-generic linux-modules-extra-$(uname -r) pulseaudio nodejs dkms x11vnc net-tools sysstat fvwm
# Config needed for ffmpeg to work
export LD_LIBRARY_PATH=/usr/local/lib${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}
echo export LD_LIBRARY_PATH=/usr/local/lib${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH} | tee -a /etc/profile

snap remove firefox

# Create recording directories
mkdir -p ./recordings/chrome
mkdir -p ./recordings/qoe

# Add user ubuntu to docker, video and syslog groups
if id "ubuntu" &>/dev/null; then
    usermod -aG docker ubuntu
    usermod -aG syslog ubuntu
    usermod -aG video ubuntu
    chown -R ubuntu:ubuntu /opt/openvidu-loadtest/
elif id "vagrant" &>/dev/null; then
    usermod -aG docker vagrant
    usermod -aG syslog vagrant
    usermod -aG video vagrant
    chown -R vagrant:vagrant /opt/openvidu-loadtest/
else
    echo "No ubuntu or vagrant user found, skipping usermod"
fi

install_v4l2loopback() {
    # Enable fake webcam for real browsers
    # Needs sudo so it works in crontab
    # Don't update the version! only this version works for using the same video source for multiple sources, which is needed for
    # having multiple browsers in one machine. Newer versions have "fixed this bug", now working the same as any OS, limiting to
    # one browser using the webcam at the same time, which is not good for our use case.
    v4l2_version=0.12.7
    mkdir -p /usr/src
    curl -L https://github.com/umlaeute/v4l2loopback/archive/v${v4l2_version}.tar.gz | tar xvz -C /usr/src
    cd /usr/src
    sudo dkms add -m v4l2loopback -v ${v4l2_version}
    if sudo dkms build -m v4l2loopback -v ${v4l2_version} 2>&1 | grep -q "BUILD_EXCLUSIVE"; then
        # Modify the dkms.conf file
        conf_file="/var/lib/dkms/v4l2loopback/${v4l2_version}/source/dkms.conf"
        # use fixed_v4l2_dkms.conf
        cp $SELF_PATH/prepare_scripts/fixed_v4l2_dkms.conf $conf_file
        sudo dkms build -m v4l2loopback -v ${v4l2_version}
    fi
    sudo dkms install -m v4l2loopback -v ${v4l2_version}
    cd $SELF_PATH
    sudo modprobe v4l2loopback devices=1 exclusive_caps=1
    echo "v4l2loopback" | tee /etc/modules-load.d/v4l2loopback.conf
    echo "options v4l2loopback devices=1 exclusive_caps=1" | tee /etc/modprobe.d/v4l2loopback.conf
}

install_node_dependencies_and_build() {
    ## Install node dependencies
    corepack enable pnpm
    corepack use pnpm@10
    pnpm install
    pnpm run build
    echo "node build completed"
}

pull_images() {
    # Pull images used by browser-emulator for faster initialization time
    docker pull docker.elastic.co/beats/metricbeat-oss:7.12.0
    docker network create browseremulator
    echo "docker images pulled"
}

install_v4l2loopback &
pull_images &
install_node_dependencies_and_build &
wait

apt-get install -yq --no-install-recommends v4l2loopback-utils
echo "base installation completed"
