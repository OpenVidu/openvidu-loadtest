#!/bin/bash

# Trace all commands.
set -o xtrace

FIREFOX=$1
LIVEKIT=$2
START_SERVER=$3
START_PLATFORM=$4

usermod -aG docker vagrant
usermod -aG syslog vagrant
usermod -aG video vagrant
chown -R vagrant:vagrant /opt/openvidu-loadtest/

cd /opt/openvidu-loadtest/browser-emulator

if [ "$START_PLATFORM" = "true" ]; then
    if [ "$LIVEKIT" = "true" ]; then
        (
            crontab -u vagrant -l
            echo '@reboot livekit-server --dev > /var/log/livekit.log 2>&1'
        ) | crontab -u vagrant -
        livekit-server --dev >/var/log/livekit.log 2>&1 &
    else
        (
            crontab -u vagrant -l
            echo '@reboot cd /opt/openvidu && ./openvidu start > /var/log/openvidu.log 2>&1'
        ) | crontab -u vagrant -
        cd /opt/openvidu
        ./openvidu start >/var/log/openvidu.log 2>&1 &
        cd /opt/openvidu-loadtest/browser-emulator
    fi
fi

if [ "$START_SERVER" = "true" ]; then
    NPM_COMMAND="npm run start:prod"
    if [ "$LIVEKIT" = "true" ]; then
        NPM_COMMAND="${NPM_COMMAND}-livekit"
    fi
    if [ "$FIREFOX" = "true" ]; then
        NPM_COMMAND="${NPM_COMMAND}-firefox"
    fi

    FULL_COMMAND="cd /opt/openvidu-loadtest/browser-emulator && CI=true pnpm install > /var/log/pnpm_install.log 2>&1 && pnpm run build > /var/log/build.log 2>&1 && $NPM_COMMAND > /var/log/server.log 2>&1"

    echo "@reboot $FULL_COMMAND" | crontab -u vagrant -

    sudo -u vagrant bash -lc "$FULL_COMMAND" &
fi
