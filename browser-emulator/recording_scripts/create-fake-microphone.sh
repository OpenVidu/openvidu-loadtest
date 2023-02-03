#!/bin/bash
# Start pulseaudio server if stopped
pulseaudio --start --disallow-exit --exit-idle-time=-1
# Load module to read audio from file
# TODO: configurable bitrate, format, channels...
pactl load-module module-pipe-source source_name=virtmic file=/tmp/virtmic format=s16le rate=48000 channels=2
# Set virtual microphone as default sound device
pactl set-default-source virtmic
# Set virtual microphone as default sound device for pulseaudio clients
echo "default-source = virtmic" > $HOME/.config/pulse/client.conf