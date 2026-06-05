#!/bin/bash

# Trace all commands.
set -o xtrace

LIVEKIT=$1
START_SERVER=$2
START_PLATFORM=$3

usermod -aG docker vagrant
usermod -aG syslog vagrant
usermod -aG video vagrant
chown -R vagrant:vagrant /opt/openvidu-loadtest/

cd /opt/openvidu-loadtest/browser-emulator

if [ "$START_PLATFORM" = "true" ]; then
    if [ "$LIVEKIT" = "true" ]; then
        (
            crontab -u vagrant -l 2>/dev/null || true
            echo '@reboot livekit-server --dev > /var/log/livekit.log 2>&1'
        ) | crontab -u vagrant -
        echo "Starting LiveKit server..."
        livekit-server --dev >/var/log/livekit.log 2>&1 &
    else
        (
            crontab -u vagrant -l 2>/dev/null || true
            echo '@reboot cd /opt/openvidu && ./openvidu start > /var/log/openvidu.log 2>&1'
        ) | crontab -u vagrant -
        echo "Starting OpenVidu server..."
        cd /opt/openvidu
        ./openvidu start >/var/log/openvidu.log 2>&1 &
        cd /opt/openvidu-loadtest/browser-emulator
    fi
fi

if [ "$START_SERVER" = "true" ]; then
    # Build npm command based on platform selection
    if [ "$LIVEKIT" = "true" ]; then
        NPM_COMMAND="pnpm run start:prod-livekit"
    else
        NPM_COMMAND="pnpm run start:prod"
    fi

    FULL_COMMAND="cd /opt/openvidu-loadtest/browser-emulator && CI=true pnpm install > /var/log/pnpm_install.log 2>&1 && pnpm run build > /var/log/build.log 2>&1 && $NPM_COMMAND > /var/log/server.log 2>&1"

    (
        crontab -u vagrant -l 2>/dev/null || true
        echo "@reboot $FULL_COMMAND"
    ) | crontab -u vagrant -

    echo "Starting browser-emulator server..."
    sudo -u vagrant bash -lc "$FULL_COMMAND" &
fi
