#!/bin/bash

# Trace all commands.
set -o xtrace

FIREFOX=$1
LIVEKIT=$2
START_SERVER=$3
START_PLATFORM=$4

pnpm run build

if [ "$START_PLATFORM" = "true" ]; then
    if [ "$LIVEKIT" = "true" ]; then
        (
            crontab -u vagrant -l
            echo '@reboot livekit-server --dev > /var/log/livekit.log 2>&1'
        ) | crontab -u vagrant -
    fi
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

if [ "$START_SERVER" = "true" ]; then
    NPM_COMMAND="npm run start:prod"
    if [ "$LIVEKIT" = "true" ]; then
        NPM_COMMAND=${NPM_COMMAND}-livekit
    fi
    if [ "$FIREFOX" = "true" ]; then
        NPM_COMMAND=${NPM_COMMAND}-firefox
    fi
    echo "@reboot cd /opt/openvidu-loadtest/browser-emulator && pnpm run build > /var/log/build.log 2>&1 && $NPM_COMMAND > /var/log/crontab.log 2>&1" 2>&1 | crontab -u vagrant -
    $NPM_COMMAND >/var/log/crontab.log 2>&1 &
fi
