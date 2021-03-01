#!/bin/sh

# Install third party libraries required
sudo apt-get update
sudo curl -sL https://deb.nodesource.com/setup_14.x | sudo bash -
sudo apt-get install -y nodejs
sudo apt-get install docker-ce docker-ce-cli containerd.io
