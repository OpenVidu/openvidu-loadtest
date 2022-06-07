#!/usr/bin/env bash

if [[ -z "$1" ]]; then
    if [[ -z "$1" ]]; then
        echo "RELEASE_VERSION argument is required" 1>&2
    fi
	echo "Example of use: ./run.sh 2.1.0" 1>&2
    exit 1
fi

RELEASE_VERSION=$1
rsync -r --exclude-from='./.dockerignore' ../../browser-emulator* .

printf '\n'
printf '\n     -------------------------------------------------------------'
printf '\n       Creating browser-emulator docker image'
printf '\n     -------------------------------------------------------------'
printf '\n'

DOCKER_BUILDKIT=1 docker build --rm=true -t openvidu/browser-emulator:${RELEASE_VERSION} .

rm -rf ./browser-emulator
