#!/bin/sh

# Install third party libraries required
sudo apt-get update

# Install Node.js
sudo curl -sL https://deb.nodesource.com/setup_14.x | sudo bash -
sudo apt-get install -y nodejs

# Install Docker CE
sudo apt install -y apt-transport-https ca-certificates curl software-properties-common
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo apt-key add -
sudo add-apt-repository "deb [arch=amd64] https://download.docker.com/linux/ubuntu focal stable"
sudo apt install -y docker-ce
sudo usermod -aG docker $USER
sudo newgrp docker

# Install browser-emulator dependencies
npm install

# Download media files
curl --url https://s3-eu-west-1.amazonaws.com/public.openvidu.io/bbb-fakevideo.y4m --output ./src/assets/mediafiles/fakevideo.y4m
curl --url https://s3-eu-west-1.amazonaws.com/public.openvidu.io/bbb-fakeaudio.wav --output ./src/assets/mediafiles/fakeudio.wav
