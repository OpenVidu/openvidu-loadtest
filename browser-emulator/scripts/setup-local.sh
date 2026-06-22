#!/bin/sh

# Creates /tmp/openvidu-loadtest with world-writable permissions.
# Run this before `docker compose up` when running tests locally.
#
# Docker bind mounts create this directory as root:root 755 by default,
# but the browser-emulator container runs as a non-root user (UID 1000)
# that needs write access to create Unix sockets for LiveKit CLI.

set -e

DIR=/tmp/openvidu-loadtest

echo "Ensuring $DIR is world-writable..."

if [ -d "$DIR" ]; then
	mkdir -m 777 -p "$DIR"
	chmod 777 "$DIR"
else
	mkdir -m 777 -p "$DIR"
fi

if [ -w "$DIR" ]; then
	echo "OK: $DIR is writable."
else
	echo "ERROR: $DIR is not writable. Try: sudo mkdir -m 777 -p $DIR"
	exit 1
fi
