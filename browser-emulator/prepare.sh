#!/bin/sh

# Install Node.js
if [ ! -x "$(command -v node)" ]; then
    # echo "Installing NodeJS"
	sudo curl -sL https://deb.nodesource.com/setup_14.x | sudo bash -
	sudo apt-get install -y nodejs
fi

# Download necessary media files for containerized Chrome Browser
if [ ! -f ./src/assets/mediafiles/fakevideo.y4m ]; then
	echo "Downloading video media file"
	curl --url https://s3-eu-west-1.amazonaws.com/public.openvidu.io/bbb-fakevideo.y4m --output ./src/assets/mediafiles/fakevideo.y4m --create-dirs
fi
if [ ! -f ./src/assets/mediafiles/fakeaudio.wav ]; then
	echo "Downloading audio media file"
	curl --url https://s3-eu-west-1.amazonaws.com/public.openvidu.io/bbb-fakeaudio.wav --output ./src/assets/mediafiles/fakeaudio.wav --create-dirs
fi

if [ ! -x "$(command -v docker)" ]; then
   	# Install Docker CE
	echo "Installing Docker CE"
	sudo apt install -y apt-transport-https ca-certificates curl software-properties-common
	curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo apt-key add -
	sudo add-apt-repository "deb [arch=amd64] https://download.docker.com/linux/ubuntu focal stable"
	sudo apt install -y docker-ce
	sudo usermod -aG docker $USER
	sudo newgrp docker
fi

echo "Instance is ready"