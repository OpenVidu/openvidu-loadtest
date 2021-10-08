#!/bin/bash

pushd ../
docker build -f docker/Dockerfile -t browser-emulator .
